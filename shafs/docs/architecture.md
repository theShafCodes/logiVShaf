# Architecture

## The pipeline in words
A user uploads a PDF quotation; the system turns it into a priced, packable job in five stages. Each stage consumes the previous stage's output and nothing else — the data shape is the contract.

```
PDF ─▶ 1. Ingestion ─▶ StructuredDocument ─▶ 2. Classification ─▶ ClassifiedItem[]
                                                                      │
                                                                      ▼
        5. Quote ◀── 4. Visualization ◀── 3. Packing ◀── Item[] + Van
```

| Stage | Input | Output | Spec |
|-------|-------|--------|------|
| 1 Ingestion | PDF bytes | `StructuredDocument` | [pdf-ingestion.md](pdf-ingestion.md) |
| 2 Classification | `StructuredDocument` | `ClassificationResult` | [fragility.md](fragility.md) |
| 3 Packing | `Item[]` + `Van` | `PackingResult` | [load-calculation.md](load-calculation.md) |
| 4 Visualization | `PackingResult` | (rendered view) | [visualization.md](visualization.md) |
| 5 Routing + pricing | `Route` + `Van` + `Item[]` | `Quote` | [pricing-routing.md](pricing-routing.md) |

## Layering: where logic is allowed to live
Three layers, strictly. Logic only ever flows down.

1. **`src/app/api/*` — transport.** Thin HTTP wrappers. They adapt a request into a typed input, call one service, and shape the JSON response. **No business logic.** Reference: `src/app/api/ingest/route.ts` only parses the multipart form and maps domain errors to status codes.
2. **`src/lib/<domain>/*.service.ts` — orchestration.** Wires the steps of one stage together and times them. Knows nothing about HTTP or the UI, so it is equally callable from an API route or the CLI (`src/cli/ingest.ts`). Reference: `src/lib/ingestion/ingestion.service.ts` runs `validate → ocr → convert → classify`.
3. **`src/lib/<domain>/*` — core logic.** Pure, single-responsibility modules (OCR extraction, table parsing, rule classification). Swappable behind interfaces; no knowledge of each other beyond shared types.

## Swap-seams (the points designed to change)
Every external or replaceable dependency sits behind an interface + a factory, so swapping it touches exactly one file:

| Seam | Interface | Factory | Switch |
|------|-----------|---------|--------|
| OCR engine | `PdfExtractor` (`src/lib/ocr/extractor.types.ts`) | `src/lib/ocr/extractor.factory.ts` | `OCR_PROVIDER` (mistral \| tesseract) |
| Classifier | `Classifier` (`src/lib/classification/types.ts`) | `src/lib/classification/classifier.factory.ts` | `CLASSIFIER_PROVIDER` (rule \| …) |
| Route provider *(planned)* | `RouteProvider` | — | Google Maps today |

Downstream code depends only on the interface, never the concrete engine.

## Configuration: one source of truth
`src/config/env.ts` is the **only** module that reads `process.env`. Everything tunable — timeouts, retries, size limits, file paths, log level — is typed, coerced, and validated there once at first import. No magic literals elsewhere; no other file touches `process.env`. See `.env.example` for the full knob list.

## Cross-cutting
- **Logging:** `src/lib/logger/logger.ts` — a request gets one `requestId` (minted in the API route) and it threads through every log line for that request.
- **Perf:** `src/lib/perf/tracker.ts` — each service step is timed and reported (`PERF_ENABLED`).
- **Retry:** `src/lib/util/retry.ts` — transient OCR failures (429/5xx/network) back off and retry.

## Traceability is a first-class output
Every produced row carries where it came from: `ClassifiedItem` keeps `pageIndex/tableIndex/rowIndex` (maps a decision back to a cell in the preview) plus `confident/matchedTerm/reason` (why it was decided). This is what makes "never guess — flag for review" enforceable in the UI and what later admin overrides hang off.
