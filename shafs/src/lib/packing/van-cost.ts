import type { Van } from "./packing.types";

/** Effective £/mi for a van at a given placed payload.
 *  UK diesel benchmark: ~15% more fuel at max payload vs empty. */
export function computeVanCostRate(van: Van, payloadKg: number): number {
  const load = Math.min(1, payloadKg / Math.max(1, van.maxPayloadKg));
  const fuel = (van.fuelCostPerMile ?? 0) * (1 + 0.15 * load);
  return van.perMileRate + fuel;
}

/** Fuel-only rate adjusted for payload (for quote line items). */
export function fuelRateForPayload(van: Van, payloadKg: number): number {
  const load = Math.min(1, payloadKg / Math.max(1, van.maxPayloadKg));
  return (van.fuelCostPerMile ?? 0) * (1 + 0.15 * load);
}
