# Stacking — Per-Item Data Enrichment

> **Status:** Active. Last additions: lateral-support failure for deformable items (§2 CRUSH); dimensional grouping for stability (§5).
> A new agent should be able to read this cold and add to it.
> This is a **data** doc: *what facts we need per item, and where each comes from.*
>
> **See also:** [`column-map.json`](../config/column-map.json),
> [`stackability.json`](../config/stackability.json),
> [`packing.types.ts`](../src/lib/packing/packing.types.ts).

---

## 1. The question

Stage 2 already tags each item **fragile or not**. That's one useful fact — but not
enough to know a stack will survive.

> **What other facts about each item do we need — like we know fragility — so we can
> stack the van without damaging anything?**

Stacking damages items in two unrelated ways, so they need different data:

- **CRUSH** — the bottom item caves under the weight piled on it (parked or driving).
- **STABILITY** — the item slides or tips because the van moves, and breaks from the fall.

**Assumptions (the only two):**

- **Every item is a cuboid box already.** We pack bounding boxes, not real shapes. The
  one place this leaks is the top surface — see *Top-loadable* in §2.
- **The van's weight capacity is excluded.** We don't check whether the total cargo
  exceeds the van's rated payload — this doc is only about per-item crush and stability
  inside the load.

---

## 2. The data we need per item

Marker: ✅ *have it* · ⚠️ *partly* · ❌ *missing*. Grouped by the two failure modes. Weight
and dimensions serve both, so they appear under each with a different job.

**Durability — how much weight can sit on it (CRUSH)**

- **Weight** — ✅. What it presses down, and what it adds to the running load beneath it.
- **Base area** *(from H·W·D)* — ✅. The same weight over a big base crushes less than over
  a small one.
- **Material** — ⚠️. The main driver of how much weight it can bear. Printed on the
  quotation but dropped today (§3).
- **Durability tier** — ⚠️. How much weight it can bear before it caves. Not a readable
  number — judged from material + build, see **§2A**. Today faked per category.
- **Brittle** — ⚠️. Does it snap instead of deform? Glass, plasterboard, ceramic, stone =
  yes. Everything else = no. Changes *where* it goes — never sandwiched, never point-loaded
  — not just how much sits on top. Read straight from the material.
