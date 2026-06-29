# Contributing

How to add to this codebase. The constitution is [`CLAUDE.md`](CLAUDE.md); the
detailed specs are in [`docs/`](docs/README.md). Read [`docs/code-overview.md`](docs/code-overview.md)
first to find where things live.

## Branching

Strict git discipline — see [`docs/branching-strategy.md`](docs/branching-strategy.md).

- Never push directly to `main`. Every milestone gets its own branch.
- Branch naming: `feat/<stage>-<short-desc>` (e.g. `feat/stage3-packing`).
- Commit in small, verifiable units; reference the work in the message.
- Open a PR; squash-merge to `main` once review + checks pass.

## Adding a feature

1. **Docs first** — write/update the spec in `docs/` before the feature code.
2. **Core logic in `src/lib/`** — framework-free, one folder per concern. It must not import from `app/` or `components/` (dependencies point inward).
3. **API route stays thin** — validate input, delegate to a `lib/` service, shape the JSON. No business logic in `src/app/api/`.
4. **UI is presentational** — components take typed props from `src/types/api.ts`; state lives in `page.tsx`.
5. **Config via `src/config/env.ts`** — never read `process.env` elsewhere; never expose keys with `NEXT_PUBLIC_`.
6. **Styling via tokens** — `src/styles/tokens.ts`. No hardcoded hex in `src/`.

## Before opening a PR

```bash
npm run typecheck   # must be clean
npm test            # all tests pass
npm run lint
```

Add tests for new `lib/` logic in a `__tests__/` folder beside it. See
[`docs/testing-guide.md`](docs/testing-guide.md). For UI-facing work, manually
click the stage through in `npm run dev` — nothing is "done" until verified in the
running UI.

## Engineering rules (from CLAUDE.md)

MRMR · loose coupling · high cohesion · single responsibility · never hardcode ·
never over-engineer · never guess, always prove.
