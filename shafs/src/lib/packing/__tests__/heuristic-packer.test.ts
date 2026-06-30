/** S3.6 / S3.7 — packing engine + fragility/support constraint layer. */
import { describe, it, expect } from "vitest";
import { HeuristicPacker } from "@/lib/packing/heuristic-packer";
import type { Placement } from "@/lib/packing/packing.types";
import { makeItem, makeVan } from "./fixtures";

const packer = new HeuristicPacker({ toleranceM: 0.005 });

/** Pairwise strict-overlap check (touching faces allowed). */
function anyOverlap(ps: Placement[]): boolean {
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]!;
      const b = ps[j]!;
      const o =
        a.position.x < b.position.x + b.size.x && b.position.x < a.position.x + a.size.x &&
        a.position.y < b.position.y + b.size.y && b.position.y < a.position.y + a.size.y &&
        a.position.z < b.position.z + b.size.z && b.position.z < a.position.z + a.size.z;
      if (o) return true;
    }
  }
  return false;
}

describe("HeuristicPacker — basics", () => {
  it("places everything, never overlaps, reports sane utilization", () => {
    const van = makeVan();
    const items = Array.from({ length: 6 }, (_, i) =>
      makeItem({ id: `b${i}`, weightKg: 20 }),
    );
    const r = packer.pack(items, van);

    expect(r.placements).toHaveLength(6);
    expect(r.unplaced).toHaveLength(0);
    expect(anyOverlap(r.placements)).toBe(false);
    expect(r.utilization).toBeGreaterThan(0);
    expect(r.utilization).toBeLessThanOrEqual(1);
  });

  it("is deterministic — identical input yields identical placements", () => {
    const van = makeVan();
    const items = Array.from({ length: 8 }, (_, i) => makeItem({ id: `b${i}`, weightKg: 15 }));
    const a = packer.pack(items, van);
    const b = packer.pack(items, van);
    expect(b.placements).toEqual(a.placements);
  });
});

describe("HeuristicPacker — edge cases", () => {
  it("flags an item larger than the interior", () => {
    const van = makeVan({ interior: { l: 1.0, w: 1.0, h: 1.0 } });
    const big = makeItem({ id: "big", dimensions: { l: 4.0, w: 0.9, h: 0.9 } });
    const r = packer.pack([big], van);
    expect(r.placements).toHaveLength(0);
    expect(r.unplaced).toHaveLength(1);
    expect(r.reasons.big).toMatch(/interior/i);
  });

  it("fails on payload when volume would otherwise fit", () => {
    const van = makeVan({ maxPayloadKg: 50 });
    const heavy = makeItem({ id: "heavy", weightKg: 500 });
    const r = packer.pack([heavy], van);
    expect(r.placements).toHaveLength(0);
    expect(r.reasons.heavy).toMatch(/payload/i);
  });

  it("flags dimensionless items as unplaced without guessing", () => {
    const van = makeVan();
    const noDims = makeItem({ id: "nd", dimensions: null });
    const r = packer.pack([noDims], van);
    expect(r.placements).toHaveLength(0);
    expect(r.reasons.nd).toMatch(/dimension/i);
  });

  it("flags an orientation-fixed item too tall to stand and barred from tipping", () => {
    const van = makeVan({ interior: { l: 3.0, w: 1.8, h: 1.9 } });
    const tooTall = makeItem({
      id: "tall",
      category: "tall-unit",
      dimensions: { l: 0.6, w: 0.6, h: 2.5 },
      orientationFixed: true,
    });
    const r = packer.pack([tooTall], van);
    expect(r.placements).toHaveLength(0);
    expect(r.reasons.tall).toMatch(/interior/i);
  });
});

