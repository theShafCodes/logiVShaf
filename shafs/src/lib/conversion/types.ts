/** Structured, computer-readable representation of extracted content. */

export type TableCell = string;
export type TableRow = TableCell[];

export interface ExtractedTable {
  /** 0-based index of this table within its page. */
  readonly index: number;
  readonly headers: TableRow;
  readonly rows: TableRow[];
}

export interface PageContent {
  /** 0-based page index as returned by the OCR engine. */
  readonly index: number;
  /** Raw markdown for this page (kept for the visual preview / audit trail). */
  readonly markdown: string;
  /** Tables parsed out of the markdown into a grid form. */
  readonly tables: ExtractedTable[];
}

export interface StructuredDocument {
  readonly pageCount: number;
  readonly tableCount: number;
  readonly pages: PageContent[];
}
