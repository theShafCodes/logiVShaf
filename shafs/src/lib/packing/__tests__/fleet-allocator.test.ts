import { describe, it, expect } from "vitest";
import { allocateFleet } from "@/lib/packing/fleet-allocator";
import { HeuristicPacker } from "@/lib/packing/heuristic-packer";
import { makeItem, makeVan } from "./fixtures";

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

  it("flags items larger than every van as unplaced", () => {
    const items = [makeItem({ id: "huge", dimensions: { l: 9000, w: 5000, h: 5000 } })];
    const vans = [makeVan({ id: "v", interior: { l: 3000, w: 1800, h: 1900 }, perMileRate: 1 })];
    const plan = allocateFleet(items, vans, packer, opts);

    expect(plan.vans).toHaveLength(0);
    expect(plan.unplaced.map((i) => i.id)).toContain("huge");
    expect(plan.reasons.huge).toMatch(/exceeds largest van interior/);
  });
});
