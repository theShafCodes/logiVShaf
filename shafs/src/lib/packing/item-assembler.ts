/**
 * Item-assembly bridge (Stage 2 → Stage 3). Stage 2's ClassifiedItem carries
 * fragility + the row's coordinates but no dimensions; this joins each classified
 * row back to its table cells, parses the dimension/quantity columns, derives a
 * transport category, resolves stacking rules, and estimates weight — producing
 * the `Item[]` the packer consumes.
 *
 * "Never guess" (CLAUDE.md): a row with any missing/unparseable dimension yields
 * an Item with `dimensions: null`; the packer reports it as unplaced with a
 * reason rather than fabricating a size.
 */
import { createLogger } from "@/lib/logger/logger";
import { categoryForCode, detectUnitFromHeader, resolveColumnIndices, toMetres, type ColumnMap, type LengthUnit } from "@/lib/packing/column-map";
import { resolveStackRules, type StackabilityMatrix } from "@/lib/packing/stackability";
import { estimateWeightKg } from "@/lib/packing/weight-estimator";
import type { Dimensions, Item } from "@/lib/packing/packing.types";
import type { ClassificationResult, ClassifiedItem } from "@/lib/classification/types";
import type { StructuredDocument, TableRow } from "@/lib/conversion/types";

const logger = createLogger("packing.assembler");

/**
 * Parse a numeric cell under a declared decimal convention. Returns null for
 * blank/non-numeric input.
 *  - ","  Italian/European: dot = thousands, comma = decimal  ("1.234,56" → 1234.56)
 *  - "."  English/US:       comma = thousands, dot = decimal  ("1,234.56" → 1234.56)
 * The convention must be declared (not guessed): "1.200" is 1200 under "," but 1.2
 * under "." — auto-detection would silently corrupt one format or the other.
 */
export function parseNumeric(raw: string | undefined, decimalSeparator: "." | "," = ","): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalized =
    decimalSeparator === ","
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(/,/g, "");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Italian convention (dot = thousands, comma = decimal). Thin back-compat wrapper. */
export function parseItalianNumber(raw: string | undefined): number | null {
  return parseNumeric(raw, ",");
}

function cell(row: TableRow, index: number): string | undefined {
  return index >= 0 && index < row.length ? row[index] : undefined;
}

/** Floor for a derived depth — avoids zero-thickness boxes (m). 0.02 m = 20 mm. */
const MIN_DERIVED_DEPTH_M = 0.02;

/**
 * Derive the missing depth axis from physics when the source table carries only
 * two dimensions plus a weight: a solid box of mass `m` and material density `ρ`
 * occupies volume `m/ρ`, so depth = volume ÷ (length × height face area). This
 * uses the row's real mass — not a fabricated number — and is clamped to stay a
 * plausible bounding box (never below MIN, never deeper than the largest known
 * axis) when ρ under/over-estimates. Returns null when mass is unavailable, in
 * which case the item is flagged unplaced rather than guessed.
 * All inputs and the return value are in metres.
 */
function deriveDepthM(
  weightKg: number | null,
  densityKgPerM3: number,
  lengthM: number,
  heightM: number,
): number | null {
  if (weightKg === null || weightKg <= 0 || densityKgPerM3 <= 0) return null;
  const faceAreaM2 = lengthM * heightM;
  if (faceAreaM2 <= 0) return null;
  const depthM = weightKg / densityKgPerM3 / faceAreaM2;
  return Math.min(Math.max(depthM, MIN_DERIVED_DEPTH_M), Math.max(lengthM, heightM));
}

/**
 * Detect the length unit from the dimension column headers, falling back to the
 * declared config unit. Checks L, H, and P columns in that order.
 */
function resolveUnit(headers: string[], cols: ColumnMap["columns"], fallback: LengthUnit): LengthUnit {
  const dimCols: number[] = [cols.dimensionL, cols.dimensionH];
  if (cols.dimensionP !== undefined) dimCols.push(cols.dimensionP);
  for (const i of dimCols) {
    const h = i >= 0 && i < headers.length ? (headers[i] ?? "") : "";
    const detected = detectUnitFromHeader(h);
    if (detected !== null) return detected;
  }
  return fallback;
}

/** Locate the table a ClassifiedItem points at, or null if coordinates are stale. */
function tableFor(doc: StructuredDocument, ci: ClassifiedItem) {
  const page = doc.pages.find((p) => p.index === ci.pageIndex);
  return page?.tables.find((t) => t.index === ci.tableIndex) ?? null;
}

/**
 * Header text that identifies a dimension column. Matches dimension words
 * (height/width/depth/length), Italian equivalents (prof/alt/lungh), an explicit
 * unit marker (cm/mm/`(m)`), or a leading single dimension letter — `L`/`W`/`H`/`D`/`P`
 * either bare or followed by a unit, e.g. `"H (m)"`.
 */
