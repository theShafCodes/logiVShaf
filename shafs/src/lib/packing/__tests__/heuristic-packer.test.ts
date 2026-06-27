/** S3.6 / S3.7 — packing engine + fragility/support constraint layer. */
import { describe, it, expect } from "vitest";
import { HeuristicPacker } from "@/lib/packing/heuristic-packer";
import type { Placement } from "@/lib/packing/packing.types";
import { makeItem, makeVan } from "./fixtures";

const packer = new HeuristicPacker({ toleranceMm: 5 });

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
  it("flags an item larger than the interior in every orientation", () => {
    const van = makeVan({ interior: { l: 1000, w: 1000, h: 1000 } });
    const big = makeItem({ id: "big", dimensions: { l: 4000, w: 900, h: 900 }, orientationFixed: false });
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

  it("honours orientationFixed — a tall unit cannot be laid down to fit", () => {
    const van = makeVan({ interior: { l: 3000, w: 1800, h: 1900 } });
    const tooTall = { id: "tall", dimensions: { l: 600, w: 600, h: 2500 } };
    const fixed = makeItem({ ...tooTall, orientationFixed: true });
    const free = makeItem({ ...tooTall, orientationFixed: false });
    expect(packer.pack([fixed], van).placements).toHaveLength(0); // can't rotate → no fit
    expect(packer.pack([free], van).placements).toHaveLength(1); // lies down along length
  });
});

describe("HeuristicPacker — fragility / support", () => {
  // Narrow tall van forces vertical stacking (floor footprint fits one item).
  const stackVan = makeVan({ interior: { l: 620, w: 620, h: 2000 }, maxPayloadKg: 1000 });

  it("stacks a sturdy box on a strong non-fragile base", () => {
    const items = [
      makeItem({ id: "base", weightKg: 10, fragility: "standard", canSupportWeightKg: 80 }),
      makeItem({ id: "top", weightKg: 10, fragility: "standard", canSupportWeightKg: 80 }),
    ];
    const r = packer.pack(items, stackVan);
    expect(r.placements).toHaveLength(2);
    const zs = r.placements.map((p) => p.position.z).sort((a, b) => a - b);
    expect(zs[0]).toBe(0);
    expect(zs[1]!).toBeGreaterThan(0); // second rests on top
    // The load-bearing (lower) placement must not be fragile.
    const lower = r.placements.find((p) => p.position.z === 0)!;
    expect(lower.fragile).toBe(false);
  });

  it("never rests another item on top of a fragile item", () => {
    const items = [
      makeItem({ id: "glass", weightKg: 10, fragility: "fragile", canSupportWeightKg: 0 }),
      makeItem({ id: "box", weightKg: 10, fragility: "standard", canSupportWeightKg: 80 }),
    ];
    const r = packer.pack(items, stackVan);

    // Invariant: for every fragile placement, nothing overlaps its top face.
    for (const f of r.placements.filter((p) => p.fragile)) {
      const top = f.position.z + f.size.z;
      const resting = r.placements.filter(
        (p) =>
          p !== f &&
          Math.abs(p.position.z - top) <= 5 &&
          p.position.x < f.position.x + f.size.x &&
          f.position.x < p.position.x + p.size.x &&
          p.position.y < f.position.y + f.size.y &&
          f.position.y < p.position.y + p.size.y,
      );
      expect(resting).toHaveLength(0);
    }
  });
});
