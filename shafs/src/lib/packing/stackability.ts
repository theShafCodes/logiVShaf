/**
 * Loads + validates the editable stacking matrix from disk (path from config).
 * Maps a transport category to its stacking rules; unknown categories resolve to
 * the conservative `fallback` row (nothing stacks on it, no rotation). Fails loud
 * on a malformed file. Mirrors the ruleset loader pattern (load + parse-from hook).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getConfig } from "@/config/env";
import type { PackingCategory, StackRules } from "@/lib/packing/packing.types";

export interface StackabilityMatrix {
  readonly version: number;
  readonly fallback: StackRules;
  readonly categories: Readonly<Record<string, StackRules>>;
}

export class StackabilityError extends Error {
  constructor(message: string) {
    super(`[stackability] ${message}`);
    this.name = "StackabilityError";
  }
}

function parseRules(obj: unknown, where: string): StackRules {
  if (typeof obj !== "object" || obj === null) {
    throw new StackabilityError(`${where} must be an object`);
  }
  const o = obj as Record<string, unknown>;
  const num = (key: string): number => {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new StackabilityError(`${where}.${key} must be a non-negative number`);
    }
    return v;
  };
  const bool = (key: string): boolean => {
    const v = o[key];
    if (typeof v !== "boolean") throw new StackabilityError(`${where}.${key} must be a boolean`);
    return v;
  };
  return {
    stackable: bool("stackable"),
    canSupportWeightKg: num("canSupportWeightKg"),
    orientationFixed: bool("orientationFixed"),
    densityKgPerM3: num("densityKgPerM3"),
  };
}

function parseMatrix(json: unknown): StackabilityMatrix {
  if (typeof json !== "object" || json === null) {
    throw new StackabilityError("matrix must be a JSON object");
  }
  const obj = json as Record<string, unknown>;
  const fallback = parseRules(obj.fallback, "fallback");

  const rawCategories = obj.categories;
  if (typeof rawCategories !== "object" || rawCategories === null) {
    throw new StackabilityError('"categories" must be an object');
  }
  const categories: Record<string, StackRules> = {};
  for (const [name, value] of Object.entries(rawCategories as Record<string, unknown>)) {
    categories[name] = parseRules(value, `categories.${name}`);
  }

  return {
    version: typeof obj.version === "number" ? obj.version : 0,
    fallback,
    categories,
  };
}

/** Resolve the stacking rules for a category, falling back to the conservative row. */
export function resolveStackRules(
  matrix: StackabilityMatrix,
  category: PackingCategory,
): StackRules {
  return matrix.categories[category] ?? matrix.fallback;
}

let cached: StackabilityMatrix | null = null;

export async function loadStackabilityMatrix(): Promise<StackabilityMatrix> {
  if (cached) return cached;
  const path = resolve(process.cwd(), getConfig().packing.stackabilityPath);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new StackabilityError(`cannot read matrix file at ${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new StackabilityError(`matrix file is not valid JSON: ${path}`);
  }
  cached = parseMatrix(json);
  return cached;
}

/** Test hook — parse a matrix object without touching disk or the cache. */
export function parseStackabilityFrom(json: unknown): StackabilityMatrix {
  return parseMatrix(json);
}
