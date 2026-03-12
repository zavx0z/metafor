## Goal

Introduce `Dark` as an active architectural domain in the repository plan and domain projection, and redistribute responsibilities so the system is no longer modeled as a two-domain `Boundary/Bulk` architecture.

## Context

The repository already documents a three-domain ontology and architecture:

- `README.md` defines the core model as `Dark × Boundary × Bulk`
- `docs/ONTOLOGY.md` and `docs/ARCHITECTURE.md` describe `Dark` as the domain of hidden structure, schema history, fixed states, structured change, and model evolution

However, the active execution plan and the currently visible code projection are still centered on a two-domain runtime model:

- `tasks/CURRENT_PLAN.md` still uses the minimal target `{ DSL -> AST -> Bulk, DSL -> AST -> Boundary }`
- `boundary/boundary.ts` is an active domain orchestrator for canonicalization and transition computation
- `bulk/index.ts` is an active bulk-domain entry
- `bulk/gravity/load.ts` still loads DSL/AST directly into bulk from `meta.json`
- there is no explicit active `dark/` domain projection participating in the current working plan

This mismatch blocks further work: the documentation already assumes `Dark`, but the plan and functional split still push hidden-structure responsibilities into the old two-domain model.

## Required Actions

1. Inspect the current active responsibilities of `boundary/*` and `bulk/*` and classify them into:
   - responsibilities that must remain in `Boundary`
   - responsibilities that must remain in `Bulk`
   - responsibilities that belong to `Dark`

2. Build a minimal architectural redistribution for the three-domain model, with explicit answers for:
   - what `Dark` owns now
   - what `Dark` must not own
   - how `Dark` relates to `DSL` and `AST`
   - which current two-domain assumptions become invalid after introducing `Dark`

3. Identify the concrete responsibility groups that should be assigned to `Dark` first.
   At minimum, evaluate these groups against the actual repository state:
   - schema continuity / schema organization
   - snapshots / fixed states
   - structured changes / patch-like evolution
   - historical continuity / version lineage
   - hidden hierarchy / latent organization
   - domain projection into `Boundary` and `Bulk`

4. Update the planning layer so that the active implementation target is no longer a two-domain contour.
   Replace the outdated two-domain formulation in `tasks/CURRENT_PLAN.md` with a three-domain working contour aligned with the documented ontology.

5. Update documentation only where necessary to remove planning contradictions.
   Focus on:
   - `README.md`
   - `docs/ARCHITECTURE.md`
   - `docs/ONTOLOGY.md`
   - `tasks/CURRENT_PLAN.md`

6. Introduce a minimal explicit repository projection for `Dark` only if it is justified by the inspection.
   If a `dark/` projection is introduced, it must be minimal and responsibility-driven, not a decorative mirror of existing folders.

7. Produce a clear responsibility map in the repository documentation or plan that answers:
   - `Dark × Gravity`
   - `Dark × Strong`
   - `Dark × Weak`
   - `Dark × Electromagnetism`
   - how these relate to `Boundary` and `Bulk` without collapsing domain ownership

8. Preserve the already agreed architectural metaphor:
   - `Boundary` is the flattening boundary
   - `Fields` is the imprint/deduplication layer on that boundary
   - deduplication must stay in `Boundary × Strong`
   - `Dark` must not absorb boundary canonicalization
   - `Dark` must not absorb bulk execution

9. After the redistribution, add a short implementation-oriented note in the plan describing which future tasks become unblocked once `Dark` exists as an explicit domain in the architecture.

## Constraints

- Do not perform a broad runtime rewrite in this task.
- Do not move code between domains unless the move is directly justified by the inspection.
- Do not duplicate ownership between `Dark`, `Boundary`, and `Bulk`.
- Do not turn `Dark` into a generic storage bucket.
- Do not move flattening into `Dark`.
- Do not move deduplication from `Boundary × Strong` into `Dark`.
- Do not move process execution from `Bulk × Weak` into `Dark`.
- Do not break current public APIs of `boundary` or `bulk` unless a change is strictly necessary and explicitly justified.
- Keep the task minimal: architecture alignment first, large implementation changes later.

## Communication

The user communicates in Russian.

When interacting with the user, always use Russian.

Task instructions and technical sections are written in English, but any direct communication with the user must be in Russian.

## Expected Result

After completion:

- the repository no longer has a contradiction between the documented ontology and the active implementation plan
- `Dark` is explicitly recognized as a real architectural domain in the working plan
- the responsibilities of `Dark`, `Boundary`, and `Bulk` are clearly separated
- the repository has a minimal, concrete three-domain responsibility map grounded in the actual codebase
- `tasks/CURRENT_PLAN.md` is updated to a three-domain contour
- future refactoring tasks can proceed from an explicit `Dark × Boundary × Bulk` model instead of the obsolete two-domain split
