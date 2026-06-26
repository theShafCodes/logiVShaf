// Configuration for different PDF formats
// This allows the parser to adapt to different quotation layouts

export interface PDFFormatConfig {
  name: string;
  vendor: string;

  // Patterns to identify this format
  identifyPatterns: string[];

  // Column mapping for line items table
  tableColumns: {
    row: number;           // Column index for row number
    code: number;          // Column index for product code
    quantity: number;      // Column index for quantity
    description: number;   // Column index for description
    dimensionL: number;    // Column index for Length
    dimensionH: number;    // Column index for Height
    dimensionP: number;    // Column index for Depth
    listPrice: number;     // Column index for list price
    surcharges: number;    // Column index for surcharges
    totalPrice: number;    // Column index for total price
  };

  // Regex patterns for extracting metadata
  patterns: {
    orderNumber: RegExp;
    clientCode: RegExp;
    acquisitionDate: RegExp;
    reference: RegExp;
    model: RegExp;
    status: RegExp;
    technician: RegExp;
    technicianEmail: RegExp;
    technicianPhone: RegExp;
    vatNumber: RegExp;
    fiscalCode: RegExp;
    packages: RegExp;
    weight: RegExp;
    companyName: RegExp;
    deliveryAddress: RegExp;
  };

  // Configuration patterns (kitchen config)
  configPatterns: {
    structure: RegExp;
    frontFinish: RegExp;
    handles: RegExp;
    top: RegExp;
    shelf: RegExp;
    plinth: RegExp;
    footHeight: RegExp;
    drawerType: RegExp;
  };
}

// Arredo3 PROPOSTA ORDINE format
export const ARREDO3_CONFIG: PDFFormatConfig = {
  name: "Arredo3 Proposta Ordine",
  vendor: "Arredo3",

  identifyPatterns: [
    "PROPOSTA ORDINE",
    "arredo3",
    "Arredo3"
  ],

  tableColumns: {
    row: 0,
    code: 1,
    quantity: 2,
    description: 3,
    dimensionL: 4,
    dimensionH: 5,
    dimensionP: 6,
    listPrice: 7,
    surcharges: 8,
    totalPrice: 9,
  },

  patterns: {
    orderNumber: /N\.\s*Ordine\s*[\n\r]*\s*(\d+\s*-\s*\w+\s*-\s*\d+)/i,
    clientCode: /Cod\.\s*Cliente[:\s]*(\d+)/i,
    acquisitionDate: /Data\s+acquisizione\s*[\n\r]*\s*(\d{2}\/\d{2}\/\d{4})/i,
    reference: /Riferimento\s+Cliente\s*[\n\r]*\s*([A-Z]+)/i,
    model: /Modello:\s*([A-Z']+)/i,
    status: /(ORDINE\s+(?:SOSPESO|CONFERMATO|ANNULLATO|IN\s+LAVORAZIONE))/i,
    technician: /Tecnico\s+ordine:\s*([A-Z]+\s+[A-Z]+)/i,
    technicianEmail: /([a-z]+\.[a-z]+@arredo3\.it)/i,
    technicianPhone: /Tecnico[^]*?(\d{3}[.\s]?\d{7})/i,
    vatNumber: /(?:Partita\s*IVA|P\.?\s*IVA)[:\s/]*(IT\d{11})/i,
    fiscalCode: /Cod\.?\s*Fiscale[:\s/]*(\d{11})/i,
    packages: /(?:N\.?\s*)?(?:Colli|Numero\s+colli)[:\s]*(\d+)/i,
    weight: /(?:Peso\s+lordo|Peso)[:\s]*([\d.,]+)\s*(?:kg)?/i,
    companyName: /(\d+\s+[A-Z][A-Z\s]+(?:SRLS?|SRL|SPA|SNC|SAS))/i,
    deliveryAddress: /Indirizzo\s+consegna[^]*?(\d{5})\s+([A-Z]+)\s+\(([A-Z]{2})\)/i,
  },

  configPatterns: {
    structure: /STRUTTURA\s+(\d+\s*-\s*[A-Z\s]+\d*)/i,
    frontFinish: /FINITURA\s+FRONTALE\s+(\d+\s*-\s*[A-Z'\s]+\d*)/i,
    handles: /MANIGLIE\s+(\d+\s*-\s*[A-Z\s]+)/i,
    top: /TOP\s+(\d+\s*-\s*[A-Z\s]+\d*)/i,
    shelf: /MENSOLA\s+(\d+\s*-\s*[A-Z\s]+\d*)/i,
    plinth: /ZOCCOLO\s+(\d+\s*-\s*[A-Z\s.]+\d*)/i,
    footHeight: /ALTEZZA\s+PIEDINI\s+(\d+\s*-\s*[A-Z.\d]+)/i,
    drawerType: /TIPO\s+SPONDA\s+(\d+\s*-\s*[A-Z\s]+)/i,
  },
};

// Function to detect PDF format
export function detectPDFFormat(text: string): PDFFormatConfig {
  // Currently only Arredo3, but can add more vendors
  for (const pattern of ARREDO3_CONFIG.identifyPatterns) {
    if (text.includes(pattern)) {
      return ARREDO3_CONFIG;
    }
  }

  // Default to Arredo3 config
  return ARREDO3_CONFIG;
}

// Registry of all supported formats
export const PDF_FORMATS: PDFFormatConfig[] = [
  ARREDO3_CONFIG,
  // Add more formats here:
  // SCAVOLINI_CONFIG,
  // VENETA_CUCINE_CONFIG,
  // etc.
];
