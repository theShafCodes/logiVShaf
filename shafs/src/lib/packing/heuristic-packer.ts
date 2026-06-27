/**
 * 3D first-fit-decreasing packer (van-calculation.md:71-87). Greedy by design —
 * true optimal 3D bin packing is NP-hard. Pure and deterministic: no clock, no
 * randomness, stable sorts everywhere, so Stage 4 can render its output directly.
 *
 * Strategy:
 *   1. expand quantities into units; items with no dimensions are unplaceable;
 *   2. sort non-fragile-first, then largest-volume-first (heavy/sturdy land on
 *      the floor; fragile fall to the end so nothing is stacked on them);
 *   3. place each unit at the lowest-then-nearest free anchor (extreme point)
 *      where it fits the interior, overlaps nothing, and — if stacked — rests
 *      fully on a non-fragile item strong enough to bear it.
 */
import { volumeM3 } from "@/lib/packing/geometry";
import type {
  Dimensions,
  Item,
  Packer,
  PackingResult,
  Placement,
  Rotation,
  Van,
  Vec3,
} from "@/lib/packing/packing.types";

const ALL_ROTATIONS: Rotation[] = ["lwh", "wlh", "lhw", "hlw", "whl", "hwl"];

function orientedSize(d: Dimensions, r: Rotation): Vec3 {
  switch (r) {
    case "lwh": return { x: d.l, y: d.w, z: d.h };
    case "wlh": return { x: d.w, y: d.l, z: d.h };
    case "lhw": return { x: d.l, y: d.h, z: d.w };
    case "hlw": return { x: d.h, y: d.l, z: d.w };
    case "whl": return { x: d.w, y: d.h, z: d.l };
    case "hwl": return { x: d.h, y: d.w, z: d.l };
  }
}

interface Unit {
  readonly item: Item;
  readonly dims: Dimensions;
  readonly volume: number;
}

/** Reasons surfaced on `unplaced`, in detection order. */
const REASON = {
  missingDims: "missing or unparseable dimensions",
  exceedsInterior: "larger than the van interior in every orientation",
  overPayload: "would exceed the van payload limit",
  noSpace: "no remaining space fits this item",
} as const;

/** Strict overlap on all three axes (touching faces do not overlap). */
function overlaps(pos: Vec3, size: Vec3, p: Placement): boolean {
  return (
    pos.x < p.position.x + p.size.x && p.position.x < pos.x + size.x &&
    pos.y < p.position.y + p.size.y && p.position.y < pos.y + size.y &&
    pos.z < p.position.z + p.size.z && p.position.z < pos.z + size.z
  );
}

export interface HeuristicOptions {
  /** Clearance slack (mm) when fitting into the interior and matching support faces. */
  readonly toleranceMm: number;
}

export class HeuristicPacker implements Packer {
  readonly strategy = "first-fit-decreasing-3d";

  constructor(private readonly opts: HeuristicOptions) {}

  pack(items: Item[], van: Van): PackingResult {
    const tol = this.opts.toleranceMm;
    const interior = van.interior;
    const placements: Placement[] = [];
    const reasons: Record<string, string> = {};
    /** itemId → count of units that failed to place. */
    const unplacedCounts = new Map<string, number>();

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

    // 2) Non-fragile first, then largest volume first; stable tie-break by id.
    units.sort((a, b) => {
      const fa = a.item.fragility === "fragile" ? 1 : 0;
      const fb = b.item.fragility === "fragile" ? 1 : 0;
      if (fa !== fb) return fa - fb;
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

      const rotations = unit.item.orientationFixed ? (["lwh"] as Rotation[]) : ALL_ROTATIONS;

      // Can it ever fit the empty interior in any orientation?
      const everFits = rotations.some((r) => {
        const s = orientedSize(unit.dims, r);
        return s.x <= interior.l + tol && s.y <= interior.w + tol && s.z <= interior.h + tol;
      });
      if (!everFits) {
        recordFailure(unit.item, REASON.exceedsInterior);
        continue;
      }

      const placed = this.tryPlace(unit, rotations, anchors, placements, interior, tol);
      if (placed === null) {
        recordFailure(unit.item, REASON.noSpace);
        continue;
      }

      placements.push(placed);
      payloadKg += unit.item.weightKg;
      anchors = this.nextAnchors(anchors, placed);
    }

    const placedVolumeM3 = placements.reduce(
      (sum, p) => sum + (p.size.x * p.size.y * p.size.z) / 1_000_000_000,
      0,
    );
    const interiorVolumeM3 = volumeM3(interior);
    const utilization = interiorVolumeM3 > 0 ? placedVolumeM3 / interiorVolumeM3 : 0;

    const unplaced: Item[] = [...unplacedCounts.entries()].map(([id, count]) => {
      const item = items.find((i) => i.id === id)!;
      return { ...item, quantity: count };
    });

    return { van, placements, utilization, unplaced, reasons };
  }

  /** Lowest-then-nearest anchor, first fitting orientation. null ⇒ no fit. */
  private tryPlace(
    unit: Unit,
    rotations: Rotation[],
    anchors: Vec3[],
    placements: Placement[],
    interior: Dimensions,
    tol: number,
  ): Placement | null {
    const sorted = [...anchors].sort(
      (a, b) => a.z - b.z || a.y - b.y || a.x - b.x,
    );

    for (const pos of sorted) {
      for (const rotation of rotations) {
        const size = orientedSize(unit.dims, rotation);
        if (
          pos.x + size.x > interior.l + tol ||
          pos.y + size.y > interior.w + tol ||
          pos.z + size.z > interior.h + tol
        ) {
          continue;
        }
        if (pos.z > 0 && !unit.item.stackable) continue;
        const candidate: Pick<Placement, "position" | "size"> = { position: pos, size };
        if (placements.some((p) => overlaps(pos, size, p))) continue;
        if (pos.z > 0 && !this.isSupported(candidate, unit.item.weightKg, placements, tol)) {
          continue;
        }
        return {
          itemId: unit.item.id,
          position: pos,
          size,
          rotation,
          fragile: unit.item.fragility === "fragile",
          weightKg: unit.item.weightKg,
          canSupportWeightKg: unit.item.canSupportWeightKg,
        };
      }
    }
    return null;
  }

  /**
   * A stacked box must rest fully on ONE placement (conservative — no partial
   * support) whose top face meets the box base, that is non-fragile and rated to
   * bear the box's weight. This is where the Stage 2 fragility flag becomes a
   * hard constraint (van-calculation.md:51-55).
   */
  private isSupported(
    box: Pick<Placement, "position" | "size">,
    weightKg: number,
    placements: Placement[],
    tol: number,
  ): boolean {
    const bx0 = box.position.x;
    const bx1 = box.position.x + box.size.x;
    const by0 = box.position.y;
    const by1 = box.position.y + box.size.y;
    for (const p of placements) {
      const top = p.position.z + p.size.z;
      if (Math.abs(top - box.position.z) > tol) continue;
      if (p.fragile) continue;
      if (p.canSupportWeightKg < weightKg) continue;
      const covers =
        p.position.x - tol <= bx0 &&
        p.position.x + p.size.x + tol >= bx1 &&
        p.position.y - tol <= by0 &&
        p.position.y + p.size.y + tol >= by1;
      if (covers) return true;
    }
    return false;
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
