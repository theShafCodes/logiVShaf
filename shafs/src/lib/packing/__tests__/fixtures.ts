/** Shared builders for packing tests (not a test file). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Dimensions, Item, Van } from "@/lib/packing/packing.types";

let nextId = 0;

export function makeItem(overrides: Partial<Item> = {}): Item {
  const dimensions: Dimensions | null =
    overrides.dimensions !== undefined ? overrides.dimensions : { l: 600, w: 600, h: 700 };
  return {
    id: overrides.id ?? `item-${nextId++}`,
    name: overrides.name ?? "test item",
    dimensions,
    weightKg: overrides.weightKg ?? 10,
    quantity: overrides.quantity ?? 1,
    fragility: overrides.fragility ?? "standard",
    category: overrides.category ?? "base-cabinet",
    stackable: overrides.stackable ?? true,
    canSupportWeightKg: overrides.canSupportWeightKg ?? 80,
    orientationFixed: overrides.orientationFixed ?? false,
    maxStackPressureKpa: overrides.maxStackPressureKpa ?? 50,
  };
}

export function makeVan(overrides: Partial<Van> = {}): Van {
  return {
    id: overrides.id ?? "test-van",
    label: overrides.label ?? "Test Van",
    interior: overrides.interior ?? { l: 3000, w: 1800, h: 1900 },
    maxPayloadKg: overrides.maxPayloadKg ?? 1500,
    doorAperture: overrides.doorAperture,
    perMileRate: overrides.perMileRate ?? 1.5,
  };
}

/**
 * Deterministic large cargo list for stress/robustness tests. Mixes box sizes,
 * weights, fragile/stackable flags, plus a few dimensionless and oversized units
 * so the unplaced-accounting invariant is exercised. No randomness — index-driven.
 */
export function makeLargeCargo(count = 200): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 50 === 0) {
      // Dimensionless — must land in unplaced (missing dimensions).
      items.push(makeItem({ id: `dimless-${i}`, dimensions: null }));
      continue;
    }
    if (i % 73 === 0) {
      // Oversized — fits no van.
      items.push(makeItem({ id: `huge-${i}`, dimensions: { l: 9000, w: 5000, h: 5000 } }));
      continue;
    }
    const l = 300 + (i % 7) * 80;
    const w = 300 + (i % 5) * 70;
    const h = 300 + (i % 4) * 90;
    items.push(
      makeItem({
        id: `box-${i}`,
        dimensions: { l, w, h },
        weightKg: 5 + (i % 9) * 4,
        fragility: i % 11 === 0 ? "fragile" : "standard",
        stackable: i % 13 !== 0,
      }),
    );
  }
  return items;
}

/** Sum of remaining quantities across an unplaced list. */
export function totalQuantity(items: Item[]): number {
  return items.reduce((n, i) => n + Math.max(1, i.quantity), 0);
}

/** Read a shipped config JSON from disk (proves the real files parse). */
export function readConfigJson(relative: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), relative), "utf8"));
}
