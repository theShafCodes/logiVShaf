# Known Limitations

What works, what doesn't, and what needs future work.

---

## Packing / 3D Load Calculation

### Oversized industrial items

Items whose longest dimension exceeds the largest van in the fleet
(currently 7200 mm — 18 t box truck) are flagged as **unplaced** and
listed in the API response under `reasons`. This is correct behaviour
for road delivery: a 12 m steel I-beam cannot fit in any standard van.

_Future work:_ Add a "flatbed lorry" or "low-loader" vehicle class; flag
these items with a "requires specialist vehicle" warning rather than silently
unplacing them.

### Derived depth for 2-D quotation tables

When a quotation table provides only Height and Width (no Depth/Length),
the packer derives the missing dimension from:

```
depth = weightKg / (densityKgPerM3 × faceAreaM2)
```

Density is read from `config/stackability.json` per category. If the real
item has an unusual density (e.g. hollow steel sections are much lighter
than solid steel), the derived depth may be wrong, leading to over- or
under-utilisation estimates.

_Workaround:_ Supply a 3-column table with explicit L/H/P dimensions and
configure `config/column-map.json` with `dimensionP` pointing at that column.

### Single-base support rule

The packer requires each stacked item to rest its full footprint on a
**single** supporting placement. Items that span two lower items are
not placed on top of them. This is conservative but safe.

_Future work:_ Implement multi-base support — allow resting on multiple
placements whose combined footprint covers the item's base.

### Orientation for fragile items

Fragile items (`fragility: "fragile"`) are always sorted to the top of the
pack and placed last. Their orientation is fixed when `orientationFixed: true`
in `config/stackability.json`. If a fragile item cannot be placed safely, it is
left unplaced (not forced in unsupported).

---

## OCR / PDF Ingestion

### Multi-page PDFs

The ingestion pipeline processes every page and every table. If the same
items appear on multiple pages (e.g. a cover page and a detail table), the
assembler creates duplicate items. Dimensions are resolved per-page —
a "classification summary" table (no dimension columns) correctly produces
`dimensions: null` items that are never packed.

_Workaround:_ The fleet allocator's `packableUnits` count already excludes
`dimensions: null` items, so duplicates from summary pages do not inflate
the pack.

### Merged / irregular table cells

Mistral OCR sometimes misreads merged header cells or tables with coloured
rows. The table-parser will produce empty or malformed cells. The item
assembler treats missing numeric columns as `null` and skips those rows.

---

## Routing / Pricing

### Google Maps API key required for live quotes

Without `GOOGLE_MAPS_API_KEY` in `.env`, the route provider throws
`RoutingError: GOOGLE_MAPS_API_KEY is not configured`. All upstream stages
(ingest, classify, pack, 3D view) still work — only the final quote step fails.

### Distance is straight-line if Maps API unavailable

There is no offline fallback distance calculator. A future improvement would
be to add a Haversine straight-line estimate as a degraded fallback with a
prominent "estimate only" label.

### Multi-van per-mile rates

Each van drives the full route. For multi-van jobs the total cost =
Σ(each van's perMileRate) × distance. This overstates cost when vans travel
in convoy — a future "convoy discount" config knob is the fix.

---

## UI

### No route map visualisation

The quote panel shows route distance and duration but does not embed a Google
Maps route map. Planned for a future milestone.

### Quote history not editable

The history panel (left sidebar) is read-only. Past quotes cannot be re-opened
for re-calculation or editing from the history list.

### No PDF export

The "Send Quote to Client" PDF-export feature is not implemented. Quote data
is visible on-screen and in the history JSON but cannot be exported to a
printable document.

---

## Security

### Admin panel has no authentication

The Van Config admin panel and quote history are accessible to any user who
can reach the dev server. For production deployment, add authentication
(Next.js middleware + session management) before exposing the admin panel.

### File upload size limit

`INGEST_MAX_FILE_BYTES` (default 25 MiB, configurable via env) guards against
very large PDFs. Any PDF under this limit is accepted regardless of content.
