/** Unit coverage for the shared placement-constraint module (Stage 3/4 seam). */
import { describe, it, expect } from "vitest";
import {
  computeUtilization,
  fitsInterior,
  hasOverlap,
  isSupported,
  resolveDrop,
  validatePlacement,
} from "@/lib/packing/placement-validator";
import type { Dimensions, Placement } from "@/lib/packing/packing.types";

const interior: Dimensions = { l: 3.0, w: 1.8, h: 1.9 };
const tol = 0.005;

function place(over: Partial<Placement> = {}): Placement {
  return {
    itemId: over.itemId ?? "p",
    position: over.position ?? { x: 0, y: 0, z: 0 },
    size: over.size ?? { x: 0.6, y: 0.6, z: 0.7 },
    fragile: over.fragile ?? false,
    weightKg: over.weightKg ?? 10,
    canSupportWeightKg: over.canSupportWeightKg ?? 80,
    stackable: over.stackable ?? true,
    maxStackPressureKpa: over.maxStackPressureKpa ?? 50,
  };
}

describe("fitsInterior", () => {
  it("accepts a box wholly inside", () => {
    expect(fitsInterior({ x: 0, y: 0, z: 0 }, { x: 0.6, y: 0.6, z: 0.7 }, interior, tol)).toBe(true);
  });
  it("rejects a box past the far wall and a box at negative coords", () => {
    expect(fitsInterior({ x: 2.8, y: 0, z: 0 }, { x: 0.6, y: 0.6, z: 0.7 }, interior, tol)).toBe(false);
    expect(fitsInterior({ x: -0.05, y: 0, z: 0 }, { x: 0.6, y: 0.6, z: 0.7 }, interior, tol)).toBe(false);
  });
});

describe("hasOverlap", () => {
  const existing = [place({ itemId: "a", position: { x: 0, y: 0, z: 0 } })];
  it("detects intersection", () => {
    expect(hasOverlap({ x: 0.3, y: 0.3, z: 0 }, { x: 0.6, y: 0.6, z: 0.7 }, existing)).toBe(true);
  });
  it("treats flush faces as non-overlapping", () => {
    expect(hasOverlap({ x: 0.6, y: 0, z: 0 }, { x: 0.6, y: 0.6, z: 0.7 }, existing)).toBe(false);
  });
});

describe("isSupported", () => {
  const base = place({ itemId: "base", position: { x: 0, y: 0, z: 0 }, maxStackPressureKpa: 50 });
  const top = { x: 0, y: 0, z: 0.7 };
  const size = { x: 0.6, y: 0.6, z: 0.7 }; // footprint 0.36 m²

  it("supports a standard box resting fully on a non-fragile base", () => {
    expect(isSupported(top, size, 10, false, [base], tol)).toBe(true);
  });
  it("rejects a standard box on a fragile base", () => {
    const fragileBase = place({ itemId: "g", fragile: true });
    expect(isSupported(top, size, 10, false, [fragileBase], tol)).toBe(false);
  });
  it("allows a fragile box to rest on a fragile base", () => {
    const fragileBase = place({ itemId: "g", fragile: true });
    expect(isSupported(top, size, 10, true, [fragileBase], tol)).toBe(true);
  });
  it("supports a heavy box while its pressure stays within the crush limit", () => {
    // 200 kg over 0.36 m² ≈ 5.45 kPa ≤ 50 kPa.
    expect(isSupported(top, size, 200, false, [base], tol)).toBe(true);
  });
  it("rejects a box whose pressure exceeds the base's crush limit", () => {
    // 200 kg over 0.36 m² ≈ 5.45 kPa > 3 kPa.
    const weakBase = place({ itemId: "soft", maxStackPressureKpa: 3 });
    expect(isSupported(top, size, 200, false, [weakBase], tol)).toBe(false);
  });
  it("rejects partial overhang (base does not fully cover footprint)", () => {
    const small = place({ itemId: "s", size: { x: 0.3, y: 0.3, z: 0.7 } });
    expect(isSupported(top, size, 10, false, [small], tol)).toBe(false);
  });
});

