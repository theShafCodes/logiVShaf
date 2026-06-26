import {
  LineItem,
  OrderInfo,
  QuotationResult,
  Dimensions,
  AdobeElement,
  AdobeExtractResult,
  KitchenConfiguration,
  TechnicianInfo,
  CustomerInfo,
  DeliveryInfo,
  OrderStatus,
  ShippingInfo,
  RAEEContributions,
  Promotion,
  QuotationSummary,
} from "@/types/quotation";
import { detectPDFFormat, PDFFormatConfig } from "./pdf-config";

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Parse Italian number format: "1.234,56" → 1234.56
export function parseItalianNumber(str: string | null | undefined): number {
  if (!str || typeof str !== "string") return 0;
  const cleaned = str.trim().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Calculate surface area in m²
export function calculateSurface(dims: Dimensions | null): number | null {
  if (!dims || dims.L === null || dims.H === null) return null;
  return (dims.L * dims.H) / 1_000_000;
}

// Calculate volume in m³
export function calculateVolume(dims: Dimensions | null): number | null {
  if (!dims || dims.L === null || dims.H === null || dims.P === null) return null;
  return (dims.L * dims.H * dims.P) / 1_000_000_000;
}

// Get all text content from elements
function getFullText(elements: AdobeElement[]): string {
  return elements
    .filter((e) => e.Text)
    .map((e) => e.Text)
    .join("\n");
}

// Get text from a table cell
function getCellText(cell: unknown): string {
  if (!cell) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "object" && cell !== null && "Text" in cell) {
    return (cell as { Text?: string }).Text || "";
  }
  return "";
}

// ============================================
// EXTRACTION MODULES
// ============================================

// Module: Extract Customer Information
function extractCustomerInfo(fullText: string, config: PDFFormatConfig): CustomerInfo {
  const customer: CustomerInfo = {
    code: "",
    company_name: "",
    legal_address: "",
    phone: "",
    email: "",
    vat_number: "",
    fiscal_code: "",
  };

  // Customer code
  const codeMatch = fullText.match(config.patterns.clientCode);
  if (codeMatch) customer.code = codeMatch[1];

  // Company name
  const companyMatch = fullText.match(config.patterns.companyName);
  if (companyMatch) customer.company_name = companyMatch[1].trim();

  // Look for address after company name
  const addressMatch = fullText.match(/(\d+\s+[A-Z][A-Z\s]+(?:SRLS?|SRL|SPA|SNC|SAS))\s*\r?\n?([^]*?)(?:Telefono|Tel\.)/i);
  if (addressMatch) {
    customer.legal_address = addressMatch[2].replace(/\r?\n/g, " ").trim();
  }

  // Phone
  const phoneMatch = fullText.match(/Telefono\s*(\d[\d\s.-]+)/i);
  if (phoneMatch) customer.phone = phoneMatch[1].trim();

  // Email
  const emailMatch = fullText.match(/Mail\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) customer.email = emailMatch[1];

  // VAT Number
  const vatMatch = fullText.match(config.patterns.vatNumber);
  if (vatMatch) customer.vat_number = vatMatch[1];

  // Fiscal Code
  const fiscalMatch = fullText.match(config.patterns.fiscalCode);
  if (fiscalMatch) customer.fiscal_code = fiscalMatch[1];

  // Alternative pattern for combined VAT/Fiscal
  const isoMatch = fullText.match(/Cod\.\s*ISO\s*\/\s*Partita\s*IVA\s*\/\s*Cod\.\s*Fiscale\s*\r?\n?\s*(IT[\d]+)\s*\/\s*(\d+)/i);
  if (isoMatch) {
    if (!customer.vat_number) customer.vat_number = isoMatch[1];
    if (!customer.fiscal_code) customer.fiscal_code = isoMatch[2];
  }

  return customer;
}

