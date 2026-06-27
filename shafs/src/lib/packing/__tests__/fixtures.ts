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

/** Read a shipped config JSON from disk (proves the real files parse). */
export function readConfigJson(relative: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), relative), "utf8"));
}
