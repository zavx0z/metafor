# Task: Polish the new Boundary canonical store architecture after the last refactor

## Communication rule

The user communicates in **Russian**.
All user-facing summaries, explanations, and reports must be in **Russian**.

---

## Context

The last refactor already made the correct architectural turn:

- `boundary` global store is now the canonical source of truth
- the store is flat, indexed, readable in JavaScript
- CPU reads the canonical store directly
- GPU derives packed/buffer forms locally
- `fields` assembles canonical stored data before it is written into the Boundary store

This direction is correct and must be preserved.

Do **not** revert back to the old model where:
- packed `heap`
- `blockPtrs`
- `bytecode`
- `bytecodeOffsets`

are the canonical truth.

They are now derived execution forms, not the canonical stored imprint.

---

## Architecture rule to preserve

### Boundary
Boundary is the flattening boundary.

### Fields
Fields is the imprint/deduplication layer.

### Boundary store
Boundary owns the final canonical store.

### Matrix
Matrix consumes the canonical Boundary store.

### CPU
CPU reads canonical indexed data directly.

### GPU
GPU derives its local packed execution/buffer forms from the same canonical store.

---

## What is already correct and must not be broken

1. `BoundaryData` is now a readable canonical JS/indexed store with:
   - `fields`
   - `stringTable`
   - `sharedBlocks`
   - `sharedValues`
   - `branes`
   - `braneValues`
   - `braneSharedBlockRefs`
   - `stateTable`
   - `transitions`
   - `conditions`
   - `states`

2. `boundary$` is now the real canonical global store.

3. `assembleStoredBoundaryData(...)` in Fields correctly assembles canonical store data before writing it into Boundary.

4. CPU runtime now reads directly from canonical store and must remain that way.

5. GPU runtime now derives packed runtime data from canonical store via `deriveMatrixData(...)`.

This architectural shape is correct and must be preserved.

---

## Goal

Polish the new architecture and remove the remaining structural issues and technical debt found after the refactor.

The goal is:

- keep the new canonical Boundary store model
- remove remaining layer leaks
- remove misplaced package responsibilities
- simplify maintenance
- reduce the risk of store/derived-layout divergence
- record the critical performance limitations explicitly

---

## Problems to address

### Problem 1 — `fieldSchema` is still outside the canonical store

`boundary.ts` still keeps a separate `fieldSchema` outside the canonical store.

This means part of the schema knowledge still lives outside Boundary global truth.

That is a leftover from the previous architecture and should be cleaned up.

#### Required action
Eliminate external `fieldSchema` state.

The canonical Boundary store must contain all schema information required for:
- update normalization
- runtime field interpretation
- export/introspection

If that means expanding field records to store more canonical schema information (for example enum metadata), do it.

No important schema truth should remain outside the Boundary store.

---

### Problem 2 — `matrix` still imports implementation helpers from `fields`

`boundary/matrix/derived.ts` currently imports multiple functions and types from `fields`.

This is a layer leak.

`matrix` must not depend on `fields` as an implementation-helper package.

Functions must live on the level where they are needed.

#### Required action
Remove `matrix -> fields` implementation dependency.

Refactor so that:

- if logic is only needed by Matrix derived packing, move it into `boundary/matrix/*`
- if logic is neutral/shared low-level logic, move it into a neutral module
- do not leave Matrix depending on Fields helpers by convenience

The dependency direction must become clean.

---

### Problem 3 — `atlas` package is now likely obsolete as a separate package

The remaining purpose of `@boundary/atlas` is now effectively GPU-local string packing:
- UTF-32 encoding
- hash generation
- registry/heap export

This is no longer canonical Boundary logic.
It is GPU-local materialization.

#### Required action
Remove the architectural role of `atlas` as a separate boundary-level package.

Move the required functionality into the GPU layer, for example:
- `boundary/matrix/gpu/string-pack.ts`
- or equivalent GPU-local module

After this refactor:
- canonical store keeps only `stringTable` and string indices
- GPU performs text packing locally
- Fields no longer depends on `@boundary/atlas`
- Matrix GPU no longer depends on a higher-level atlas package

If full package deletion is safe, delete it.
If full deletion is too risky in one step, isolate and deprecate it clearly so it no longer acts as an architectural layer.

---

### Problem 4 — `deriveMatrixData(...)` is too large and too coupled

`deriveMatrixData(...)` currently does many jobs at once:
- reconstructs shared/local field blocks
- recreates heap packing
- re-encodes values
- recompiles transitions into bytecode
- projects lock flags
- builds the full derived runtime slice

This is functionally acceptable, but it is too monolithic and raises the risk of future divergence.

