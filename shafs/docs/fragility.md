# Stage 2 — Fragility Classification  *(Built)*

Tag each extracted item `fragile` or `standard`, with an audit trail for why. A separate concern from extraction — it must not leak into the parser.

## Input
A `StructuredDocument` from Stage 1.

## Output
`ClassificationResult { provider, items: ClassifiedItem[], counts }`. Each `ClassifiedItem` carries its `pageIndex/tableIndex/rowIndex` position, the `label` used, the `fragility` verdict, `confident`, the `matchedTerm`, and a human-readable `reason`.

## Approach
Behind the `Classifier` interface, selected by `CLASSIFIER_PROVIDER` via `classifier.factory.ts`. Current engine: `rule-classifier.ts`.

1. **Pick the item table** (`table-selector.ts`) — among all parsed tables, choose the one whose headers match `itemTableHeaderKeywords` at least `minHeaderMatches` times. Ignores summary/total tables.
2. **Build each row's text** from the columns named in `textColumnKeywords`.
3. **Decide**, in priority order:
   - **Override** — an exact `overrides[].phrase` match wins outright.
   - **Keyword** — first hit in `fragile.keywords` / `standard.keywords` sets the verdict and records `matchedTerm`.
   - **Default** — no match → `defaultWhenUnmatched`, with `confident=false` (flag for review).

The ruleset is **editable config**, not code: `config/fragility-rules.json` (path from `FRAGILITY_RULES_PATH`), loaded + validated by `ruleset.ts` (fails loud on malformed JSON; keywords lowercased once at load; cached). This keeps it fast, transparent, debuggable, and admin-editable — and a baseline to A/B any future classifier against.

## Edge cases
- No table matches the header keywords → empty `items`, surfaced as "no classifiable items".
- Row matches both a fragile and standard keyword → first match by scan order wins; `reason` records it.
- Unmatched row → defaulted + `confident=false` so the UI can prompt a manual override.
- Malformed `fragility-rules.json` → `RulesetError` at load, fail loud (no silent fallback ruleset).

## Future work (same interface)
- **LLM second pass** for rows the rules don't confidently match: call a model → `fragile/standard` + confidence, behind the same `Classifier` interface so it's swap/A-B-able. Set `fragilitySource = llm`.
- **Manual override** path writing `fragilitySource = override` — the audit-trail fields already exist to support it.

## Definition of done
The extracted table renders with each row tagged fragile/standard, low-confidence rows visibly flagged, and editing `config/fragility-rules.json` changes the result on the next run — verified in the UI.
