### Goal

Perform a full data-flow refactor so that the Boundary pipeline follows the agreed ontology precisely:

- **Boundary** is the flattening boundary
- **Fields** is the imprint layer where deduplication happens after flattening
- **Matrix** consumes already flattened and deduplicated stored data
- **CPU** executes directly from indexed stored data
- **GPU** derives backend-local buffers from the same stored data

This refactor must correct the current mismatch between the agreed architecture and the current implementation.

---

### Architectural Rule To Preserve

This project is metaphor-first and the metaphor is architectural, not decorative.

- **Boundary** = the event-horizon-like flattening layer  
  Data arriving at Boundary loses hierarchy and becomes flat.

- **Fields** = the imprint layer on the boundary  
  Data written into Fields is deduplicated and compacted.

- **Matrix** = the execution layer  
  Matrix must consume only already flattened and deduplicated stored data.

- **CPU** = direct indexed JavaScript execution over stored data  
- **GPU** = buffer preparation and execution from the same stored data

Do not violate this division of responsibility.

---

### Current Repository State That Must Be Analyzed And Refactored

The current implementation still mixes responsibilities.

1. `boundary/fields/index.t.ts` still exposes `Data` in object form with:
   - `fields?: Field[]`
   - `branes?: Brane[]`
   - `Collapse[][]` transitions
   - `values: [fieldIndex, BraneValue][]`  [oai_citation:0‡index.t.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/fields/index.t.ts)

2. `boundary/boundary.ts` currently performs most preparation in `prepareData()`:
   - materializes entanglement
   - compiles superpositions
   - encodes values
   - builds heap
   - derives initial states  [oai_citation:1‡boundary.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/boundary.ts)

3. `boundary/fields/superposition.ts` currently compiles transition objects into a compact linear bytecode layout:
   - `state table`
   - `state blocks`
   - `condition blocks`
   - heap for `IN/NOT_IN` lists  [oai_citation:2‡superposition.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/fields/superposition.ts)
   This is already a flattening-oriented representation of transitions.

4. `boundary/fields/condition.ts` parses declarative conditions into atomic checks with `op` and `val`  [oai_citation:3‡condition.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/fields/condition.ts)

5. `boundary/fields/values.ts` still performs early string interning through `getStringAtlas().intern()` inside common preparation, so strings are still converted too early into atlas-dependent representation  [oai_citation:4‡values.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/fields/values.ts)

6. `boundary/fields/heap.t.ts` shows that the stored execution form is already intended to be flat and indexed:
   - `HeapInput.localFields`
   - `braneEntangledMap`
   - `entangledFields`
   - `fieldMeta`
   - result `heap` + `blockPtrs`  [oai_citation:5‡heap.t.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/fields/heap.t.ts)

7. `boundary/matrix/matrix.t.ts` currently accepts only shared execution data:
   - `heap`
   - `states`
   - `bytecode`
   - `bytecodeOffsets`
   - `blockPtrs`  [oai_citation:6‡matrix.t.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/matrix/matrix.t.ts)
   This direction is correct and must be preserved.

8. `boundary/matrix/runtime.ts` removed `atlasExport` from shared Matrix init context, but still creates GPU string export in runtime orchestration through `getStringAtlas().exportData()` for the GPU branch  [oai_citation:7‡runtime.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/matrix/runtime.ts)  
   This is still not the final architecture.

9. `boundary/matrix/gpu/init.ts` still expects atlas-export-shaped input to create `stringRegistry` and `stringHeap` buffers  [oai_citation:8‡init.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/matrix/gpu/init.ts)

---

### Required Target Architecture

#### 1. Boundary responsibility
Boundary must be the flattening layer.

That means the incoming object/hierarchical data must be flattened before it is written into Fields.

This includes at minimum:
- transition object graphs
- nested condition structures
- any remaining object-shaped execution data

Boundary must convert them into flat relational/indexed forms.

Transition objects must not remain the canonical stored form.

#### 2. Fields responsibility
Fields must be the deduplication layer.

Fields must receive already flattened data and produce:
- deduplicated string table
- deduplicated value tables where justified
- compact indexed relations
- compact transition storage
- compact stored data for Matrix

Fields must not be a GPU-buffer layer.
Fields must not emit backend-specific buffer payloads.

Fields must own deduplication, compaction, indexing, and stored canonical data.

#### 3. Matrix responsibility
Matrix must consume only stored canonical data.

Matrix must not be responsible for semantic flattening.
Matrix must not depend on object graphs.
Matrix must not depend on GPU-only payload crossing the shared boundary.

CPU must execute directly over indexed stored data.
GPU must derive its buffers from the same stored data.

#### 4. String responsibility
Strings must be deduplicated in Fields by ID.

This means:
- Fields must own canonical string IDs
- stored data and transition conditions must reference strings by `stringId`
- CPU must be able to resolve string IDs from canonical stored data
- GPU must derive `stringRegistry` and `stringHeap` from the same canonical stored string table
- do not keep early GPU-specific atlas export as the canonical common representation

