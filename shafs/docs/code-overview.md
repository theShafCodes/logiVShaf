# Code Overview

Guide to where each part of the five-stage pipeline lives. This is a Next.js 15
(App Router) project; everything is under `src/`. Core logic is framework-free in
`src/lib/`; API routes are thin HTTP wrappers; React components render results.

## Top-level layout

```
src/
├── app/            Next.js App Router — pages + API routes
│   ├── page.tsx        Main UI orchestrator (upload → classify → pack → quote)
│   └── api/            HTTP endpoints (see docs/api-reference.md)
├── cli/            tsx entry points (e.g. `npm run ingest`)
├── components/     React UI (common / layout / results / upload)
├── config/         env.ts — typed config loaded from environment
├── lib/            Framework-free core logic, one folder per concern
├── styles/         Design tokens (tokens.ts) — see docs/design-system.md
└── types/          api.ts — shared request/response shapes
```

## Where each stage lives

| Stage | Core logic (`src/lib/`) | API route (`src/app/api/`) | UI (`src/components/`) |
|-------|-------------------------|----------------------------|------------------------|
| 1 — PDF ingestion | `ocr/`, `conversion/`, `ingestion/` | `ingest/` | `upload/DropZone`, `results/ResultTables` |
| 2 — Fragility classification | `classification/` | (runs inside `ingest/`) | `results/ClassificationSummary`, `common/FragilityBadge` |
| 3 — Packing / load calc | `packing/` | `pack/`, `pack/direct/`, `vans/` | `results/PackingResultPanel`, `results/Van3DViewer` |
| 4 — 3D visualization | — | — | `results/Van3DViewer` |
| 5 — Routing + pricing | `routing/`, `pricing/` | `quote/`, `map/` | `results/QuotePanel` |
| — Cross-cutting | `logger/`, `perf/`, `storage/`, `util/` | — | `layout/AppHeader` |

## Key files

- `src/lib/ingestion/ingestion.service.ts` — Stage 1 orchestrator (OCR → document → classify).
- `src/lib/packing/packer.service.ts` — Stage 3 orchestrator (assemble items → rank vans → pack fleet).
- `src/lib/packing/heuristic-packer.ts` — the 3D first-fit placement algorithm + fragility constraints.
- `src/lib/pricing/index.ts` — Stage 5 orchestrator (load vans → fetch route → calculate quote).
- `src/lib/pricing/calculator.ts` — pure pricing math (distance cost + fragility surcharge).
- `src/lib/routing/google-maps.provider.ts` — Google Maps Routes API v2 client (server-only).
- `src/config/env.ts` — single source of truth for all runtime config / API keys.

## Design rules (from CLAUDE.md)

- Core logic in `lib/` never imports from `app/` or `components/` — dependencies point inward.
- API routes contain no business logic — they validate input and delegate to a `lib/` service.
- No hardcoded colours in `src/`; all styling via tokens in `src/styles/tokens.ts`.
- API keys are read only through `config/env.ts` and never prefixed `NEXT_PUBLIC_`.
