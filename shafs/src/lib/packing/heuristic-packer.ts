/**
 * 3D first-fit-decreasing packer (van-calculation.md:71-87). Greedy by design —
 * true optimal 3D bin packing is NP-hard. Pure and deterministic: no clock, no
 * randomness, stable sorts everywhere, so Stage 4 can render its output directly.
 *
 * Strategy:
 *   1. expand quantities into units; items with no dimensions are unplaceable;
 *   2. sort non-fragile first, then sturdiest base first (high canSupportWeightKg),
 *      then largest volume — so rated bases land on the floor before the lighter
 *      items that stack on them; fragile fall to the end so nothing is stacked on
 *      them;
 *   3. for each unit, score every valid (anchor × orientation) candidate and pick
 *      the best: stackable items are rewarded for building vertically on a rated
 *      base, all items are nudged toward the origin to keep the load compact. This
 *      replaces the old floor-first scan that spread stackables across the floor
 *      and left the vertical space empty.
 */
import { volumeM3 } from "@/lib/packing/geometry";
import { computeUtilization, validatePlacement } from "@/lib/packing/placement-validator";
import type {
  Dimensions,
  Item,
  Packer,
  PackingResult,
  Placement,
  Van,
  Vec3,
} from "@/lib/packing/packing.types";

/**
 * Anchor-scoring knobs (physical-world calibration — keep, do not inline).
 * Scaled so the support bonus dominates the height reward, which dominates the
 * compaction nudge; ties never hinge on floating-point noise.
 */
const W_Z = 1_000;            // reward per mm of height for a stackable item
const SUPPORT_BONUS = 1_000_000; // flat reward for resting on a rated base (z>0)
const W_COMPACT = 1;          // penalty per mm of (x+y) distance from the origin
const W_FLAT = 1;             // penalty per mm of z-dimension for stackable floor items — prefers flat orientations so items can stack on top of each other rather than standing tall and blocking the ceiling

/**
 * Higher is better. Rewards a stackable item for sitting high on a rated base
 * (build columns) and nudges every item toward the origin corner (stay compact,
 * leaving no stranded floor gaps). For stackable items at floor level, prefers
 * the flat orientation (smallest z-dimension) so subsequent items have room to
 * stack without hitting the ceiling — "intelligent vertical stacking".
 * Deterministic — no clock, no randomness.
 */
function scoreCandidate(pos: Vec3, size: Vec3, stackable: boolean): number {
  const verticalReward = stackable ? pos.z * W_Z : 0;
  const supportBonus = pos.z > 0 ? SUPPORT_BONUS : 0;
  const compaction = (pos.x + pos.y) * W_COMPACT;
  // Prefer flat orientations for stackable items: a tall item on the floor wastes
  // vertical space; a flat item leaves room for a column of stacked boxes above it.
  const flatBonus = stackable ? -size.z * W_FLAT : 0;
  return verticalReward + supportBonus - compaction + flatBonus;
}

/** A candidate box orientation and which of the 6 axis permutations produced it. */
interface Orientation {
  readonly size: Vec3;
  readonly rotationIndex: number;
}

/**
 * Up to 6 axis permutations of (l,w,h) mapped to (x,y,z). Index 0 is the natural
 * orientation. `orientationFixed` items return only index 0 (never tipped). Boxes
 * with repeated dimensions collapse to fewer unique orientations, deterministically.
 */
