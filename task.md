## Goal

Stabilize and formalize the current gravity-derived entanglement architecture after the latest refactor so the system clearly distinguishes between:

- gravity-driven entanglement membership,
- runtime/boundary materialization readiness,
- downstream boundary materialization.

The existing pipeline must remain intact:

gravity AST → actor projection → flattened gravity graph → strong entanglement membership → boundary projection → fields materialization → Matrix.

This task does **not** redesign the pipeline.  
It refines the architecture introduced in the latest commits so the separation between layers becomes explicit, stable, and encoded in types and contracts.

## Current State

Recent changes already introduced important architectural improvements:

- `projectGravityActors()` creates an intermediate actor projection layer.
- `flattenProjection()` converts the projection into a flat graph.
- `GravityEntanglementPayload` now includes lineage information (`ownerKey`, `scopeLineageKeys`, `actorLineageKeys`).
- `buildStrongEntanglement()` can keep gravity-driven membership even when no boundary-ready shared fields exist yet.
- `StrongEntanglementBlock` contains `membershipSemanticKeys`.
- Boundary projection emits blocks only when shared fields are ready for materialization.

These changes are correct and must be preserved.

However, the architecture currently contains two conceptual levels of entanglement that are not yet fully formalized in types or contracts.

## Core Problem

Two distinct levels of entanglement now exist in the system:

### 1. Strong membership entanglement

Actors belong to the same entangled structure because:

- gravity payload lineage,
- connectivity,
- actor hierarchy,
- runtime binding

indicate that they share the same entanglement semantics.

This membership may exist even when boundary materialization is not yet possible.

### 2. Boundary-materializable entanglement

A strong membership block becomes boundary-materializable only when:

- shared runtime fields can be resolved,
- those fields can be projected into boundary prepared structures.

The system already behaves this way internally, but the distinction is not yet encoded clearly in the architecture.

This task formalizes that distinction.

## Required Actions

### 1. Formalize the two-level entanglement model

Introduce an explicit distinction between:

- **membership-level entanglement blocks**
- **boundary-materializable entanglement blocks**

This distinction must be visible in:

- types
- naming
- structure of the pipeline

It must be impossible to confuse membership blocks with boundary-ready blocks.

### 2. Clarify the contract of `StrongEntanglementBlock`

Review the structure of `StrongEntanglementBlock`.

Ensure that the type clearly separates:

- gravity-derived membership semantics
- derived runtime/boundary readiness information

The type must explicitly encode that membership exists independently of boundary readiness.

`membershipSemanticKeys` was a first step.  
Extend the structure so the entire type clearly expresses this model.

### 3. Make boundary projection explicitly a narrowing phase

Refactor the boundary projection stage so that it is clearly implemented as:

membership blocks → projection narrowing → boundary-materializable blocks.

Boundary projection must **not** appear to rediscover entanglement.

Instead, it should:

1. receive membership blocks
2. resolve runtime fields
3. produce prepared boundary blocks only when possible.

Naming and structure should make this obvious.

### 4. Strengthen the prepared boundary contract

Prepared boundary projection must rely primarily on explicit prepared field structures.

The canonical downstream representation must use explicit prepared field entries rather than legacy field index arrays.

If compatibility fallbacks remain, they must be:

- minimal
- isolated
- clearly secondary.

### 5. Ensure membership logic is gravity-driven

Review `buildStrongEntanglement()`.

Ensure that membership formation is primarily driven by:

- gravity payload semantics
- lineage
- connectivity
- runtime binding

Shared field resolution should act only as a **projection constraint**, not as the main source of entanglement membership.

The code structure should clearly reflect this.

### 6. Preserve actor projection as a separate architectural layer

The architecture should remain structured as:

1. parsed gravity AST
2. actor projection
3. flattened gravity graph
4. strong membership entanglement
5. boundary projection
6. boundary materialization
7. matrix-ready execution data

Do not collapse projection and flattening back into a single generic traversal.

The projection layer must remain conceptually separate.

### 7. Expand tests for the two-level model

Add or extend tests that verify the architectural invariants.

At minimum ensure tests confirm:

- gravity membership blocks can exist without boundary-ready fields
- boundary projection only emits materializable blocks
- membership remains intact even when boundary projection produces nothing
- runtime actor binding continues to preserve membership semantics
- prepared field projection is the canonical downstream path

The tests must validate architecture invariants, not only output values.

### 8. Preserve end-to-end execution

After refactoring, the system must still execute the full path:

gravity AST → actor projection → flattened graph → strong membership entanglement → boundary projection → fields materialization → matrix-ready execution input.

Do not leave the repository in a partially refactored or non-executable state.

## Constraints

- Do not redesign the pipeline again.
- Do not remove the actor projection layer.
- Do not involve `mass`.
- Do not modify `weak`.
- Do not reintroduce entanglement ownership into `boundary/fields`.
- Do not revert to value-equality discovery.
- Do not reduce the model to simple field-name coincidence.
- Do not introduce backend-specific logic into gravity or strong layers.

## Expected Result

After completion:

- gravity payload semantics define entanglement membership upstream
- strong membership blocks represent the canonical entanglement structure
- boundary projection is a narrowing/materialization preparation step
- boundary remains a pure downstream materialization layer
- prepared field projection is the canonical downstream contract
- the full path from gravity AST to matrix-ready execution data remains operational
- the codebase clearly distinguishes membership entanglement from materializable entanglement