/**
 * Stage 1 orchestrator: validate → OCR → convert to structured tables.
 * Each step is a separate module; this service only wires them and times them.
 * Knows nothing about HTTP or the UI — callable from an API route or a CLI.
 */
import { createHash } from "node:crypto";
import { createLogger } from "@/lib/logger/logger";
import { PerfTracker, type PerfReport } from "@/lib/perf/tracker";
import { getExtractor } from "@/lib/ocr/extractor.factory";
import { buildStructuredDocument } from "@/lib/conversion/document.builder";
import { validateUpload } from "@/lib/ingestion/file.validator";
import { getClassifier } from "@/lib/classification/classifier.factory";
import { getObjectStore } from "@/lib/storage/store.factory";
import type { StructuredDocument } from "@/lib/conversion/types";
import type { ClassificationResult } from "@/lib/classification/types";

export interface IngestionInput {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
  /** Correlation id for tracing one request end-to-end through the logs. */
  readonly requestId: string;
}

export interface IngestionResult {
  readonly filename: string;
  readonly provider: string;
  readonly document: StructuredDocument;
  readonly classification: ClassificationResult;
  readonly perf: PerfReport;
}

/**
 * Persist the source PDF and its structured document to the object store, keyed
 * by the PDF's sha256 so re-uploads are idempotent. Swallows all errors (logs a
 * warning) — archiving is best-effort and out of the request's critical path.
 * A NoopObjectStore (the default) makes this a cheap no-op.
 */
async function archiveArtifacts(
  bytes: Uint8Array,
  document: StructuredDocument,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const store = getObjectStore();
  if (store.backend === "noop") return;

  const hash = createHash("sha256").update(bytes).digest("hex");
  try {
    await Promise.all([
      store.put({ key: `raw/${hash}.pdf`, body: bytes, contentType: "application/pdf" }),
      store.put({
        key: `documents/${hash}.json`,
        body: new TextEncoder().encode(JSON.stringify(document)),
        contentType: "application/json",
      }),
    ]);
    logger.info("artifacts archived", { hash, backend: store.backend });
  } catch (err) {
    logger.warn("artifact archive failed — continuing", { error: String(err) });
  }
}

export async function ingestPdf(input: IngestionInput): Promise<IngestionResult> {
  const logger = createLogger("ingestion").child({ requestId: input.requestId });
  const perf = new PerfTracker(logger);

  logger.info("ingestion started", { file: input.filename, bytes: input.bytes.byteLength });

  const file = await perf.track("validate", async () =>
    validateUpload({ bytes: input.bytes, mimeType: input.mimeType, filename: input.filename }),
  );

  const extractor = getExtractor();
  const ocr = await perf.track("ocr", () =>
    extractor.extract({ bytes: file.bytes, mimeType: file.mimeType, filename: file.filename }),
  );

  const document = await perf.track("convert", async () => buildStructuredDocument(ocr));

  // Archive source PDF + clean document, content-addressed. Fire-and-forget so it
  // stays off the request's critical path — archiving must never add latency to or
  // fail ingestion. It catches its own errors; `void` marks the intentional no-await.
  void archiveArtifacts(input.bytes, document, logger);

  const classifier = getClassifier();
  const classification = await perf.track("classify", () => classifier.classify(document));

  const report = perf.report();
  logger.info("ingestion complete", {
    file: input.filename,
    pages: document.pageCount,
    tables: document.tableCount,
    items: classification.items.length,
    fragile: classification.counts.fragile,
    totalMs: report.totalMs,
  });

  return {
    filename: input.filename,
    provider: extractor.provider,
    document,
    classification,
    perf: report,
  };
}
