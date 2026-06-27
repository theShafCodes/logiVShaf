# Stage 3 — 3D Load / Space Calculation  *(Built)*

Given the job's items and a van, decide whether and how they fit. A bin-packing
problem. Implemented in `src/lib/packing/` behind a `Packer` swap-seam; the
heuristic is replaceable without touching callers.

## Input
`Item[]` (dimensions + weight + quantity + `fragility` + stacking rules) and a
`Van` (interior `l/w/h` + `maxPayloadKg`) from the fleet repository
([admin-van-config.md](admin-van-config.md)). Items are assembled from Stage 1/2
output by the item-assembler.

## Output
`PackingResult { van, placements: { itemId, position:{x,y,z}, size, rotation, fragile, weightKg, canSupportWeightKg }[], utilization, unplaced[], reasons }`.
Pure, serializable geometry — **no rendering concern**, so Stage 4 is a pure
function of this shape.

## Module map (data flow)
```
StructuredDocument + ClassificationResult
        │  item-assembler.ts  (+ column-map.ts, stackability.ts, weight-estimator.ts, geometry.ts)
        ▼
     Item[]  ──────────────┐
   van.repository.ts → Van[]│
        ▼                   │
   packer.service.ts  (assemble → rank fleet)
        │  heuristic-packer.ts  (3D first-fit-decreasing + fragility/support)
        ▼
   PackingResult (+ van ranking, fitsInSingleVan)  →  app/api/pack/route.ts
```

| Module | Role |
|--------|------|
| `geometry.ts` | Reference formulas: `surface_m2=(L·H)/1e6`, `volume_m3=(L·W·H)/1e9` (mm). |
| `weight-estimator.ts` | Explicit PDF weight, else `volume × category density` fallback. |
| `stackability.ts` + `config/stackability.json` | Category → `{stackable, canSupportWeightKg, orientationFixed, densityKgPerM3}`; conservative fallback. |
| `column-map.ts` + `config/column-map.json` | Table column indices + category code patterns (mirrors reference `pdf-config.ts`). |
| `item-assembler.ts` | Joins classified rows to table cells → `Item[]`; flags missing-dimension rows. |
| `van.repository.ts` + `config/vans.json` | `VanRepository` (JSON-file impl); forward-compatible with ML-1 admin. |
| `heuristic-packer.ts` | The `Packer`: greedy 3D placement + fragility/support constraints. |
| `packer.service.ts` | Orchestrator: assemble → pack across fleet → rank. |
| `app/api/pack/route.ts` | Thin HTTP wrapper. |

## Approach
- **Greedy heuristic**: 3D first-fit-decreasing. Units are expanded from
  quantities, sorted non-fragile-first then largest-volume-first, and placed at
  the lowest-then-nearest free extreme-point anchor. True optimal 3D bin packing
  is NP-hard — not attempted.
- **Fragility as a constraint layer** on top of pure geometry — where the Stage 2
  flag becomes a hard rule:
  - a stacked box must rest fully on **one** non-fragile placement rated to bear
    its weight (`canSupportWeightKg ≥` box weight);
  - fragile items sort last, so they end up on top and nothing is stacked on them.
- **Van ranking fallback:** the service packs every configured van and ranks
  fits-first then tightest-pack; partial packs rank by units placed. An explicit
  `fitsInSingleVan` signals when no one van holds the whole job.
- Config-driven knobs (tolerance, density, fleet cap) live in `src/config/env.ts`.

## Edge cases (all covered by tests)
- A single item larger than the interior in every orientation → `unplaced`
  (`larger than the van interior…`).
- Total weight over `maxPayloadKg` though volume fits → `unplaced`
  (`would exceed the van payload limit`).
- Missing/merged dimensions → `dimensions: null`, never guessed → `unplaced`
  (`missing or unparseable dimensions`).
- Quantity > 1 → expanded into N placements.
- Nothing fits any van → ranked best-effort + `fitsInSingleVan = false`.

## Definition of done
Against fixed sample `Item[]` and a configured `Van`, the engine returns a
deterministic `PackingResult` with sane non-overlapping placements, correct
`unplaced`, and verifiable `utilization`. Proven by the Vitest suite in
`src/lib/packing/__tests__/` (26 cases) — run with `npm test`.
