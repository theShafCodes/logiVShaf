/** S3.2 / S3.4 / S3.5 — the shipped config files parse and resolve correctly. */
import { describe, it, expect } from "vitest";
import { parseStackabilityFrom, resolveStackRules } from "@/lib/packing/stackability";
import { parseColumnMapFrom, categoryForCode } from "@/lib/packing/column-map";
import { parseVansFrom } from "@/lib/packing/van.repository";
import { estimateWeightKg } from "@/lib/packing/weight-estimator";
import { surfaceM2, volumeM3 } from "@/lib/packing/geometry";
import { readConfigJson } from "./fixtures";

describe("geometry (reference formulas)", () => {
  it("surface_m2 = (L*H)/1e6, volume_m3 = (L*W*H)/1e9", () => {
    expect(surfaceM2(600, 700)).toBeCloseTo(0.42, 6);
    expect(volumeM3({ l: 600, w: 600, h: 700 })).toBeCloseTo(0.252, 6);
  });
});

describe("stackability matrix", () => {
  const matrix = parseStackabilityFrom(readConfigJson("config/stackability.json"));

  it("transcribes the documented matrix rows", () => {
    expect(resolveStackRules(matrix, "appliance").canSupportWeightKg).toBe(0);
    expect(resolveStackRules(matrix, "top").stackable).toBe(false);
    expect(resolveStackRules(matrix, "base-cabinet").stackable).toBe(true);
    expect(resolveStackRules(matrix, "base-cabinet").canSupportWeightKg).toBeGreaterThan(0);
    expect(resolveStackRules(matrix, "tall-unit").orientationFixed).toBe(true);
    expect(resolveStackRules(matrix, "wall-cabinet").canSupportWeightKg).toBeLessThan(
      resolveStackRules(matrix, "base-cabinet").canSupportWeightKg,
    );
  });

  it("unknown category resolves to the conservative fallback", () => {
    const r = resolveStackRules(matrix, "mystery" as never);
    expect(r.stackable).toBe(false);
    expect(r.canSupportWeightKg).toBe(0);
    expect(r.orientationFixed).toBe(true);
  });

  it("rejects a malformed matrix", () => {
    expect(() => parseStackabilityFrom({ fallback: {}, categories: {} })).toThrow();
  });
});

describe("weight estimator", () => {
  const matrix = parseStackabilityFrom(readConfigJson("config/stackability.json"));

  it("uses explicit weight when present", () => {
    expect(estimateWeightKg({ dimensions: { l: 600, w: 600, h: 700 }, explicitWeightKg: 42, densityKgPerM3: 180 })).toBe(42);
  });

  it("estimates from volume * density when no explicit weight", () => {
    const density = resolveStackRules(matrix, "base-cabinet").densityKgPerM3;
    const kg = estimateWeightKg({ dimensions: { l: 1000, w: 1000, h: 1000 }, densityKgPerM3: density });
    expect(kg).toBeCloseTo(density, 6); // 1 m³ × density
  });

  it("returns 0 for dimensionless items", () => {
    expect(estimateWeightKg({ dimensions: null, densityKgPerM3: 500 })).toBe(0);
  });
});

describe("column map", () => {
  const map = parseColumnMapFrom(readConfigJson("config/column-map.json"));

  it("matches category code patterns, else defaults", () => {
    expect(categoryForCode(map, "EFOR600")).toBe("appliance");
    expect(categoryForCode(map, "TOP120")).toBe("top");
    expect(categoryForCode(map, "COL3060")).toBe("tall-unit");
    expect(categoryForCode(map, "XYZ999")).toBe(map.defaultCategory);
  });
});

describe("van fleet config", () => {
  it("parses the shipped fleet with unique ids", () => {
    const vans = parseVansFrom(readConfigJson("config/vans.json"));
    expect(vans.length).toBeGreaterThanOrEqual(2);
    expect(new Set(vans.map((v) => v.id)).size).toBe(vans.length);
  });

  it("rejects duplicate van ids", () => {
    expect(() =>
      parseVansFrom({
        vans: [
          { id: "a", label: "A", interior: { l: 1, w: 1, h: 1 }, maxPayloadKg: 1, perMileRate: 1 },
          { id: "a", label: "A2", interior: { l: 1, w: 1, h: 1 }, maxPayloadKg: 1, perMileRate: 1 },
        ],
      }),
    ).toThrow();
  });
});
