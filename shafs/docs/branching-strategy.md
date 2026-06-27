# Branching Strategy

Simple and defensible. Satisfies "every milestone requires its own dedicated branch; no direct pushes to main" without inventing anything exotic.

## Branches
```
main      ← always deployable; release only, after manual UI verification
 ▲
develop   ← integration branch; features merge here first
 ▲
feature/<stage>-<short-name>   ← one per milestone
```

- **`main`** — always deployable. Nothing lands here except a release merged from `develop`, and only after the milestone is manually clicked through in the running UI.
- **`develop`** — integration. Feature branches PR into here.
- **`feature/<stage>-<short-name>`** — one branch per milestone. Examples: `feature/admin-van-config`, `feature/packing-engine`, `feature/fragility-classifier`.

## Milestone lifecycle
1. Branch off `develop`: `feature/<stage>-<short-name>`.
2. Build the milestone (a milestone is a micro-step, not a whole stage).
3. Open a PR into `develop`. The relevant sub-agent ([agents.md](agents.md)) reviews by scope.
4. **Squash-merge** into `develop`, then **tag**.
5. A milestone is **done only when manually clicked through in the running UI** — never call it tested until tested by hand.
6. Cut a release from `develop` into `main` after that manual verification.

## Roadmap → branches
Mapping the `CLAUDE.md` §4 roadmap to representative feature branches. Each ML breaks into 3–6 micro-step branches.

| ML | Scope | Representative branches |
|----|-------|-------------------------|
| ML-0 | Core rules / foundation (this step) | `feature/docs-foundation` |
| ML-1 | Admin van presets + rates | `feature/admin-van-config`, `feature/van-rate-fields` |
| ML-2 | Ingestion + classification + 3D volume | `feature/pdf-ingestion`, `feature/fragility-classifier`, `feature/packing-engine` |
| ML-3 | 3D render + interactive layout | `feature/viewer-threejs`, `feature/viewer-fragility-colors` |
| ML-4 | Maps routing + price quote | `feature/route-provider`, `feature/quote-calculation` |

> Stages 1–2 (ingestion, classification) already exist in `src/`; their remaining polish and the later stages follow this flow going forward.