- **Soft or hard (deforms or holds shape)** — ❌. *Soft can still be durable* — a pillow
  squashes and recovers instead of breaking, so it survives fine; it just **can't bear a
  load on top** (durability = none). The other effect: soft items **pack smaller** (a
  pillow fills a gap; flat cloth doesn't) — a space win. What decides actual *damage* is
  **recovery**: cloth and foam spring back (harmless), cardboard stays crushed, glass
  breaks. **Cross-failure-mode effect on stability:** a deformable face **cannot act as a
  rigid lateral wall** — any rigid neighbour leaning against it will shift or tip, because
  the contact surface compresses. Soft items must not be placed as the sole side-support for
  a tall or top-heavy neighbour; pad or isolate the deformable face.

**Stability — will it stay put when the van moves (STABILITY)**

- **Weight** — ✅. How hard it shoves forward under braking.
- **Shape** *(from H·W·D)* — ✅. Tall-narrow tips over; low-wide stays put.
- **Orientation — fixed / partial / none** — ⚠️. Which ways up it may be turned: a fixed
  up (motors, liquids) that must never be flipped, *partial* (only some faces allowed), or
  *none* (any way up). Today a blunt yes/no `orientationFixed` set per category.
- **Top-heaviness** — ❌. Where the weight sits; a top-heavy item tips on its corners even
  when it isn't tall.
- **Base grip** — ❌. Smooth metal/plastic slides under braking; cardboard grips. Flags
  "needs wedging."
- **Fragility** — ✅. Doesn't make it move — sets **how bad it is if it does**. Classified
  in Stage 2.

**Both — can you stack on it at all**

- **Can you stack on top of it?** — ❌. A bare bike or chair has empty air at the top of
  its box — anything placed there falls through. Just one flag: **yes or no**. Same
  question downward: does it sit flat on its whole base, or on feet/legs that punch point
  loads into what's beneath?

### 2A. How we determine durability

This is the vague one, so here is exactly what to look at. Durability is **not** a single
fact on the page — the same material can be strong or weak depending on how the item is
built. Judge it from two signals, most important first:

1. **Material** *(from the `Material` column, §3)* — the ceiling. Foam/fabric ≈ none →
   cardboard/thin plastic = low → engineered wood/MDF = medium → solid wood/steel/concrete
   = high → glass = brittle (shatters on a point load).
2. **Hollow or solid** *(from category/description)* — a hollow shell is far weaker than
   a solid block of the *same* material. A steel washing machine is hollow → medium, not
   high. Cabinets, drawers and appliances are hollow.

**How the intelligence combines them:** two outputs from material + build:

1. **Durability tier** (*none / low / medium / high*) — start from the material's ceiling
   (signal 1), knock it **down** for a hollow build (signal 2). Maps to a
   `maxStackPressureKpa` in config. Coarse-but-honest beats a precise-looking guess.
2. **Brittle flag** (*yes / no*) — read straight from material. Glass, plasterboard,
   ceramic, stone = yes. Brittle items snap instead of deforming, so placement rules
   differ: never sandwiched, never point-loaded.

---

## 3. Where each fact comes from

Three routes — and most of the missing data is **cheaper than expected**, because the
quotation already prints it:

- **Route 1 — read a column we already get.** The PDF prints it; just map it. Supplies
  `Material` and `Category`.
- **Route 2 — classify from text.** Infer from material/description, the way fragility is
  classified. Supplies durability, deformability, base grip, orientation lock,
  top-heaviness.
- **Route 3 — derive at packing time.** Pure maths, no data needed. Supplies contact
  area and the column-weight sum.

**The key finding — we already get the best data, then drop it.** The quotation
([`edited-fleet-big-SPLIT.pdf`](../edited-fleet-big-SPLIT.pdf)) prints a **`Material`**
and a **`Category`** column per item. But [`column-map.json`](../config/column-map.json)
has **no header pattern for either**, so the parser ignores both — and `category` is
instead re-guessed by regex on the description text.

Material is the single best signal for durability, deformability and base grip — and
we throw it away. Reading those two columns is the cheapest, highest-leverage unlock here:
Route 1, no AI, just a config change. After that, Route 2 turns the free-text `Material`
(e.g. *"Wood / Fabric / Foam"*) into clean values — resolving mixed materials to the
**weakest** one (foam → can't bear load) — exactly as Stage 2 turns text into fragility.

---

## 4. Build order — highest leverage first

Crush before stability: crush destroys cargo; stability failures are usually survivable.

**Step 1 — Prerequisite: map the columns we already get (Route 1, free)**
Add `Material` and `Category` header patterns to `column-map.json`. Every step below
depends on having these fields parsed. Zero logic change — config only.

**Step 2 — Fix the column-weight sum (Route 3, `placement-validator.ts`)**
This is the single most impactful correctness fix. The pressure on the base item is
`Σ(weight of every item above it in the column) / item.baseArea`. Currently the validator
likely checks only the immediately adjacent item above — that is wrong and understates
load. Fix this before adding any new per-item data or the crush check is meaningless.

**Step 3 — Durability tier + brittle flag (Route 2, `placement-validator.ts`)**
Derive from Material + hollow/solid per §2A → `none / low / medium / high` tier and
`brittle: bool`. These are what step 2's pressure is checked against:
- Tier → `maxStackPressureKpa` config value: reject placement if column pressure exceeds it.
- Brittle → reject any placement that point-loads or sandwiches the item.
Steps 2 and 3 are one sprint: the sum check is useless without a threshold; the threshold
is useless without a correct sum.

**Step 4 — Top-loadable flag (Route 1, `heuristic-packer.ts` slot selector)**
One boolean per category in config. If the item below a candidate slot has
`topLoadable: false`, that slot is blocked regardless of pressure limits — nothing may
be placed above it. Covers bikes, chairs, sofas, open-top boxes. Near-zero cost;
pays off in both crush (no load placed) and stability (no items falling through voids).

**Step 5 — Orientation lock: fixed / partial / none (Route 2, `heuristic-packer.ts`)**
Upgrade from the current blunt `orientationFixed: bool` to a three-value enum. Only
permitted rotations are tried when the packer searches for a slot. Prevents motors,
liquids, and fragile glass panels being turned upside-down.

---

**What is deferred and the exact dependency blocking each:**

- **Soft lateral support** — a deformable face cannot be the rigid lateral wall for a
  tall neighbour (§2). Valid, but enforcing it requires the packer to track which items
  are laterally adjacent. Implement after the packer gains adjacency awareness.
- **KNN dimensional grouping** — pre-sort items by rounded dims so similar items land in
  adjacent slots, forming a larger stable unit. Cheap and deterministic, but the
  best-fit heuristic does not guarantee adjacency for a sorted input list. Elevate when
  the packer supports explicit group-slot assignment (§5).
- **Top-heaviness, base grip** — real stability signals, but top-heaviness needs
  centre-of-mass data not on the manifest, and base grip needs wedging logic not yet in
  the packer. Revisit when stability failures appear in practice.

---

## 5. Considered but deferred

Real facts, but low-value for now (YAGNI) — recorded so they aren't re-derived:

- **"Do not stack" flag** — not new data; it's just durability = *none* (§2A), which the
  tiers already produce.
- **Aggressor (sharp/protruding parts that puncture a neighbour)** — all other data asks
  "will this break"; this asks "can it break others." Niche until soft items are common.
- **Nestability** — chairs nest, identical units stack cleanly. A space win, not a
  damage-prevention fact.
- **Value/priority** — protect costly items more. Overlaps fragility's "how bad if it
  moves"; revisit only if value data appears on the manifest.
- **Dimensional grouping for stability** — items with near-identical L×W×H placed
  side-by-side form a larger effective unit that resists tipping far better than isolated
  boxes. A fast deterministic pass at packing time — bucket by rounded dims, assign
  adjacent slots — needs no per-item field; it is pure **Route 3** (derive from the
  assembled item set, no AI). Deferred because: (a) this is a packing-algorithm concern,
  not per-item data — belongs in `heuristic-packer.ts`, not `packing.types.ts`; (b) the
  base stability signals (weight + shape + orientation) already cover the common case.
  Elevate when the packer supports explicit group-slot assignment.

---

## 6. How to add to this doc

Add the fact to **§2** (name, which problem, have-it marker, one line on why) and note
its route in **§3**. This is a **data** doc — describe the *fact we need*, not the
algorithm.
