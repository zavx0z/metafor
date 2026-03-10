## Goal

Refine and complete the newly introduced upstream entanglement pipeline so that the current implementation stops being a transitional heuristic bridge and becomes a stable architecture where gravity-derived entanglement is the real source-of-truth from parsed `bulk.gravity` AST down to `Matrix`.

This task is not about starting over.

It is a continuation of the latest entanglement refactor already implemented in `arch`:

- upstream entanglement projection exists,
- `boundary/fields` no longer owns entanglement discovery,
- `flattenGravity()` exists,
- `buildStrongEntanglement()` exists,
- boundary projection exists,
- the pipeline already reaches matrix-ready heap.

The purpose of this task is to remove the remaining architectural weaknesses in that implementation and align it with the clarified target model.

## Current State

The latest commit already moved the system in the right direction:

- `boundary` now consumes prepared entanglement projection instead of discovering entanglement from raw values;
- `PreparedEntanglementBlock` / `PreparedEntanglementProjection` were introduced;
- `force/updateBoundary()` now uses an upstream path:
  `gravity AST -> flatten -> strong blocks -> boundary projection`;
- tests were added for projection materialization and gravity-to-matrix pipeline.

However, the current implementation is still transitional in several important ways:

1. `flattenGravity()` still traverses the generic template tree and uses regular `el` nodes as structural transport.
   This means the extraction is not yet conceptually separated as a pure actor-hierarchy projection from gravity.

2. `buildStrongEntanglement()` currently derives blocks mainly from:
   - flattened field refs,
   - adjacency,
   - matching runtime field names.
   This is better than old boundary equality discovery, but it still does not model gravity entanglement strongly enough as an explicit upstream structure.

3. There is a hard and fragile assumption:
   `flattened gravity actor count === runtime actor count`.
   This is not a stable architectural contract and must be removed.

4. `setGravitySource()` is currently a manual store registration bridge.
   This is acceptable as a temporary step, but the gravity source path should become a proper part of the preparation pipeline rather than a manual side-channel.

5. Boundary materialization still reconstructs shared values from raw brane values and validates equality across branes.
   Validation is fine, but the current projection still does not carry a sufficiently explicit gravity-derived entanglement model.

## Clarified Target Model

For this task, use the following clarified architecture as the target:

- `mass` does not participate in entanglement here;
- `weak` remains out of scope;
- regular HTML is irrelevant for entanglement;
- `bulk.gravity` is the source of actor entanglement structure;
- the parsed gravity AST must be projected into an actor-only flattened structure with preserved connectivity;
- that flattened structure must preserve not only actor membership but also gravity entanglement values/signals strongly enough for `strong` to build blocks from gravity-derived structure rather than from loose field-name coincidence;
- `strong` must build entanglement blocks from this flattened gravity structure;
- runtime binding between flattened actor graph and runtime actors must not rely on naive positional equality or count equality;
- `boundary` must continue to only materialize prepared shared-field blocks.

## Required Actions

### 1. Inspect and formalize the weaknesses of the current refactor

Review the current implementation introduced in the last commit and explicitly identify where it is still transitional.

At minimum inspect:

- `force/strong/strong.ts`
- `force/strong/strong.t.ts`
- `force/force.ts`
- `force/store.ts`
- `boundary/fields/entangled.ts`
- tests that were added in the last commit

The purpose of this step is not just reading — it is to drive the next refactor with a precise model of what is still heuristic and unstable.

### 2. Refactor gravity flattening into a true actor-hierarchy projection

Refine `flattenGravity()` so it becomes a proper actor-only projection layer rather than a generic AST traversal with `el` passthrough.

The result must be conceptually clean:

- regular HTML nodes must not participate in the flattened actor graph as structural carriers;
- the flattening stage must extract only actor-relevant information from gravity;
- scopes from `logical`, `condition`, and `map` must remain preserved;
- actor hierarchy must remain preserved;
- projection links must remain preserved;
- the output must be a gravity-derived actor graph, not a filtered general-purpose UI AST.

Do not solve this by simply deleting recursion through `el`.
Solve it by making the extraction model explicitly actor-oriented.

### 3. Strengthen the flattened structure contract

The flattened structure must become a stable architectural contract for strong entanglement construction.

It must preserve enough information to represent:

- actor manifestation nodes,
- scope lineage,
- actor hierarchy,
- connectivity edges,
- gravity field-origin relationships,
- gravity entanglement-relevant values or value-carriers as they exist at the AST/projection level.

The contract must not be just:

- actor ids,
- scope ids,
- field refs.

It must be rich enough that strong entanglement blocks can be built from actual gravity-derived connectivity/value structure rather than from field-name coincidence alone.

