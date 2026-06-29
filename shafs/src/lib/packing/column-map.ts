/**
 * Loads + validates the line-item column map (column indices + category code
 * patterns) from disk. Mirrors the ruleset loader pattern (load + parse-from
 * hook); fails loud on a malformed file.
 */
import { resolve } from "node:path";
import { getConfig } from "@/config/env";
import { loadJsonFile } from "@/lib/packing/config-loader";
import type { PackingCategory } from "@/lib/packing/packing.types";

export interface ColumnIndices {
  readonly code: number;
  /** Optional quantity column; absent ⇒ one unit per row. */
  readonly quantity?: number;
  readonly description: number;
  /** Length → van x-axis. */
  readonly dimensionL: number;
  /** Height → van z-axis. */
  readonly dimensionH: number;
  /** Depth → van y-axis. Absent ⇒ derived from mass ÷ (density × face area). */
  readonly dimensionP?: number;
  /** Optional per-item weight column; absent ⇒ weight is estimated. */
  readonly weight?: number;
}

export interface CategoryPattern {
  readonly category: PackingCategory;
  readonly regex: RegExp;
}

export interface ColumnMap {
  readonly version: number;
  /** Multiplier converting source dimension units to millimetres (cm ⇒ 10, mm ⇒ 1). */
  readonly unitScale: number;
  readonly columns: ColumnIndices;
  readonly defaultCategory: PackingCategory;
  readonly categoryPatterns: CategoryPattern[];
}

const VALID_CATEGORIES: readonly PackingCategory[] = [
  "heavy-material",
  "glass-panel",
  "light-industrial",
  "appliance",
  "top",
  "base-cabinet",
  "wall-cabinet",
  "tall-unit",
  "accessory",
];

export class ColumnMapError extends Error {
  constructor(message: string) {
    super(`[column-map] ${message}`);
    this.name = "ColumnMapError";
  }
}

function isCategory(v: unknown): v is PackingCategory {
  return typeof v === "string" && (VALID_CATEGORIES as readonly string[]).includes(v);
}

function parseColumns(value: unknown): ColumnIndices {
  if (typeof value !== "object" || value === null) {
    throw new ColumnMapError('"columns" must be an object');
  }
  const o = value as Record<string, unknown>;
  const idx = (key: string, optional = false): number | undefined => {
    const v = o[key];
    if (v === undefined && optional) return undefined;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      throw new ColumnMapError(`columns.${key} must be a non-negative integer`);
    }
    return v;
  };
  return {
    code: idx("code")!,
    quantity: idx("quantity", true),
    description: idx("description")!,
    dimensionL: idx("dimensionL")!,
    dimensionH: idx("dimensionH")!,
    dimensionP: idx("dimensionP", true),
    weight: idx("weight", true),
  };
}

function parsePatterns(value: unknown): CategoryPattern[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ColumnMapError('"categoryPatterns" must be an array');
  return value.map((entry, i) => {
    const o = entry as Record<string, unknown>;
    if (!isCategory(o.category)) {
      throw new ColumnMapError(`categoryPatterns[${i}].category is not a known category`);
    }
    if (typeof o.pattern !== "string" || o.pattern === "") {
      throw new ColumnMapError(`categoryPatterns[${i}].pattern must be a non-empty string`);
    }
    let regex: RegExp;
    try {
      regex = new RegExp(o.pattern, "i");
    } catch {
      throw new ColumnMapError(`categoryPatterns[${i}].pattern is not a valid regex`);
    }
    return { category: o.category, regex };
  });
}

function parseColumnMap(json: unknown): ColumnMap {
  if (typeof json !== "object" || json === null) {
    throw new ColumnMapError("column map must be a JSON object");
  }
  const obj = json as Record<string, unknown>;
  if (!isCategory(obj.defaultCategory)) {
    throw new ColumnMapError('"defaultCategory" is not a known category');
  }
  const unitScale = obj.unitScale === undefined ? 1 : obj.unitScale;
  if (typeof unitScale !== "number" || !Number.isFinite(unitScale) || unitScale <= 0) {
    throw new ColumnMapError('"unitScale" must be a positive number');
  }
  return {
    version: typeof obj.version === "number" ? obj.version : 0,
    unitScale,
    columns: parseColumns(obj.columns),
    defaultCategory: obj.defaultCategory,
    categoryPatterns: parsePatterns(obj.categoryPatterns),
  };
}

/** First pattern whose regex matches the product code wins; else the default. */
export function categoryForCode(map: ColumnMap, code: string): PackingCategory {
  for (const p of map.categoryPatterns) {
    if (p.regex.test(code)) return p.category;
  }
  return map.defaultCategory;
}

let cached: ColumnMap | null = null;

export async function loadColumnMap(): Promise<ColumnMap> {
  if (cached) return cached;
  const path = resolve(process.cwd(), getConfig().packing.columnMapPath);
  cached = await loadJsonFile(path, parseColumnMap, ColumnMapError);
  return cached;
}

/** Test hook — parse a column map object without touching disk or the cache. */
export function parseColumnMapFrom(json: unknown): ColumnMap {
  return parseColumnMap(json);
}
