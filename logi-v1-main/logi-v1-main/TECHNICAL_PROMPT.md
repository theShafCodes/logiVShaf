# Technical Prompt for Claude Code: LogiV1 - PDF Quotation Extractor

## Context
You are building a web application called **LogiV1** that extracts structured data from Italian kitchen quotation PDFs (specifically Arredo3 "PROPOSTA ORDINE" documents). The user has Adobe PDF Services API credentials ready.

---

## Problem Statement

**Input**: PDF files containing kitchen quotations with:
- 7-19 pages of tables
- Line items with product codes, descriptions, dimensions (L×H×P in mm), and prices
- Italian number format (comma as decimal separator: `1.234,56`)
- Multiple sections: furniture, appliances, tops/countertops, accessories
- Header info: order number, client details, delivery address

**Output**: Structured JSON with:
- All line items parsed with dimensions
- Calculated surface area (m²) = `(L × H) / 1,000,000`
- Calculated volume (m³) = `(L × H × P) / 1,000,000,000`
- Totals: list price, final price, total surface, total volume
- Order metadata

**Why Adobe PDF Extract API**: Standard PDF parsers fail on complex multi-page tables. Adobe's AI-powered extraction (Sensei) provides ~99% accuracy on table structure.

---

## Build Instructions

### Step 1: Initialize Project

```bash
npx create-next-app@latest quotation-extractor --typescript --tailwind --eslint --app --src-dir=false
cd quotation-extractor

# Install dependencies
npm install @adobe/pdfservices-node-sdk adm-zip
npm install -D @types/adm-zip
```

### Step 2: Create Environment File

Create `.env.local`:
```
PDF_SERVICES_CLIENT_ID=<user_will_provide>
PDF_SERVICES_CLIENT_SECRET=<user_will_provide>
```

Add to `.gitignore`:
```
.env.local
uploads/
*.zip
```

### Step 3: Create Type Definitions

Create `types/quotation.ts`:

```typescript
export interface Dimensions {
  L: number | null;  // Length in mm
  H: number | null;  // Height in mm
  P: number | null;  // Depth in mm
}

export interface LineItem {
  row: number;
  code: string;
  quantity: number;
  description: string;
  details: Record<string, string>;
  dimensions: Dimensions | null;
  list_price: number;
  surcharges: number;
  total_price: number;
  // Calculated fields
  surface_m2: number | null;
  volume_m3: number | null;
}

export interface OrderInfo {
  order_number: string;
  client_code: string;
  client_name: string;
  client_address: string;
  delivery_address: string;
  client_phone: string;
  client_email: string;
  client_vat: string;
  reference: string;
  acquisition_date: string;
  technician: {
    name: string;
    phone: string;
    email: string;
  };
  model: string;
  configuration: Record<string, string>;
}

export interface QuotationSummary {
  total_items: number;
  total_list_price: number;
  total_final_price: number;
  total_surface_m2: number;
  total_volume_m3: number;
  weight_kg: number | null;
  volume_mc: number | null;
  estimated_packages: number | null;
}

export interface QuotationResult {
  success: boolean;
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
```

### Step 4: Create Adobe Extraction Library

Create `lib/adobe-extract.ts`:

```typescript
import {
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  ExtractPDFParams,
  ExtractElementType,
  ExtractPDFJob,
  ExtractPDFResult,
} from "@adobe/pdfservices-node-sdk";
import * as fs from "fs";
import AdmZip from "adm-zip";
import { Readable } from "stream";

interface AdobeElement {
  Path: string;
  Text?: string;
  Table?: string[][];
  Bounds?: number[];
}

interface AdobeExtractResult {
  elements: AdobeElement[];
}

export async function extractPdfWithAdobe(pdfPath: string): Promise<AdobeExtractResult> {
  const clientId = process.env.PDF_SERVICES_CLIENT_ID;
  const clientSecret = process.env.PDF_SERVICES_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Adobe API credentials not configured");
  }

  let readStream: fs.ReadStream | null = null;

  try {
    // Create credentials
    const credentials = new ServicePrincipalCredentials({
      clientId,
      clientSecret,
    });

    // Create PDF Services instance
    const pdfServices = new PDFServices({ credentials });

    // Upload the PDF
    readStream = fs.createReadStream(pdfPath);
    const inputAsset = await pdfServices.upload({
      readStream,
      mimeType: MimeType.PDF,
    });

    // Configure extraction parameters
    const params = new ExtractPDFParams({
      elementsToExtract: [
        ExtractElementType.TEXT,
        ExtractElementType.TABLES,
      ],
    });

    // Create and submit the extraction job
    const job = new ExtractPDFJob({ inputAsset, params });
    const pollingURL = await pdfServices.submit({ job });

    // Wait for job completion
    const pdfServicesResponse = await pdfServices.getJobResult({
      pollingURL,
      resultType: ExtractPDFResult,
    });

    // Get the result asset
    const resultAsset = pdfServicesResponse.result.resource;
    const streamAsset = await pdfServices.getContent({ asset: resultAsset });

    // Save ZIP to temp file
    const zipPath = pdfPath.replace(".pdf", "_extract.zip");
    const writeStream = fs.createWriteStream(zipPath);
    
    await new Promise<void>((resolve, reject) => {
      if (streamAsset.readStream instanceof Readable) {
        streamAsset.readStream.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      } else {
        reject(new Error("Invalid stream asset"));
      }
    });

    // Extract JSON from ZIP
    const zip = new AdmZip(zipPath);
    const jsonContent = zip.readAsText("structuredData.json");
    const extractedData: AdobeExtractResult = JSON.parse(jsonContent);

    // Cleanup ZIP file
    fs.unlinkSync(zipPath);

    return extractedData;
  } finally {
    readStream?.destroy();
  }
}
```