describe("HeuristicPacker — stacking & rotation", () => {
  it("builds upward: stackable items in a wide, tall van produce z>0 placements", () => {
    // Floor easily fits all items side by side, so only an upward preference yields
    // stacking — this would be all-floor (z=0) under the old floor-first scan.
    const van = makeVan({ interior: { l: 3.0, w: 1.8, h: 1.9 } });
    const items = Array.from({ length: 6 }, (_, i) =>
      makeItem({ id: `c${i}`, weightKg: 10, canSupportWeightKg: 80 }),
    );
    const r = packer.pack(items, van);
    expect(r.placements).toHaveLength(6);
    expect(anyOverlap(r.placements)).toBe(false);
    expect(r.placements.some((p) => p.position.z > 0)).toBe(true);
  });

  it("keeps non-stackable items on the floor", () => {
    const van = makeVan({ interior: { l: 3.0, w: 1.8, h: 1.9 } });
    const items = Array.from({ length: 4 }, (_, i) =>
      makeItem({ id: `a${i}`, category: "appliance", stackable: false, canSupportWeightKg: 0 }),
    );
    const r = packer.pack(items, van);
    expect(r.placements).toHaveLength(4);
    expect(r.placements.every((p) => p.position.z === 0)).toBe(true);
  });

  it("tips a box that only fits rotated when orientation is free", () => {
    const van = makeVan({ interior: { l: 3.0, w: 1.8, h: 1.9 } });
    const tippable = makeItem({
      id: "tip",
      dimensions: { l: 0.6, w: 0.6, h: 2.5 }, // stands too tall (2.5 > 1.9)…
      orientationFixed: false, // …but may lie down (2.5 along the 3.0 length)
    });
    const r = packer.pack([tippable], van);
    expect(r.placements).toHaveLength(1);
    const p = r.placements[0]!;
    expect(p.size.z).toBeLessThanOrEqual(van.interior.h);
    expect(p.rotationIndex).toBeGreaterThan(0); // not the natural orientation
  });

  it("is deterministic with rotation enabled", () => {
    const van = makeVan();
    const items = Array.from({ length: 7 }, (_, i) =>
      makeItem({ id: `d${i}`, dimensions: { l: 0.5, w: 0.4, h: 0.7 }, weightKg: 12 }),
    );
    expect(packer.pack(items, van).placements).toEqual(packer.pack(items, van).placements);
  });
});

describe("HeuristicPacker — standard stacking (fragility-driven)", () => {
  // Footprint of exactly one box ⇒ the only way to place N is a vertical column.
  const columnVan = (h: number) => makeVan({ interior: { l: 0.62, w: 0.62, h }, maxPayloadKg: 5000 });

  it("stacks standard-on-standard into a vertical column", () => {
    // Headline behaviour: three identical standard boxes can only fit by stacking.
    const items = Array.from({ length: 3 }, (_, i) =>
      makeItem({ id: `s${i}`, fragility: "standard", weightKg: 30 }),
    );
    const r = packer.pack(items, columnVan(2.4)); // 3 × 0.7 = 2.1 < 2.4

    expect(r.placements).toHaveLength(3);
    expect(r.unplaced).toHaveLength(0);
    expect(anyOverlap(r.placements)).toBe(false);
    const zs = r.placements.map((p) => p.position.z).sort((a, b) => a - b);
    expect(zs).toEqual([0, 0.7, 1.4]); // strictly increasing column, flush faces
  });

  it("stacks even when the base's weight rating is far below the top's mass", () => {
    // canSupportWeightKg(5) ≪ weightKg(200): the per-box rating no longer gates —
    // only the van payload caps total mass. Proves the magnitude check is gone.
    const items = [
      makeItem({ id: "a", fragility: "standard", weightKg: 200, canSupportWeightKg: 5 }),
      makeItem({ id: "b", fragility: "standard", weightKg: 200, canSupportWeightKg: 5 }),
    ];
    const r = packer.pack(items, columnVan(2.0)); // payload 5000 ≥ 2×200

    expect(r.placements).toHaveLength(2);
    expect(anyOverlap(r.placements)).toBe(false);
    expect(r.placements.some((p) => p.position.z > 0)).toBe(true); // a real stack formed
  });

  it("overflows when the column hits the van roof", () => {
    // Floor fits one footprint; height fits exactly two boxes (2×0.7 < 1.5 < 3×0.7).
    const items = Array.from({ length: 4 }, (_, i) =>
      makeItem({ id: `o${i}`, fragility: "standard", weightKg: 20 }),
    );
    const r = packer.pack(items, columnVan(1.5));

    expect(r.placements).toHaveLength(2);
    expect(r.unplaced).toHaveLength(2); // two boxes have nowhere to go
    for (const u of r.unplaced) expect(r.reasons[u.id]).toMatch(/space/i);
  });

  it("does not stack a box onto a base too small to cover it (single-base support)", () => {
    // Small base sorts to the floor first (higher rating); the larger box cannot
    // rest on its partial footprint and must take the floor beside it.
    const small = makeItem({
      id: "small",
      fragility: "standard",
      dimensions: { l: 0.3, w: 0.3, h: 0.3 },
      canSupportWeightKg: 100,
    });
    const big = makeItem({
      id: "big",
      fragility: "standard",
      dimensions: { l: 0.6, w: 0.6, h: 0.7 },
      canSupportWeightKg: 10,
    });
    const van = makeVan({ interior: { l: 2.0, w: 0.62, h: 2.0 } });
    const r = packer.pack([small, big], van);

    expect(r.placements).toHaveLength(2);
    const bigP = r.placements.find((p) => p.itemId === "big")!;
    expect(bigP.position.z).toBe(0); // floored beside, never balanced on the small base
  });

  it("stacks standards but leaves a non-stackable fragile item on the floor", () => {
    // Two-footprint floor + height for a column: standards build up, the fragile
    // (non-stackable) box rides on the floor — nothing rests on it.
    const items = [
      makeItem({ id: "std0", fragility: "standard", weightKg: 20 }),
      makeItem({ id: "std1", fragility: "standard", weightKg: 20 }),
      makeItem({ id: "glass", fragility: "fragile", stackable: false, weightKg: 20 }),
    ];
    const van = makeVan({ interior: { l: 1.3, w: 0.62, h: 1.6 } });
    const r = packer.pack(items, van);

    expect(r.placements).toHaveLength(3);
    const glass = r.placements.find((p) => p.itemId === "glass")!;
    expect(glass.position.z).toBe(0);
    expect(r.placements.filter((p) => !p.fragile).some((p) => p.position.z > 0)).toBe(true);
  });
});