const DIMENSION_HEADER = /(height|width|depth|length|dimension|\bcm\b|\bmm\b|\(m\)|prof|alt|lungh|^\s*[lwhdp]\b)/i;

/**
 * A table is a packable cargo manifest only if its configured dimension columns
 * carry dimension headers. This rejects summary/classification tables (e.g. a
 * second table that repeats the items with only Category/Classification columns)
 * which would otherwise yield a flood of dimensionless "unplaced" phantoms.
 */
function isDimensionedTable(headers: string[], cols: ColumnMap["columns"]): boolean {
  const at = (i: number) => (i >= 0 && i < headers.length ? headers[i] ?? "" : "");
  return DIMENSION_HEADER.test(at(cols.dimensionL)) && DIMENSION_HEADER.test(at(cols.dimensionH));
}

export interface AssembleInput {
  readonly doc: StructuredDocument;
  readonly classification: ClassificationResult;
  readonly columnMap: ColumnMap;
  readonly matrix: StackabilityMatrix;
}

/** Build the packable `Item[]` for a job. Order follows the classification list. */
export function assembleItems(input: AssembleInput): Item[] {
  const { doc, classification, columnMap, matrix } = input;
  const items: Item[] = [];

  const sep = columnMap.decimalSeparator;
  const num = (raw: string | undefined) => parseNumeric(raw, sep);

  for (const ci of classification.items) {
    const table = tableFor(doc, ci);
    const row = table?.rows[ci.rowIndex] ?? null;
    if (table === null || row === null || row === undefined) {
      logger.warn("classified row not found in document", {
        page: ci.pageIndex,
        table: ci.tableIndex,
        row: ci.rowIndex,
      });
      continue;
    }

    // Locate columns by header text per table (falls back to fixed indices), so
    // one config maps differing layouts — a 6-col cm sheet and an 11-col m sheet.
    const cols = resolveColumnIndices(table.headers, columnMap);

    // Skip rows from non-cargo tables (no dimension columns) — e.g. a summary
    // table that repeats the items with only Category/Classification columns.
    if (!isDimensionedTable(table.headers, cols)) continue;

    const unit = resolveUnit(table.headers, cols, columnMap.inputUnit);
    const code = (cell(row, cols.code) ?? "").trim();
    const name = (cell(row, cols.description) ?? ci.label).trim();

    const category = categoryForCode(columnMap, code);
    const rules = resolveStackRules(matrix, category);

    const explicitWeightKg =
      cols.weight !== undefined ? num(cell(row, cols.weight)) : null;

    // Parse the raw dimensions, convert to metres immediately. Depth may be absent (2-D source).
    const lRaw = num(cell(row, cols.dimensionL));
    const hRaw = num(cell(row, cols.dimensionH));
    const pRaw =
      cols.dimensionP !== undefined ? num(cell(row, cols.dimensionP)) : null;

    const l = lRaw !== null && lRaw > 0 ? toMetres(lRaw, unit) : null;
    const h = hRaw !== null && hRaw > 0 ? toMetres(hRaw, unit) : null;
    let w = pRaw !== null && pRaw > 0 ? toMetres(pRaw, unit) : null;

    // No depth column ⇒ derive it from mass + density (see deriveDepthM).
    if (w === null && cols.dimensionP === undefined && l !== null && h !== null) {
      w = deriveDepthM(explicitWeightKg, rules.densityKgPerM3, l, h);
    }

    const dimensions: Dimensions | null =
      l !== null && h !== null && w !== null && w > 0 ? { l, w, h } : null;

    const qtyParsed =
      cols.quantity !== undefined ? num(cell(row, cols.quantity)) : null;
    const quantity = qtyParsed !== null && qtyParsed >= 1 ? Math.floor(qtyParsed) : 1;

    const weightKg = estimateWeightKg({
      dimensions,
      explicitWeightKg,
      densityKgPerM3: rules.densityKgPerM3,
    });

    items.push({
      id: `${ci.pageIndex}-${ci.tableIndex}-${ci.rowIndex}`,
      name: name || code || "item",
      dimensions,
      weightKg,
      quantity,
      fragility: ci.fragility,
      category,
      // Any item may be placed on top of a compatible base — the support rule
      // (fragility compatibility + crush pressure) decides where it can actually
      // go: standards form columns, fragile rests only on fragile. The matrix
      // still owns density + orientation.
      stackable: true,
      canSupportWeightKg: rules.canSupportWeightKg,
      orientationFixed: rules.orientationFixed,
      maxStackPressureKpa: rules.maxStackPressureKpa,
    });
  }

  return items;
}
