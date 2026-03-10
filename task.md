# Task: Replace packed Boundary store with canonical flat JS indexed store

## Communication rule

The user communicates in **Russian**.
All user-facing summaries, explanations, and task results must be in **Russian**.

---

## Goal

Refactor the current Boundary/Fields/Matrix architecture so that the **global Boundary store** becomes the real canonical source of truth in the form the user wants:

- flat
- deduplicated
- indexed
- readable in JavaScript
- minimal in weight
- flexible under future changes

The current store is still shaped around packed runtime/execution structures:
- `bytecode`
- `bytecodeOffsets`
- `states`
- `heap`
- `blockPtrs`
- `stringTable` 

That is **not** the desired final architecture.

The new target is:

- the **global store lives in Boundary**
- the **global store is the canonical final imprint**
- `Fields` only prepares/deduplicates data before writing into the Boundary store
- `Matrix` consumes the full Boundary store
- `CPU` works directly from this JS indexed store
- `GPU` derives packed buffers locally from this same store

---

## Architectural rule to preserve

This project is metaphor-first.

### Boundary
Boundary is the boundary itself.
It performs **flattening** before anything is written to Fields/store.

### Fields
Fields is the imprint layer on the boundary.
It performs **deduplication at write time**.

### Matrix
Matrix consumes already flattened and deduplicated stored data.

### Backends
- CPU reads the stored data directly in JavaScript by indices
- GPU derives local buffers from the same stored data

This metaphor is the architectural rule.

---

## Important correction

Do **not** treat the current packed runtime structures as canonical truth by default.

In particular, do **not** assume that these must remain the canonical store:
- `heap`
- `blockPtrs`
- `bytecodeOffsets`

They may become **derived execution forms** instead of canonical storage.

The canonical truth must be a **flat readable indexed JS store**, not a pre-packed VM/GPU layout.

---

## Current problem in repository

The current `BoundaryData` contract still defines the global store around packed execution-oriented structures:
- `bytecode`
- `bytecodeOffsets`
- `states`
- `heap`
- `blockPtrs`
- `stringTable`  [oai_citation:0‡store.t.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/store.t.ts)

This means:
- the store is still hard to inspect
- the store is still too close to current runtime packing
- the store is not yet the flexible canonical imprint the user wants

This must be changed.

---

## Target store model

Design a new **Boundary global store** as the final canonical stored imprint.

It must contain only:
- flat data
- deduplicated data
- indexed data
- runtime results written by Matrix

It must not contain:
- temporary preparation artifacts
- helper flattening IR
- backend-local buffers
- GPU-only payload
- hidden packed execution forms unless strictly justified
- data that Matrix neither reads nor writes

The new store should prefer readable JS/TS structures:
- arrays
- indexed tables
- records
- maps only where justified and beneficial

Do not optimize first for “maximum binary packing”.
Optimize first for:
- compactness
- clarity
- flexibility
- canonicality

---

## Core required decisions

You must explicitly decide and implement:

### 1. What is canonical store data?
Determine the real canonical store shape for:
- fields metadata
- brane values
- string table
- transitions
- conditions
- entanglement/shared data
- runtime states

### 2. What is only derived execution form?
Determine which current structures should become derived:
- `heap`
- `blockPtrs`
- `bytecode`
- `bytecodeOffsets`
- any other packed/runtime-oriented layout

Do not keep any structure as canonical truth just because current CPU/GPU code happens to use it today.

### 3. What Matrix actually reads/writes
Apply the strict rule:

A field may stay in global store only if Matrix:
- reads it
- and/or writes it back

If not, it must not live there.

---

## Required implementation work

### Phase 1 — redesign `BoundaryData`
Rewrite `boundary/store.t.ts` so the global store describes the new canonical JS indexed store, not the old packed runtime layout.  [oai_citation:1‡store.t.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/store.t.ts)

The new `BoundaryData` must be:
- readable
- explicit
- flat
- deduplicated
- index-based
- future-proof

### Phase 2 — rewrite `boundary/store.ts`
Update `boundary/store.ts` so the actual global mutable store matches the new `BoundaryData` contract.  [oai_citation:2‡store.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/store.ts)

The store must start empty and be populated only with final flattened + deduplicated data plus Matrix-written runtime results.

### Phase 3 — move final store ownership to Boundary
Boundary owns the global store.

