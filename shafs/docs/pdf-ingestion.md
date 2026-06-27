# Stage 1 — PDF Ingestion → Table  *(Built)*

Turn an uploaded PDF into a `StructuredDocument` of machine-readable tables, with a visual "what you uploaded is what gets processed" check at the front.

## Input
A PDF upload: raw bytes + MIME type + filename. HTTP entry is `POST /api/ingest` (multipart, field `file`); the same path is callable headless via `src/cli/ingest.ts` (`npm run ingest`).

## Output
`StructuredDocument` — `{ pageCount, tableCount, pages[] }`, each page carrying its raw `markdown` (for preview/audit) and parsed `tables`. Wrapped by the service as `IngestionResult { filename, provider, document, classification, perf }`.

## Approach
Orchestrated by `src/lib/ingestion/ingestion.service.ts` as four timed steps:

1. **Validate** (`ingestion/file.validator.ts`) — trust-boundary guard: non-empty, ≤ `INGEST_MAX_FILE_BYTES`, MIME in `INGEST_ALLOWED_MIME`, and a `%PDF-` magic-byte sniff against spoofed MIME. Never simplified away — it guards OCR cost and the engine.
2. **OCR** (`ocr/` behind `PdfExtractor`) — the selected engine returns `OcrDocument`. `mistral.extractor.ts` (`POST /v1/ocr`, model `mistral-ocr-latest`) for production; `tesseract.extractor.ts` (free, local, reconstructs tables from word coordinates) for dev. Engine chosen by `OCR_PROVIDER` via `extractor.factory.ts`. Transient failures retry (`util/retry.ts`).
3. **Convert** (`conversion/document.builder.ts` + `markdown-table.parser.ts`) — OCR markdown → `StructuredDocument`. The parser's job is narrow: markdown tables → grids. Nothing here guesses item semantics.
4. **Classify** — hands off to Stage 2 ([fragility.md](fragility.md)).

**Visual upload + preview** (`src/app/page.tsx`): the user drops a PDF, sees it rendered, and confirms before anything runs — satisfies "no feature is done until manually verified in the UI" at the first stage.

## Edge cases
- Empty / oversized / non-PDF (spoofed MIME) → `FileValidationError` → HTTP 422.
- OCR fails after retries → `OcrExtractionError` → HTTP 502.
- Merged cells, multi-line descriptions, missing dimensions → produce a **flagged** row, never a silent guess (the "never guess" rule; flagging surfaces in Stage 2 as `confident=false`).
- Unexpected failure → HTTP 500, logged with `requestId`.

## Definition of done
User uploads a PDF through the UI, sees the rendered preview, confirms, and gets back an editable table of extracted rows — manually clicked through in the running app.