describe("HeuristicPacker — crush pressure & fragile compatibility", () => {
  it("stacks fragile-on-fragile into a column", () => {
    const van = makeVan({ interior: { l: 0.62, w: 0.62, h: 2.0 }, maxPayloadKg: 1000 });
    const items = Array.from({ length: 2 }, (_, i) =>
      makeItem({ id: `f${i}`, fragility: "fragile", weightKg: 10 }),
    );
    const r = packer.pack(items, van);
    expect(r.placements).toHaveLength(2);
    expect(r.placements.some((p) => p.position.z > 0)).toBe(true); // fragile rests on fragile
  });

  it("does not stack a box whose pressure would crush its base", () => {
    // Two-footprint tall van: stacking is preferred, but the heavy box's pressure
    // (300 kg / 0.36 m² ≈ 8.2 kPa) exceeds the soft base's 3 kPa limit, so it floors.
    const base = makeItem({ id: "a-soft", weightKg: 10, maxStackPressureKpa: 3 });
    const heavy = makeItem({ id: "z-heavy", weightKg: 300, maxStackPressureKpa: 50 });
    const van = makeVan({ interior: { l: 1.3, w: 0.62, h: 2.0 }, maxPayloadKg: 1000 });
    const r = packer.pack([base, heavy], van);

    expect(r.placements).toHaveLength(2);
    const heavyP = r.placements.find((p) => p.itemId === "z-heavy")!;
    expect(heavyP.position.z).toBe(0); // crush limit forced it onto the floor
  });
});

describe("HeuristicPacker — fragility / support invariants", () => {
  // Narrow tall van forces vertical stacking (floor footprint fits one item).
  const stackVan = makeVan({ interior: { l: 0.62, w: 0.62, h: 2.0 }, maxPayloadKg: 1000 });

  it("the load-bearing (lower) placement is never fragile", () => {
    const items = [
      makeItem({ id: "base", weightKg: 10, fragility: "standard" }),
      makeItem({ id: "top", weightKg: 10, fragility: "standard" }),
    ];
    const r = packer.pack(items, stackVan);
    expect(r.placements).toHaveLength(2);
    const lower = r.placements.find((p) => p.position.z === 0)!;
    expect(lower.fragile).toBe(false);
  });

  it("never rests another item on top of a fragile item", () => {
    const items = [
      makeItem({ id: "glass", weightKg: 10, fragility: "fragile", stackable: false }),
      makeItem({ id: "box", weightKg: 10, fragility: "standard" }),
    ];
    const r = packer.pack(items, stackVan);

    // Invariant: for every fragile placement, nothing overlaps its top face.
    for (const f of r.placements.filter((p) => p.fragile)) {
      const top = f.position.z + f.size.z;
      const resting = r.placements.filter(
        (p) =>
          p !== f &&
          Math.abs(p.position.z - top) <= 0.005 &&
          p.position.x < f.position.x + f.size.x &&
          f.position.x < p.position.x + p.size.x &&
          p.position.y < f.position.y + f.size.y &&
          f.position.y < p.position.y + p.size.y,
      );
      expect(resting).toHaveLength(0);
    }
  });
});
