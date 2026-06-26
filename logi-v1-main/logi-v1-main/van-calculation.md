The Problem

  We have items with dimensions (L × H × P). We need to:
  1. Fit them into vans (3D bin packing)
  2. Minimize vans used (space = money)
  3. Respect stacking rules (fragile items can't have weight on top)

  ---
  Key Questions

  1. How do we know what an item IS?

  Every quotation has different items. We need to classify them.

  Options:
  ┌───────────────────────┬───────────────────────────────────────┬─────────────────────────────────────────┐
  │       Approach        │                 Pros                  │                  Cons                   │
  ├───────────────────────┼───────────────────────────────────────┼─────────────────────────────────────────┤
  │ Product code patterns │ Fast, deterministic                   │ Limited - codes vary by vendor          │
  ├───────────────────────┼───────────────────────────────────────┼─────────────────────────────────────────┤
  │ Keyword matching      │ Simple to implement                   │ Misses edge cases                       │
  ├───────────────────────┼───────────────────────────────────────┼─────────────────────────────────────────┤
  │ Lookup database       │ Accurate if complete                  │ Needs maintenance, won't know new items │
  ├───────────────────────┼───────────────────────────────────────┼─────────────────────────────────────────┤
  │ LLM classification    │ Handles any item, understands context │ Slower, costs API calls                 │
  └───────────────────────┴───────────────────────────────────────┴─────────────────────────────────────────┘
  My recommendation: Hybrid approach
  - First: Check product code patterns (EFOR = oven, EFRI = fridge)
  - Second: Keyword scan in description ("vetro", "cristallo" = glass)
  - Fallback: LLM for unknown items

  ---
  2. How do we determine fragility / stackability?

  Categories I see:
  ┌───────────────┬──────────────────────────────┬───────────────┬────────────────────────┐
  │   Category    │           Examples           │  Stackable?   │  Can support weight?   │
  ├───────────────┼──────────────────────────────┼───────────────┼────────────────────────┤
  │ Appliances    │ Ovens, fridges, dishwashers  │ NO            │ NO                     │
  ├───────────────┼──────────────────────────────┼───────────────┼────────────────────────┤
  │ Glass/Tops    │ Countertops, glass shelves   │ NO            │ NO                     │
  ├───────────────┼──────────────────────────────┼───────────────┼────────────────────────┤
  │ Base cabinets │ Solid wood boxes             │ YES           │ YES (strong)           │
  ├───────────────┼──────────────────────────────┼───────────────┼────────────────────────┤
  │ Wall cabinets │ Lighter boxes                │ YES           │ MAYBE (limited weight) │
  ├───────────────┼──────────────────────────────┼───────────────┼────────────────────────┤
  │ Tall units    │ Columns, pantries            │ NO (too tall) │ NO                     │
  ├───────────────┼──────────────────────────────┼───────────────┼────────────────────────┤
  │ Accessories   │ Handles, hinges, small parts │ YES           │ YES                    │
  └───────────────┴──────────────────────────────┴───────────────┴────────────────────────┘
  Key insight: It's not just "fragile or not" - it's a matrix:
  - Can this item BE stacked on something? (its own strength)
  - Can something be stacked ON this item? (fragility)
  - Max weight it can support?

  ---
  3. What data do we need per item?

  Item:
    - dimensions: L × H × P (we have this)
    - weight_kg: (do PDFs have this?)
    - category: appliance | cabinet | top | accessory
    - fragile: boolean
    - stackable: boolean (can go on top of others)
    - max_load_kg: number (weight it can support on top)
    - orientation_fixed: boolean (can it be rotated?)

  Question for you: Do the Arredo3 PDFs include weight per item? Or just total weight?

  ---
  4. The 3D Tetris Problem

  This is called 3D Bin Packing - it's computationally hard but solvable.

  Algorithm approach:
  1. Sort items by: size (largest first) + fragility (fragile last)
  2. Place heavy/sturdy items at bottom of van
  3. Stack compatible items on top
  4. Fragile items go on top or in gaps (nothing above them)
  5. Fill remaining space with small items

  Constraints:
  - Van dimensions (L × W × H)
  - Weight limit per van
  - Axle weight distribution (front vs back)
  - Door access (need to unload in order?)

  ---
  5. Van Database

  We need:
  Van:
    - model: "Fiat Ducato L3H2"
    - internal_dimensions: L × W × H
    - max_payload_kg: number
    - door_dimensions: W × H (loading constraint)

  ---
  Proposed Architecture

  PDF → Extract Items → Classify Items → Calculate Loading → Output Plan
           ↓                ↓                    ↓
      [dimensions]    [add fragility,      [3D bin packing
                       stackability,        with constraints]
                       weight estimate]

  Intelligence Layer:
  1. Classifier - Determines item type, fragility, stackability
  2. Weight Estimator - If not in PDF, estimate from dimensions + type
  3. Load Planner - 3D algorithm that respects stacking rules
  4. Optimizer - Minimize number of vans

  ---
  Questions for You

  Before we build this:

  1. Do PDFs include weight per item? Or just total shipment weight?
  2. Do you have a van fleet? Fixed van sizes, or do you rent different sizes?
  3. Delivery order matters? If delivering to multiple stops, loading order = unloading order (last in, first out)
  4. How accurate do we need to be?
    - Rough estimate (±1 van) for quoting?
    - Or exact loading plan for drivers?
