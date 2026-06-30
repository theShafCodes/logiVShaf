/**
 * Loads + validates the line-item column map (column indices + category code
 * patterns) from disk. Mirrors the ruleset loader pattern (load + parse-from
 * hook); fails loud on a malformed file.
 */
import { resolve } from "node:path";
import { getConfig } from "@/config/env";
import { loadJsonFile } from "@/lib/packing/config-loader";
import type { PackingCategory } from "@/lib/packing/packing.types";

/** Recognised source length units. */
export type LengthUnit = "m" | "cm" | "mm" | "in";

/** Multiplier to convert one unit to metres. */
export const TO_METRES: Record<LengthUnit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  in: 0.0254,
};

export function toMetres(value: number, unit: LengthUnit): number {
  return value * TO_METRES[unit];
}

/**
 * Detect a length unit from a column header string.
 * Checked in specificity order (mm/cm before bare m) to avoid false matches.
 * Returns null when no recognised marker is found.
 */
const UNIT_HEADER_PATTERNS: ReadonlyArray<[LengthUnit, RegExp]> = [
  ["mm", /\bmm\b|\bmillimet(?:re|er)s?\b/i],
  ["cm", /\bcm\b|\bcentimet(?:re|er)s?\b/i],
  ["in", /\binch(?:es)?\b/i],
  ["m",  /\bmet(?:re|er)s?\b|\(m\)/i],
];

export function detectUnitFromHeader(header: string): LengthUnit | null {
  for (const [unit, rx] of UNIT_HEADER_PATTERNS) {
    if (rx.test(header)) return unit;
  }
  return null;
}

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
  /**
   * Declared source unit for dimension columns — used as fallback when no unit
   * marker is found in column headers. The assembler detects from headers first
   * so the same column map works across sources that print "cm" in the header.
   */
  readonly inputUnit: LengthUnit;
  /**
   * Decimal convention of the numeric cells. "," = Italian/European (dot is the
   * thousands separator, comma the decimal point — e.g. "1.234,56" → 1234.56);
   * "." = English/US (comma thousands, dot decimal — e.g. "1,234.56" → 1234.56).
   * Declared per source because the two are genuinely ambiguous (Italian "1.200"
   * means 1200, English "1.200" means 1.2) — guessing corrupts dimensions.
   * Defaults to "," for back-compat with the original Italian importer.
   */
  readonly decimalSeparator: "." | ",";
  readonly columns: ColumnIndices;
  /**
   * Optional per-field header regexes. When present for a field, the column is
   * located by matching the table's header row (first match wins) instead of a
   * fixed index — so one config handles tables whose columns sit in different
   * positions (e.g. a 6-column cm sheet vs an 11-column metres sheet). `columns`
   * stays as the fallback for required fields when no header matches, and for
   * tables with no usable header text.
   */
  readonly headerPatterns: HeaderPatterns;
  readonly defaultCategory: PackingCategory;
  readonly categoryPatterns: CategoryPattern[];
}

export type HeaderPatterns = Readonly<Partial<Record<keyof ColumnIndices, RegExp>>>;

/**
 * Resolve the effective column indices for one table by matching its header row
 * against `headerPatterns`. A field with a pattern uses the first header it
 * matches; required fields fall back to the fixed `columns` index when nothing
 * matches, optional fields (depth/weight/quantity) become absent. Fields without
 * a pattern always use the fixed index.
 */
export function resolveColumnIndices(headers: string[], map: ColumnMap): ColumnIndices {
  const hp = map.headerPatterns;
  const c = map.columns;
  const byHeader = (rx: RegExp | undefined): number | undefined => {
    if (!rx) return undefined;
    const i = headers.findIndex((h) => rx.test(h));
    return i >= 0 ? i : undefined;
  };
  const required = (field: keyof ColumnIndices, fallback: number): number =>
    hp[field] ? (byHeader(hp[field]) ?? fallback) : fallback;
  const optional = (field: keyof ColumnIndices, fallback: number | undefined): number | undefined =>
    hp[field] ? byHeader(hp[field]) : fallback;
  return {
    code: required("code", c.code),
    description: required("description", c.description),
    dimensionL: required("dimensionL", c.dimensionL),
    dimensionH: required("dimensionH", c.dimensionH),
    dimensionP: optional("dimensionP", c.dimensionP),
    weight: optional("weight", c.weight),
    quantity: optional("quantity", c.quantity),
  };
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

const VALID_UNITS: ReadonlyArray<LengthUnit> = ["m", "cm", "mm", "in"];

function isLengthUnit(v: unknown): v is LengthUnit {
  return typeof v === "string" && (VALID_UNITS as readonly string[]).includes(v);
}

function parseColumnMap(json: unknown): ColumnMap {
  if (typeof json !== "object" || json === null) {
    throw new ColumnMapError("column map must be a JSON object");
  }
  const obj = json as Record<string, unknown>;
  if (!isCategory(obj.defaultCategory)) {
    throw new ColumnMapError('"defaultCategory" is not a known category');
  }
  if (!isLengthUnit(obj.inputUnit)) {
    throw new ColumnMapError('"inputUnit" must be one of: m, cm, mm, in');
  }
  if (obj.decimalSeparator !== undefined && obj.decimalSeparator !== "." && obj.decimalSeparator !== ",") {
    throw new ColumnMapError('"decimalSeparator" must be "." or ","');
  }
  return {
    version: typeof obj.version === "number" ? obj.version : 0,
    inputUnit: obj.inputUnit,
    decimalSeparator: (obj.decimalSeparator as "." | "," | undefined) ?? ",",
    columns: parseColumns(obj.columns),
    headerPatterns: parseHeaderPatterns(obj.headerPatterns),
    defaultCategory: obj.defaultCategory,
    categoryPatterns: parsePatterns(obj.categoryPatterns),
  };
}

const HEADER_PATTERN_FIELDS: ReadonlyArray<keyof ColumnIndices> = [
  "code", "description", "dimensionL", "dimensionH", "dimensionP", "weight", "quantity",
];

function parseHeaderPatterns(value: unknown): HeaderPatterns {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null) {
    throw new ColumnMapError('"headerPatterns" must be an object');
  }
  const o = value as Record<string, unknown>;
  const out: Record<string, RegExp> = {};
  for (const field of HEADER_PATTERN_FIELDS) {
    const pat = o[field];
    if (pat === undefined) continue;
    if (typeof pat !== "string" || pat === "") {
      throw new ColumnMapError(`headerPatterns.${field} must be a non-empty string`);
    }
    try {
      out[field] = new RegExp(pat, "i");
    } catch {
      throw new ColumnMapError(`headerPatterns.${field} is not a valid regex`);
    }
  }
  return out;
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
