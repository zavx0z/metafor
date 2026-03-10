# Task: Remove the legacy entanglement model completely and keep only prepared projection materialization

## Context

The current entanglement flow is in a transition state.

Right now `boundary/fields/entangled.ts` still contains two different models:

### Legacy model

- `findEntangledGroups(...)`
- `buildBraneMapping(...)`

This model derives entanglement directly from brane values inside `fields`.

### New model

- `materializeEntanglement(values, projection)`

This model takes a prepared upstream entanglement projection and only materializes it into boundary-ready layout.

The architecture direction is already decided:

- entanglement origin belongs upstream
- boundary/fields must not remain the owner of legacy entanglement derivation
- no fallback compatibility path should remain

This task must finish that migration.

---

## Primary objective

Delete the old entanglement model completely and make the new prepared-projection model the only valid path.

No fallback.
No compatibility layer.
No parallel legacy path.

---

## Files that must be reviewed

At minimum:

- `boundary/fields/entangled.ts`
- `boundary/fields/entangled.t.ts`
- `boundary/fields/index.ts`
- any imports or call sites using:
  - `findEntangledGroups`
  - `buildBraneMapping`
  - old field-index-only projection logic
- tests related to entanglement in:
  - `boundary/tests/**`
  - `force/tests/**`
  - any other affected package

Also review upstream usage:

- `force/strong/strong.ts`
- any code producing `PreparedEntanglementProjection`

---

## What must be removed

### 1. Legacy derivation functions

Delete the old derivation path from `fields`:

- `findEntangledGroups(...)`
- `buildBraneMapping(...)`

`fields` must no longer derive entanglement groups from raw values as a first-class model.

### 2. Legacy compatibility fallback

Delete the fallback path in `materializeEntanglement(...)` that accepts old field-index-only projection shape.

Specifically:

- remove support for `fieldIndices`-only compatibility
- remove any helper that reconstructs `PreparedEntanglementField[]` from legacy fallback input
- remove any normalization that exists only to support the old projection shape

The prepared projection contract must become strict.

### 3. Legacy types if still present

Remove any legacy-only types that existed only to support the old local derivation model or old fallback projection shape.

Do not keep dead compatibility types.

---

## What must remain

### 1. One strict upstream-to-boundary flow

The only valid entanglement flow must become:

upstream preparation
→ prepared entanglement projection
→ `materializeEntanglement(...)`
→ boundary-ready layout

### 2. Strict projection contract

`PreparedEntanglementProjection` and its block/field structure must be the only accepted contract.

Boundary materialization must require:

- explicit blocks
- explicit prepared fields
- no hidden reconstruction from legacy shorthand

### 3. Validation stays

Boundary/fields should still validate the prepared projection against actual brane values.

That is good and should stay.

But validation must not turn back into derivation.

---

## Required architectural outcome

After this task:

- entanglement origin lives upstream
- boundary/fields only materializes and validates upstream projection
- there is one entanglement model, not two
- there is one contract, not a new contract plus fallback legacy shorthand

---

## Important constraints

### Do not reintroduce ownership drift

Do not let boundary/fields remain a silent owner of entanglement origin.

### Do not keep fallback “just in case”

This task explicitly removes fallback paths.

### Do not weaken the new upstream model

Do not simplify the upstream prepared projection just to preserve legacy compatibility.

---

## Tests

Update tests so they reflect the final strict model.

Required:

- remove tests that validate the old derivation path as supported behavior
- update tests that depended on old fallback projection shape
- keep tests for:
  - valid prepared projection materialization
  - divergence detection
  - duplicate assignment errors
  - missing field / out-of-range / invalid block validation
- keep or add tests proving that entanglement now comes only from prepared projection

If useful, add one negative test that confirms legacy shorthand or fallback input is rejected.

---

## Required implementation approach

### Step 1 — Diagnose usage

Before editing, list:

- where old legacy functions are still exported or called
- where old fallback projection shape is still accepted
- which tests still depend on it

### Step 2 — Remove legacy code

Delete old derivation functions, legacy-only helpers, and fallback logic.

### Step 3 — Tighten types

Make the prepared entanglement projection contract strict and explicit.

### Step 4 — Update tests

Bring tests in line with the strict one-path architecture.

### Step 5 — Verify architecture alignment

Confirm:

- upstream owns entanglement origin
- boundary/fields only materializes and validates
- no second model remains

---

## Required deliverables

Provide:

1. A short diagnosis of all legacy entanglement entry points removed
2. The exact files changed
3. The exact legacy functions/helpers/types deleted
4. The final strict projection contract used
5. The updated tests
6. A short confirmation that no fallback path remains

---

## Acceptance criteria

The task is complete only when all of the following are true:

- `findEntangledGroups(...)` is removed
- `buildBraneMapping(...)` is removed
- no legacy field-index-only fallback remains in `materializeEntanglement(...)`
- boundary/fields no longer derives entanglement origin
- upstream prepared projection is the only supported entanglement source
- tests reflect the strict one-path architecture
- no compatibility shim remains

---

## Hard prohibitions

Do not:

- keep the legacy model behind an internal helper
- keep a fallback path in `materializeEntanglement(...)`
- preserve old projection shorthand for backward compatibility
- move entanglement origin back into `fields`
- leave dead exports or dead types behind

---

## Final instruction

Finish the migration completely.

There must be exactly one entanglement model in the system:
upstream-prepared projection → boundary materialization.

No fallback.
No legacy derivation path.
No second source of truth.