describe("validatePlacement", () => {
  it("passes a valid floor placement", () => {
    expect(validatePlacement(
      { position: { x: 0, y: 0, z: 0 }, size: { x: 0.6, y: 0.6, z: 0.7 }, weightKg: 10, fragile: false },
      { others: [], interior, toleranceM: tol },
    )).toEqual({ ok: true });
  });
  it("names the overlapping item", () => {
    const r = validatePlacement(
      { position: { x: 0.1, y: 0.1, z: 0 }, size: { x: 0.6, y: 0.6, z: 0.7 }, weightKg: 10, fragile: false },
      { others: [place({ itemId: "blocker" })], interior, toleranceM: tol },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("blocker");
  });
  it("rejects an unsupported airborne box", () => {
    const r = validatePlacement(
      { position: { x: 0, y: 0, z: 0.7 }, size: { x: 0.6, y: 0.6, z: 0.7 }, weightKg: 10, fragile: false },
      { others: [], interior, toleranceM: tol },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/support/i);
  });
  it("reports out-of-bounds", () => {
    const r = validatePlacement(
      { position: { x: 5.0, y: 0, z: 0 }, size: { x: 0.6, y: 0.6, z: 0.7 }, weightKg: 10, fragile: false },
      { others: [], interior, toleranceM: tol },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/bounds/i);
  });
});

describe("resolveDrop (drag snapping)", () => {
  const size = { x: 0.6, y: 0.6, z: 0.7 };
  const base = place({ itemId: "base", position: { x: 0, y: 0, z: 0 }, size: { x: 0.6, y: 0.6, z: 0.7 } });

  it("lands on the floor (z=0, x/y unchanged) when nothing is underneath", () => {
    expect(resolveDrop(0.9, 0.4, size, [])).toEqual({ x: 0.9, y: 0.4, z: 0 });
  });

  it("snaps a roughly-aligned box onto the support so it rests fully on it", () => {
    // Dropped 0.04m/0.03m off the base → snapped back onto the base, lifted to its top.
    expect(resolveDrop(0.04, 0.03, size, [base])).toEqual({ x: 0, y: 0, z: 0.7 });
  });

  it("clamps onto a larger support's footprint instead of overhanging", () => {
    const big = place({ itemId: "big", position: { x: 0, y: 0, z: 0 }, size: { x: 1.2, y: 1.2, z: 0.7 } });
    // Dropped near the far corner → clamped so the 0.6-box stays fully on the 1.2-base.
    expect(resolveDrop(1.1, 1.1, size, [big])).toEqual({ x: 0.6, y: 0.6, z: 0.7 });
  });

  it("does not snap a box too large to be covered (stays put for the validator to reject)", () => {
    const small = place({ itemId: "small", position: { x: 0, y: 0, z: 0 }, size: { x: 0.3, y: 0.3, z: 0.3 } });
    expect(resolveDrop(0.05, 0.05, size, [small])).toEqual({ x: 0.05, y: 0.05, z: 0.3 });
  });

  it("rests on the highest support when footprints overlap a stack", () => {
    const lower = place({ itemId: "low", position: { x: 0, y: 0, z: 0 }, size: { x: 0.6, y: 0.6, z: 0.7 } });
    const upper = place({ itemId: "up", position: { x: 0, y: 0, z: 0.7 }, size: { x: 0.6, y: 0.6, z: 0.7 } });
    expect(resolveDrop(0.02, 0.02, size, [lower, upper]).z).toBe(1.4);
  });
});

describe("computeUtilization", () => {
  it("reports volume fill and floor footprint", () => {
    const placements = [
      place({ position: { x: 0, y: 0, z: 0 } }),
      place({ position: { x: 0, y: 0, z: 0.7 } }), // stacked — not on floor
    ];
    const u = computeUtilization(placements, interior);
    expect(u.volumeFill).toBeGreaterThan(0);
    expect(u.volumeFill).toBeLessThanOrEqual(1);
    // Only the floor box counts toward footprint: (0.6 * 0.6) / (3.0 * 1.8).
    expect(u.floorFootprint).toBeCloseTo((0.6 * 0.6) / (3.0 * 1.8), 6);
  });
  it("is zero for an empty van", () => {
    expect(computeUtilization([], interior)).toEqual({ volumeFill: 0, floorFootprint: 0 });
  });
});