Fields must no longer behave like a hidden owner of final canonical state.

Fields may:
- deduplicate
- compact
- normalize
- return prepared data

But Boundary writes the final canonical imprint into the global store.

### Phase 4 — keep Fields as preparation/deduplication layer
Refactor Fields so it prepares:
- canonical string indices
- deduplicated values/relations
- one canonical transitions/conditions representation
- anything needed for writing the final store

Fields must not define the final store as packed VM/GPU layout.

### Phase 5 — redesign transitions and conditions
The canonical store must use **one** transitions/conditions representation.

Requirements:
- flat
- indexed
- readable in JS
- compact
- strings referenced only by indices
- no multiple parallel forms as canonical truth

Do not keep nested object graphs as canonical transitions.
Do not keep several competing condition formats.

### Phase 6 — redesign strings
Strings must be deduplicated in Fields.

In canonical store:
- keep one canonical string table
- keep only string indices everywhere else

Do not store:
- repeated raw strings everywhere
- GPU atlas export
- backend-local text buffers

GPU must derive text buffers locally from canonical string table.

### Phase 7 — refactor CPU runtime
CPU must stop depending on the current packed layout as canonical truth.

Refactor CPU Matrix execution to work directly from the new canonical Boundary store.

This likely requires rewriting transition evaluation and field access logic away from direct dependence on:
- `heap`
- `blockPtrs`
- `bytecodeBase`
- `bytecodeOffsets`

if those become derived forms rather than canonical truth.

This is expected and allowed.

### Phase 8 — refactor GPU runtime
GPU must derive whatever it needs locally from the same canonical store:
- buffers
- offsets
- local packed forms
- string atlas/buffers

Do not push GPU forms upward into the canonical store.

### Phase 9 — runtime result write-back
Preserve the mutable-store model:

- Boundary creates/owns the store
- final flattened + deduplicated data is written there
- Matrix writes runtime results back there

Ensure the store remains the single source of truth through execution.

---

## Explicit non-goals

- Do not merely rename current packed structures.
- Do not preserve the current `heap/blockPtrs/bytecodeOffsets` model as canonical truth without proving it is necessary.
- Do not optimize for GPU-first layout at the store level.
- Do not keep both a readable store and a hidden packed canonical store.
- Do not leave temporary preparation structures in the global store.

---

## Files to inspect and refactor

At minimum:

- `boundary/store.t.ts`
- `boundary/store.ts`
- `boundary/boundary.ts`
- `boundary/fields/*`
- `boundary/matrix/matrix.t.ts`
- `boundary/matrix/matrix.ts`
- `boundary/matrix/runtime.ts`
- `boundary/matrix/cpu/*`
- `boundary/matrix/gpu/*`

---

## Validation requirements

After the refactor, verify all of the following:

1. Global Boundary store is the final canonical imprint.
2. The store is readable as flat indexed JS data.
3. The store is deduplicated.
4. Fields is only preparation/deduplication, not final store owner.
5. CPU reads from canonical store directly.
6. GPU derives buffers locally from canonical store.
7. Strings exist in the store only via canonical string table + indices.
8. Transitions/conditions exist in one canonical representation.
9. No store field remains that Matrix does not read or write.
10. No temporary preparation data leaks into the store.
11. Existing semantics remain correct unless a change is strictly required by the new architecture.

---

## Deliverables

1. New canonical `BoundaryData`
2. Updated mutable Boundary store implementation
3. Refactored Boundary/Fields ownership
4. Refactored canonical transitions/conditions storage
5. Refactored string contract
6. Refactored CPU consumption path
7. Refactored GPU derivation path
8. Updated tests
9. Short Russian summary including:
   - what was removed from canonical store
   - what remains in canonical store
   - what became CPU-derived
   - what became GPU-derived
   - why the new model is lighter and easier to evolve

---

## Acceptance criteria

The task is complete only if all of these are true:

- Boundary owns the global canonical store
- the global store is flat, deduplicated, indexed, and readable in JS
- Fields only prepares/deduplicates data before writing to the store
- CPU works directly from canonical store
- GPU derives buffers locally from canonical store
- strings are stored only by indices plus canonical string table
- transitions/conditions have one canonical indexed form
- no hidden packed runtime layout remains the true source of truth
- no unused data lives in the store
- the architecture matches the agreed holographic metaphor