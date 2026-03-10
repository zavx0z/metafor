# Task: Refactor Boundary/Fields/Matrix data flow to the final stored-data contract

## Communication rule

The user communicates in **Russian**.
All user-facing explanations, summaries, and follow-up questions must be in **Russian**.

---

## Goal

Refactor the current Boundary → Fields → Matrix pipeline so that it matches the agreed architecture exactly:

- **Boundary** performs flattening
- **Fields** performs deduplication and compaction
- **global Boundary store** contains only final flattened + deduplicated stored data plus Matrix-written runtime results
- **Matrix** consumes the full store as the canonical source of truth
- **CPU** executes directly over indexed stored data
- **GPU** derives buffers locally from the same stored data

The final architecture must eliminate any extra store data that Matrix does not read or write.

---

## Metaphor / ontology rule (must be preserved)

This project is metaphor-first.

- **Boundary** is the event-horizon-like boundary.
  What approaches the boundary is stretched and flattened.

- **Fields** is the imprint layer on the boundary.
  What is written on the boundary is deduplicated.

- **Matrix** consumes the imprint and computes over it.

This is not decorative language.
It is the architectural rule for data-flow responsibilities.

---

## Required target model

### 1. Boundary

Boundary must do flattening only.

Boundary may:

- parse nested input
- flatten transitions and conditions
- prepare local intermediate data

Boundary must not:

- keep intermediate preparation artifacts in the global store
- treat temporary preparation structures as canonical data

### 2. Fields

Fields must receive flattened input and produce the final canonical stored snapshot.

Fields owns:

- deduplication
- compaction
- canonical indexing
- canonical string IDs
- compact stored transition representation
- final stored data contract

### 3. Global store

Global store must contain only:

- final flattened + deduplicated stored data from Fields
- runtime results written by Matrix

Global store must contain no:

- temporary preparation structures
- helper/intermediate flattening IR
- backend-local buffers
- GPU-only payload
- hidden duplicate representations
- data not used by Matrix for reading or writing

### 4. Matrix

Matrix must consume the full canonical store.

CPU:

- reads stored indexed data directly in JavaScript

GPU:

- derives buffers locally from the same stored data

Matrix writes back runtime results into the store.

---

## Current repository problems to fix

### Problem A — deduplication still orchestrated in `boundary.ts`

The current code moved in the right direction, but `boundary.ts` still performs too much Fields-owned work:

- creates string interner
- creates field meta
- encodes values
- builds heap
- compiles flattened ensemble
- assembles `StoredBoundaryData`

This means the real Fields layer still does not fully own deduplication/compaction/stored-contract assembly.

### Problem B — global store is still shaped around current Matrix runtime layout

Current global store still centers around:

- `bytecode`
- `bytecodeOffsets`
- `initialStates`
- `heap`
- `braneBlockPtrs`
- `stringTable`

This may still be too close to current execution packing rather than the cleanest canonical stored model.

You must verify which structures are:

- true canonical stored data
- execution-specific packing details

### Problem C — Matrix shared boundary still uses an execution-slice contract instead of full canonical store

Current code still passes `params` plus `stringTable` into Matrix init.
This is a transitional shape.

The final architecture requires:

- Matrix consumes the full final store as the canonical data source
- CPU and GPU derive what they need from that store
- no extra hidden split between “real store” and “actual Matrix input” unless justified

### Problem D — strings must exist only as canonical IDs in stored data

Strings must not exist in stored data as backend-local atlas export or alternate runtime payload.
Stored data must use canonical string IDs plus canonical deduplicated string table.
GPU text/buffer conversion must stay local to GPU.

### Problem E — no unread/unwritten store data

Every field in global store must be justified:

- Matrix reads it
- and/or Matrix writes it back

If not, it must not be there.

---

## Required implementation work

### Phase 1 — define the final canonical global store

Refactor the current store contract so that the global Boundary store becomes the final canonical stored snapshot.

The global store must contain only the data that:

- survived Boundary flattening
- survived Fields deduplication
- is actually needed by Matrix

You must explicitly classify each currently stored structure as one of:

- canonical stored data
- temporary preparation data
- CPU-local execution detail
- GPU-local execution detail
- runtime result

This classification must be reflected in code, not just in comments.

### Phase 2 — move stored-data assembly fully into Fields