// Module: Extract Delivery Information
function extractDeliveryInfo(fullText: string, config: PDFFormatConfig): DeliveryInfo {
  const delivery: DeliveryInfo = {
    recipient: "",
    address: "",
    city: "",
    postal_code: "",
    province: "",
    full_address: "",
  };

  // Look for delivery address pattern
  const deliveryMatch = fullText.match(/Indirizzo\s+consegna[^]*?(\d+)\s+(C\/O\s+[^]*?)(\d{5})\s+([A-Z]+)\s+\(([A-Z]{2})\)/i);
  if (deliveryMatch) {
    delivery.recipient = deliveryMatch[2].split(/\r?\n/)[0].trim();
    const addressParts = deliveryMatch[2].split(/\r?\n/);
    if (addressParts.length > 1) {
      delivery.address = addressParts.slice(1).join(" ").trim();
    }
    delivery.postal_code = deliveryMatch[3];
    delivery.city = deliveryMatch[4];
    delivery.province = deliveryMatch[5];
    delivery.full_address = `${delivery.recipient} ${delivery.address} ${delivery.postal_code} ${delivery.city} (${delivery.province})`;
  }

  // Alternative pattern
  const altMatch = fullText.match(/VIA\s+SAN\s+SEVERO[^]*?(\d{5})\s+([A-Z]+)\s+\(([A-Z]{2})\)/i);
  if (altMatch && !delivery.full_address) {
    delivery.address = "VIA SAN SEVERO KM 1";
    delivery.postal_code = altMatch[1];
    delivery.city = altMatch[2];
    delivery.province = altMatch[3];
    delivery.full_address = `${delivery.address} ${delivery.postal_code} ${delivery.city} (${delivery.province})`;
  }

  return delivery;
}

// Module: Extract Technician Information
function extractTechnicianInfo(fullText: string, config: PDFFormatConfig): TechnicianInfo {
  const technician: TechnicianInfo = {
    name: "",
    phone: "",
    email: "",
  };

  const techMatch = fullText.match(config.patterns.technician);
  if (techMatch) technician.name = techMatch[1];

  const techEmailMatch = fullText.match(config.patterns.technicianEmail);
  if (techEmailMatch) technician.email = techEmailMatch[1].toLowerCase();

  const techPhoneMatch = fullText.match(config.patterns.technicianPhone);
  if (techPhoneMatch) technician.phone = techPhoneMatch[1];

  return technician;
}

// Module: Extract Kitchen Configuration
function extractConfiguration(fullText: string, config: PDFFormatConfig): KitchenConfiguration {
  const kitchenConfig: KitchenConfiguration = {
    model: "",
    structure: "",
    front_finish: "",
    handles: "",
    top: "",
    shelf: "",
    plinth: "",
    foot_height: "",
    drawer_type: "",
  };

  const modelMatch = fullText.match(config.patterns.model);
  if (modelMatch) kitchenConfig.model = modelMatch[1];

  const configPatterns = config.configPatterns;

  const structureMatch = fullText.match(configPatterns.structure);
  if (structureMatch) kitchenConfig.structure = structureMatch[1].trim();

  const frontMatch = fullText.match(configPatterns.frontFinish);
  if (frontMatch) kitchenConfig.front_finish = frontMatch[1].trim();

  const handlesMatch = fullText.match(configPatterns.handles);
  if (handlesMatch) kitchenConfig.handles = handlesMatch[1].trim();

  const topMatch = fullText.match(configPatterns.top);
  if (topMatch) kitchenConfig.top = topMatch[1].trim();

  const shelfMatch = fullText.match(configPatterns.shelf);
  if (shelfMatch) kitchenConfig.shelf = shelfMatch[1].trim();

  const plinthMatch = fullText.match(configPatterns.plinth);
  if (plinthMatch) kitchenConfig.plinth = plinthMatch[1].trim();

  const footMatch = fullText.match(configPatterns.footHeight);
  if (footMatch) kitchenConfig.foot_height = footMatch[1].trim();

  const drawerMatch = fullText.match(configPatterns.drawerType);
  if (drawerMatch) kitchenConfig.drawer_type = drawerMatch[1].trim();

  return kitchenConfig;
}

