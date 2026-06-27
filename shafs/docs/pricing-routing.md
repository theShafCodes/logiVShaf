# Stage 5 — Routing + Pricing  *(Planned)*

The end of the pipeline: trace the route and quote a final client price from the mileage rate. Two independent things that combine into a `Quote`.

## Input
Origin + destination (for routing); the selected `Van` (per-mile rate) and the job's `Item[]` (for surcharges).

## Output
- A `Route { origin, destination, distance, duration }`, shown to the client (map + distance) so the quote is transparent.
- A `Quote { route, van, lineItems, subtotal, surcharges, total }` where `total = distance × van.perMileRate (+ fragility surcharges)`.

## Approach
- **Routing** behind a `RouteProvider` interface (same swap-ability reason as the OCR extractor), Google Maps Directions/Distance Matrix as the first implementation. Lives in `src/lib/pricing/` or `src/lib/routing/`. API key via `src/config/env.ts` — **never** hardcoded, never shipped to the client (server-side calls only).
- **Pricing** as its own **pure** module: `calculateQuote(route, van, items) → Quote`. No live Maps call inside it, so the maths is independently testable. `perMileRate` comes from the admin van config; fragility surcharge logic (e.g. padding/labour per fragile item) defined here as explicit, config-driven knobs.

## Edge cases
- No route found / unroutable address → surface a clear error, no quote.
- Maps API failure or quota → fail loud; retry transient errors; never fabricate a distance.
- Zero fragile items → surcharge is 0, not an error.
- Missing/zero `perMileRate` on the van → reject with a config error (don't quote £0).

## Definition of done
A user uploads a PDF, the pipeline runs end-to-end, and the screen shows the traced route plus a final client price = `distance × van per-mile rate (+ surcharges)` — verified in the running UI.