#### Required action
Split `deriveMatrixData(...)` into clearly separated pure steps.

At minimum separate:
- canonical store -> field/value packing
- canonical store -> transition/condition compilation
- canonical store -> lock projection
- canonical string table -> GPU text packing
- final derived runtime assembly

Keep the logic pure and explicit.

The purpose is:
- easier reasoning
- easier auditing
- lower risk of accidental semantic drift

---

### Problem 5 — GPU update path is critically inefficient

Current GPU runtime rebuilds the whole GPU context on heap update / store change.

Architecturally this is acceptable as a temporary fallback, but from a performance standpoint it is a critical issue.

#### Critical performance note
This must be explicitly treated as technical debt, not as an acceptable final implementation.

Recreating:
- derived runtime data
- GPU buffers
- bind group / context

on every update is expensive and will not scale.

#### Required action
Do one of the following:

1. If a correct partial update path can be implemented safely now, implement it.
2. If not, then:
   - keep the current full-rebuild behavior
   - but isolate it clearly as a fallback path
   - add code comments and technical notes explaining that this is a temporary performance limitation
   - structure the GPU code so incremental synchronization can be added later without architectural rewrite

Do not hide this cost.
Document it clearly.

---

### Problem 6 — canonical store must remain the only truth

After the refactor, the canonical store is the truth and derived execution data is secondary.

This means:
- derived runtime data must never become a hidden parallel truth
- CPU behavior and GPU behavior must remain projections of the store, not sources of truth themselves

#### Required action
Audit code paths for accidental re-introduction of hidden truth outside the store.

In particular check:
- update paths
- unlock paths
- GPU rebuild paths
- any compatibility/export helpers

If anything mutates a derived representation without the canonical store being the authoritative source, fix it.

---

### Problem 7 — comments/docs need to match the new architecture

Some code already reflects the new architecture, but comments and documentation may still tell the old story.

#### Required action
Update comments/docstrings in touched files so they clearly state:

- canonical truth = Boundary store
- Fields = preparation/deduplication layer
- CPU = direct store execution
- GPU = derived local packing
- packed runtime data is no longer the canonical store

Do not leave misleading comments that describe the old packed-store architecture.

---

## Required files to inspect and refactor

At minimum inspect and update as needed:

- `boundary/boundary.ts`
- `boundary/store.ts`
- `boundary/store.t.ts`
- `boundary/store.access.ts`
- `boundary/fields/stored.ts`
- `boundary/fields/string-table.ts`
- `boundary/matrix/derived.ts`
- `boundary/matrix/matrix.ts`
- `boundary/matrix/runtime.ts`
- `boundary/matrix/cpu/*`
- `boundary/matrix/gpu/*`
- `boundary/atlas/*` (for migration/removal)

---

## Performance notes (must be included in the final report)

The final report must explicitly address:

1. Why the new canonical JS store is better for flexibility and evolution.
2. Why early packed canonical truth was removed.
3. What the current GPU performance limitation is.
4. Whether GPU full-context rebuild still exists after this task.
5. What remains to be optimized later.
6. Whether any additional memory duplication still exists between canonical store and derived runtime forms.

These performance notes are mandatory.

---

## Validation requirements

After completion verify all of the following:

1. Boundary store remains the only canonical source of truth.
2. No important schema truth remains outside Boundary store.
3. Matrix no longer imports implementation helpers from Fields.
4. Atlas logic is either removed or fully pushed down into GPU-local code.
5. CPU still executes directly from canonical store.
6. GPU still derives its runtime data from canonical store.
7. Derived runtime logic is more modular and easier to audit.
8. No semantic behavior was changed unintentionally.
9. Comments/docs match the new architecture.
10. Performance caveats are explicitly documented.

---

## Deliverables

1. Refactored code
2. Cleaned package/layer boundaries
3. Reduced coupling between Matrix and Fields
4. Atlas cleanup/migration
5. More modular derived runtime assembly
6. Russian summary including:
   - what was changed
   - what architectural leaks were removed
   - whether atlas was removed or pushed down
   - whether `fieldSchema` was eliminated from outside the store
   - current critical performance limitations
   - what still remains as technical debt

---

## Acceptance criteria

The task is complete only if all of the following are true:

- canonical Boundary store remains intact
- Matrix no longer depends on Fields implementation helpers
- atlas is no longer an architectural boundary-level dependency
- CPU reads canonical store directly
- GPU derives packed forms locally
- external `fieldSchema` truth is eliminated
- derived runtime assembly is decomposed into smaller pure steps
- critical GPU performance limitations are explicitly documented
- no accidental semantic regression was introduced