// Module: Extract Order Status
function extractOrderStatus(fullText: string, config: PDFFormatConfig): OrderStatus {
  const status: OrderStatus = {
    status: "",
    confirmation_message: "",
    confirmation_deadline_days: null,
  };

  const statusMatch = fullText.match(config.patterns.status);
  if (statusMatch) status.status = statusMatch[1].toUpperCase();

  const confirmMatch = fullText.match(/Cortesemente[^]*?(\d+)\s+giorni/i);
  if (confirmMatch) {
    status.confirmation_deadline_days = parseInt(confirmMatch[1]);
    status.confirmation_message = `Confermare entro ${confirmMatch[1]} giorni per procedere con la produzione`;
  }

  return status;
}

// Module: Extract Shipping Information
function extractShippingInfo(fullText: string, config: PDFFormatConfig): ShippingInfo {
  const shipping: ShippingInfo = {
    packages_count: null,
    gross_weight_kg: null,
    volume_m3: null,
  };

  const colliMatch = fullText.match(config.patterns.packages);
  if (colliMatch) shipping.packages_count = parseInt(colliMatch[1]);

  const altColliMatch = fullText.match(/(\d+)\s*(?:colli|pz|pezzi)/i);
  if (altColliMatch && !shipping.packages_count) {
    shipping.packages_count = parseInt(altColliMatch[1]);
  }

  const weightMatch = fullText.match(config.patterns.weight);
  if (weightMatch) shipping.gross_weight_kg = parseItalianNumber(weightMatch[1]);

  const volumeMatch = fullText.match(/Volume[:\s]*([\d.,]+)\s*(?:m3|m³|mc)?/i);
  if (volumeMatch) shipping.volume_m3 = parseItalianNumber(volumeMatch[1]);

  return shipping;
}

