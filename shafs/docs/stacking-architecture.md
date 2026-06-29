# 3D Stacking — Micro-Architecture

How the load-planning logic decides **where each box goes** and **whether a box may sit
somewhere**. The same rules drive both the automatic packer and the interactive 3D drag.

## Coordinate frame (the contract everything shares)

All modules agree on one frame, all in **millimetres**:

```
origin = rear-left-floor corner (0,0,0)
x → van length  (interior.l)   "from rear"
y → van width   (interior.w)   "from left"
z → up/height   (interior.h)   "from floor"
```

A `Placement` stores the **near corner** `position` + the box `size`; the far corner is
`position + size`. This single frame is the source of truth — the auto-packer and the
interactive drag both read/write it, so the rules cannot diverge.

## Module map

| File | Role |
|------|------|
| `src/lib/packing/packing.types.ts` | Shared `Item` / `Placement` / `Van` shapes |
| `src/lib/packing/geometry.ts` | `volumeM3` pure helpers |
| `src/lib/packing/placement-validator.ts` | **"May this box sit here?"** — rule engine (pure, shared by server + client) |
| `src/lib/packing/heuristic-packer.ts` | **"Where should each box go?"** — greedy search |
| `src/lib/packing/fleet-allocator.ts` | **"Which vans carry the whole job?"** — wraps the packer across vehicles |
| `src/components/results/Van3DViewer.tsx` | Interactive drag — reuses the same rule engine |

---

## Layer 1 — The rule engine (`placement-validator.ts`)

A placement is legal only if it passes three gates **in order** (first failure wins, so the
error message names the most specific cause):

**1. Bounds** — `fitsInterior()`: box lies wholly inside `interior.l/w/h` (± tolerance).
This is where the **right wall and ceiling** act as hard limits.

**2. No overlap** — `intersects()`: strict overlap on all 3 axes. Touching faces are allowed
(`<`, not `<=`), so boxes sit flush.

**3. Support** (only if `z > 0`) — `isSupported()`. A raised box must rest **fully on one
single placement** (conservative: no partial / multi-box support) whose top face meets the
box base (`|top − z| ≤ tol`) and clears two physics gates:

- **Fragility compatibility** — a fragile box may only rest on a fragile base; a standard box
  may *never* sit on a fragile base. (Standard bases accept anything.)
- **Crush limit** — `stackPressureKpa(weightKg, footprint) = (m·g / A)` must not exceed the
  base's `maxStackPressureKpa`. Per-interface only: weight is not propagated further down the
  column (stated model boundary).

A floor box (`z ≈ 0`) skips gate 3.

---

## Layer 2 — The packer (`heuristic-packer.ts`)

A **first-fit-decreasing 3D packer with extreme-point anchors**. Pure & deterministic (no
clock, no randomness, stable sorts) so the visualiser can render its output directly.

**① Expand** — explode `quantity` into individual units; dimensionless items go straight to
`unplaced` (`missing dimensions`).

**② Sort** the units (this is what *enables* stacking):
```
non-fragile first        → fragile fall to the end (nothing stacks on them)
then sturdiest base       → high canSupportWeightKg lands on the floor first,
                            so rated bases exist before lighter items arrive
then largest volume
then id (stable tie-break)
```

**③ Anchors** — candidate positions. Seed `[{0,0,0}]`. Each placed box spawns three new
extreme points:
```
right (+x) · beside (+y) · atop (+z)
```
De-duplicated, kept bounded. This is how the search reaches the **right wall and the
ceiling** — not just the floor.

**④ Place each unit** — `tryPlace()`:
- Weight gate first (position-independent): running `payloadKg + weight ≤ van.maxPayloadKg`,
  else `overPayload`.
- Interior fit in *any* allowed orientation (up to 6 axis permutations; `orientationFixed`
  items keep only the natural one), else `exceedsInterior`.
- Otherwise score **every (anchor × orientation) candidate** that passes `validatePlacement`,
  keep the best. No fit → `noSpace`.

**⑤ Scoring** — `scoreCandidate()`, the heart of vertical optimisation:
```
score =  (stackable ? pos.z · 1000 : 0)     // reward height — climb toward ceiling
       + (pos.z > 0 ? 1_000_000 : 0)        // big bonus for resting on a base
       − (pos.x + pos.y) · 1                 // nudge toward rear-left → compact, no stranded gaps
```
Magnitudes are deliberately tiered: `support ≫ height ≫ compaction`, so ties never hinge on
float noise. A new candidate only displaces the incumbent on a **strictly** higher score →
lowest, most compact, lowest-rotation placement wins deterministically. Non-stackable items
are gated to the floor (`pos.z > 0 && !stackable → skip`).

The packer reports `volumeFill` (placed m³ / interior m³) as the success metric, plus
`floorFootprint` (exposes unused height).

---

## Layer 3 — Interactive drag (`Van3DViewer` + validator)

Manual placement reuses the **exact same rule engine** — no parallel logic:
- `resolveDrop(x,y,size,others)` finds the highest support under the dragged footprint and
  **snaps x/y** so the box rests fully on it (without the snap a hand-dropped box almost never
  aligns within tolerance and stacking would be impossible in the UI).
- The candidate is then run through `validatePlacement`; valid → ghost turns green and
  commits, invalid → snaps back with the reason.

---

## What it intentionally does *not* fill

Dead air above an item is **physics, not a bug**:
- non-stackable items (nothing may sit on them),
- fragile items (nothing on top),
- any interface where the stack-pressure / fragility gates fail.

And it is a **greedy heuristic** — 3D bin-packing is NP-hard, so the result is high-quality
and deterministic, not provably optimal.

---

## One-line flow

```
items → expand → sort(stack-enabling) → for each unit:
        weight gate → interior fit → score(anchor × orientation | validatePlacement) → place → spawn anchors
      → volumeFill / floorFootprint
```
