// types/quotation.ts
// TypeScript interfaces for Arredo3 quotation extraction

export interface Dimensions {
  L: number | null;  // Length in mm
  H: number | null;  // Height in mm  
  P: number | null;  // Depth (Profondità) in mm
}

export interface LineItem {
  row: number;
  code: string;
  quantity: number;
  description: string;
  details: Record<string, string>;
  dimensions: Dimensions | null;
  list_price: number;        // Pr. List. column
  surcharges: number;        // Sconti/Magg. column
  total_price: number;       // Pr. Totale column
  // Calculated fields
  surface_m2: number | null; // (L × H) / 1,000,000
  volume_m3: number | null;  // (L × H × P) / 1,000,000,000
}

export interface TechnicianInfo {
  name: string;
  phone: string;
  email: string;
}

export interface OrderInfo {
  order_number: string;        // e.g., "135649 - OCL - 2025"
  client_code: string;         // e.g., "12067"
  client_name: string;         // e.g., "12067 LV SRLS"
  client_address: string;
  delivery_address: string;
  client_phone: string;
  client_email: string;
  client_vat: string;          // Partita IVA
  reference: string;           // Riferimento Cliente (e.g., "MASCELLO")
  acquisition_date: string;    // Data acquisizione
  technician: TechnicianInfo;
  model: string;               // e.g., "KALI'"
  configuration: KitchenConfiguration;
}

export interface KitchenConfiguration {
  structure: string;           // STRUTTURA
  front_finish: string;        // FINITURA FRONTALE
  handles: string;             // MANIGLIE
  top: string;                 // TOP
  shelf: string;               // MENSOLA
  plinth: string;              // ZOCCOLO
  foot_height: string;         // ALTEZZA PIEDINI
  drawer_type: string;         // TIPO SPONDA
}

export interface QuotationSummary {
  total_items: number;
  total_list_price: number;
  total_final_price: number;
  total_surface_m2: number;
  total_volume_m3: number;
  // From PDF footer
  weight_kg: number | null;
  volume_mc: number | null;
  estimated_packages: number | null;
}

export interface RAEEContributions {
  cappe: number;
  piani_cottura: number;
  lavaggio: number;
  frigoriferi: number;
  forni: number;
  microonde: number;
  total: number;
}

export interface QuotationResult {
  success: true;
  order_info: OrderInfo;
  line_items: LineItem[];
  categories: {
    furniture: LineItem[];
    appliances: LineItem[];
    tops: LineItem[];
    accessories: LineItem[];
  };
  summary: QuotationSummary;
  raee?: RAEEContributions;
  extraction_timestamp: string;
}

export interface ExtractionError {
  success: false;
  error: string;
  details?: string;
}

export type ExtractionResponse = QuotationResult | ExtractionError;

// Adobe PDF Extract API types
export interface AdobeTableCell {
  Text?: string;
  RowSpan?: number;
  ColSpan?: number;
}

export interface AdobeElement {
  Path: string;
  Text?: string;
  Table?: AdobeTableCell[][];
  Bounds?: [number, number, number, number];
  Page?: number;
  attributes?: Record<string, any>;
}

export interface AdobeExtractResult {
  version: string;
  extended_metadata?: Record<string, any>;
  elements: AdobeElement[];
}