// Module: Extract RAEE Contributions
function extractRAEE(fullText: string): RAEEContributions | null {
  const raee: RAEEContributions = {
    cappe: 0,
    piani_cottura: 0,
    lavaggio: 0,
    frigoriferi: 0,
    forni: 0,
    microonde: 0,
    total: 0,
  };

  let hasRAEE = false;

  const patterns = {
    cappe: /Cappe[:\s]*([\d.,]+)/i,
    piani_cottura: /Piani?\s*(?:di\s*)?cottura[:\s]*([\d.,]+)/i,
    lavaggio: /Lavaggio[:\s]*([\d.,]+)/i,
    frigoriferi: /Frigorifer[io][:\s]*([\d.,]+)/i,
    forni: /Forni?[:\s]*([\d.,]+)/i,
    microonde: /Microonde[:\s]*([\d.,]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = fullText.match(pattern);
    if (match) {
      raee[key as keyof Omit<RAEEContributions, 'total'>] = parseItalianNumber(match[1]);
      hasRAEE = true;
    }
  }

  const totalMatch = fullText.match(/(?:Totale\s+)?RAEE[:\s]*([\d.,]+)/i);
  if (totalMatch) {
    raee.total = parseItalianNumber(totalMatch[1]);
    hasRAEE = true;
  } else {
    raee.total = raee.cappe + raee.piani_cottura + raee.lavaggio +
                 raee.frigoriferi + raee.forni + raee.microonde;
  }

  return hasRAEE ? raee : null;
}

// Module: Extract Promotions
function extractPromotions(fullText: string): Promotion[] {
  const promotions: Promotion[] = [];

  // Look for specific promo code patterns (e.g., PROMO_2024, SCONTO_ESTATE)
  // Avoid matching partial words like "promoZIONI"
  const promoMatches = fullText.matchAll(/(?:PROMO|SCONTO)[_\s-]([A-Z0-9_-]{3,})/gi);

  for (const match of promoMatches) {
    const code = match[1];
    // Skip if it looks like a partial Italian word
    if (/^ZIONI|^ZIONE/i.test(code)) continue;

    const promo: Promotion = {
      code: `PROMO_${code}`,
      description: "",
      discount_percent: null,
      discount_amount: null,
    };

    promotions.push(promo);
  }

  return promotions;
}

// Module: Extract Order Info (orchestrates other modules)
function extractOrderInfo(elements: AdobeElement[], config: PDFFormatConfig): OrderInfo {
  const fullText = getFullText(elements);

  let order_number = "";
  let reference = "";
  let acquisition_date = "";

  const orderMatch = fullText.match(config.patterns.orderNumber);
  if (orderMatch) order_number = orderMatch[1].trim();

  const refMatch = fullText.match(config.patterns.reference);
  if (refMatch) reference = refMatch[1].trim();

  const dateMatch = fullText.match(config.patterns.acquisitionDate);
  if (dateMatch) acquisition_date = dateMatch[1];

  return {
    order_number,
    reference,
    acquisition_date,
    customer: extractCustomerInfo(fullText, config),
    delivery: extractDeliveryInfo(fullText, config),
    technician: extractTechnicianInfo(fullText, config),
    configuration: extractConfiguration(fullText, config),
    status: extractOrderStatus(fullText, config),
  };
}

// ============================================
// TABLE PARSING MODULE
// ============================================

// Group table rows by row number - continuation rows have empty first column
function groupTableRows(tableRows: unknown[][]): unknown[][][] {
  const groups: unknown[][][] = [];
  let currentGroup: unknown[][] = [];

  for (let i = 1; i < tableRows.length; i++) { // Skip header row
    const row = tableRows[i];
    if (!Array.isArray(row) || row.length < 4) continue;

    const firstCell = getCellText(row[0]).trim();
    const rowNum = parseInt(firstCell);

    if (!isNaN(rowNum) && rowNum > 0) {
      // New item - save previous group and start new one
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [row];
    } else if (currentGroup.length > 0) {
      // Continuation row - append to current group
      currentGroup.push(row);
    }
  }

  // Don't forget last group
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

// Parse a group of rows (main row + continuation rows) into a single line item
// Uses DIRECT COLUMN MAPPING from config - no heuristics
function parseRowGroup(rows: unknown[][], config: PDFFormatConfig): LineItem | null {
  if (rows.length === 0) return null;

  const mainRow = rows[0];
  if (!Array.isArray(mainRow)) return null;

  // Use config for direct column access
  const col = config.tableColumns;

  // Parse main row using FIXED column positions
  const rowNum = parseInt(getCellText(mainRow[col.row])) || 0;
  if (rowNum <= 0) return null;

  const code = getCellText(mainRow[col.code])?.trim() || "";
  if (!code || code.length < 2) return null;

  const quantity = parseInt(getCellText(mainRow[col.quantity])) || 1;

  // Get description from main row
  const mainDescription = getCellText(mainRow[col.description])?.trim() || "";

  // Collect variant descriptions from continuation rows
  const variants: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const desc = getCellText(rows[i][col.description])?.trim();
    if (desc) {
      variants.push(desc);
    }
    // Also collect any surcharges from continuation rows
  }

  // Build full description (main + variants)
  const fullDescription = [mainDescription, ...variants].filter(Boolean).join("\n");

  // Get dimensions DIRECTLY from their columns (no scanning/guessing)
  const L = parseInt(getCellText(mainRow[col.dimensionL])) || null;
  const H = parseInt(getCellText(mainRow[col.dimensionH])) || null;
  const P = parseInt(getCellText(mainRow[col.dimensionP])) || null;

  // Get prices DIRECTLY from their columns
  const listPrice = parseItalianNumber(getCellText(mainRow[col.listPrice]));
  let surcharges = parseItalianNumber(getCellText(mainRow[col.surcharges]));
  const totalPrice = parseItalianNumber(getCellText(mainRow[col.totalPrice]));

  // Add surcharges from continuation rows (they appear in the surcharges column)
  for (let i = 1; i < rows.length; i++) {
    const extraSurcharge = parseItalianNumber(getCellText(rows[i][col.surcharges]));
    if (extraSurcharge > 0) {
      surcharges += extraSurcharge;
    }
  }

  const dims: Dimensions | null = (L !== null || H !== null || P !== null)
    ? { L, H, P }
    : null;

  return {
    row: rowNum,
    code,
    quantity,
    description: fullDescription,
    variants,
    dimensions: dims,
    list_price: listPrice,
    surcharges,
    total_price: totalPrice,
    surface_m2: calculateSurface(dims),
    volume_m3: calculateVolume(dims),
  };
}

// Module: Categorize item based on product code
function categorizeItem(item: LineItem): "furniture" | "appliances" | "tops" | "accessories" {
  const code = item.code.toUpperCase();

  if (/^E(FOR|FRI|LVS|PIC|CAPPA|MICRO)/.test(code) ||
      /^(FORNO|FRIGO|LAVAST|CAPPA|PIANO)/.test(code)) {
    return "appliances";
  }

  if (/^(TOP|ALZ|SCH|PIANO)/.test(code)) {
    return "tops";
  }

  if (/^(AC|ERUB|ELAV|EALAV|LED|LUCE|CEST)/.test(code)) {
    return "accessories";
  }

  return "furniture";
}

// ============================================
// MAIN PARSER (ORCHESTRATOR)
// ============================================

export function parseQuotation(adobeResult: AdobeExtractResult): QuotationResult {
  const fullText = getFullText(adobeResult.elements);

  // Auto-detect PDF format
  const config = detectPDFFormat(fullText);
  console.log(`Detected PDF format: ${config.name}`);

  const lineItems: LineItem[] = [];

  // Extract tables from Adobe result
  for (const element of adobeResult.elements) {
    if (element.Path?.includes("/Table") && element.Table) {
      // DEBUG: Log first few rows to see actual column structure
      console.log("=== TABLE STRUCTURE DEBUG ===");
      console.log("Header row:", element.Table[0]?.map((c: unknown) => getCellText(c)));
      if (element.Table[1]) {
        console.log("First data row:", element.Table[1]?.map((c: unknown) => getCellText(c)));
      }
      if (element.Table[2]) {
        console.log("Second data row:", element.Table[2]?.map((c: unknown) => getCellText(c)));
      }
      console.log("=== END DEBUG ===");

      // Group rows by row number (handles multi-row items)
      const rowGroups = groupTableRows(element.Table);

      for (const group of rowGroups) {
        const item = parseRowGroup(group, config);
        if (item && item.code) {
          lineItems.push(item);
        }
      }
    }
  }

  // Categorize items
  const categories = {
    furniture: [] as LineItem[],
    appliances: [] as LineItem[],
    tops: [] as LineItem[],
    accessories: [] as LineItem[],
  };

  for (const item of lineItems) {
    const category = categorizeItem(item);
    categories[category].push(item);
  }

  // Extract all order info using modular extractors
  const orderInfo = extractOrderInfo(adobeResult.elements, config);

  // Extract shipping, RAEE, promotions
  const shipping = extractShippingInfo(fullText, config);
  const raee = extractRAEE(fullText);
  const promotions = extractPromotions(fullText);

  // Calculate summary totals
  const summary: QuotationSummary = {
    total_items: lineItems.length,
    total_list_price: lineItems.reduce((sum, i) => sum + i.list_price, 0),
    total_surcharges: lineItems.reduce((sum, i) => sum + i.surcharges, 0),
    total_final_price: lineItems.reduce((sum, i) => sum + i.total_price, 0),
    total_surface_m2: lineItems.reduce((sum, i) => sum + (i.surface_m2 || 0), 0),
    total_volume_m3: lineItems.reduce((sum, i) => sum + (i.volume_m3 || 0), 0),
    shipping,
    raee,
    promotions,
  };

  return {
    success: true,
    order_info: orderInfo,
    line_items: lineItems,
    categories,
    summary,
    extraction_timestamp: new Date().toISOString(),
  };
}