### Step 5: Create Quotation Parser

Create `lib/parse-quotation.ts`:

```typescript
import { LineItem, OrderInfo, QuotationResult, Dimensions } from "@/types/quotation";

interface AdobeElement {
  Path: string;
  Text?: string;
  Table?: string[][];
}

interface AdobeExtractResult {
  elements: AdobeElement[];
}

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

// Extract order info from text elements
function extractOrderInfo(elements: AdobeElement[]): OrderInfo {
  const info: OrderInfo = {
    order_number: "",
    client_code: "",
    client_name: "",
    client_address: "",
    delivery_address: "",
    client_phone: "",
    client_email: "",
    client_vat: "",
    reference: "",
    acquisition_date: "",
    technician: { name: "", phone: "", email: "" },
    model: "",
    configuration: {},
  };

  const fullText = elements
    .filter((e) => e.Text)
    .map((e) => e.Text)
    .join("\n");

  // Extract using regex patterns
  const patterns: Record<string, RegExp> = {
    order_number: /N\.\s*Ordine\s*[\n\r]*\s*(\d+\s*-\s*\w+\s*-\s*\d+)/,
    client_code: /Cod\.\s*Cliente[:\s]*(\d+)/,
    acquisition_date: /Data acquisizione\s*[\n\r]*\s*(\d{2}\/\d{2}\/\d{4})/,
    reference: /Riferimento Cliente[\s\S]*?([A-Z]{3,})/,
    model: /Modello:\s*([A-Z'\s]+)/,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = fullText.match(pattern);
    if (match) {
      (info as any)[key] = match[1].trim();
    }
  }

  return info;
}

// Parse table rows into line items
function parseTableRow(row: string[], rowIndex: number): LineItem | null {
  // Expected: R, Codice, Q.tà, Descrizione, L, H, P, Pr.List, Sconti, Pr.Totale
  if (row.length < 8) return null;
  
  const rowNum = parseInt(row[0]);
  if (isNaN(rowNum)) return null;

  // Find dimension columns (integers) and price columns (decimals)
  let L: number | null = null;
  let H: number | null = null;
  let P: number | null = null;
  let listPrice = 0;
  let surcharges = 0;
  let totalPrice = 0;

  // Scan for dimensions and prices
  for (let i = 4; i < row.length; i++) {
    const val = row[i]?.trim();
    if (!val) continue;

    if (val.includes(",")) {
      // It's a price (Italian decimal)
      const price = parseItalianNumber(val);
      if (listPrice === 0) listPrice = price;
      else if (totalPrice === 0) totalPrice = price;
      else surcharges = price;
    } else {
      // It's a dimension
      const dim = parseInt(val);
      if (!isNaN(dim) && dim > 0 && dim < 10000) {
        if (L === null) L = dim;
        else if (H === null) H = dim;
        else if (P === null) P = dim;
      }
    }
  }

  const dimensions: Dimensions | null = (L || H || P) 
    ? { L, H, P } 
    : null;

  return {
    row: rowNum,
    code: row[1]?.trim() || "",
    quantity: parseInt(row[2]) || 1,
    description: row[3]?.trim() || "",
    details: {},
    dimensions,
    list_price: listPrice,
    surcharges,
    total_price: totalPrice || listPrice + surcharges,
    surface_m2: calculateSurface(dimensions),
    volume_m3: calculateVolume(dimensions),
  };
}

// Main parsing function
export function parseQuotation(adobeResult: AdobeExtractResult): QuotationResult {
  const lineItems: LineItem[] = [];

  // Extract tables
  for (const element of adobeResult.elements) {
    if (element.Path?.includes("/Table") && element.Table) {
      for (let i = 1; i < element.Table.length; i++) {
        const item = parseTableRow(element.Table[i], i);
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
    const code = item.code.toUpperCase();
    if (/^E(FOR|FRI|LVS|PIC|CAPPA|MICRO)/.test(code)) {
      categories.appliances.push(item);
    } else if (/^(TOP|ALZ|SCH)/.test(code)) {
      categories.tops.push(item);
    } else if (/^(AC|ERUB|ELAV|EALAV)/.test(code)) {
      categories.accessories.push(item);
    } else {
      categories.furniture.push(item);
    }
  }

  // Calculate summary
  const summary = {
    total_items: lineItems.length,
    total_list_price: lineItems.reduce((sum, i) => sum + i.list_price, 0),
    total_final_price: lineItems.reduce((sum, i) => sum + i.total_price, 0),
    total_surface_m2: lineItems.reduce((sum, i) => sum + (i.surface_m2 || 0), 0),
    total_volume_m3: lineItems.reduce((sum, i) => sum + (i.volume_m3 || 0), 0),
    weight_kg: null,
    volume_mc: null,
    estimated_packages: null,
  };

  return {
    success: true,
    order_info: extractOrderInfo(adobeResult.elements),
    line_items: lineItems,
    categories,
    summary,
    extraction_timestamp: new Date().toISOString(),
  };
}
```

