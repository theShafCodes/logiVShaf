/**
 * Pure placement-constraint module — the single source of truth for "may this box
 * sit here?". Extracted from the heuristic packer so the auto-packer and the
 * interactive 3D drag (Stage 4) enforce *identical* rules. No Node/DOM deps: this
 * file is imported by both the server packer and the React client.
 *
 * Coordinate system matches packing.types: origin at one bottom corner, x = van
 * length (l), y = width (w), z up (h), all metres. "Touching faces do not
 * overlap" — boxes may sit flush against each other.
 */
import { volumeM3, volumeM3Vec3 } from "@/lib/packing/geometry";
import type { Dimensions, Placement, Vec3 } from "@/lib/packing/packing.types";

/** Items whose base sits within this many m of z=0 count as resting on the floor. 0.001 m = 1 mm. */
const FLOOR_EPS_M = 0.001;

/** Standard gravity (m/s²) for the vertical-pressure model. */
const G = 9.80665;

/**
 * Downward pressure (kPa) that a mass of `weightKg` exerts over a contact face of
 * `areaM2`:  P = (m · g) / A.  Vertical only — horizontal forces and an item's
 * own internal/self weight are out of scope for this model (assumptions stated by
 * design). A non-positive area is treated as infinite pressure (refuse).
 */
export function stackPressureKpa(weightKg: number, areaM2: number): number {
  if (areaM2 <= 0) return Infinity;
  return (weightKg * G) / areaM2 / 1000; // Pa → kPa
}

/** A box considered for placement — geometry, mass, and fragility (for the gate). */
export interface PlacementCandidate {
  readonly position: Vec3;
  readonly size: Vec3;
  readonly weightKg: number;
  /** True ⇒ fragile. A fragile item may only rest on another fragile item. */
  readonly fragile: boolean;
}

/**
 * Everything a candidate is validated against. `others` is every OTHER placement
 * already in the van — callers exclude the box being moved themselves (by index),
 * which avoids the ambiguity of excluding by itemId when several units share an id.
 */
export interface ValidationContext {
  readonly others: readonly Placement[];
  readonly interior: Dimensions;
  readonly toleranceM: number;
}

export interface ValidationResult {
  readonly ok: boolean;
  /** Human-readable failure cause, present only when `ok` is false. */
  readonly reason?: string;
}

/** Does the box lie wholly inside the van interior (within clearance slack)? */
export function fitsInterior(
  position: Vec3,
  size: Vec3,
  interior: Dimensions,
  tol: number,
): boolean {
  return (
    position.x >= -tol &&
    position.y >= -tol &&
    position.z >= -tol &&
    position.x + size.x <= interior.l + tol &&
    position.y + size.y <= interior.w + tol &&
    position.z + size.z <= interior.h + tol
  );
}

/** Strict overlap on all three axes (touching faces do not overlap). */
function intersects(pos: Vec3, size: Vec3, p: Placement): boolean {
  return (
    pos.x < p.position.x + p.size.x && p.position.x < pos.x + size.x &&
    pos.y < p.position.y + p.size.y && p.position.y < pos.y + size.y &&
    pos.z < p.position.z + p.size.z && p.position.z < pos.z + size.z
  );
}

/** First placement the box collides with, or null when the space is clear. */
export function firstOverlap(
  pos: Vec3,
  size: Vec3,
  others: readonly Placement[],
): Placement | null {
  for (const p of others) if (intersects(pos, size, p)) return p;
  return null;
}

export function hasOverlap(pos: Vec3, size: Vec3, others: readonly Placement[]): boolean {
  return firstOverlap(pos, size, others) !== null;
}

/**
 * A stacked box must rest fully on ONE placement (conservative — no partial
 * support) whose top face meets the box base and that satisfies two gates
 * (van-calculation.md:51-55):
 *
 *   1. Fragility compatibility — a fragile box may only rest on a fragile base;
 *      a standard box may never sit on a fragile base. (Standard bases take any
 *      box.) So nothing standard is ever balanced on fragile, and fragile-on-
 *      fragile columns are allowed.
 *   2. Crush limit — the candidate's vertical pressure on the base's top face,
 *      stackPressureKpa(weightKg, footprint), must not exceed the base's
 *      `maxStackPressureKpa`. This is the per-interface crush check (a single
 *      box's overweight is what presses on its support; weight is not propagated
 *      further down the column — out of scope for this model).
 *
 * Total mass is still bounded globally by the van payload.
 */
