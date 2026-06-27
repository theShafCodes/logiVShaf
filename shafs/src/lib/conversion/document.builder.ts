/**
 * Converts raw OCR output (markdown per page) into a StructuredDocument by
 * parsing tables out of each page. Pure transform — OCR-engine agnostic.
 */
import type { OcrDocument } from "@/lib/ocr/extractor.types";
import { parseMarkdownTables } from "@/lib/conversion/markdown-table.parser";
import type { PageContent, StructuredDocument } from "@/lib/conversion/types";

export function buildStructuredDocument(ocr: OcrDocument): StructuredDocument {
  const pages: PageContent[] = ocr.pages.map((page) => ({
    index: page.index,
    markdown: page.markdown,
    tables: parseMarkdownTables(page.markdown),
  }));

  const tableCount = pages.reduce((sum, p) => sum + p.tables.length, 0);
  return { pageCount: pages.length, tableCount, pages };
}
