# Goal

Revise the core documentation set so MetaFor is consistently described as a three-domain system:

`Dark × Boundary × Bulk`

Introduce `Dark` as an ontologically distinct domain of hidden structure, memory, hierarchy, and model evolution, and align the overall philosophical, ontological, architectural, and entry-level project description with this model.

# Context

The current documentation still describes MetaFor through two fundamental domains only: `Boundary` and `Bulk`.

This is no longer sufficient.

The missing domain is `Dark`.

`Dark` must be introduced not as a storage folder, implementation detail, or auxiliary technical service, but as a real ontological layer of hidden causality and latent organization.

The intended reading is:

- `Dark` — hidden structural frame and memory of the world
- `Boundary` — the boundary where structure is flattened, fixed, and made canonical
- `Bulk` — manifested volume, mass, execution, and observable form

The purpose of `Dark` is to hold what is not yet manifested and not yet flattened:

- schemas
- hierarchy
- patches
- snapshots
- history of change
- model evolution

This must also clarify the different role of gravity in each domain:

- `Dark × Gravity` — hidden hierarchy and latent structure
- `Boundary × Gravity` — flattening and boundary geometry
- `Bulk × Gravity` — mass and manifested form

The cosmological metaphor must be strengthened, but kept disciplined:

- dark matter is used as a metaphor for the hidden structural substrate that is not directly observed but shapes organization
- dark energy is used as a metaphor for the tendency of the hidden world to expand through patches, snapshots, and schema evolution

This must not be presented as literal physics reproduction.
It must be documented as a strict architectural metaphor.

At the same time, the existing ontology must remain internally coherent:

- `Boundary` remains the flattening boundary
- deduplication / imprinting remains on the boundary side, not inside `Dark`
- `Bulk` remains the domain of manifested execution and observable form
- `Dark` is the hidden causal substrate from which projections toward both `Boundary` and `Bulk` can emerge

# Required Actions

1. Update `README.md`.

   - Replace the entry-level two-domain description with a three-domain model.
   - Update the ontology and architecture overview so the project is introduced through `Dark`, `Boundary`, and `Bulk`.
   - Make the reading order of the repository reflect the expanded worldview.
   - Ensure the README explains that the project must now be understood through hidden substrate, fixation boundary, and manifested volume.

2. Update `PHILOSOPHY.md`.

   - Extend the philosophical model from two fundamental modes to three domains.
   - Introduce `Dark` as the latent, hidden, non-manifest structural substrate of the world.
   - Explain why MetaFor needs this third layer conceptually:
     - without it, the system describes fixation and manifestation, but not hidden structural causality
     - with it, the system can describe how the world is secretly organized, then fixed, then manifested
   - Preserve and deepen the metaphor-first method.
   - Explicitly clarify that cosmology is used as a source of structural analogy, not as literal implementation doctrine.
   - Add a clear philosophical triad:
     - hidden substrate
     - fixation boundary
     - manifested volume
   - Show why this makes the MetaFor metaphor more complete than the current `Boundary/Bulk` pair.

3. Update `ONTOLOGY.md`.

   - Change the ontology from a two-domain model to a three-domain model.
   - Update the domain section so the fundamental domains are:
     - `Dark`
     - `Boundary`
     - `Bulk`
   - Add a dedicated subsection for `Dark` explaining that it is:
     - the domain of hidden structure
     - the carrier of hierarchy
     - the domain of schema persistence and evolution
     - the substrate of patches, snapshots, and historical continuity
     - the latent organizational frame of the world
   - Preserve the rule that domains are modes of existence, not owners of forces.
   - Update the domain × force projection section by adding all four `Dark` force projections.

4. Define the four force roles inside `Dark` in `ONTOLOGY.md`.

   Add a domain-force interpretation parallel to the existing `Boundary` and `Bulk` sections.

   At minimum define:

   - `Dark × Gravity`
     - hidden hierarchy
     - latent structure
     - schema organization
     - deep addressability of the hidden world

   - `Dark × Electromagnetism`
     - projection and transfer from hidden substrate toward other domains
     - propagation of structural change from latent memory
     - communication of patches, snapshots, and schema-derived deltas

   - `Dark × Strong`
     - retention of hidden continuity
     - persistence of schema coherence
     - holding together the latent structural frame
     - consistency of snapshots and historical lineage

   - `Dark × Weak`
     - evolution of the hidden model
     - schema mutation and transformation
     - transitions between latent structural versions
     - patch-driven reconfiguration of hidden organization

   These descriptions must not duplicate `Boundary` or `Bulk`.
   They must clearly belong to the hidden substrate domain.

5. Update entity interpretations in `ONTOLOGY.md` where needed.

   - Review whether `Patch`, `Identity`, `Index`, `State`, and related entities need explicit three-domain clarification.
   - Add only the necessary adjustments.
   - In particular:
     - `Patch` should no longer read only as a transport/change form between technical boundaries, but also as part of latent structural evolution inside `Dark`
     - `Identity` may need clarification relative to historical continuity and hidden persistence
     - `Index` must remain a runtime geometric address and must not be incorrectly elevated into the `Dark` domain unless justified
   - Keep changes minimal and coherent.

