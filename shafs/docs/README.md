# Docs Index

The constitution is [`../CLAUDE.md`](../CLAUDE.md). These docs hold the detail it points at — one file per concern. Ordered by the build order from the foundational plan.

## Foundations (read first)
- [architecture.md](architecture.md) — the five-stage pipeline, data flow, module boundaries, swap-seams.
- [data-model.md](data-model.md) — domain types (built + planned) and how they relate.

## Pipeline stage specs
Each spec follows the same shape: **Input · Output · Approach · Edge cases · Definition of done.**

| Stage | Doc | Status |
|-------|-----|--------|
| 1 — PDF ingestion → table | [implementation-details.md](implementation-details.md) | Built |
| 2 — Fragility classification | [implementation-details.md](implementation-details.md) | Built |
| 3 — 3D load / space calculation | [implementation-details.md](implementation-details.md) · [stage3-explained.md](stage3-explained.md) (long-form) | Built |
| 4 — 3D visualization | [implementation-details.md](implementation-details.md) | Planned |
| 5 — Routing + pricing | [implementation-details.md](implementation-details.md) | Built |

## Control surface
- [admin-van-config.md](admin-van-config.md) — van presets + per-mile rates (Stages 3 & 5 depend on it). Planned.

## Reference (Phase 8)
- [code-overview.md](code-overview.md) — where each stage lives in the codebase.
- [api-reference.md](api-reference.md) — all API endpoints, request/response shapes.
- [ui-components.md](ui-components.md) — UI component guide.
- [testing-guide.md](testing-guide.md) — running and writing tests.

## Process
- [branching-strategy.md](branching-strategy.md) — branches, milestones, release flow.
- [agents.md](agents.md) — the three sub-agents, their scope, and what they gate.
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — how to add a feature.
- [../RELEASE_NOTES.md](../RELEASE_NOTES.md) — release history.
