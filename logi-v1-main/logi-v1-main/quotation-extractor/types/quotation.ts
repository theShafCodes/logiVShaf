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
  variants: string[];           // Variant details (STRUTTURA, LAVORAZIONI, etc.)
  dimensions: Dimensions | null;
  list_price: number;           // Pr. List. column
  surcharges: number;           // Sconti/Magg. column
  total_price: number;          // Pr. Totale column
  // Calculated fields
  surface_m2: number | null;    // (L × H) / 1,000,000
  volume_m3: number | null;     // (L × H × P) / 1,000,000,000
}

export interface CustomerInfo {
  code: string;                  // e.g., "12067"
  company_name: string;          // e.g., "12067 LV SRLS"
  legal_address: string;         // e.g., "VIA ONORATO, 66 71121 FOGGIA (FG)"
  phone: string;                 // e.g., "0881716523"
  email: string;                 // e.g., "amministrazionecentrocamerette@gmail.com"
  vat_number: string;            // Partita IVA e.g., "IT04294770716"
  fiscal_code: string;           // Codice Fiscale e.g., "04294770716"
}

export interface DeliveryInfo {
  recipient: string;             // e.g., "C/O MAGAZZINI CONSALVO"
  address: string;               // e.g., "VIA SAN SEVERO KM 1"
  city: string;                  // e.g., "FOGGIA"
  postal_code: string;           // e.g., "71121"
  province: string;              // e.g., "FG"
  full_address: string;          // Complete address string
}

export interface TechnicianInfo {
  name: string;                  // e.g., "ANGELO PONTE"
  phone: string;                 // e.g., "041.5899834"
  email: string;                 // e.g., "angelo.ponte@arredo3.it"
}

export interface KitchenConfiguration {
  model: string;                 // e.g., "KALI'"
  structure: string;             // STRUTTURA e.g., "08 - VISONE 08"
  front_finish: string;          // FINITURA FRONTALE e.g., "320 - KALI' LAVAGNA MAXXIMATT 320"
  handles: string;               // MANIGLIE e.g., "999 - SENZA MANIGLIA E SENZA FORI"
  top: string;                   // TOP e.g., "1821 - PEARL WHITE OPACO 1821"
  shelf: string;                 // MENSOLA e.g., "1713 - BEIGE SUEDE 1713"
  plinth: string;                // ZOCCOLO e.g., "26 - ALLUMINIO FIN. METAL 26"
  foot_height: string;           // ALTEZZA PIEDINI e.g., "12 - H.12"
  drawer_type: string;           // TIPO SPONDA e.g., "011 - LEGRABOX GRIGIO ORIONE"
}

export interface OrderStatus {
  status: string;                // e.g., "ORDINE SOSPESO"
  confirmation_message: string;  // e.g., "Cortesemente le chiediamo..."
  confirmation_deadline_days: number | null;  // e.g., 3
}

export interface OrderInfo {
  order_number: string;          // e.g., "135649 - OCL - 2025"
  reference: string;             // Riferimento Cliente e.g., "MASCELLO"
  acquisition_date: string;      // Data acquisizione e.g., "01/09/2025"
  customer: CustomerInfo;
  delivery: DeliveryInfo;
  technician: TechnicianInfo;
  configuration: KitchenConfiguration;
  status: OrderStatus;
}

export interface ShippingInfo {
  packages_count: number | null;      // Numero colli e.g., 40
  gross_weight_kg: number | null;     // Peso lordo e.g., 1029.04
  volume_m3: number | null;           // Volume m³
}

export interface RAEEContributions {
  cappe: number;                 // Range hoods
  piani_cottura: number;         // Cooktops
  lavaggio: number;              // Washing machines/dishwashers
  frigoriferi: number;           // Refrigerators
  forni: number;                 // Ovens
  microonde: number;             // Microwaves
  total: number;                 // Total RAEE contribution
}

export interface Promotion {
  code: string;                  // Promo code
  description: string;           // Promo description
  discount_percent: number | null;
  discount_amount: number | null;
}

export interface QuotationSummary {
  total_items: number;
  total_list_price: number;
  total_surcharges: number;
  total_final_price: number;
  total_surface_m2: number;
  total_volume_m3: number;
  shipping: ShippingInfo;
  raee: RAEEContributions | null;
  promotions: Promotion[];
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
  attributes?: Record<string, unknown>;
  filePaths?: string[];  // Excel file paths for tables
}

export interface AdobeExtractResult {
  version: string;
  extended_metadata?: Record<string, unknown>;
  elements: AdobeElement[];
}
