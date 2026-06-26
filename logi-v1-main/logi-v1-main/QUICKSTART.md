# LogiV1 - Claude Code Quickstart Prompt

Copy and paste this to Claude Code to start the project:

---

## Initial Prompt for Claude Code

```
I need you to build a web app called "LogiV1" - a PDF quotation extractor.

## What it does:
- User uploads an Arredo3 kitchen quotation PDF (Italian)
- We use Adobe PDF Extract API to extract tables and text
- Parse the extracted data into structured JSON
- Calculate: surface (m²) = L×H/1000000, volume (m³) = L×H×P/1000000000
- Display results with totals

## Tech stack:
- Next.js 14 with App Router
- TypeScript strict mode
- Adobe PDF Services SDK (@adobe/pdfservices-node-sdk)
- Tailwind CSS

## I have ready:
- Adobe API credentials (will add to .env.local)
- Sample PDF for testing

## Please:
1. Read the CLAUDE.md file first for full context
2. Set up the project structure
3. Create the Adobe extraction integration
4. Build the API route for /api/extract
5. Create the upload UI

Start by creating the Next.js project and initial file structure.
```

---

## Follow-up Prompts

### After project setup:
```
Now implement lib/adobe-extract.ts following the Adobe PDF Services SDK documentation:
1. Create credentials from environment variables
2. Upload PDF to Adobe
3. Configure extraction for TEXT + TABLES
4. Submit job and poll for completion
5. Download ZIP result and extract structuredData.json
```

### After Adobe integration:
```
Create lib/parse-quotation.ts to:
1. Parse Italian numbers (1.234,56 → 1234.56)
2. Extract order info from text elements
3. Parse table rows into LineItem objects
4. Calculate surface_m2 and volume_m3
5. Categorize items (furniture, appliances, tops, accessories)
6. Return QuotationResult with summary totals
```

### For debugging:
```
Debug: [specific error message] in [filename]:[line number]
Show me the code context and suggest a fix.
```

### For testing:
```
Test the extraction endpoint:
1. Start dev server (npm run dev)
2. Create a test script that POSTs a PDF to /api/extract
3. Log the response and verify structure matches QuotationResult type
```

---

## Environment Variables (.env.local)

```
PDF_SERVICES_CLIENT_ID=your_client_id
PDF_SERVICES_CLIENT_SECRET=your_client_secret
```

---

## Key Files to Create

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project context (already created) |
| `types/quotation.ts` | TypeScript interfaces |
| `lib/adobe-extract.ts` | Adobe API integration |
| `lib/parse-quotation.ts` | Data parsing & calculations |
| `app/api/extract/route.ts` | API endpoint |
| `app/page.tsx` | Upload UI |

---

## Expected Output Format

```json
{
  "success": true,
  "order_info": {
    "order_number": "135649 - OCL - 2025",
    "reference": "MASCELLO",
    "model": "KALI'"
  },
  "line_items": [
    {
      "row": 1,
      "code": "FIAAC18615",
      "description": "FIANCO IN ACCOSTO SP. 1.8 P.61,5",
      "dimensions": { "L": 18, "H": 870, "P": 615 },
      "list_price": 110.00,
      "total_price": 131.00,
      "surface_m2": 0.01566,
      "volume_m3": 0.00963
    }
  ],
  "summary": {
    "total_items": 42,
    "total_list_price": 13471.56,
    "total_final_price": 13494.25,
    "total_surface_m2": 12.4082,
    "total_volume_m3": 4.614082
  }
}
```
