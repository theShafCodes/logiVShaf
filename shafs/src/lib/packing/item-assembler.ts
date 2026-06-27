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
import { categoryForCode, type ColumnMap } from "@/lib/packing/column-map";
import { resolveStackRules, type StackabilityMatrix } from "@/lib/packing/stackability";
import { estimateWeightKg } from "@/lib/packing/weight-estimator";
import type { Dimensions, Item } from "@/lib/packing/packing.types";
import type { ClassificationResult, ClassifiedItem } from "@/lib/classification/types";
import type { StructuredDocument, TableRow } from "@/lib/conversion/types";

const logger = createLogger("packing.assembler");

/**
 * Italian number → float. "1.234,56" → 1234.56 (dot = thousands, comma = decimal).
 * Ported from logi-v1-main parse-quotation. Returns null for blank/non-numeric.
 */
export function parseItalianNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function cell(row: TableRow, index: number): string | undefined {
  return index >= 0 && index < row.length ? row[index] : undefined;
}

/** Locate the table row a ClassifiedItem points at, or null if coordinates are stale. */
function rowFor(doc: StructuredDocument, ci: ClassifiedItem): TableRow | null {
  const page = doc.pages.find((p) => p.index === ci.pageIndex);
  const table = page?.tables.find((t) => t.index === ci.tableIndex);
  const row = table?.rows[ci.rowIndex];
  return row ?? null;
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

  for (const ci of classification.items) {
    const row = rowFor(doc, ci);
    if (row === null) {
      logger.warn("classified row not found in document", {
        page: ci.pageIndex,
        table: ci.tableIndex,
        row: ci.rowIndex,
      });
      continue;
    }

    const cols = columnMap.columns;
    const code = (cell(row, cols.code) ?? "").trim();
    const name = (cell(row, cols.description) ?? ci.label).trim();

    const l = parseItalianNumber(cell(row, cols.dimensionL));
    const h = parseItalianNumber(cell(row, cols.dimensionH));
    const p = parseItalianNumber(cell(row, cols.dimensionP));
    const dimensions: Dimensions | null =
      l !== null && h !== null && p !== null && l > 0 && h > 0 && p > 0
        ? { l, w: p, h }
        : null;

    const qtyParsed = parseItalianNumber(cell(row, cols.quantity));
    const quantity = qtyParsed !== null && qtyParsed >= 1 ? Math.floor(qtyParsed) : 1;

    const category = categoryForCode(columnMap, code);
    const rules = resolveStackRules(matrix, category);

    const explicitWeightKg =
      cols.weight !== undefined ? parseItalianNumber(cell(row, cols.weight)) : null;
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
      stackable: rules.stackable,
      canSupportWeightKg: rules.canSupportWeightKg,
      orientationFixed: rules.orientationFixed,
    });
  }

  return items;
}
