# End-to-End Test Plan

Manual test script for the full pipeline: PDF upload → 3D packing → pricing quote.
Run this after any significant change. Each step has a pass/fail criterion.

## Prerequisites

- Dev server running: `npm run dev` (defaults to port 3000)
- `.env` file with `MISTRAL_API_KEY` and `GOOGLE_MAPS_API_KEY` set
- Sample PDF: `shafs/INDUSTRIAL_QUOTATION.pdf` (included in repo)

---

## Step 1 — Upload PDF

**Action:** Navigate to `http://localhost:3000`. Drag and drop
`INDUSTRIAL_QUOTATION.pdf` onto the drop zone.

**Expected:**
- "Processing…" spinner appears
- After ~3–10 s: item table renders with rows of industrial items
- Page shows "20 items, 11 fragile, 9 standard" (approximate)
- Perf panel shows OCR and classification timings

**Fail if:** Red error banner; no table appears; spinner never clears.

---

## Step 2 — Review Classification

**Action:** Scroll through the classified items table. Find an item tagged
"fragile" (e.g. "Tempered Industrial Glass Pane"). Click its fragility badge to
override it to "standard".

**Expected:**
- Badge changes from red "fragile" to grey "standard"
- Badge shows "manual override" reason on hover
- Packing panel re-runs automatically

**Fail if:** Override has no effect; packing does not re-run.

---

## Step 3 — Review Packing Result

**Action:** After packing completes, scroll to the "Packing" section.

**Expected:**
- "Fleet plan" card shows van(s) used and item count
- 3D viewer renders items inside the van outline
- At least some items have `z > 0` (stacking is visible)
- Volume utilization % is shown
- "Unplaced items" section lists any oversized items with a reason

**Fail if:** 3D viewer blank; all items at z=0; utilization shows NaN.

---

## Step 4 — Edge case: oversized items

**Action:** Inspect the "Unplaced items" list.

**Expected:**
- Industrial Steel I-Beam (12 m) is listed as unplaced
- Reason: "exceeds largest van interior (1200 cm; max 720 cm)"
- Items that DO fit (e.g. heavy-material with sensible dimensions) are placed

**Fail if:** I-Beam is reported as placed (a 12 m beam cannot fit in any road van).

---

## Step 5 — Get Quote

**Action:** In the "Route" section, type "London, UK" in Origin and
"Manchester, UK" in Destination. Select suggestions from the autocomplete list.
Click "Get Quote".

**Expected:**
- Distance shows ~212 miles
- Duration shows ~3–4 hours
- Line items table shows each van's distance cost
- Surcharge section shows fragile-item surcharges
- Total is a positive £ amount
- No "Quote failed" error banner

**Fail if:** Total is £0; red error banner; route not found.

---

## Step 6 — Reset flow

**Action:** Click "Start Over / New Quote".

**Expected:**
- All form fields clear
- Item table disappears
- 3D viewer disappears
- Drop zone resets to idle state

**Fail if:** Previous results still visible after reset.

---

## Step 7 — Quote History

**Action:** After completing a quote, refresh the page. Expand the
"Quote History" panel in the left sidebar.

**Expected:**
- The quote just completed appears as the first entry
- Shows origin → destination, distance, number of vans, total £
- Entry count increases with each successful quote

**Fail if:** History panel empty after a successful quote; count does not increase.

---

## Step 8 — Admin: Van Config

**Action:** Open the "Van Fleet" panel in the left sidebar. Click "Edit" on any
van. Change the per-mile rate by ±0.10. Save.

**Expected:**
- Van list updates to show new rate
- Re-running a quote (re-upload same PDF) reflects the updated rate in the total

**Fail if:** Rate change not persisted; quote total unchanged.

---

## Edge Case Scenarios

| Scenario | Expected outcome |
|----------|-----------------|
| PDF with no tables | Error: "No tables found in document" |
| All items fragile | All items in packing plan marked red; surcharge line high |
| Very heavy items exceeding payload | Fleet allocator adds a second van |
| Origin = Destination | Route distance = 0; quote total = surcharges only |
| Missing API key (GOOGLE_MAPS_API_KEY) | "Routing API not configured" error; packing still works |

---

## Automated tests (complement to manual)

```bash
npm test            # 98 unit + integration tests
npm run typecheck   # TypeScript strict mode
npm run lint        # ESLint
```

All 98 tests must pass before a PR is merged.
