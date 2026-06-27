# Stage 4 — 3D Visualization  *(Planned)*

A pure rendering layer. Consumes `PackingResult` and draws it. **No business logic here.**

## Input
A `PackingResult` from Stage 3.

## Output
An interactive 3D view: the van as a wireframe/box, each item as a labelled box at its `position`/`rotation`, colour-coded by fragility. No data is produced — this stage only renders.

## Approach
- **Three.js** (natural fit for this stack). Lives in `src/app/viewer/`.
- A **dumb, swappable view**: it only ever reads the `PackingResult` shape, so if the packing algorithm changes, the viewer doesn't. Keep it a pure function of its input — no fetching, no recomputation of placement.
- Colour legend: fragile vs standard; highlight `unplaced` items separately (e.g. listed beside the canvas, not in the van).

## Edge cases
- Empty `placements` → render the empty van + a clear "nothing packed" state.
- `unplaced` non-empty → show them distinctly so the user sees what didn't fit.
- Degenerate dimensions (zero/negative) → guard at the boundary; never crash the canvas.

## Definition of done
Given a Stage 3 `PackingResult`, the viewer renders the van and every placed item in correct relative position, colour-coded by fragility, and the user can orbit/inspect it in the running UI.
