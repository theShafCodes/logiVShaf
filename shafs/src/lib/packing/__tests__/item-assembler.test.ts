/** S3.4 — item-assembly bridge: classified rows + table columns → Item[]. */
import { describe, it, expect } from "vitest";
import { assembleItems, parseItalianNumber } from "@/lib/packing/item-assembler";
import { HeuristicPacker } from "@/lib/packing/heuristic-packer";
import { parseColumnMapFrom } from "@/lib/packing/column-map";
import { parseStackabilityFrom } from "@/lib/packing/stackability";
import { readConfigJson } from "./fixtures";
import type { StructuredDocument } from "@/lib/conversion/types";
import type { ClassificationResult } from "@/lib/classification/types";

const matrix = parseStackabilityFrom(readConfigJson("config/stackability.json"));

// The shipped, header-driven column map must map BOTH real layouts. This guards the
// regression where repointing fixed indices for one sheet broke the other.
describe("assembleItems — shipped config resolves both layouts by header", () => {
  const shipped = parseColumnMapFrom(readConfigJson("config/column-map.json"));
  const oneRow = (headers: string[], row: string[]): { doc: StructuredDocument; cls: ClassificationResult } => ({
    doc: { pageCount: 1, tableCount: 1, pages: [{ index: 0, markdown: "", tables: [{ index: 0, headers, rows: [row] }] }] },
    cls: { provider: "rule", counts: { fragile: 0, standard: 1, lowConfidence: 0 },
      items: [{ pageIndex: 0, tableIndex: 0, rowIndex: 0, label: "x", fragility: "standard", confident: true, matchedTerm: null, reason: "" }] },
  });

  it("6-column cm sheet (INDUSTRIAL): Height/Width by header, depth derived, cm→m", () => {
    const { doc, cls } = oneRow(
      ["Item #", "Item Description", "Material", "Height (cm)", "Width (cm)", "Weight (kg)"],
      ["1", "Industrial Steel I-Beam", "Steel", "50", "1200", "850"],
    );
    const items = assembleItems({ doc, classification: cls, columnMap: shipped, matrix });
    expect(items).toHaveLength(1);
    expect(items[0]!.dimensions!.h).toBeCloseTo(0.5, 6); // 50 cm
    expect(items[0]!.dimensions!.l).toBeCloseTo(12, 6); // 1200 cm (Width→l)
    expect(items[0]!.weightKg).toBe(850);
    expect(items[0]!.quantity).toBe(1); // no quantity column
  });

  // Both the full ("Height (m)") and abbreviated ("H (m)") SPLIT header variants
  // exist in real OCR output — both must resolve identically.
  for (const [variant, dimHeaders, wtHeader] of [
    ["full", ["Height (m)", "Width (m)", "Depth (m)"], "Unit Weight (kg)"],
    ["abbreviated", ["H (m)", "W (m)", "D (m)"], "Unit Wt (kg)"],
  ] as const) {
    it(`11-column m sheet (SPLIT, ${variant} headers): H/W/D + weight + quantity, dot decimals`, () => {
      const { doc, cls } = oneRow(
        ["#", "Item Description", "Category", "Material", ...dimHeaders, wtHeader, "Quantity", "Line Volume (m³)", variant === "full" ? "Line Weight (kg)" : "Line Wt (kg)"],
        ["1", "Sun Lounger Pair (boxed)", "Garden", "Plastic", "1.03", "0.97", "1.05", "79.89", "14", "14.69", "1118.5"],
      );
      const items = assembleItems({ doc, classification: cls, columnMap: shipped, matrix });
      expect(items).toHaveLength(1);
      expect(items[0]!.dimensions!.h).toBeCloseTo(1.03, 6); // dot is decimal, not thousands (was 103)
      expect(items[0]!.dimensions!.l).toBeCloseTo(0.97, 6); // Width→l
      expect(items[0]!.dimensions!.w).toBeCloseTo(1.05, 6); // Depth→w (read, not derived)
      expect(items[0]!.weightKg).toBeCloseTo(79.89, 2); // Unit Weight, not Line Weight (idx wins by first match)
      expect(items[0]!.quantity).toBe(14);
      // Real placement: a correctly-sized item must fit a large van (proves it's no longer a 103 m phantom).
      const packed = new HeuristicPacker({ toleranceM: 0.005 }).pack(
        [{ ...items[0]!, quantity: 1 }],
        { id: "big", label: "Big", interior: { l: 6, w: 2.4, h: 2.4 }, maxPayloadKg: 5000, perMileRate: 2 },
      );
      expect(packed.placements).toHaveLength(1);
    });
  }
});

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

// Titan/Apex 2-D schema: cm units, Italian decimals, no depth or quantity column.
// Inline (not the shipped config) so this capability test is independent of the
// deployment's current column map.
const titanMap = parseColumnMapFrom({
  version: 2,
  inputUnit: "cm",
  columns: { code: 1, description: 1, dimensionH: 3, dimensionL: 4, weight: 5 },
  defaultCategory: "heavy-material",
  categoryPatterns: [
    { category: "glass-panel", pattern: "(Glass|Panel)" },
    { category: "heavy-material", pattern: "(Steel|Iron|Concrete|Gear)" },
    { category: "appliance", pattern: "(TV|Machine|Motor|Gear|Appliance)" },
  ],
});

describe("assembleItems — 2-D source (cm) with derived depth", () => {
  const items = assembleItems({ doc, classification, columnMap: titanMap, matrix });

  it("builds one Item per classified row", () => {
    expect(items).toHaveLength(3);
  });

  it("scales cm→m (Width→l, Height→h) and derives a plausible depth", () => {
    const beam = items[0]!;
    expect(beam.dimensions).not.toBeNull();
    expect(beam.dimensions!.l).toBe(12); // 1200 cm → 12 m
    expect(beam.dimensions!.h).toBe(0.5); //  50 cm → 0.5 m
    // Derived depth stays a plausible box: positive, not deeper than the largest axis.
    expect(beam.dimensions!.w).toBeGreaterThan(0);
    expect(beam.dimensions!.w).toBeLessThanOrEqual(12);
    expect(beam.quantity).toBe(1); // no quantity column ⇒ one unit
    expect(beam.weightKg).toBe(850);
  });

  it("derives category from the description and resolves its rules", () => {
    const gear = items[1]!;
    expect(gear.category).toBe("heavy-material"); // "Cast Iron" matches heavy-material (density ~7000 kg/m³)
    expect(gear.dimensions).toEqual({ l: 1.0, h: 0.8, w: expect.any(Number) });
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
    const result = assembleItems({ doc: twoTableDoc, classification: withSummary, columnMap: titanMap, matrix });
    expect(result).toHaveLength(3); // the 4th row (summary table) is skipped, not flagged
  });
});

describe("assembleItems — legacy explicit 3-D source (mm)", () => {
  // Arredo3-style: explicit L/H/P columns, mm units, code-based categories.
  const arredo3Map = parseColumnMapFrom({
    version: 1,
    inputUnit: "mm",
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
    expect(items[0]!.dimensions).toEqual({ l: 0.598, w: 0.55, h: 0.595 });
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
