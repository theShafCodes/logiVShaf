# Quotation PDF Extractor - LogiV1

## Project Overview
Web application that extracts structured data from Arredo3 kitchen quotation PDFs using Adobe PDF Extract API. Users upload PDF quotations, the system extracts tables/text, calculates pricing based on dimensions, and returns structured JSON for further processing.

## Problem We're Solving
Arredo3 kitchen quotations are complex PDFs with:
- Multiple tables spanning 7+ pages
- Line items with dimensions (L, H, P in mm)
- Italian number formatting (1.234,56)
- Nested product details and variants
- Multiple categories (furniture, appliances, tops, accessories)

**Goal**: Extract all line items, parse dimensions, calculate surface area (m²) and volume (m³), compute totals, return clean JSON.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **PDF Extraction**: Adobe PDF Services API (Extract)
- **File Upload**: Multer or Next.js API routes
- **Styling**: Tailwind CSS
- **State**: React hooks (useState, useEffect)

## Quick Reference
```bash
# Dev server
npm run dev → localhost:3000

# Environment variables required
PDF_SERVICES_CLIENT_ID=<adobe_client_id>
PDF_SERVICES_CLIENT_SECRET=<adobe_client_secret>

# Test extraction
curl -X POST http://localhost:3000/api/extract -F "pdf=@quotation.pdf"
```

## Project Structure
```
quotation-extractor/
├── CLAUDE.md                 # This file
├── app/
│   ├── page.tsx              # Upload UI
│   ├── layout.tsx            # Root layout
│   └── api/
│       └── extract/
│           └── route.ts      # PDF extraction endpoint
├── lib/
│   ├── adobe-extract.ts      # Adobe API integration
│   ├── parse-quotation.ts    # Parse extracted JSON to structured data
│   └── calculations.ts       # Surface/volume/price calculations
├── types/
│   └── quotation.ts          # TypeScript interfaces
├── components/
│   ├── UploadForm.tsx        # File upload component
│   └── ResultsTable.tsx      # Display extracted data
└── uploads/                  # Temporary PDF storage (gitignored)
```

## Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| PDF Extraction | Adobe PDF Extract API | AI-powered, 99%+ accuracy on tables |
| Number Format | Parse Italian → Float | Source uses comma decimals |
| Dimensions | Store in mm | Match source PDF units |
| Calculations | Server-side | Ensure consistency |
| File Storage | Temp + cleanup | Don't persist user PDFs |

## Data Flow
```
1. User uploads PDF → /api/extract
2. Server saves to temp file
3. Adobe API: upload asset → create job → poll status → download ZIP
4. Parse structuredData.json from ZIP
5. Extract tables → map to LineItem[]
6. Calculate: surface_m2 = (L × H) / 1,000,000
7. Calculate: volume_m3 = (L × H × P) / 1,000,000,000
8. Sum totals, return JSON response
9. Cleanup temp files
```

## Key Interfaces
```typescript
interface LineItem {
  row: number;
  code: string;
  qty: number;
  description: string;
  dimensions: { L: number; H: number; P: number } | null;
  list_price: number;
  surcharges: number;
  total_price: number;
  // Calculated
  surface_m2?: number;
  volume_m3?: number;
}

interface QuotationResult {
  order_info: OrderInfo;
  line_items: LineItem[];
  summary: {
    total_items: number;
    total_list_price: number;
    total_final_price: number;
    total_surface_m2: number;
    total_volume_m3: number;
  };
}
```

## Code Standards
- Functional components only
- Events prefixed: `handleUpload`, `handleExtract`
- All prices in EUR (number, 2 decimals)
- All dimensions in mm (number)
- ISO dates for timestamps
- Error messages user-friendly

## Adobe PDF Extract API Flow
```typescript
// 1. Create credentials
const credentials = new ServicePrincipalCredentials({
  clientId: process.env.PDF_SERVICES_CLIENT_ID,
  clientSecret: process.env.PDF_SERVICES_CLIENT_SECRET
});

// 2. Upload PDF
const inputAsset = await pdfServices.upload({ readStream, mimeType: MimeType.PDF });

// 3. Configure extraction (TEXT + TABLES)
const params = new ExtractPDFParams({
  elementsToExtract: [ExtractElementType.TEXT, ExtractElementType.TABLES]
});

// 4. Submit job and poll
const job = new ExtractPDFJob({ inputAsset, params });
const pollingURL = await pdfServices.submit({ job });
const result = await pdfServices.getJobResult({ pollingURL, resultType: ExtractPDFResult });

// 5. Download ZIP, extract structuredData.json
```

## Italian Number Parsing
```typescript
// "1.234,56" → 1234.56
function parseItalianNumber(str: string): number {
  if (!str) return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}
```

## Current Sprint
- [x] Day 1: Project setup, CLAUDE.md, types
- [ ] Day 2: Adobe API integration (lib/adobe-extract.ts)
- [ ] Day 3: Quotation parser (lib/parse-quotation.ts)
- [ ] Day 4: API route + calculations
- [ ] Day 5: Upload UI + results display
- [ ] Day 6: Error handling + testing
- [ ] Day 7: Polish + deploy

## Testing Commands
```bash
# Unit tests
npm test

# Test API endpoint
npm run dev
# Then: POST /api/extract with PDF file

# Type check
npm run typecheck
```

## Debugging Protocol
```
Debug: [error] in [file]:[line]

Example:
Debug: TypeError: Cannot read property 'elements' in lib/parse-quotation.ts:45
→ Check Adobe response structure, ensure ZIP extraction worked
```

## Known Edge Cases
1. **Multi-page tables**: Adobe handles continuation automatically
2. **Merged cells**: Check for null values in table rows
3. **Sub-items**: Some rows have indented descriptions (components of main item)
4. **Missing dimensions**: Accessories often have no L/H/P
5. **RAEE contributions**: Separate section at end of PDF

## Dependencies
```json
{
  "@adobe/pdfservices-node-sdk": "^4.0.0",
  "adm-zip": "^0.5.10",
  "next": "^14.0.0",
  "react": "^18.0.0",
  "typescript": "^5.0.0"
}
```

## Environment Setup
```bash
# .env.local (gitignored)
PDF_SERVICES_CLIENT_ID=your_client_id_here
PDF_SERVICES_CLIENT_SECRET=your_client_secret_here
```
