# Docs Index

The constitution is [`../CLAUDE.md`](../CLAUDE.md). These docs hold the detail it points at — one file per concern. Ordered by the build order from the foundational plan.

## Foundations (read first)
- [architecture.md](architecture.md) — the five-stage pipeline, data flow, module boundaries, swap-seams.
- [data-model.md](data-model.md) — domain types (built + planned) and how they relate.

## Pipeline stage specs
Each spec follows the same shape: **Input · Output · Approach · Edge cases · Definition of done.**

| Stage | Doc | Status |
|-------|-----|--------|
| 1 — PDF ingestion → table | [pdf-ingestion.md](pdf-ingestion.md) | Built |
| 2 — Fragility classification | [fragility.md](fragility.md) | Built |
| 3 — 3D load / space calculation | [load-calculation.md](load-calculation.md) | Planned |
| 4 — 3D visualization | [visualization.md](visualization.md) | Planned |
| 5 — Routing + pricing | [pricing-routing.md](pricing-routing.md) | Planned |

## Control surface
- [admin-van-config.md](admin-van-config.md) — van presets + per-mile rates (Stages 3 & 5 depend on it). Planned.

## Process
- [branching-strategy.md](branching-strategy.md) — branches, milestones, release flow.
- [agents.md](agents.md) — the three sub-agents, their scope, and what they gate.
