/**
 * Selects the OCR engine from config (OCR_PROVIDER). Downstream code calls
 * getExtractor() and never names a concrete engine — swapping providers is a
 * one-line addition here, zero changes elsewhere.
 */
import { getConfig } from "@/config/env";
import { MistralExtractor } from "@/lib/ocr/mistral.extractor";
import { TesseractExtractor } from "@/lib/ocr/tesseract.extractor";
import { CachingExtractor, cacheNamespace } from "@/lib/ocr/caching.extractor";
import type { PdfExtractor } from "@/lib/ocr/extractor.types";

// Register OCR engines here. The active one is chosen by OCR_PROVIDER in .env.
const registry: Record<string, () => PdfExtractor> = {
  mistral: () => new MistralExtractor(), // production — fast, structured tables
  tesseract: () => new TesseractExtractor(), // dev — free, local, plain text
};

let cached: PdfExtractor | null = null;

export function getExtractor(): PdfExtractor {
  if (cached) return cached;
  const cfg = getConfig().ocr;
  const provider = cfg.provider.toLowerCase();
  const factory = registry[provider];
  if (!factory) {
    throw new Error(
      `[ocr] Unknown OCR_PROVIDER "${provider}". Known: ${Object.keys(registry).join(", ")}`,
    );
  }
  const engine = factory();
  // Wrap the engine in a content-hash cache so the same PDF is never billed twice.
  // Disabled engines (tesseract) are free, but caching them is still a latency win.
  cached = cfg.cache.enabled
    ? new CachingExtractor(engine, {
        dir: cfg.cache.dir,
        keyNamespace: cacheNamespace(engine.provider, cfg.model),
      })
    : engine;
  return cached;
}
