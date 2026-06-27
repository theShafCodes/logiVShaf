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
  /** True ⇒ must stay upright in its given footprint (no rotation, e.g. tall units). */
  readonly orientationFixed: boolean;
  /** Estimator fallback density (kg/m³) when the PDF carries no per-item weight. */
  readonly densityKgPerM3: number;
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
  readonly orientationFixed: boolean;
}

/** Interior box of a fleet van (config/vans.json). */
export interface Van {
  readonly id: string;
  readonly label: string;
  readonly interior: Dimensions;
  readonly maxPayloadKg: number;
  /** Loading aperture (mm); optional gate constraint. */
  readonly doorAperture?: { readonly w: number; readonly h: number };
  /** Carried for Stage 5 pricing; unused by the packer. */
  readonly perMileRate: number;
}

/** Which item dimension maps to each van axis. Identity is `"lwh"` (l→x, w→y, h→z). */
export type Rotation = "lwh" | "wlh" | "lhw" | "hlw" | "whl" | "hwl";

/** One placed unit of an item. `size` is the footprint after `rotation`. */
export interface Placement {
  readonly itemId: string;
  /** Bottom-near-left corner of the box in van-space (mm). */
  readonly position: Vec3;
  /** Oriented size occupying van axes x/y/z (mm). */
  readonly size: Vec3;
  readonly rotation: Rotation;
  readonly fragile: boolean;
  readonly weightKg: number;
  /** Mass (kg) this placed item can bear on top — used by the support constraint. */
  readonly canSupportWeightKg: number;
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
