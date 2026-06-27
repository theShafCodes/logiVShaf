/** S3.4 — item-assembly bridge: classified rows + table columns → Item[]. */
import { describe, it, expect } from "vitest";
import { assembleItems, parseItalianNumber } from "@/lib/packing/item-assembler";
import { parseColumnMapFrom } from "@/lib/packing/column-map";
import { parseStackabilityFrom } from "@/lib/packing/stackability";
import { readConfigJson } from "./fixtures";
import type { StructuredDocument } from "@/lib/conversion/types";
import type { ClassificationResult } from "@/lib/classification/types";

const columnMap = parseColumnMapFrom(readConfigJson("config/column-map.json"));
const matrix = parseStackabilityFrom(readConfigJson("config/stackability.json"));

const doc: StructuredDocument = {
  pageCount: 1,
  tableCount: 1,
  pages: [
    {
      index: 0,
      markdown: "",
      tables: [
        {
          index: 0,
          headers: ["#", "Cod", "Qta", "Descrizione", "L", "H", "P"],
          rows: [
            ["1", "EFOR600", "1", "Forno", "598", "595", "550"],
            ["2", "BASE600", "2", "Base unit", "600", "720", "560"],
            ["3", "TOP120", "1", "Piano cucina", "1.200", "40", ""],
          ],
        },
      ],
    },
  ],
};

const classification: ClassificationResult = {
  provider: "rule",
  counts: { fragile: 1, standard: 2, lowConfidence: 0 },
  items: [
    { pageIndex: 0, tableIndex: 0, rowIndex: 0, label: "Forno", fragility: "fragile", confident: true, matchedTerm: "forno", reason: "" },
    { pageIndex: 0, tableIndex: 0, rowIndex: 1, label: "Base unit", fragility: "standard", confident: true, matchedTerm: null, reason: "" },
    { pageIndex: 0, tableIndex: 0, rowIndex: 2, label: "Piano cucina", fragility: "standard", confident: true, matchedTerm: null, reason: "" },
  ],
};

describe("parseItalianNumber", () => {
  it("treats dot as thousands and comma as decimal", () => {
    expect(parseItalianNumber("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseItalianNumber("600")).toBe(600);
    expect(parseItalianNumber("")).toBeNull();
    expect(parseItalianNumber("abc")).toBeNull();
  });
});

describe("assembleItems", () => {
  const items = assembleItems({ doc, classification, columnMap, matrix });

  it("builds one Item per classified row", () => {
    expect(items).toHaveLength(3);
  });

  it("maps L→l, P→w, H→h and carries category + fragility", () => {
    const oven = items[0]!;
    expect(oven.dimensions).toEqual({ l: 598, w: 550, h: 595 });
    expect(oven.category).toBe("appliance");
    expect(oven.fragility).toBe("fragile");
    expect(oven.weightKg).toBeGreaterThan(0);
  });

  it("expands quantity and resolves base-cabinet stacking rules", () => {
    const base = items[1]!;
    expect(base.quantity).toBe(2);
    expect(base.category).toBe("base-cabinet");
    expect(base.stackable).toBe(true);
    expect(base.canSupportWeightKg).toBeGreaterThan(0);
  });

  it("flags a row with a missing dimension instead of guessing", () => {
    const top = items[2]!;
    expect(top.dimensions).toBeNull(); // missing P
    expect(top.weightKg).toBe(0);
    expect(top.category).toBe("top");
  });
});
