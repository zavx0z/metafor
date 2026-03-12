## Goal

Rewrite `tasks/CURRENT_PLAN.md` and align all active tasks with the actual intended architecture, where `Dark` becomes the owner of graph structure, storage, paths, addressing, and force-level graph preparation.

This task is not about implementing the full migration yet.
It is about fixing the plan and task layer so further work follows the correct domain ownership model and does not preserve obsolete assumptions.

## Context

The repository has already moved to a documented three-domain language, and `tasks/CURRENT_PLAN.md` already mentions `Dark` as an architectural domain.

However, the current plan still describes `Dark` mainly as:

- hidden continuity
- schema lineage
- fixed states
- structured changes
- projection contracts

and still leaves major structural ownership elsewhere, including:

- boundary-side geometry / flattening
- bulk-side topology / actor hierarchy
- direct bulk loading assumptions

This is now insufficient.

The clarified target model is stricter:

1. `Dark` is not only continuity.
2. `Dark` is the domain owner of the graph itself.
3. `Dark` must own:
   - graph storage
   - path formation
   - addressing
   - graph API
   - schema loading
   - graph flattening with preserved links
   - force-level preparation of structure
4. The old separate `force/` package from the pre-`boundary/bulk` refactor must now be reinterpreted as the source of the new `Dark` domain.
5. The force logic is not only `Gravity`; graph preparation was distributed across the force layer and must now be re-homed into `dark/gravity`, `dark/strong`, `dark/weak`, and `dark/em`.
6. `Boundary` and `Bulk` must stop being treated as owners of the primary graph and its addressing.
7. Future implementation work must follow this updated ownership model.

## Core architectural correction

The plan must explicitly state the following.

### Dark

`Dark` is the owner of the structural graph domain.

`Dark` owns:

- schema loading by the main schema path
- `DSL`, `AST`, and AST-schema holding on the dark side
- graph storage
- graph flattening into a flat form with preserved relations
- path construction
- addressing
- graph API
- force-level preparation of structure before domain projection
- hidden organization of the graph as the source for later `Boundary` and `Bulk` usage

`Dark` does not yet need to implement full persistence/history runtime in this task.
But the plan must stop describing `Dark` as only continuity/lineage and must describe it as the owner of the graph substrate.

### Boundary

`Boundary` is no longer the owner of source graph parsing or primary addressing.

`Boundary` must only own boundary-specific work on top of the dark-prepared structure:

- boundary flattening in the boundary sense
- canonicalization
- deduplication
- string interning
- boundary state transition computation
- boundary-specific runtime representation

### Bulk

`Bulk` is no longer the owner of source graph parsing or primary graph addressing.

`Bulk` must only own manifestation/runtime work on top of the dark-prepared structure:

- manifested topology/runtime projection
- binding
- entanglement projection
- intentions / action loading
- process execution

## Required Actions

1. Rewrite `tasks/CURRENT_PLAN.md` so that it no longer describes `Dark` as only a continuity/projection layer.
   It must explicitly describe `Dark` as the owner of graph storage, path formation, addressing, and force-level graph preparation.

2. Replace any wording in the plan that leaves primary graph ownership in `Boundary` or `Bulk`.

3. Add an explicit section to the plan describing the migration principle:

   `old force/ responsibilities -> dark/* domain responsibilities`

   This section must explain that the pre-refactor `force/` package is the correct architectural ancestor of the new `Dark` domain.

4. Add an explicit section describing what must move into `Dark` first.
   At minimum, it must include:

   - storage of graph structure
   - path/address API
   - graph flattening with preserved relations
   - schema-loading ownership
   - force-level structure preparation

5. Add an explicit section describing what must remain outside `Dark`:

   - boundary canonicalization
   - boundary deduplication
   - boundary transition runtime
   - bulk manifestation runtime
   - bulk process execution

6. Rewrite the plan stages so future work starts from the following order:

   - establish `Dark` as graph/store/address owner
   - move pre-refactor force responsibilities into `dark/*`
   - rewire `Boundary` to consume dark-owned graph structure
   - rewire `Bulk` to consume dark-owned graph structure
   - only after that continue with deeper runtime refactors

7. Update active task descriptions so they no longer conflict with the new ownership model.
   Any task that still assumes:
   - direct primary graph ownership in `Boundary`
   - direct primary graph ownership in `Bulk`
   - `Dark` as only continuity/history/projection
   must be rewritten or marked obsolete.

8. In the updated plan, explicitly distinguish two meanings of flattening:
   - graph flattening in `Dark` as preparation of the source graph into flat linked structure
   - boundary flattening in `Boundary` as boundary-specific geometric/canonical preparation

   These must not be conflated.

9. Add a section describing `Dark × Force` responsibilities in the new model:

   - `Dark × Gravity` — graph geometry, structure loading, hierarchy, paths, addressing
   - `Dark × Strong` — graph cohesion, relation retention, stable linked flat form
   - `Dark × Weak` — structural transformation path, graph transition preparation
   - `Dark × Electromagnetism` — projection/export contract of prepared graph state to downstream domains

   This section must clearly state that the old force layer was not “just channels”, but the preparation layer of the graph.

10. Add a section describing the implementation boundary for the next tasks:
    this task updates plan and task definitions only.
    Full code migration comes afterwards and must follow the corrected plan.

## Constraints

- Do not implement the whole migration in this task.
- Do not keep contradictory task text alongside the new plan.
- Do not describe `Dark` as only lineage/history/projection anymore.
- Do not leave primary graph ownership in `Boundary` or `Bulk`.
- Do not move boundary canonicalization into `Dark`.
- Do not move deduplication into `Dark`.
- Do not move bulk execution into `Dark`.
- Do not write vague wording; ownership must be explicit.
- Do not preserve old task language if it conflicts with the corrected architecture.

## Communication

The user communicates in Russian.

When interacting with the user, always use Russian.

Task instructions and technical sections are written in English, but any direct communication with the user must be in Russian.

## Expected Result

After completion:

1. `tasks/CURRENT_PLAN.md` reflects the real intended architecture.
2. `Dark` is described as the owner of graph storage, addressing, paths, and force-level graph preparation.
3. The old pre-refactor `force/` layer is explicitly recognized as the migration source for `dark/*`.
4. `Boundary` and `Bulk` are no longer described as owners of the primary graph.
5. Existing tasks are updated so they no longer contradict the corrected plan.
6. The repository gets a clean planning baseline for the next implementation step: migration of force functionality into `Dark` in domain format.
