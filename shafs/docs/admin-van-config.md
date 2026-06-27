# Admin Van Configuration  *(Planned)*

The control surface Stages 3 and 5 both depend on — so it exists early, not as an afterthought.

## Input
Admin-entered van presets.

## Output
Persisted `Van` presets `{ id, label, interior:{l,w,h}, maxWeight, perMileRate, surchargeMultipliers? }`, read live by the rest of the app.

## Approach
- A **CRUD UI** (`src/app/admin/`) over the `Van` collection: create, edit, delete presets.
- Everything downstream that needs a van — the packer choosing a best-fit, the pricer reading a rate — pulls **live** from this config, never from hardcoded values. Otherwise Stages 3/5 can't be tested realistically.
- Storage behind a small repository interface (file/DB swappable), config-driven, consistent with the rest of the swap-seam pattern.

## Edge cases
- Duplicate label / id → reject.
- Zero or negative dimension, weight, or rate → reject at the trust boundary (these feed money and geometry).
- Deleting a van referenced by an in-flight quote → warn / soft-handle, don't orphan.

## Definition of done
An admin can create, edit, and delete van presets in the UI, and a newly created van is immediately selectable in the packing and pricing flows — verified in the running app. This is **ML-1** in the roadmap and the first feature built after the foundation.
