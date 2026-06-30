/**
 * Multi-van fleet allocation (Stage 3.5). The single-van packer answers "does it
 * fit one van"; this answers "which set of vans carries the WHOLE job, as cheaply
 * as possible" — so an overflowing quotation is completed across vehicles instead
 * of silently leaving cargo behind.
 *
 * Cost model: total trip cost = distance × Σ(effectiveCostPerMile). Distance is a
 * positive constant at allocation time, so minimising Σ(computeVanCostRate) over
 * the chosen fleet minimises total £. Stage 5 applies the live distance.
 *
 * Search: exhaustive branch-and-bound over the fleet with memoisation on the
 * remaining-cargo signature + availability state, capped by a node budget that
 * falls back to a cost-efficient greedy completion. Pure and deterministic.
 */
import { volumeM3Vec3 } from "@/lib/packing/geometry";
import { computeUtilization } from "@/lib/packing/placement-validator";
import { computeVanCostRate } from "@/lib/packing/van-cost";
import type { Item, Packer, PackingResult, Van } from "@/lib/packing/packing.types";

/**
 * Two fleets whose summed per-mile rate differs by less than this are treated as
 * cost-equal, so the secondary tie-breaks (fewer vans, then fuller vans) decide.
 * A few pence of rate — small enough that we never pick a meaningfully pricier
 * fleet just to save a van. Calibration knob: keep, do not inline.
 */
const COST_EPS = 0.02;

/**
 * All 6 distinct axis permutations for a box — used when orientationFixed=false to
 * try every valid rotation before deciding an item can't fit a given space.
 */
export function allOrientations(l: number, w: number, h: number): [number, number, number][] {
  return [[l,w,h],[l,h,w],[w,l,h],[w,h,l],[h,l,w],[h,w,l]];
}

export interface FleetPlan {
  /** Vans actually used, in load order. Empty only when nothing is packable. */
  readonly vans: PackingResult[];
  /** Items (with remaining quantity) no van in the fleet can carry. */
  readonly unplaced: Item[];
  /** itemId → why it could not be carried by any van. */
  readonly reasons: Record<string, string>;
  /** Units with valid dimensions that fit at least one van. */
  readonly packableUnits: number;
  /** Units actually placed across the chosen fleet. */
  readonly placedUnits: number;
  /** True ⇒ the whole job rides in one van and nothing is left unplaced. */
  readonly fitsInSingleVan: boolean;
  /** Σ effectiveCostRate across the chosen fleet (the quantity minimised). */
  readonly totalPerMileRate: number;
}

export interface AllocateOptions {
  /** Clearance slack (m), matched to the packer's tolerance. */
  readonly toleranceM: number;
  /** Search nodes before falling back to greedy completion. */
  readonly nodeBudget?: number;
  /**
   * Above this many packable units the exhaustive branch-and-bound is skipped and
   * the cost-efficient greedy completion is used directly. The exact search re-packs
   * the whole remaining cargo against every van at every node (≈ nodeBudget × |vans|
   * full packs) — fine for a typical quote, pathological for a several-hundred-unit
   * job, where greedy gives an effectively identical fleet at a fraction of the cost.
   */
  readonly exactSearchMaxUnits?: number;
}

function unitsOf(item: Item): number {
  return Math.max(1, item.quantity);
}

function totalUnits(items: Item[]): number {
  return items.reduce((n, i) => n + unitsOf(i), 0);
}

/**
 * Split a cargo list at `k` units: `head` holds at most `k` units (splitting one
 * item's quantity if it straddles the boundary), `tail` holds the rest. A single
 * van can only ever hold a few dozen units, so feeding the packer the whole
 * several-hundred-unit remainder is wasted work — we cap the slice it sees and
 * carry the tail to the next step. No units are lost: head-unplaced + tail are
 * merged back before the next pack.
 */
function capUnits(items: Item[], k: number): { head: Item[]; tail: Item[] } {
  const head: Item[] = [];
  const tail: Item[] = [];
  let used = 0;
  for (const it of items) {
    const q = unitsOf(it);
    if (used >= k) { tail.push(it); continue; }
    if (used + q <= k) { head.push(it); used += q; continue; }
    const take = k - used;
    head.push({ ...it, quantity: take });
    tail.push({ ...it, quantity: q - take });
    used = k;
  }
  return { head, tail };
}

