# Docs Index

The constitution is [`../CLAUDE.md`](../CLAUDE.md). These docs hold the detail it points at — one file per concern.

## Foundations (read first)
- [architecture.md](architecture.md) — the five-stage pipeline, layering, swap-seams, and where each stage lives in `src/`.
- [data-model.md](data-model.md) — domain types (built + planned) and how they relate.

## Pipeline stage specs
Each spec follows the same shape: **Input · Output · Approach · Edge cases · Definition of done.**

| Stage | Doc | Status |
|-------|-----|--------|
| 1 — PDF ingestion → table | [implementation-details.md](implementation-details.md) | Built |
| 2 — Fragility classification | [implementation-details.md](implementation-details.md) | Built |
| 3 — 3D load / space calculation | [implementation-details.md](implementation-details.md) · [stage3-explained.md](stage3-explained.md) (long-form, authoritative) | Built |
| 4 — 3D visualization | [implementation-details.md](implementation-details.md) | Planned |
| 5 — Routing + pricing | [implementation-details.md](implementation-details.md) · [fleet-allocation.md](fleet-allocation.md) (van choice + pricing) | Built |

## Control surface
- [admin-van-config.md](admin-van-config.md) — van presets + per-mile rates (Stages 3 & 5 depend on it). Planned.
- [fleet-allocation.md](fleet-allocation.md) — how vans are chosen, how cargo is distributed, and how the return journey is priced.

## Design
- [design-system.md](design-system.md) — colour/spacing/font tokens and the design rules.
- [ui-reference.md](ui-reference.md) — the Moverta visual aesthetic spec.
- [ui-components.md](ui-components.md) — React component catalogue.

## Reference
- [api-reference.md](api-reference.md) — all API endpoints, request/response shapes.
- [testing-guide.md](testing-guide.md) — running and writing tests, plus the manual end-to-end script.
- [known-limitations.md](known-limitations.md) — what doesn't work yet and planned future work.

## Process
- [branching-strategy.md](branching-strategy.md) — branches, milestones, release flow.
- [agents.md](agents.md) — the three sub-agents, their scope, and what they gate.
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — how to add a feature.
- [../RELEASE_NOTES.md](../RELEASE_NOTES.md) — release history.
