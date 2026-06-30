export type Fragility = "fragile" | "standard" | "uncertain";

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

// ── Stage 3 — Packing ───────────────────────────────────────────────────────

export interface VanDimensions { l: number; w: number; h: number; }
export interface Van { id: string; label: string; interior: VanDimensions; maxPayloadKg: number; fuelCostPerMile?: number; perMileRate: number; }
export interface Vec3 { x: number; y: number; z: number; }
export interface Placement { itemId: string; position: Vec3; size: Vec3; fragile: boolean; weightKg: number; canSupportWeightKg: number; stackable: boolean; maxStackPressureKpa: number; rotationIndex?: number; }
/** An item (or remaining quantity) the packer could not place; `reasons[id]` explains why. */
export interface UnplacedItem { id: string; name: string; quantity: number; }
export interface PackingResult { van: Van; placements: Placement[]; utilization: number; unplaced: UnplacedItem[]; reasons: Record<string, string>; }
export interface VanRanking { vanId: string; label: string; utilization: number; fits: boolean; placedUnits: number; packableUnits: number; }
/** Full item data sent to the client — superset of what the packer builds internally. */
export interface PackedItem {
  id: string;
  name: string;
  quantity: number;
  fragility: Fragility;
  dimensions: VanDimensions | null;
  weightKg: number;
  stackable: boolean;
  canSupportWeightKg: number;
  maxStackPressureKpa: number;
}

export interface PackResponse {
  success: boolean;
  requestId?: string;
  error?: string;
  items?: PackedItem[];
  packableUnits?: number;
  /** Chosen fleet, in load order — one entry per van used. */
  fleet?: PackingResult[];
  selected?: PackingResult;
  ranking?: VanRanking[];
  fitsInSingleVan?: boolean;
  /** Cargo no van can carry (oversized / missing dimensions). */
  unplaced?: UnplacedItem[];
  reasons?: Record<string, string>;
  /** Σ perMileRate across the fleet. */
  totalPerMileRate?: number;
  perf?: PerfReport;
}

// ── Stage 5 — Quote ──────────────────────────────────────────────────────────

export interface Route { origin: string; destination: string; distanceMiles: number; durationSeconds: number; distanceMethod: "road" | "straight-line"; }
export interface QuoteLineItem { label: string; amount: number; }
/** One vehicle in a quote — described by capability + id, never by brand alone. */
export interface QuoteVan { id: string; label: string; description: string; perMileRate: number; distanceCost: number; }
export interface Quote { route: Route; vans: QuoteVan[]; lineItems: QuoteLineItem[]; subtotal: number; surcharges: number; total: number; }

export interface QuoteResponse {
  success: boolean;
  requestId?: string;
  error?: string;
  quote?: Quote;
  perf?: PerfReport;
}
