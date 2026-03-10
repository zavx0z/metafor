# Task: Replace packed Boundary store with canonical flat JS store

## Communication rule

The user communicates in **Russian**.
All user-facing summaries and explanations must be in **Russian**.

---

## Goal

Refactor the current Boundary/Fields/Matrix data flow so that:

- the **global store lives only in `boundary`**
- this global store is the **single canonical source of truth**
- the global store contains **flat, deduplicated, readable JavaScript data**
- the global store does **not** use packed runtime-oriented binary layout as its canonical form
- `fields` becomes a preparation/deduplication layer, not the owner of final stored state
- `matrix` consumes the full boundary store
- CPU executes from this JS store directly
- GPU derives buffers locally from this JS store

The immediate goal is **clarity + flexibility + low weight**, not maximum early binary packing.

---

## Architectural rule to preserve

### Boundary

Boundary is the flattening boundary.

It performs flattening before data is written into the global store.

### Fields

Fields performs deduplication and compaction before data is written into the global store.

Fields does not own the final global store.

### Boundary global store

The final global store belongs to Boundary and contains only:

- flattened data
- deduplicated data
- runtime results written by Matrix

### Matrix

Matrix receives the full boundary store.

- CPU works from the store directly in JavaScript
- GPU derives buffers from the same store

---

## Important correction to previous task

The previous direction was too close to the current packed execution layout.

That is **not** the target now.

The new target is:

- **do not treat `heap`, `blockPtrs`, `bytecodeOffsets`, and similar packed structures as the canonical store by default**
- instead, build a **flat canonical JS store**
- only derive packed/buffer forms where actually needed for execution

In other words:

- canonical truth = readable flat indexed JS store
- CPU runtime = direct JS execution from that store
- GPU runtime = local buffer preparation from that store

---

## Current problem in the repository

The current `boundary` store still keeps packed execution-shaped data such as:

- `bytecode`
- `bytecodeOffsets`
- `states`
- `heap`
- `blockPtrs`
- `stringTable`

This means the current store is still shaped around the runtime packing model instead of a clean canonical JS store.

That must be changed.

---

## Required target store shape

Design and implement a new canonical Boundary global store that is:

- flat
- deduplicated
- index-based
- readable in JavaScript
- minimal
- not packed into GPU/VM-specific layout by default

The store should contain canonical JS structures such as:

- field metadata tables
- string table by indices
- brane state data
- field-value tables by indices
- entanglement/shared-field relations
- flattened transitions / conditions in readable indexed form
- runtime state snapshot

Use plain JS/TS data structures where it improves clarity:

- arrays
- indexed tables
- records
- maps if justified

Do **not** default to binary packed buffers as the canonical store.

---

## Critical rule: no unused store data

Nothing may live in the global Boundary store unless Matrix reads it or writes it.

If some data is:

- not read by Matrix
- and not written by Matrix

it must not be in the global store.

This rule must be applied strictly during the refactor.

---

## Required implementation work

### Phase 1 — redesign the Boundary global store

Replace the current packed-oriented Boundary store contract with a canonical flat JS store.

The new store must:

- be easy to inspect
- be easy to evolve
- remain compact through indices and deduplication
- not depend on packed runtime layout

You must explicitly define the new store contract in `boundary/store.t.ts`.

### Phase 2 — move final store ownership to Boundary

Ensure the final canonical store is created and owned by Boundary.

Fields may prepare and deduplicate data,
but the resulting canonical state must be written into the Boundary global store as the final source of truth.

Fields must not remain the hidden owner of canonical state.

### Phase 3 — refactor Fields into a preparation layer

Fields must become a pure preparation / deduplication layer.

Fields should:

- receive flattened data
- deduplicate strings and other repeated data
- normalize values
- prepare flattened transitions / condition structures
- return data suitable for writing into the Boundary store

Fields must not define the final storage contract as a runtime-packed model.

### Phase 4 — redesign transitions/conditions storage

Transitions currently end up in bytecode-shaped form too early.

For this refactor:

- store transitions in a flat readable indexed JS form inside the canonical store
- store conditions under one unified contract
- if strings are used in conditions, only string indices may be stored
- do not store multiple condition representations

The canonical store must use one transition/condition representation.

### Phase 5 — redesign string storage

Strings must be deduplicated in Fields.

In the Boundary store:

- store canonical string table
- store only string indices everywhere else

Do not store:

- raw duplicate strings all over the store
- GPU atlas export
- GPU-local text/buffer payloads

GPU text conversion must happen only in GPU code.

### Phase 6 — remove packed execution structures from canonical truth where possible

Review the following current structures:

- `heap`
- `blockPtrs`
- `bytecode`
- `bytecodeOffsets`

Classify each as:

- canonical store data
- CPU-local execution form
- GPU-local execution form
- derived packing only

Default assumption for this task:

- they should **not** remain canonical truth unless strictly necessary

Prefer moving them to derived execution preparation.

### Phase 7 — make CPU read directly from the store

Refactor CPU Matrix execution so it works directly from the new canonical JS store,
not from packed heap/bytecode runtime structures as canonical truth.

This may require rewriting CPU transition evaluation around the new store contract.

That is expected.

### Phase 8 — make GPU derive buffers locally

Refactor GPU preparation so it builds all required buffers from the canonical Boundary store.

Do not move GPU buffer forms upward into the store.

### Phase 9 — store mutation discipline

Preserve the mutable-store model:

- Boundary creates/owns the empty store
- Boundary writes final flattened + deduplicated data into it
- Matrix writes runtime results back into the same store

No intermediate preparation artifacts may leak into the store.

---

## Design guidance

This refactor should optimize for:

- clear canonical store shape
- flexibility under future changes
- minimal duplicated data
- low memory weight through indices/deduplication
- no hidden packed canonical truth
- late execution packing only where needed

Do not optimize for “maximum packing as early as possible”.
That is explicitly not the goal of this task.

---

## Expected deliverables

1. New canonical Boundary store contract
2. Refactored Boundary write/preparation flow
3. Refactored Fields layer as dedup/preparation only
4. New flat indexed transitions/conditions representation
5. Canonical string-table + string-index model
6. CPU execution adapted to the new store
7. GPU buffer derivation adapted to the new store
8. Updated tests
9. Short Russian summary:
   - what was removed from canonical store
   - what remains in canonical store
   - what is now derived only for CPU/GPU execution
   - why the new store is lighter and easier to evolve

---

## Acceptance criteria

The task is complete only if all of the following are true:

- global canonical store lives in Boundary
- the store is flat, deduplicated, indexed, and readable in JS
- Fields is only preparation/deduplication, not final store owner
- CPU reads directly from the canonical JS store
- GPU derives buffers locally from the same store
- strings are stored only by indices plus canonical string table
- transitions/conditions have one flat canonical representation
- no packed runtime layout remains canonical truth without strict justification
- no data exists in the store unless Matrix reads or writes it
