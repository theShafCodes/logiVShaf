# Data Model

The spine. Every stage is "transform A into B"; if A/B are sloppy every downstream stage inherits the mess. Built types are accurate to current code; planned types are contracts for stages not yet written.

## Built — Stage 1 output (`src/lib/conversion/types.ts`)
The computer-readable form of an extracted PDF.

- **`ExtractedTable`** — `{ index, headers: string[], rows: string[][] }`. One grid parsed out of a page.
- **`PageContent`** — `{ index, markdown, tables: ExtractedTable[] }`. `markdown` is kept verbatim for the visual preview / audit trail.
- **`StructuredDocument`** — `{ pageCount, tableCount, pages: PageContent[] }`. The whole document.

OCR-layer intermediate (`src/lib/ocr/extractor.types.ts`): `OcrDocument { model, pages: OcrPage[], usage }` → converted into `StructuredDocument` by `src/lib/conversion/document.builder.ts`.

## Built — Stage 2 output (`src/lib/classification/types.ts`)
- **`Fragility`** = `"fragile" | "standard"`.
- **`ClassifiedItem`** — `{ pageIndex, tableIndex, rowIndex, label, fragility, confident, matchedTerm, reason }`. Position fields trace the row back to the preview; `confident=false` means the rules didn't match and we fell back to the default (flag for review); `matchedTerm`/`reason` are the audit trail.
- **`ClassificationCounts`** — `{ fragile, standard, lowConfidence }`.
- **`ClassificationResult`** — `{ provider, items, counts }`.

## Planned — the rest of the domain
These don't exist as `.ts` yet; they land with their stages. Documented here so the shape is agreed before the code.

- **`Item`** — the unit the packer and pricer reason about. `{ name, dimensions: {l,w,h}, weight, quantity, fragility, fragilitySource, category }`. Derived from `ClassifiedItem` + the parsed dimension columns. `fragilitySource` = `rule | llm | override`.
- **`Quotation`** — `{ items: Item[], sourcePdfRef, extractionMeta }`. The reviewed/corrected job; what the user confirms before packing.
- **`Van`** — `{ id, label, interior: {l,w,h}, maxPayloadKg, doorAperture?, fuelCostPerMile?, perMileRate }`. Configured in admin presets ([admin-van-config.md](admin-van-config.md)); the live source for Stages 3 & 5. Never hardcoded.
- **`PackingResult`** — `{ van, placements: { itemId, position:{x,y,z}, rotation }[], utilization, unplaced: Item[] }`. Pure serializable geometry — no rendering concern, so Stage 4 is a pure function of it.
- **`Route`** — `{ origin, destination, distance, duration }`. From the route provider.
- **`Quote`** — `{ route, van, lineItems, subtotal, surcharges, total }`. `total = distance × van.perMileRate (+ fragility surcharges)`.

## Relationships
```
StructuredDocument ──parse cols──▶ Item[] ──┐
ClassificationResult ──fragility──▶ Item   ─┤
                                            ▼
                                  Quotation ──┬─▶ PackingResult ──▶ (Stage 4 render)
                                     Van ─────┘                       │
                                     Route ───────────────────────────┴─▶ Quote
```
