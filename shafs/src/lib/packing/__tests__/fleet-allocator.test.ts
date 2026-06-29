import { describe, it, expect } from "vitest";
import { allocateFleet } from "@/lib/packing/fleet-allocator";
import { HeuristicPacker } from "@/lib/packing/heuristic-packer";
import { makeItem, makeVan, makeLargeCargo, totalQuantity } from "./fixtures";

const packer = new HeuristicPacker({ toleranceMm: 5 });
const opts = { toleranceMm: 5 };

describe("allocateFleet", () => {
  it("uses a single van when everything fits", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const vans = [makeVan({ id: "v", perMileRate: 1.5 })];
    const plan = allocateFleet(items, vans, packer, opts);

    expect(plan.vans).toHaveLength(1);
    expect(plan.fitsInSingleVan).toBe(true);
    expect(plan.unplaced).toHaveLength(0);
    expect(plan.placedUnits).toBe(2);
  });

  it("spreads overflow across multiple vans until everything is carried", () => {
    // A tiny van that holds exactly one box; three boxes ⇒ three vans.
    const vans = [makeVan({ id: "tiny", interior: { l: 700, w: 700, h: 800 }, maxPayloadKg: 1000, perMileRate: 1 })];
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" }), makeItem({ id: "c" })];
    const plan = allocateFleet(items, vans, packer, opts);

    expect(plan.vans.length).toBeGreaterThanOrEqual(3);
    expect(plan.placedUnits).toBe(3);
    expect(plan.unplaced).toHaveLength(0);
    expect(plan.fitsInSingleVan).toBe(false);
  });

  it("chooses the cheapest van combination, not the fewest vans", () => {
    // Two boxes. One expensive van holds both (rate 3); a cheap van holds one
    // (rate 1). Cheapest = two cheap vans (2) beats one expensive van (3).
    const cheap = makeVan({ id: "cheap", interior: { l: 700, w: 700, h: 800 }, maxPayloadKg: 1000, perMileRate: 1 });
    const big = makeVan({ id: "big", interior: { l: 1300, w: 700, h: 800 }, maxPayloadKg: 1000, perMileRate: 3 });
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];

    const plan = allocateFleet(items, [cheap, big], packer, opts);

    expect(plan.totalPerMileRate).toBe(2);
    expect(plan.vans).toHaveLength(2);
    expect(plan.vans.every((r) => r.van.id === "cheap")).toBe(true);
    expect(plan.unplaced).toHaveLength(0);
  });

  it("flags dimensionless items as unplaced without searching over them", () => {
    const items = [makeItem({ id: "ok" }), makeItem({ id: "bad", dimensions: null })];
    const vans = [makeVan({ id: "v", perMileRate: 1 })];
    const plan = allocateFleet(items, vans, packer, opts);

    expect(plan.unplaced.map((i) => i.id)).toContain("bad");
    expect(plan.reasons.bad).toMatch(/dimensions/);
    expect(plan.placedUnits).toBe(1);
  });

  it("prefers fewer vans when two fleets cost the same", () => {
    // One box per cheap van (rate 1); a big van holds both (rate 2, no fuel ⇒ exact).
    // Two cheap vans = 2 and one big van = 2: a tie. Tie-break ⇒ the single big van.
    const cheap = makeVan({ id: "cheap", interior: { l: 700, w: 700, h: 800 }, maxPayloadKg: 1000, perMileRate: 1 });
    const big = makeVan({ id: "big", interior: { l: 1300, w: 700, h: 800 }, maxPayloadKg: 1000, perMileRate: 2 });
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];

    const plan = allocateFleet(items, [cheap, big], packer, opts);

    expect(plan.totalPerMileRate).toBeCloseTo(2, 5);
    expect(plan.vans).toHaveLength(1);
    expect(plan.vans[0]!.van.id).toBe("big");
  });

  it("carries a large mixed cargo list with no silent drops", () => {
    const items = makeLargeCargo(200);
    // Generous availability so van capacity never binds — lets us prove every
    // packable unit is actually placed, not merely accounted for.
    const vans = [
      makeVan({ id: "s", interior: { l: 2050, w: 1580, h: 1230 }, maxPayloadKg: 15600, perMileRate: 0.98, quantity: 20 }),
      makeVan({ id: "m", interior: { l: 2512, w: 1636, h: 1397 }, maxPayloadKg: 25000, perMileRate: 1.28, quantity: 20 }),
      makeVan({ id: "l", interior: { l: 3705, w: 1870, h: 1932 }, maxPayloadKg: 30000, perMileRate: 1.8, quantity: 20 }),
    ];

    const start = Date.now();
    const plan = allocateFleet(items, vans, packer, opts);
    const elapsedMs = Date.now() - start;

    // Always-true conservation: every unit is either packable or pre-filtered to
    // unplaced — nothing vanishes from the accounting.
    const unplacedQty = totalQuantity(plan.unplaced);
    expect(plan.packableUnits + unplacedQty).toBe(totalQuantity(items));
    // With capacity to spare, every packable unit is genuinely carried.
    expect(plan.placedUnits).toBe(plan.packableUnits);

    // The pre-filtered unplaced carry plain-English reasons.
    for (const item of plan.unplaced) {
      expect(plan.reasons[item.id]).toBeTruthy();
    }

    // Generous bound — asserts it terminates (exact search + greedy fallback), not perf.
    expect(elapsedMs).toBeLessThan(30_000);
  });

  it("flags items larger than every van as unplaced", () => {
    const items = [makeItem({ id: "huge", dimensions: { l: 9000, w: 5000, h: 5000 } })];
    const vans = [makeVan({ id: "v", interior: { l: 3000, w: 1800, h: 1900 }, perMileRate: 1 })];
    const plan = allocateFleet(items, vans, packer, opts);

    expect(plan.vans).toHaveLength(0);
    expect(plan.unplaced.map((i) => i.id)).toContain("huge");
    expect(plan.reasons.huge).toMatch(/exceeds largest van interior/);
  });
});