### Step 6: Create API Route

Create `app/api/extract/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { extractPdfWithAdobe } from "@/lib/adobe-extract";
import { parseQuotation } from "@/lib/parse-quotation";

export async function POST(request: NextRequest) {
  let tempPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No PDF file provided" },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".pdf")) {
      return NextResponse.json(
        { success: false, error: "File must be a PDF" },
        { status: 400 }
      );
    }

    // Create uploads directory if needed
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Save uploaded file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    tempPath = path.join(uploadsDir, `${Date.now()}_${file.name}`);
    await writeFile(tempPath, buffer);

    // Extract with Adobe API
    console.log("Starting Adobe PDF extraction...");
    const adobeResult = await extractPdfWithAdobe(tempPath);

    // Parse into structured data
    console.log("Parsing extracted data...");
    const quotation = parseQuotation(adobeResult);

    return NextResponse.json(quotation);

  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Extraction failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    // Cleanup temp file
    if (tempPath) {
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
```

### Step 7: Create Upload UI

Create `app/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { QuotationResult } from "@/types/quotation";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuotationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setError(null);
    } else {
      setError("Please select a valid PDF file");
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || "Extraction failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">LogiV1 - Quotation Extractor</h1>

      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Upload PDF Quotation</h2>
        
        <div className="flex gap-4 items-center">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="flex-1 p-2 border rounded"
          />
          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? "Extracting..." : "Extract"}
          </button>
        </div>

        {error && (
          <p className="mt-4 text-red-600">{error}</p>
        )}
      </div>

      {/* Results Section */}
      {result && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Extraction Results</h2>
          
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">Items</div>
              <div className="text-2xl font-bold">{result.summary.total_items}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">List Price</div>
              <div className="text-2xl font-bold">€{result.summary.total_list_price.toFixed(2)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">Final Price</div>
              <div className="text-2xl font-bold">€{result.summary.total_final_price.toFixed(2)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">Total Volume</div>
              <div className="text-2xl font-bold">{result.summary.total_volume_m3.toFixed(4)} m³</div>
            </div>
          </div>

          {/* Order Info */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Order: {result.order_info.order_number}</h3>
            <p className="text-gray-600">Reference: {result.order_info.reference}</p>
            <p className="text-gray-600">Date: {result.order_info.acquisition_date}</p>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">L</th>
                  <th className="p-2 text-right">H</th>
                  <th className="p-2 text-right">P</th>
                  <th className="p-2 text-right">List €</th>
                  <th className="p-2 text-right">Total €</th>
                  <th className="p-2 text-right">m²</th>
                  <th className="p-2 text-right">m³</th>
                </tr>
              </thead>
              <tbody>
                {result.line_items.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="p-2">{item.row}</td>
                    <td className="p-2 font-mono">{item.code}</td>
                    <td className="p-2">{item.description}</td>
                    <td className="p-2 text-right">{item.dimensions?.L ?? "-"}</td>
                    <td className="p-2 text-right">{item.dimensions?.H ?? "-"}</td>
                    <td className="p-2 text-right">{item.dimensions?.P ?? "-"}</td>
                    <td className="p-2 text-right">{item.list_price.toFixed(2)}</td>
                    <td className="p-2 text-right">{item.total_price.toFixed(2)}</td>
                    <td className="p-2 text-right">{item.surface_m2?.toFixed(4) ?? "-"}</td>
                    <td className="p-2 text-right">{item.volume_m3?.toFixed(6) ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* JSON Export */}
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "quotation_extracted.json";
              a.click();
            }}
            className="mt-6 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Download JSON
          </button>
        </div>
      )}
    </main>
  );
}
```

### Step 8: Test

```bash
npm run dev
# Open http://localhost:3000
# Upload the Arredo3 PDF
# View extracted results
```

---

## Key Points for Claude Code Agent

1. **File Upload is in the Next.js app** - users upload via the web UI
2. **Adobe API handles the heavy lifting** - no need for manual PDF parsing
3. **Parse the `structuredData.json`** from Adobe's ZIP response
4. **Italian numbers**: Always use `parseItalianNumber()` for prices
5. **Dimensions are in mm** - convert to m² and m³ for display
6. **Clean up temp files** after processing
7. **Error handling**: Return user-friendly messages

---

## Commands for Claude Code

```
# Start building
"Set up the Next.js project with TypeScript and create the initial file structure"

# Add Adobe integration
"Create lib/adobe-extract.ts following the CLAUDE.md spec"

# Test extraction
"Test the /api/extract endpoint with a sample PDF"

# Debug issues
"Debug: [error] in [file]:[line]"
```