6. Update `ARCHITECTURE.md`.

   - Revise the architecture reading rule so the architectural projection is no longer implicitly two-domain.
   - Introduce `Dark` as a domain-level participant in the architecture model.
   - Clarify that `Dark` is not equivalent to runtime `Boundary` or runtime `Bulk`, and not merely a filesystem grouping.
   - Describe `Dark` as the domain that holds latent structure, schema history, snapshots, patches, and model evolution.
   - Explain that `Boundary` and `Bulk` can be projected in parallel from latent structures rather than being treated as the whole world by themselves.
   - Preserve the rule that `Bulk` and `Boundary` remain parallel domains, and that cross-domain transfer between them still passes through `Electromagnetism`.

7. Add `Dark` force projection to `ARCHITECTURE.md`.

   Create a dedicated architectural section for:

   - `Dark × Gravity`
   - `Dark × Strong`
   - `Dark × Weak`
   - `Dark × Electromagnetism`

   These sections must explain architectural responsibility, not only philosophical meaning.

   The architectural reading should cover at least:

   - hidden hierarchy and schema organization
   - retention of persistent structural memory
   - hidden evolution through patches/snapshots/history
   - projection or transfer of latent structure toward the other domains

8. Carefully revise the canonical system path in `ARCHITECTURE.md`.

   The current path is centered around:

   `DSL -> AST -> Bulk` and `DSL -> AST -> Boundary`

   Rework this so the path reflects the existence of a latent domain.

   Do not introduce speculative code architecture beyond what the documentation can justify.

   The revised explanation should make it possible to read the system as something conceptually closer to:

   - declarative description
   - latent structural model / hidden continuity
   - projection toward fixation
   - projection toward manifestation

   This must be documented carefully and without inventing unsupported implementation claims.

9. Update file-system / projection wording in `ARCHITECTURE.md`.

   - If the current file projection section would become misleading after the introduction of `Dark`, revise the wording.
   - Do not force a fake directory layout if the repository does not actually use it yet.
   - Keep the distinction clear between:
     - ontology
     - architectural target projection
     - current migration reality
   - If needed, explicitly say that the ontology can include `Dark` before or beyond a full filesystem projection.

10. Perform a consistency pass across all four documents.

    Ensure the same core distinctions are preserved everywhere:

    - `Dark` is latent hidden structure, memory, hierarchy, history, and evolution
    - `Boundary` is flattening, fixation, canonicalization, and boundary geometry
    - `Boundary` strong/imprint side remains the place of deduplication and compact canonical form
    - `Bulk` is manifested volume, mass, execution, process, and observable dynamics
    - the cosmological metaphor is explanatory and structural, not literal physics
    - the project is now read through a complete three-domain worldview

11. Preserve the tone and document roles.

    - `README.md` must remain the project entry point
    - `PHILOSOPHY.md` must explain why the worldview is shaped this way
    - `ONTOLOGY.md` must define what exists
    - `ARCHITECTURE.md` must explain how ontology projects into system design

    Do not collapse these documents into each other.
    Each document must keep its own responsibility.

# Constraints

- Do not reduce `Dark` to a storage or persistence implementation detail.
- Do not move deduplication from the boundary imprint/canonicalization layer into `Dark`.
- Do not weaken the existing meaning of `Boundary` as flattening boundary.
- Do not weaken the existing meaning of `Bulk` as manifested execution domain.
- Do not rewrite the documents into generic abstract prose; preserve the current precise, declarative style.
- Do not introduce implementation claims that are not supported by the documentation scope.
- Do not force concrete repository restructuring or directory creation in this task unless the documentation can justify it without inventing current code state.
- Keep the cosmology metaphor disciplined and explicit as metaphor.
- Preserve internal consistency of terms such as `Patch`, `Identity`, `Index`, `State`, `Transition`, `Process`, `Brane`, and `Field`.

# Communication

The user communicates in Russian.

When interacting with the user, always use Russian.

Task instructions and technical sections are written in English, but any direct communication with the user must be in Russian.

# Expected Result

After the task is completed:

- the repository documentation consistently describes MetaFor as a three-domain system: `Dark`, `Boundary`, `Bulk`
- `Dark` is clearly established as the latent hidden substrate of structure, hierarchy, memory, patches, snapshots, history, and model evolution
- the distinct role of gravity in all three domains is clearly explained
- the relationship between hidden structure, fixation boundary, and manifested volume is coherent across philosophy, ontology, architecture, and README
- the cosmological metaphor becomes more complete and more rigorous
- the existing meaning of boundary flattening, boundary deduplication/imprint, and bulk manifestation/execution remains intact
- the documentation reads as one aligned worldview rather than four partially disconnected texts