The current early atlas-dependent encoding in `boundary/fields/values.ts` is not the final architecture and must be redesigned.

---

### Refactor Work Required

#### Phase 1 — define the canonical stored data contract
Introduce and document one explicit stored data contract that sits between Fields and Matrix.

This contract must be:
- flat
- indexed
- deduplicated
- backend-neutral
- sufficient for both CPU and GPU

It must explicitly cover:
- field metadata
- per-brane state data
- per-brane field-value addressing
- entanglement/shared-field relations
- transition storage
- string table / string IDs
- any offsets/pointers required for execution

Do not leave this implicit inside scattered helper outputs.

#### Phase 2 — move flattening to Boundary
Refactor the current object-based transition and condition preparation so that Boundary is explicitly responsible for flattening.

That means:
- transition objects and nested condition objects must stop being the effective stored model
- flatten them before writing to Fields
- preserve compact linear transition encoding, but place it correctly in the flattening stage of the architecture

If the current bytecode layout is still the best compact form for transitions, keep it.  
But treat it as the flattened transition storage generated by Boundary, not as a random implementation detail.

#### Phase 3 — make Fields the canonical deduplication layer
Refactor Fields so that it accepts flattened data and produces deduplicated stored data.

This includes:
- canonical string table with IDs
- no raw duplicate strings repeated in stored data
- no backend-specific atlas export as the stored contract
- compact indexed forms for value storage and shared data

The result from Fields must be the minimal stored form Matrix needs.

#### Phase 4 — remove early atlas-specific common encoding
Refactor string handling so that the common stored representation is canonical string IDs plus canonical stored string table, not GPU export structures.

Current code still interns strings via `getStringAtlas().intern()` in common encoding logic and still routes GPU atlas materialization through runtime orchestration  [oai_citation:9‡values.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/fields/values.ts)  [oai_citation:10‡runtime.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/matrix/runtime.ts)

That must be redesigned so that:
- Fields owns canonical string deduplication
- Matrix shared contract remains backend-neutral
- GPU derives its local string buffers from canonical stored string data

#### Phase 5 — keep Matrix shared input minimal and strict
Preserve the direction already established in `MatrixInitParams`:
- `heap`
- `states`
- `bytecode`
- `bytecodeOffsets`
- `blockPtrs`  [oai_citation:11‡matrix.t.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/matrix/matrix.t.ts)

But after the refactor, ensure these are either:
- the canonical stored data directly,
- or a clean execution slice derived from the canonical stored contract without leaking backend-specific artifacts.

If additional canonical stored data must be passed to Matrix, it must be justified as truly shared CPU/GPU execution data.

#### Phase 6 — CPU/GPU final split
After Matrix receives stored canonical data:
- CPU executes directly from indexed stored data in JavaScript
- GPU derives only its own local buffers from the same stored data

No GPU-only payload may cross the shared Boundary→Matrix contract.

---

### Explicit Non-Goals

- Do not do a cosmetic refactor.
- Do not merely rename types.
- Do not keep object-graph transitions as the hidden true model.
- Do not keep GPU atlas export as the real common representation under another name.
- Do not move backend-specific materialization upward.
- Do not expand scope into unrelated runtime redesign outside this data-flow correction.

---

### Required Deliverables

1. A clearly defined canonical stored data contract between Fields and Matrix.
2. Refactored Boundary flattening flow.
3. Refactored Fields deduplication flow.
4. Corrected string pipeline with canonical string IDs in stored data.
5. Clean Matrix shared input with no GPU-only payload.
6. CPU direct indexed execution preserved.
7. GPU local buffer derivation preserved.
8. Updated tests proving:
   - flattening and deduplication are separated correctly
   - strings are deduplicated by ID in stored data
   - CPU/GPU both run from the same stored data model
   - no backend-specific payload leaks through the shared boundary

---

### Acceptance Criteria

The refactor is complete only if all of the following are true:

- Boundary is clearly the flattening layer.
- Fields is clearly the deduplication layer.
- Matrix receives only flattened + deduplicated stored data.
- CPU runs directly from indexed stored data.
- GPU prepares buffers only from the same stored data.
- Strings are deduplicated by ID in Fields.
- No GPU-only atlas export crosses the shared Matrix boundary.
- Transition data is stored in compact flat form, not as canonical nested objects.
- The architecture matches the metaphor and the division of responsibility exactly.

---

### Important Guidance For Implementation

Be conservative with runtime semantics and aggressive with architectural clarity.

Preserve working execution behavior where possible, but do not preserve misplaced responsibilities for convenience.

If a current structure already matches the target architecture, keep it.
If it violates the architecture, move it to the correct layer even if the old code currently “works”.

The final result must optimize for:
- correctness of responsibility boundaries
- flat indexed stored data
- minimum memory duplication
- CPU/GPU shared source of truth
- clean future extensibility