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

// Shipped schema: | Item # | Item Description | Material | Height (cm) | Width (cm) | Weight (kg) |
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
          headers: ["Item #", "Item Description", "Material", "Height (cm)", "Width (cm)", "Weight (kg)"],
          rows: [
            ["1", "Industrial Steel I-Beam (12m)", "Structural Steel", "50", "1200", "850"],
            ["6", "Cast Iron Machine Gear Assembly", "Cast Iron", "80", "100", "156"],
            ["7", "Mystery Panel (no weight)", "Foam", "100", "100", ""],
          ],
        },
      ],
    },
  ],
};

const classification: ClassificationResult = {
  provider: "rule",
  counts: { fragile: 0, standard: 3, lowConfidence: 0 },
  items: [
    { pageIndex: 0, tableIndex: 0, rowIndex: 0, label: "I-Beam", fragility: "standard", confident: true, matchedTerm: null, reason: "" },
    { pageIndex: 0, tableIndex: 0, rowIndex: 1, label: "Gear", fragility: "standard", confident: true, matchedTerm: null, reason: "" },
    { pageIndex: 0, tableIndex: 0, rowIndex: 2, label: "Mystery", fragility: "standard", confident: true, matchedTerm: null, reason: "" },
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

describe("assembleItems — 2-D source (cm) with derived depth", () => {
  const items = assembleItems({ doc, classification, columnMap, matrix });

  it("builds one Item per classified row", () => {
    expect(items).toHaveLength(3);
  });

  it("scales cm→mm (Width→l, Height→h) and derives a plausible depth", () => {
    const beam = items[0]!;
    expect(beam.dimensions).not.toBeNull();
    expect(beam.dimensions!.l).toBe(12000); // 1200 cm → mm
    expect(beam.dimensions!.h).toBe(500); //   50 cm → mm
    // Derived depth stays a plausible box: positive, not deeper than the largest axis.
    expect(beam.dimensions!.w).toBeGreaterThan(0);
    expect(beam.dimensions!.w).toBeLessThanOrEqual(12000);
    expect(beam.quantity).toBe(1); // no quantity column ⇒ one unit
    expect(beam.weightKg).toBe(850);
  });

  it("derives category from the description and resolves its rules", () => {
    const gear = items[1]!;
    expect(gear.category).toBe("heavy-material"); // "Cast Iron" matches heavy-material (density ~7000 kg/m³)
    expect(gear.dimensions).toEqual({ l: 1000, h: 800, w: expect.any(Number) });
  });

  it("makes a standard item stackable even when its category matrix row says false", () => {
    // Fragility-driven stacking: the gear is a standard 'appliance' (matrix
    // stackable:false), yet a standard item must always stack into columns.
    const gear = items[1]!;
    expect(gear.fragility).toBe("standard");
    expect(gear.stackable).toBe(true);
  });

  it("flags a row whose depth cannot be derived (no weight) instead of guessing", () => {
    const mystery = items[2]!;
    expect(mystery.dimensions).toBeNull();
    expect(mystery.weightKg).toBe(0);
  });

  it("skips rows from a non-cargo summary table (no dimension headers)", () => {
    const twoTableDoc: StructuredDocument = {
      pageCount: 1,
      tableCount: 2,
      pages: [
        {
          index: 0,
          markdown: "",
          tables: [
            doc.pages[0]!.tables[0]!, // the dimensioned cargo table (3 rows)
            {
              index: 1,
              headers: ["Item #", "Item Description", "Category", "Classification"],
              rows: [["1", "Industrial Steel I-Beam (12m)", "Standard", "Standard"]],
            },
          ],
        },
      ],
    };
    const withSummary: ClassificationResult = {
      ...classification,
      items: [
        ...classification.items,
        { pageIndex: 0, tableIndex: 1, rowIndex: 0, label: "I-Beam", fragility: "standard", confident: true, matchedTerm: null, reason: "" },
      ],
    };
    const result = assembleItems({ doc: twoTableDoc, classification: withSummary, columnMap, matrix });
    expect(result).toHaveLength(3); // the 4th row (summary table) is skipped, not flagged
  });
});

describe("assembleItems — legacy explicit 3-D source (mm)", () => {
  // Arredo3-style: explicit L/H/P columns, mm units, code-based categories.
  const arredo3Map = parseColumnMapFrom({
    version: 1,
    unitScale: 1,
    columns: { code: 1, quantity: 2, description: 3, dimensionL: 4, dimensionH: 5, dimensionP: 6 },
    defaultCategory: "base-cabinet",
    categoryPatterns: [{ category: "appliance", pattern: "^EFOR" }],
  });

  const arredoDoc: StructuredDocument = {
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
  const arredoClass: ClassificationResult = {
    provider: "rule",
    counts: { fragile: 0, standard: 3, lowConfidence: 0 },
    items: [
      { pageIndex: 0, tableIndex: 0, rowIndex: 0, label: "Forno", fragility: "fragile", confident: true, matchedTerm: "forno", reason: "" },
      { pageIndex: 0, tableIndex: 0, rowIndex: 1, label: "Base unit", fragility: "standard", confident: true, matchedTerm: null, reason: "" },
      { pageIndex: 0, tableIndex: 0, rowIndex: 2, label: "Piano cucina", fragility: "standard", confident: true, matchedTerm: null, reason: "" },
    ],
  };

  const items = assembleItems({ doc: arredoDoc, classification: arredoClass, columnMap: arredo3Map, matrix });

  it("maps L→l, P→w, H→h with no scaling", () => {
    expect(items[0]!.dimensions).toEqual({ l: 598, w: 550, h: 595 });
    expect(items[0]!.category).toBe("appliance");
  });

  it("carries the category's crush limit through to the item", () => {
    const forno = items[0]!; // fragile oven, 'appliance' → maxStackPressureKpa 12
    expect(forno.fragility).toBe("fragile");
    expect(forno.maxStackPressureKpa).toBe(12);
  });

  it("expands quantity from its column", () => {
    expect(items[1]!.quantity).toBe(2);
  });

  it("flags an explicit row with a missing dimension (does not derive)", () => {
    expect(items[2]!.dimensions).toBeNull(); // missing P, no derivation in explicit mode
  });
});
