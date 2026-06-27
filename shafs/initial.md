1. **PDF ingestion** → computer-readable table
2. **Fragility classification** (fragile / non-fragile per item)
3. **3D load calculation** (does it fit, how, in which van)
4. **3D visualization** (show the packed van)
5. **Route + pricing** (Google Maps distance + van's per-mile rate → quote)

Here's the foundational plan, in words.

## 1. Documentation-first foundation (before any feature code)

Most important first:

- **CLAUDE.md (root, ≤200 lines)** — not a feature spec. It's the "constitution": project purpose in 2-3 sentences, the five-stage pipeline named explicitly, the non-negotiable rules ("never guess, always test," "no feature is done until manually verified in the UI," "every milestone = a branch + push"), a pointer to where the *real* docs live, and a one-line description of each sub-agent's job. Anything longer belongs in `/docs`, linked from here.
- **`/docs` — modular, one file per concern:**
  - `docs/architecture.md` — system diagram in words (the pipeline, data flow between stages, what's a server action vs API route vs core-logic module)
  - `docs/data-model.md` — the domain types (Quotation, Item, Van, Route, Quote) and how they relate
  - `docs/pdf-ingestion.md`, `docs/fragility.md`, `docs/load-calculation.md`, `docs/visualization.md`, `docs/pricing-routing.md` — one spec per pipeline stage, each with: input, output, algorithm/approach, edge cases, "definition of done"
  - `docs/admin-van-config.md` — van presets and rate-setting
  - `docs/branching-strategy.md` and `docs/agents.md` — process docs
- **Sub-agents.** Define them as actual config (Claude Code supports project-level sub-agents via `.claude/agents/`), each with a narrow job:
  - *architect-agent* — owns data model + module boundaries, reviews any change that touches `core-logic/`
  - *security-agent* — reviews anything touching file upload, third-party API keys (Mistral, Google Maps), and admin config writes
  - *design-agent* — owns UI/UX consistency for the admin panel and the 3D viewer
  - The point isn't ceremony — it's that each agent has a strict scope, so a PDF-parsing change doesn't get rubber-stamped by the same context that's thinking about pricing.
- **Milestones are micro-steps**, not stages. Each of the five pipeline stages gets broken into 3-6 milestones (e.g. Stage 1 → "visual upload UI," "Mistral document API call wired up," "visual preview of the inputted PDF," "raw JSON → table parser," "table → Quotation schema," "error states"). A milestone is done only when it's manually clicked through in the running UI — matches the "never say tested until tested manually" rule.

## 2. Core data model (the spine everything else hangs off)

Before writing any pipeline code, lock down these types, because all five stages read/write them:

- **`Item`** — name, dimensions (L/W/H), weight, quantity, fragility flag, fragility confidence/source (rule vs override), category (from PDF line item)
- **`Quotation`** — list of `Item[]`, raw source PDF reference, extraction metadata (what the existing `quotation.ts` already partly covers)
- **`Van`** — id, label, internal dimensions, max weight, per-mile rate, fuel/labor multiplier if any — this is what the admin presets configure
- **`PackingResult`** — which van was selected (or candidates ranked), placement of each item in 3D space, utilization %, any items that didn't fit
- **`Route`** — origin, destination, distance, duration (from Google Maps)
- **`Quote`** — Route + Van rate + any fragility-driven surcharge → final price

Getting this schema right early is the single highest-leverage thing — every later stage is "transform A into B," and if A/B are sloppy, every stage downstream inherits the mess.

## 3. Stage 1 — PDF ingestion → table

The flow here is deliberately **visual and verifiable at every step**: a user uploads a PDF through a visual interface, *sees* the PDF they uploaded rendered on screen (so they can confirm it's the right document before any processing), then the system converts it into a structured table, which then feeds fragility classification. The extraction engine is the **Mistral document/OCR API** — it takes the PDF and returns structured, machine-readable content. The plan for the rebuild:

- **Visual upload + preview.** The user drops in a PDF and the app renders it on screen — a "what you uploaded is what gets processed" check. Nothing runs until the user confirms, which satisfies the "no feature is done until manually verified in the UI" rule at the very first stage.
- **Mistral OCR as the extraction engine** — model `mistral-ocr-latest` (currently `mistral-ocr-4-0`), called via the `POST /v1/ocr` endpoint (SDK `ocr.process()`). Isolated behind an interface (`PdfExtractor`) so the engine could be swapped later without touching downstream code. Mistral takes the previewed PDF and returns structured tables/text.
- The parser's job is narrowly: Mistral's raw extracted tables/text → normalized `Item[]`. Anything ambiguous (merged cells, multi-line descriptions, missing dimensions) should produce a flagged item rather than silently guessing — ties back to "never guess."
- Output of this stage is a `Quotation` object, persisted (DB or session) and shown back as an editable table, so a user can review/correct the parsed table before classification runs. Classification (Stage 2) then tags each row fragile / non-fragile.

## 4. Stage 2 — Fragility classification

This is a separate concern from extraction — don't let it leak into the parser. Two viable approaches, and you can ship the first and upgrade later:

- **Rule-based first pass**: a keyword/category lookup table (e.g. "mirror," "glass," "TV," "lamp" → fragile) maintained as a config file the admin can edit — fast, transparent, debuggable, and it gives you a baseline to compare any future ML/LLM classifier against.
- **LLM-assisted second pass** (optional, later): for items the rule table doesn't confidently match, call a model with the item description and let it return fragile/non-fragile + confidence. Keep this behind the same interface so you can A/B it against the rule table.
- Every item carries *why* it was classified that way (rule matched / model call / manual override) — this matters because the admin will want to override classifications, and you need an audit trail for that.

## 5. Stage 3 — 3D load/space calculation

This is a bin-packing problem: given `Item[]` (with dimensions/weight) and a `Van` (with internal dimensions/max weight), determine if/how it fits.

- Use a real packing algorithm (a 3D extension of first-fit-decreasing or similar greedy heuristic is the standard pragmatic choice — true optimal 3D bin packing is NP-hard, so don't try to solve it exactly).
- Fragile items get a placement constraint layer on top of pure geometry: e.g. "no heavy non-fragile item stacked directly above a fragile item," "fragile items placed last / on top, not load-bearing." This is where the fragility flag from Stage 2 actually gets used — it's a constraint feeding the packer, not a separate report.
- If items don't fit in the selected van, the algorithm should be able to rank/suggest alternate van presets from the admin's configured list rather than just failing.
- Output is the `PackingResult` — a clean, serializable list of "this item at this x/y/z position, this rotation" — kept separate from any rendering concern, so visualization is a pure function of this data.

## 6. Stage 4 — 3D visualization

Pure rendering layer, consuming `PackingResult` — no business logic here.

- Three.js is the natural choice (already an available library in this kind of stack) — render the van as a wireframe/box, render each item as a labeled box positioned per the packing result, color-code by fragility.
- Keep this a dumb, swappable view: if the packing algorithm changes, visualization shouldn't need to change, because it only ever reads the `PackingResult` shape.

## 7. Stage 5 — Google Maps + price quote

The end of the pipeline: the **route is traced** and a **final price is quoted to the client based on the mileage rate**. Two independent things that combine into the `Quote`:

- **Routing**: Google Maps Directions/Distance Matrix API, given origin + destination → distance + duration. The traced route is shown to the client (map + distance) so the quote is transparent, not a black box. Isolate behind a `RouteProvider` interface for the same swap-ability reason as the PDF extractor.
- **Pricing**: `rate` comes from the admin's van config (per-mile, set when the van preset is created), multiplied by route distance, plus any fragility surcharge logic you want to define (e.g. extra padding/labor cost per fragile item). This produces the final `Quote` presented to the client.
- Keep pricing logic as its own pure module (`calculateQuote(route, van, items) → Quote`) so it's independently testable without needing a live Maps call every time you test the math.
- **Definition of done**: a user uploads a PDF, the pipeline runs end-to-end, and the screen shows the traced route plus a final client price = `distance × van per-mile rate (+ surcharges)`.

## 8. Admin van configuration

This is the control surface that Stages 3 and 5 both depend on, so it needs to exist early, not as an afterthought:

- CRUD UI for `Van` presets: name, internal L/W/H, max weight, per-mile rate.
- Selecting a van elsewhere in the app (or letting the packing algorithm pick the best-fit one) should pull live from this config, not from hardcoded values — otherwise Stage 3/5 can't be tested realistically.

## 9. Suggested module layout (extending what's in the diagram)

Keep the same instinct as the inspiration repo — domain types separated from API routes separated from "core-logic" transforms — just widened to cover all five stages:

```
core-logic/
  pdf-extraction/    (mistral-extract.ts, pdf-config.ts, parser)
  classification/    (fragility rules, optional LLM classifier)
  packing/           (3D bin-packing algorithm)
  pricing/           (rate calc, route provider interface)
domain/
  types/             (Item, Van, Quotation, PackingResult, Route, Quote)
app/
  api/               (one route per pipeline stage, thin wrappers over core-logic)
  admin/             (van config UI)
  viewer/            (3D visualization)
```

## 10. Build order (so foundations actually get laid before features)

1. Data model + CLAUDE.md + docs skeleton + branching strategy (no feature code yet)
2. Admin van config (everything downstream needs a `Van` to test against)
3. Stage 1 (visual upload → preview → Mistral extraction → table) — re-platform the inspiration repo's pattern onto the Mistral API
4. Stage 2 (fragility) — rule-based first
5. Stage 3 (packing) — test against fixed sample data before wiring to live Stage 1/2 output
6. Stage 4 (visualization) — render Stage 3's output
7. Stage 5 (routing + pricing) — last, since it's the least coupled to the rest

Each numbered item above maps to one or more milestones/branches per the strategy in section 1 — so the "rebuild with strong docs" instruction and the "four (five) steps" instruction aren't actually two separate plans, they're the same plan: docs and process are the scaffolding the five stages get built inside.