export function isSupported(
  pos: Vec3,
  size: Vec3,
  weightKg: number,
  fragile: boolean,
  others: readonly Placement[],
  tol: number,
): boolean {
  const bx0 = pos.x;
  const bx1 = pos.x + size.x;
  const by0 = pos.y;
  const by1 = pos.y + size.y;
  const pressure = stackPressureKpa(weightKg, size.x * size.y);
  for (const p of others) {
    const top = p.position.z + p.size.z;
    if (Math.abs(top - pos.z) > tol) continue;
    if (p.fragile && !fragile) continue;          // standard may not sit on fragile
    if (pressure > p.maxStackPressureKpa) continue; // would crush the base
    const covers =
      p.position.x - tol <= bx0 &&
      p.position.x + p.size.x + tol >= bx1 &&
      p.position.y - tol <= by0 &&
      p.position.y + p.size.y + tol >= by1;
    if (covers) return true;
  }
  return false;
}

/**
 * Full gate: bounds → overlap → support (in detection order, most specific cause
 * wins). A box on the floor (z≈0) skips the support check. Returns the first
 * failure with a human-readable reason for the drag UI; `{ ok: true }` otherwise.
 */
export function validatePlacement(
  candidate: PlacementCandidate,
  ctx: ValidationContext,
): ValidationResult {
  const { position, size, weightKg, fragile } = candidate;
  const { others, interior, toleranceM: tol } = ctx;

  if (!fitsInterior(position, size, interior, tol)) {
    return { ok: false, reason: "exceeds van bounds" };
  }
  const hit = firstOverlap(position, size, others);
  if (hit !== null) {
    return { ok: false, reason: `overlaps ${hit.itemId}` };
  }
  if (position.z > 0 && !isSupported(position, size, weightKg, fragile, others, tol)) {
    return { ok: false, reason: "not supported from below" };
  }
  return { ok: true };
}

/**
 * Where a dragged box settles. Finds the highest support under its footprint and
 * snaps x/y so the box rests fully on that support — without the snap, a hand-
 * positioned box almost never aligns within tolerance, so isSupported's coverage
 * check fails and vertical stacking is effectively impossible in the UI. Returns
 * the floor (z=0, x/y unchanged) when nothing is underneath, or when the box is
 * too large to be covered by the support (it then stays put and the caller's
 * validation reports it unsupported).
 */
export function resolveDrop(
  x: number,
  y: number,
  size: Vec3,
  others: readonly Placement[],
): { x: number; y: number; z: number } {
  let support: Placement | null = null;
  let top = 0;
  for (const p of others) {
    const overlapXY =
      x < p.position.x + p.size.x && p.position.x < x + size.x &&
      y < p.position.y + p.size.y && p.position.y < y + size.y;
    if (overlapXY && p.position.z + p.size.z >= top) {
      top = p.position.z + p.size.z;
      support = p;
    }
  }
  if (support === null) return { x, y, z: 0 };
  // Snap onto the support when the box fits within its footprint.
  if (size.x <= support.size.x && size.y <= support.size.y) {
    x = Math.max(support.position.x, Math.min(x, support.position.x + support.size.x - size.x));
    y = Math.max(support.position.y, Math.min(y, support.position.y + support.size.y - size.y));
  }
  return { x, y, z: top };
}

/** Volume-fill (placed m³ / interior m³) and floor coverage, both 0..1. */
export interface UtilizationMetrics {
  /** Σ placed box volume / van interior volume. */
  readonly volumeFill: number;
  /** Σ floor-resting box footprint / van floor area — exposes unused height. */
  readonly floorFootprint: number;
}

export function computeUtilization(
  placements: readonly Placement[],
  interior: Dimensions,
): UtilizationMetrics {
  const interiorVol = volumeM3(interior);
  const placedVol = placements.reduce((sum, p) => sum + volumeM3Vec3(p.size), 0);
  const volumeFill = interiorVol > 0 ? placedVol / interiorVol : 0;

  const floorArea = interior.l * interior.w;
  const floorUsed = placements.reduce(
    (sum, p) => (p.position.z <= FLOOR_EPS_M ? sum + p.size.x * p.size.y : sum),
    0,
  );
  const floorFootprint = floorArea > 0 ? floorUsed / floorArea : 0;

  return { volumeFill, floorFootprint };
}
