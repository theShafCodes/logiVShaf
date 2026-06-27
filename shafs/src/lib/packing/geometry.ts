/**
 * Pure geometry helpers carried over verbatim from the reference parser
 * (logi-v1-main/quotation-extractor/lib/parse-quotation.ts:35,41). Dimensions are
 * millimetres; outputs are m² / m³.
 */
import type { Dimensions } from "@/lib/packing/packing.types";

const MM2_PER_M2 = 1_000_000;
const MM3_PER_M3 = 1_000_000_000;

/** surface_m2 = (L × H) / 1_000_000 — the visible face used for utilisation reporting. */
export function surfaceM2(l: number, h: number): number {
  return (l * h) / MM2_PER_M2;
}

/** volume_m3 = (L × W × H) / 1_000_000_000. */
export function volumeM3(d: Dimensions): number {
  return (d.l * d.w * d.h) / MM3_PER_M3;
}