function orientations(d: Dimensions, orientationFixed: boolean): Orientation[] {
  const perms: ReadonlyArray<readonly [number, number, number]> = [
    [d.l, d.w, d.h],
    [d.l, d.h, d.w],
    [d.w, d.l, d.h],
    [d.w, d.h, d.l],
    [d.h, d.l, d.w],
    [d.h, d.w, d.l],
  ];
  const considered = orientationFixed ? perms.slice(0, 1) : perms;
  const seen = new Set<string>();
  const out: Orientation[] = [];
  considered.forEach((p, rotationIndex) => {
    const key = `${p[0]}:${p[1]}:${p[2]}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ size: { x: p[0], y: p[1], z: p[2] }, rotationIndex });
  });
  return out;
}

interface Unit {
  readonly item: Item;
  readonly dims: Dimensions;
  readonly volume: number;
}

/** Reasons surfaced on `unplaced`, in detection order. */
const REASON = {
  missingDims: "missing dimensions — cannot be packed",
  exceedsInterior: "exceeds van interior — item cannot fit in any orientation",
  overPayload: "too heavy — would exceed van payload limit",
  noSpace: "no space left in this van",
} as const;

export interface HeuristicOptions {
  /** Clearance slack (mm) when fitting into the interior and matching support faces. */
  readonly toleranceMm: number;
}

export class HeuristicPacker implements Packer {
  readonly strategy = "first-fit-decreasing-3d";

  constructor(private readonly opts: HeuristicOptions) {}

  pack(items: Item[], van: Van): PackingResult {
    const tol = this.opts.toleranceMm;
    const {interior} = van;
    const placements: Placement[] = [];
    const reasons: Record<string, string> = {};
    /** itemId → count of units that failed to place. */
    const unplacedCounts = new Map<string, number>();
    const itemById = new Map(items.map((item) => [item.id, item]));

    const recordFailure = (item: Item, reason: string) => {
      unplacedCounts.set(item.id, (unplacedCounts.get(item.id) ?? 0) + 1);
      // Keep the first (most specific) reason per item.
      if (!(item.id in reasons)) reasons[item.id] = reason;
    };

    // 1) Expand quantities; route dimensionless items straight to unplaced.
    const units: Unit[] = [];
    for (const item of items) {
      if (item.dimensions === null) {
        for (let i = 0; i < Math.max(1, item.quantity); i++) recordFailure(item, REASON.missingDims);
        continue;
      }
      for (let i = 0; i < Math.max(1, item.quantity); i++) {
        units.push({ item, dims: item.dimensions, volume: volumeM3(item.dimensions) });
      }
    }

    // 2) Non-fragile first, then sturdiest base first (highest maxStackPressureKpa —
    //    these go on the floor and other items build on top of them), then largest
    //    volume; stable tie-break by id.
    units.sort((a, b) => {
      const fa = a.item.fragility === "fragile" ? 1 : 0;
      const fb = b.item.fragility === "fragile" ? 1 : 0;
      if (fa !== fb) return fa - fb;
      if (b.item.maxStackPressureKpa !== a.item.maxStackPressureKpa) {
        return b.item.maxStackPressureKpa - a.item.maxStackPressureKpa;
      }
      if (b.volume !== a.volume) return b.volume - a.volume;
      return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
    });

    // Extreme-point anchors; seed at the origin corner.
    let anchors: Vec3[] = [{ x: 0, y: 0, z: 0 }];
    let payloadKg = 0;

    for (const unit of units) {
      // Weight gate first — position-independent.
      if (payloadKg + unit.item.weightKg > van.maxPayloadKg) {
        recordFailure(unit.item, REASON.overPayload);
        continue;
      }

      // Can it fit the van interior in ANY allowed orientation?
      const orients = orientations(unit.dims, unit.item.orientationFixed);
      const fitsInterior = orients.some(
        (o) =>
          o.size.x <= interior.l + tol &&
          o.size.y <= interior.w + tol &&
          o.size.z <= interior.h + tol,
      );
      if (!fitsInterior) {
        recordFailure(unit.item, REASON.exceedsInterior);
        continue;
      }

      const placed = this.tryPlace(unit, anchors, placements, interior, tol);
      if (placed === null) {
        recordFailure(unit.item, REASON.noSpace);
        continue;
      }

      placements.push(placed);
      payloadKg += unit.item.weightKg;
      anchors = this.nextAnchors(anchors, placed);
    }

    const { volumeFill: utilization } = computeUtilization(placements, interior);

    const unplaced: Item[] = [...unplacedCounts.entries()].map(([id, count]) => ({
      ...itemById.get(id)!,
      quantity: count,
    }));

    return { van, placements, utilization, unplaced, reasons };
  }

  /**
   * Best-scoring valid (anchor × orientation) candidate; null ⇒ no fit. Anchors
   * are visited lowest-then-nearest and a candidate only displaces the incumbent
   * on a *strictly* higher score, so ties resolve to the lowest, most compact,
   * lowest-rotation placement — keeping the packer deterministic.
   */
  private tryPlace(
    unit: Unit,
    anchors: Vec3[],
    placements: Placement[],
    interior: Dimensions,
    tol: number,
  ): Placement | null {
    const orients = orientations(unit.dims, unit.item.orientationFixed);
    const sorted = [...anchors].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);

    let best: Placement | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const pos of sorted) {
      // Item-policy gate: a non-stackable item may only sit on the floor.
      if (pos.z > 0 && !unit.item.stackable) continue;
      for (const o of orients) {
        const verdict = validatePlacement(
          {
            position: pos,
            size: o.size,
            weightKg: unit.item.weightKg,
            fragile: unit.item.fragility === "fragile",
          },
          { others: placements, interior, toleranceMm: tol },
        );
        if (!verdict.ok) continue;
        const score = scoreCandidate(pos, o.size, unit.item.stackable);
        if (score > bestScore) {
          bestScore = score;
          best = {
            itemId: unit.item.id,
            position: pos,
            size: o.size,
            fragile: unit.item.fragility === "fragile",
            weightKg: unit.item.weightKg,
            canSupportWeightKg: unit.item.canSupportWeightKg,
            stackable: unit.item.stackable,
            maxStackPressureKpa: unit.item.maxStackPressureKpa,
            rotationIndex: o.rotationIndex,
          };
        }
      }
    }
    return best;
  }

  /** Extreme points spawned by a placement: right (+x), beside (+y), atop (+z). */
  private nextAnchors(anchors: Vec3[], p: Placement): Vec3[] {
    const spawned: Vec3[] = [
      { x: p.position.x + p.size.x, y: p.position.y, z: p.position.z },
      { x: p.position.x, y: p.position.y + p.size.y, z: p.position.z },
      { x: p.position.x, y: p.position.y, z: p.position.z + p.size.z },
    ];
    const merged = [...anchors, ...spawned];
    // De-duplicate identical anchors to keep the list bounded + deterministic.
    const seen = new Set<string>();
    return merged.filter((a) => {
      const key = `${a.x}:${a.y}:${a.z}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