/** Merge two cargo lists, summing quantities of entries that share an id. */
function mergeById(a: Item[], b: Item[]): Item[] {
  const map = new Map<string, Item>();
  for (const it of [...a, ...b]) {
    const existing = map.get(it.id);
    map.set(it.id, existing ? { ...existing, quantity: unitsOf(existing) + unitsOf(it) } : it);
  }
  return [...map.values()];
}

/** A single unit of this item fits inside (in some orientation), and is light enough for, some van. */
function fitsAnyVan(item: Item, vans: Van[], tol: number): boolean {
  if (item.dimensions === null) return false;
  const { l, w, h } = item.dimensions;
  const candidates = item.orientationFixed
    ? ([[l, w, h]] as [number, number, number][])
    : allOrientations(l, w, h);
  return vans.some(
    (v) =>
      item.weightKg <= v.maxPayloadKg &&
      candidates.some(
        ([a, b, c]) =>
          a <= v.interior.l + tol &&
          b <= v.interior.w + tol &&
          c <= v.interior.h + tol,
      ),
  );
}

/** Human-readable reason why no van can carry this item. */
function exceedReason(item: Item, vans: Van[]): string {
  const maxL = Math.max(...vans.map((v) => v.interior.l));
  const maxW = Math.max(...vans.map((v) => v.interior.w));
  const maxH = Math.max(...vans.map((v) => v.interior.h));
  const maxPayload = Math.max(...vans.map((v) => v.maxPayloadKg));
  if (item.dimensions === null) return "missing or unparseable dimensions";
  const { l, w, h } = item.dimensions;
  const candidates: [number, number, number][] = item.orientationFixed ? [[l, w, h]] : allOrientations(l, w, h);
  const fitsDims = candidates.some(([a, b, c]) => a <= maxL && b <= maxW && c <= maxH);
  if (!fitsDims) {
    const longestM = Math.max(l, w, h);
    return `exceeds largest van interior — item is ${longestM.toFixed(2)} m, max interior is ${maxL.toFixed(2)} m`;
  }
  return `too heavy for any van — ${Math.round(item.weightKg)} kg, fleet max is ${Math.round(maxPayload)} kg`;
}

/** Order-independent key for a remaining-cargo multiset (id → remaining qty). */
function signature(items: Item[]): string {
  return items
    .map((i) => `${i.id}:${unitsOf(i)}`)
    .sort()
    .join("|");
}

