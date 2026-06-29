/**
 * Stage 3 — 3D load / space calculation domain types.
 *
 * Coordinate system: the van interior is an axis-aligned box with its origin at
 * one bottom corner. `x` runs along the van length (`l`), `y` along the width
 * (`w`), `z` upward (`h`). All linear units are millimetres (mm), matching the
 * source PDF (see docs/load-calculation.md). Mass is kilograms.
 *
 * Reference dimension mapping (Arredo3 `L/H/P` → our `l/w/h`):
 *   L (lunghezza)  → l   (length, van x)
 *   P (profondità) → w   (depth → width, van y)
 *   H (altezza)    → h   (height, van z)
 */
import type { Fragility } from "@/lib/classification/types";

/** A point or size in van-space (mm). */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Box dimensions in an item's own frame (mm). */
export interface Dimensions {
  readonly l: number;
  readonly w: number;
  readonly h: number;
}

/** Transport category — drives the stackability matrix (config/stackability.json). */
export type PackingCategory =
  | "heavy-material"
  | "glass-panel"
  | "light-industrial"
  | "appliance"
  | "top"
  | "base-cabinet"
  | "wall-cabinet"
  | "tall-unit"
  | "accessory";

/** Stacking rules resolved for a category (config/stackability.json). */
export interface StackRules {
  /** Can this item be placed on top of another item? */
  readonly stackable: boolean;
  /** Max mass (kg) this item can bear on top of it. 0 ⇒ nothing may stack on it. */
  readonly canSupportWeightKg: number;
  /** Estimator fallback density (kg/m³) when the PDF carries no per-item weight. */
  readonly densityKgPerM3: number;
  /** True ⇒ must ship in its natural orientation (no tipping/rotating to fit). */
  readonly orientationFixed: boolean;
  /**
   * Internal crush limit (kPa): the most vertical pressure this item can bear on
   * its top face before the box above it is refused. See stackPressureKpa.
   */
  readonly maxStackPressureKpa: number;
}

/**
 * The unit the packer reasons about. Built by the item-assembler from a
 * `ClassifiedItem` (Stage 2) joined with the parsed dimension columns.
 */
export interface Item {
  readonly id: string;
  readonly name: string;
  /** Null when the source row had missing/merged dimensions — excluded from packing, flagged. */
  readonly dimensions: Dimensions | null;
  readonly weightKg: number;
  readonly quantity: number;
  readonly fragility: Fragility;
  readonly category: PackingCategory;
  readonly stackable: boolean;
  readonly canSupportWeightKg: number;
  /** True ⇒ must ship in its natural orientation (no tipping/rotating to fit). */
  readonly orientationFixed: boolean;
  /** Internal vertical-crush limit (kPa) on this item's top face. */
  readonly maxStackPressureKpa: number;
}

/** Interior box of a fleet van (config/vans.json). */
export interface Van {
  readonly id: string;
  readonly label: string;
  readonly interior: Dimensions;
  readonly maxPayloadKg: number;
  /** Loading aperture (mm); optional gate constraint. */
  readonly doorAperture?: { readonly w: number; readonly h: number };
  /** Estimated fuel cost per mile for operating-cost views. */
  readonly fuelCostPerMile?: number;
  /** Carried for Stage 5 pricing; unused by the packer. */
  readonly perMileRate: number;
  /** Available units in the fleet; undefined → treated as 5 by the allocator. */
  readonly quantity?: number;
}

/** One placed unit of an item. Size maps l→x, w→y, h→z (natural orientation). */
export interface Placement {
  readonly itemId: string;
  /** Bottom-near-left corner of the box in van-space (mm). */
  readonly position: Vec3;
  /** Size in van axes x/y/z (mm): l→x, w→y, h→z. */
  readonly size: Vec3;
  readonly fragile: boolean;
  readonly weightKg: number;
  /** Mass (kg) this placed item can bear on top — used by the support constraint. */
  readonly canSupportWeightKg: number;
  /** Whether this item may itself rest on another (drives manual-drag elevation policy). */
  readonly stackable: boolean;
  /** Internal vertical-crush limit (kPa) on this item's top face. */
  readonly maxStackPressureKpa: number;
  /**
   * Which of the 6 axis permutations of the item's (l,w,h) produced `size`.
   * 0 = natural (l→x, w→y, h→z). Optional: absent ⇒ natural. Carried for viewer
   * fidelity and so manual edits can round-trip the chosen orientation.
   */
  readonly rotationIndex?: number;
}

/** Output of packing one job into one van. Pure, serializable geometry. */
export interface PackingResult {
  readonly van: Van;
  readonly placements: Placement[];
  /** Σ placed box volume / van interior volume, 0..1. */
  readonly utilization: number;
  /** Items (or remaining quantity units) that could not be placed. */
  readonly unplaced: Item[];
  /** itemId → human-readable reason it (or part of it) went unplaced. */
  readonly reasons: Record<string, string>;
}

/** Swap-seam: the packing heuristic is replaceable without touching callers. */
export interface Packer {
  readonly strategy: string;
  pack(items: Item[], van: Van): PackingResult;
}
