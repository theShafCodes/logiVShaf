/**
 * Engine-agnostic OCR contract. Downstream code depends only on this — the
 * concrete engine (Mistral today, anything tomorrow) is selected by the factory.
 */

export interface OcrInput {
  /** Raw file bytes. */
  readonly bytes: Uint8Array;
  /** MIME type, e.g. "application/pdf". */
  readonly mimeType: string;
  /** Original filename, for logging/audit only. */
  readonly filename: string;
}

export interface OcrPage {
  readonly index: number;
  readonly markdown: string;
}

export interface OcrDocument {
  readonly model: string;
  readonly pages: OcrPage[];
  /** Engine-reported usage (pages billed, etc.), passed through untouched. */
  readonly usage: Record<string, unknown> | null;
}

export interface PdfExtractor {
  /** Engine identifier, e.g. "mistral". */
  readonly provider: string;
  extract(input: OcrInput): Promise<OcrDocument>;
}

/** Raised when extraction fails after exhausting retries. */
export class OcrExtractionError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "OcrExtractionError";
  }
}
