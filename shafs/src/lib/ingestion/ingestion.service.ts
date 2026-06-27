/**
 * Stage 1 orchestrator: validate → OCR → convert to structured tables.
 * Each step is a separate module; this service only wires them and times them.
 * Knows nothing about HTTP or the UI — callable from an API route or a CLI.
 */
import { createLogger } from "@/lib/logger/logger";
import { PerfTracker, type PerfReport } from "@/lib/perf/tracker";
import { getExtractor } from "@/lib/ocr/extractor.factory";
import { buildStructuredDocument } from "@/lib/conversion/document.builder";
import { validateUpload } from "@/lib/ingestion/file.validator";
import { getClassifier } from "@/lib/classification/classifier.factory";
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