/** Stable serialisation of availability map for memoisation. */
function serAvail(a: Record<string, number>): string {
  return Object.entries(a)
    .sort(([ka], [kb]) => ka.localeCompare(kb))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

interface Allocation {
  readonly cost: number;
  readonly vans: PackingResult[];
}

/** Lowest volume fill across the chosen vans (1 = best, 0 = an empty van). */
function minFill(alloc: Allocation): number {
  if (alloc.vans.length === 0) return 1;
  return Math.min(
    ...alloc.vans.map((r) => computeUtilization(r.placements, r.van.interior).volumeFill),
  );
}

/**
 * True if `a` is a better fleet than `b`. Cost decides first; within COST_EPS the
 * fleets are cost-equal, so we prefer fewer vans (simpler, less handling) and then
 * the one whose emptiest van is fuller (no van running nearly empty). Deterministic.
 */
function betterAllocation(a: Allocation, b: Allocation): boolean {
  if (Math.abs(a.cost - b.cost) > COST_EPS) return a.cost < b.cost;
  if (a.vans.length !== b.vans.length) return a.vans.length < b.vans.length;
  return minFill(a) > minFill(b);
}

export function allocateFleet(
  allItems: Item[],
  vans: Van[],
  packer: Packer,
  opts: AllocateOptions,
): FleetPlan {
  const tol = opts.toleranceM;
  const budget = opts.nodeBudget ?? 1500;
  // Max units handed to any single pack(). A van holds at most a few dozen, so this
  // bounds per-pack cost without ever starving a van of options to fill it.
  const packCap = opts.exactSearchMaxUnits ?? 150;

  // 1) Separate cargo no van can ever carry — flagged, never searched over.
  const unplaced: Item[] = [];
  const reasons: Record<string, string> = {};
  const packable: Item[] = [];
  for (const item of allItems) {
    if (item.dimensions === null) {
      unplaced.push(item);
      reasons[item.id] = "missing or unparseable dimensions";
    } else if (!fitsAnyVan(item, vans, tol)) {
      unplaced.push(item);
      reasons[item.id] = exceedReason(item, vans);
    } else {
      packable.push(item);
    }
  }

  const packableUnits = totalUnits(packable);

  // Initial availability map: van.quantity ?? 5 copies of each type.
  const initAvail: Record<string, number> = Object.fromEntries(
    vans.map((v) => [v.id, v.quantity ?? 5]),
  );

  // 2) Cost-efficient greedy completion — used as the node-budget fallback.
  const greedyComplete = (remaining: Item[], curAvail: Record<string, number>): Allocation => {
    const out: PackingResult[] = [];
    let rem = remaining;
    let cost = 0;
    let avail = { ...curAvail };
    while (totalUnits(rem) > 0) {
      // Only the densest van can hold a few dozen units, so cap what each pack sees.
      const { head, tail } = capUnits(rem, packCap);
      let best: { result: PackingResult; van: Van; eff: number } | null = null;
      for (const van of vans.filter((v) => (avail[v.id] ?? 0) > 0)) {
        const result = packer.pack(head, van);
        if (result.placements.length === 0) continue;
        const payload = result.placements.reduce((s, p) => s + p.weightKg, 0);
        const rate = computeVanCostRate(van, payload);
        const eff = result.placements.reduce((s, p) => s + volumeM3Vec3(p.size), 0) / rate;
        // Same eff (within a relative epsilon) → prefer the van that clears more
        // units this step, so fewer vans follow — mirrors the exact search's tie-break.
        const tie = best !== null && Math.abs(eff - best.eff) <= best.eff * COST_EPS;
        const better = best === null || (tie ? result.placements.length > best.result.placements.length : eff > best.eff);
        if (better) best = { result, van, eff };
      }
      if (best === null) {
        // Nothing in the head fit any remaining van. If a tail exists the head units
        // are genuinely unplaceable here (van availability exhausted) — stop to avoid
        // looping; remaining cargo surfaces as unplaced via the caller.
        break;
      }
      out.push(best.result);
      const payload = best.result.placements.reduce((s, p) => s + p.weightKg, 0);
      cost += computeVanCostRate(best.van, payload);
      avail = { ...avail, [best.van.id]: (avail[best.van.id] ?? 0) - 1 };
      rem = mergeById(best.result.unplaced, tail);
    }
    return { cost, vans: out };
  };

  // 3) Exhaustive cheapest-combination search with memoisation.
  const memo = new Map<string, Allocation>();
  let nodes = 0;

  const solve = (remaining: Item[], curAvail: Record<string, number>): Allocation => {
    if (totalUnits(remaining) === 0) return { cost: 0, vans: [] };
    const sig = signature(remaining) + "|" + serAvail(curAvail);
    const cached = memo.get(sig);
    if (cached) return cached;
    if (nodes++ > budget) return greedyComplete(remaining, curAvail);

    // Try every available van that makes progress; densest-first finds a tight bound early.
    const trials = vans
      .filter((v) => (curAvail[v.id] ?? 0) > 0)
      .map((van) => ({ van, result: packer.pack(remaining, van) }))
      .filter((t) => t.result.placements.length > 0)
      .sort((a, b) => b.result.placements.length - a.result.placements.length);

    let best: Allocation | null = null;
    for (const t of trials) {
      const payload = t.result.placements.reduce((s, p) => s + p.weightKg, 0);
      const vanCost = computeVanCostRate(t.van, payload);
      const newAvail = { ...curAvail, [t.van.id]: (curAvail[t.van.id] ?? 0) - 1 };
      const sub = solve(t.result.unplaced, newAvail);
      const candidate: Allocation = { cost: vanCost + sub.cost, vans: [t.result, ...sub.vans] };
      if (best === null || betterAllocation(candidate, best)) {
        best = candidate;
      }
    }
    const result = best ?? { cost: 0, vans: [] };
    memo.set(sig, result);
    return result;
  };

  // Large jobs skip the exponential exact search and go straight to greedy — the
  // exact search's value (shaving a van on a tight quote) doesn't survive the cost
  // of re-packing hundreds of units per node, and greedy mirrors its tie-breaks.
  const plan =
    packable.length === 0
      ? { cost: 0, vans: [] }
      : packableUnits > packCap
        ? greedyComplete(packable, initAvail)
        : solve(packable, initAvail);
  const placedUnits = plan.vans.reduce((n, r) => n + r.placements.length, 0);

  return {
    vans: plan.vans,
    unplaced,
    reasons,
    packableUnits,
    placedUnits,
    fitsInSingleVan: unplaced.length === 0 && plan.vans.length === 1,
    totalPerMileRate: plan.cost,
  };
}