### 4. Make gravity entanglement explicit inside the flattened model

This is the most important refinement.

Right now the implementation mostly preserves field refs and connectivity.
That is not enough.

You need to explicitly model the gravity-side entanglement payload that is extracted from AST.

The flattened gravity model must preserve not only that:

- two actor nodes are connected,
- two actor nodes mention related field paths,

but also the gravity-side entanglement values or value-projection semantics that make those actors belong to the same entangled structure.

In other words:
the flattened model must represent gravity entanglement as a first-class upstream structure, not merely as a set of field-name hints.

### 5. Refactor `buildStrongEntanglement()` to use gravity-derived structure, not count-equality and loose matching

Remove the fragile architectural assumptions from `buildStrongEntanglement()`.

Specifically:

- remove the hard dependency on `graph.actors.length === runtimeActors.length`;
- remove reliance on simple positional correspondence between flattened actors and runtime actors;
- reduce reliance on loose field-name coincidence as the main grouping mechanism.

Replace it with a more stable binding approach between:

- flattened gravity actor structure,
- runtime actors / branes.

The binding must be explicit and architecturally meaningful.

The strong layer must build entanglement blocks from:

- flattened gravity structure,
- preserved gravity entanglement semantics,
- explicit actor/runtime correspondence,
not from positional coincidence.

### 6. Introduce a stable actor/runtime binding strategy

Design and implement a real mapping between flattened gravity actor nodes and runtime actors.

This mapping must survive cases where:

- actor counts differ,
- some runtime actors do not map 1:1 to flatten order,
- gravity structure is richer than currently materialized runtime actors,
- runtime actor creation order is not guaranteed to be identical to flattened order.

Do not leave this as a hidden positional convention.

Make it an explicit contract or preparation step.

### 7. Keep boundary materialization downstream-only, but improve upstream explicitness

`boundary/fields` should remain a materialization layer.
Do not move entanglement origin back down.

However, improve the upstream contract so that boundary is consuming a more explicit prepared entanglement projection.

Validation in `materializeEntanglement()` is fine.
But the upstream model should become more explicit, so boundary is less dependent on reconstructing the shared payload from raw brane values.

Do not overcomplicate this into full backend-specific packing.
Keep boundary downstream-only, but make the incoming projection cleaner and more explicit.

### 8. Revisit gravity-source registration

The current `setGravitySource()` approach is acceptable as a transition, but it is too manual as a long-term preparation contract.

Refine the way gravity source enters the pipeline so it becomes a natural part of the preparation path instead of a side registration hack in the store.

The solution should remain practical and minimal, but architecturally cleaner than the current manual registration approach.

### 9. Update tests to reflect the refined architecture

Expand or rewrite tests so they verify the refined, non-transitional model.

At minimum cover:

- actor-only gravity projection is independent from regular HTML layout;
- flattened gravity structure preserves entanglement-relevant connectivity and value semantics;
- strong entanglement blocks are built from gravity-derived structure rather than from positional coincidence;
- runtime mapping is explicit and resilient;
- boundary still only materializes prepared projection;
- end-to-end path remains valid from gravity AST to matrix-ready prepared data.

### 10. Keep the pipeline executable end-to-end

After the refactor, the repository must still support a working path:

`gravity AST -> actor-only flattened gravity structure -> strong entanglement blocks -> boundary projection -> fields materialization -> matrix-ready data`

Do not leave the system in a half-architected state.

## Constraints

- Do not reintroduce entanglement ownership into `boundary/fields`.
- Do not involve `mass`.
- Do not modify `weak`.
- Do not treat regular HTML layout as part of the entanglement model.
- Do not keep positional count-equality as the core runtime binding mechanism.
- Do not reduce the problem to field-name coincidence.
- Do not push heap/layout/backend concerns into gravity or strong.
- Do not rewrite the entire system unnecessarily.
- Do not abandon the working path already introduced in the last commit.
- Keep the existing refactor direction, but make it architecturally stable.

## Expected Result

After completion, the latest entanglement refactor should no longer be a transitional bridge.

The repository should contain a stronger and more stable architecture where:

- `bulk.gravity` is truly treated as the source of entanglement structure;
- parsed gravity is projected into an actor-only flattened graph;
- the flattened graph preserves real entanglement-relevant connectivity and gravity-side value structure;
- `strong` builds entanglement blocks from that structure rather than from positional coincidence;
- runtime mapping between flattened actors and branes is explicit and stable;
- `boundary/fields` remains only a materialization layer;
- the path from gravity AST to matrix-ready prepared data remains executable and testable;
- the implementation is closer to the clarified ontology rather than to a temporary heuristic bridge.