Fields must become the actual producer of the final stored snapshot.

That means the final stored contract must be assembled by Fields-owned logic, not by `boundary.ts` orchestration.

Boundary may still:

- flatten input
- call Fields

But Boundary must no longer be the effective owner of:

- deduplication
- stored string indexing
- stored field-meta assembly
- stored compact data assembly

### Phase 3 — pass full store into Matrix

Refactor Matrix initialization so Matrix consumes the full canonical store object directly.

Do not keep a split where:

- one part is “the real store”
- another part is “Matrix params”
unless that split is strictly internal and derived locally inside Matrix

The architectural rule is:

- global store is the stored imprint
- Matrix consumes that imprint

### Phase 4 — separate canonical store from backend-local preparation

Keep only canonical stored data in the store.

Any backend-local preparation must happen after Matrix receives the store:

- CPU selects/reads indexed structures directly
- GPU derives buffers locally

Do not keep backend-local packing in the canonical store just because current CPU code uses it.

### Phase 5 — review `bytecode`, `bytecodeOffsets`, `heap`, `blockPtrs`

Perform an architectural classification of these structures:

- `bytecode`
- `bytecodeOffsets`
- `heap`
- `blockPtrs`

Determine which of them are truly canonical stored data and which are execution packing details.

Important:

- Do not remove them blindly.
- Do not keep them blindly.
- Decide based on the new contract:
  “global store contains only minimal flattened + deduplicated data actually used by Matrix.”

Likely outcomes to consider:

- compact transition representation may remain canonical
- some current heap/layout structures may turn out to be execution preparation, not canonical truth

Make the code reflect the final decision.

### Phase 6 — enforce string contract

Ensure:

- stored string table is canonical and deduplicated in Fields
- stored values and conditions use only string IDs / indices
- GPU derives atlas/buffers locally from that table
- no alternate string payload crosses the shared stored boundary

### Phase 7 — store mutation discipline

Preserve the mutable-store model:

- Boundary starts from an empty store
- Boundary/Fields fill only final stored data
- Matrix writes runtime results back into the same store

But enforce that temporary preparation data never leaks into the store.

---

## Required files to inspect and likely refactor

At minimum inspect and refactor as needed:

- `boundary/boundary.ts`
- `boundary/store.ts`
- `boundary/store.t.ts`
- `boundary/fields/index.ts`
- `boundary/fields/stored.t.ts`
- `boundary/fields/string-table.ts`
- `boundary/fields/values.ts`
- `boundary/fields/values.t.ts`
- `boundary/fields/superposition.ts`
- `boundary/matrix/matrix.t.ts`
- `boundary/matrix/matrix.ts`
- `boundary/matrix/runtime.ts`
- `boundary/matrix/cpu/*`
- `boundary/matrix/gpu/*`

Also inspect tests and update them.

---

## Validation requirements

After the refactor, verify all of the following:

1. Boundary flattening exists as a distinct responsibility.
2. Fields owns final deduplicated stored-data assembly.
3. Global store contains only final stored data plus Matrix-written runtime results.
4. No temporary preparation structures leak into global store.
5. No store field remains that Matrix neither reads nor writes.
6. CPU executes directly from stored indexed data.
7. GPU builds its buffers locally from the same stored data.
8. Strings are canonicalized to IDs in stored data.
9. GPU text conversion remains local.
10. No backend-specific payload is stored as canonical truth.
11. Existing runtime behavior is preserved unless a behavior change is strictly required by the corrected architecture.

---

## Deliverables

1. Code refactor implementing the final stored-data contract
2. Updated type contracts
3. Updated store contracts
4. Updated Matrix initialization flow
5. Updated CPU/GPU data consumption paths
6. Updated tests
7. A short Russian summary:
   - what was changed
   - what was moved out of store
   - what remains in store and why
   - what Matrix reads
   - what Matrix writes

---

## Acceptance criteria

The task is complete only if all of these are true:

- Boundary flattens
- Fields deduplicates
- global store contains only final stored data + Matrix runtime results
- Matrix consumes the full store
- CPU reads indexed stored data directly
- GPU derives buffers locally
- strings exist in stored data only via canonical indices
- no unused data lives in the store
- no temporary preparation artifacts live in the store
- the resulting architecture matches the holographic metaphor exactly
