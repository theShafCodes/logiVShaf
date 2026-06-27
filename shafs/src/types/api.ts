export type Fragility = "fragile" | "standard";

export interface ExtractedTable {
  index: number;
  headers: string[];
  rows: string[][];
}

export interface PageContent {
  index: number;
  markdown: string;
  tables: ExtractedTable[];
}

export interface ClassifiedItem {
  pageIndex: number;
  tableIndex: number;
  rowIndex: number;
  label: string;
  fragility: Fragility;
  confident: boolean;
  matchedTerm: string | null;
  reason: string;
}

export interface ClassificationResult {
  provider: string;
  items: ClassifiedItem[];
  counts: { fragile: number; standard: number; lowConfidence: number };
}

export interface PerfSpan {
  name: string;
  durationMs: number;
}

export interface PerfReport {
  totalMs: number;
  spans: PerfSpan[];
}

export interface IngestResponse {
  success: boolean;
  requestId?: string;
  error?: string;
  filename?: string;
  provider?: string;
  document?: {
    pageCount: number;
    tableCount: number;
    pages: PageContent[];
  };
  classification?: ClassificationResult;
  perf?: PerfReport;
}
