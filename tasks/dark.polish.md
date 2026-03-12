# Goal

Polish the newly introduced `Dark` domain documentation so the three-domain model remains conceptually strong, linguistically consistent, and architecturally disciplined.

# Context

The last documentation update correctly introduced `Dark` as the missing third domain and aligned the main documents around a three-domain worldview.

However, the current result still has four cleanup issues:

1. Russian documentation now contains too many mixed English phrases inside Russian prose.
2. Some architecture wording is too strong and reads like an implementation claim rather than a careful architectural interpretation.
3. There is unresolved wording tension between:
   - `Boundary` and `Bulk` being projections from `Dark`
   - `Boundary` and `Bulk` loading their own `DSL/AST` layers independently
4. Some ontology passages risk making `Dark` read like a shadow copy of the whole runtime world instead of a latent domain of hidden structure, memory, hierarchy, history, and evolution.

This task is not about changing the three-domain decision.
It is about cleaning and tightening the existing documentation.

# Required Actions

1. Clean up language consistency in the updated documentation.

   Review at least:

   - `README.md`
   - `PHILOSOPHY.md`
   - `ONTOLOGY.md`
   - `ARCHITECTURE.md`

   Replace unnecessary English phrases embedded in Russian prose with precise Russian equivalents wherever possible.

   Examples of problematic mixed wording include expressions like:

   - `schema history`
   - `model evolution`
   - `hidden hierarchy`
   - `deep addressability`
   - `snapshot lineage`
   - `latent-delta`
   - `versioned-конфигурация`

   Preserve established technical identifiers such as:

   - `Dark`
   - `Boundary`
   - `Bulk`
   - `Gravity`
   - `Electromagnetism`
   - `Strong`
   - `Weak`
   - `DSL`
   - `AST`
   - `UUID`
   - `JSON Patch`

   The goal is not artificial purism.
   The goal is clean Russian documentation with only necessary technical identifiers left in English.

2. Soften the canonical path wording in `ARCHITECTURE.md`.

   Rework the section that currently presents the canonical path as something like:

   `DSL -> AST -> Dark -> { Boundary, Bulk }`

   Do not remove the idea that `Dark` is the hidden structural substrate.
   But rewrite this part so it does not sound like a hard implementation pipeline or a proven runtime stage.

   The architecture should read more carefully, for example in the sense that:

   - MetaFor may be interpreted through hidden structural continuity and parallel domain projections
   - `Dark` is an architectural and ontological reading layer
   - this does not automatically imply a mandatory standalone runtime module or execution-stage pipeline

   Keep the idea.
   Reduce the implementation rigidity.

3. Resolve the wording tension between projection and independent loading.

   In `ARCHITECTURE.md`, explicitly reconcile these two statements:

   - `Boundary` and `Bulk` are parallel projections from the hidden structural world
   - `Boundary` and `Bulk` independently load their own `DSL/AST` layers

   Make the distinction explicit:

   - ontologically and architecturally, both domains are rooted in the same hidden substrate
   - runtime ownership and technical loading can still remain domain-local
   - projection from `Dark` does not mean shared runtime ownership or a single central loader

   The reader should no longer need to infer this reconciliation.

4. Normalize the ontology so `Dark` does not become a full shadow runtime.

   Review the `Dark`-domain interpretations of entities in `ONTOLOGY.md`, especially:

   - `State`
   - `Transition`
   - `Process`
   - any other entities that may now read as fully duplicated from `Boundary` and `Bulk`

   Preserve the idea that `Dark` has hidden continuity, historical versions, schema evolution, and latent reconfiguration.

   But reduce or rephrase any passages that make `Dark` sound like:

   - a second full execution world
   - a hidden duplicate of all runtime behavior
   - a complete mirrored domain containing everything in the same operational sense

   `Dark` should remain:

   - latent
   - structural
   - historical
   - hierarchical
   - causally grounding

   It should not become a generic shadow copy of manifested runtime reality.

5. Preserve the core distinctions everywhere.

   During cleanup, make sure all documents still clearly preserve:

   - `Dark` as hidden structure, memory, hierarchy, history, patches, snapshots, and model evolution
   - `Boundary` as flattening, fixation, canonicalization, and boundary geometry
   - `Boundary × Strong` as the place of deduplication / compact canonical form
   - `Bulk` as manifested volume, execution, process, and observable form
   - cosmology as a disciplined metaphor, not literal physics
   - the three-domain model as the now-correct worldview of the documentation

6. Perform a final consistency pass.

   After the edits, verify that:

   - the four core documents use compatible terminology
   - no document accidentally downgrades `Dark` into mere storage
   - no document accidentally moves deduplication into `Dark`
   - no document makes `Dark` sound like a mandatory concrete runtime stage unless explicitly and carefully justified
   - the documentation remains readable and precise

# Constraints

- Do not undo the introduction of `Dark`.
- Do not revert the three-domain model back to a two-domain model.
- Do not weaken the existing meaning of `Boundary`.
- Do not weaken the existing meaning of `Bulk`.
- Do not move deduplication away from `Boundary × Strong`.
- Do not turn this task into a large conceptual rewrite.
- Do not introduce new ontology concepts beyond what is necessary for cleanup.
- Do not make speculative claims about repository implementation that are not clearly justified by the documentation scope.
- Keep all edits minimal but precise.

# Communication

The user communicates in Russian.

When interacting with the user, always use Russian.

Task instructions and technical sections are written in English, but any direct communication with the user must be in Russian.

# Expected Result

After the task is completed:

- the documentation still consistently describes MetaFor as a three-domain system: `Dark`, `Boundary`, `Bulk`
- the Russian prose is significantly cleaner and no longer overloaded with unnecessary English fragments
- `Dark` is described as a latent structural and historical substrate rather than a shadow duplicate of runtime reality
- the architecture no longer overstates `Dark` as a mandatory implementation pipeline stage
- the relation between hidden projection and domain-local loading is explicitly clarified
- all four core documents remain aligned, readable, and conceptually disciplined
