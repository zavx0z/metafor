# Goal

Polish the MetaFor documentation to a final, internally consistent state by aligning the ontology, architecture, README, and protocol layer around one exact transport model and one exact reading of domain-force-channel relationships.

# Context

The documentation has already reached a strong near-final state:

- the three-domain model (`Dark`, `Boundary`, `Bulk`) is established
- the philosophical and ontological framing is much cleaner
- the architecture no longer overstates `Dark` as a mandatory runtime stage
- a dedicated `docs/PROTOCOL.md` has been introduced

However, the protocol layer and the domain-force descriptions still need final alignment.

The main unresolved issue is the exact final reading of transfer, channels, and content of change.

The final intended distinctions that must be preserved and clarified are:

- `Impulse` is not a carrier; it is the structured content/composition of change
- `Electromagnetism` is the transport force of observable transfer/spread
- `Boson` is a general protocol/carrier type
- `Photon`, `Graviton`, and `Gluon` are protocol subtypes/channels and must be described consistently
- `Graviton` belongs to hidden/internal organization, not to the visible transport metaphor
- `Boundary × Strong` must remain the place of canonicalization, deduplication, and compaction
- the three-domain worldview must remain intact

The current documentation is already close, but still risks confusion because protocol descriptions are spread across:

- `README.md`
- `docs/ONTOLOGY.md`
- `docs/ARCHITECTURE.md`
- `docs/PROTOCOL.md`

Some passages now state protocol relationships in slightly different ways, and those differences need to be resolved into one final wording model.

# Required Actions

1. Perform a final consistency pass across the four core documentation files:

   - `README.md`
   - `docs/ONTOLOGY.md`
   - `docs/ARCHITECTURE.md`
   - `docs/PROTOCOL.md`

   Ensure these documents describe the same protocol worldview and do not leave competing interpretations.

2. Freeze the exact role of `Impulse`.

   Make sure all documents consistently state that:

   - `Impulse` is the content/composition of change
   - `Impulse` is not a transport unit
   - `Impulse` is not a force
   - `Impulse` is not a channel
   - `Impulse` may be serialized architecturally (for example as `JSON Patch`), but serialization must not make it read like a carrier

   Remove or rewrite any wording that still makes `Impulse` sound like something that itself travels as a transport mechanism.

3. Freeze the exact role of `Electromagnetism`.

   Align all mentions so that `Electromagnetism` is described consistently as:

   - the force of observable transfer / spread / signaling
   - the domain-crossing transfer logic where state becomes visibly propagated
   - not a generic synonym for every possible force-channel in the system

   At the same time, do not let the documents drift back into the older wording where all cross-domain transfer is reduced to a single universal `Electromagnetism` channel for everything.

   The final wording must clearly separate:

   - `Electromagnetism` as the transport force for observable signal/state propagation
   - other forces having their own channels and roles

4. Freeze the exact role of `Boson`.

   Make all relevant documents describe `Boson` consistently as:

   - a general protocol/carrier type
   - not a force by itself
   - not identical to any one subtype
   - the architectural base type for channel-units such as `Photon`, `Graviton`, and `Gluon`

   Ensure that the wording does not drift into treating `Boson` as an extra force or as a vague “anything that moves”.

5. Freeze the exact role of `Photon`.

   Ensure the final documentation consistently states that:

   - `Photon` is a subtype of `Boson`
   - `Photon` belongs to `Electromagnetism`
   - `Photon` is the visible/observable propagation channel
   - `Photon` is the correct public-facing protocol metaphor for observable transport between manifested or boundary-visible parts of the system

   If some passages overextend `Photon`, narrow them back to this exact role.

6. Freeze the exact role of `Graviton`.

   Ensure the final documentation consistently states that:

   - `Graviton` is a subtype of `Boson`
   - `Graviton` belongs to `Gravity`
   - `Graviton` is part of the hidden/internal protocol of structural organization
   - `Graviton` is not the main visible transport metaphor
   - `Graviton` should be read through hidden organization, addressability, and structural causality rather than public signal spread

   Remove any wording that makes `Graviton` sound like a general visible transport event.

7. Freeze the exact role of `Gluon`.

   Review all mentions of `Gluon` and make them fully consistent.

   The final wording must make clear that:

   - `Gluon` is a subtype of `Boson`
   - `Gluon` belongs to `Strong`
   - `Gluon` relates to value/field-change within the regime of structural holding/cohesion
   - `Gluon` must not weaken or replace the established role of `Boundary × Strong` in canonicalization, deduplication, interning, and compaction

   In other words:

   - `Gluon` may describe a strong-channel change mechanism
   - but `Boundary × Strong` still owns compact canonical form and deduplicated structure

8. Tighten the relation between forces, channels, and entities in `docs/ONTOLOGY.md`.

   Review the sections for:

   - `Gravity`
   - `Electromagnetism`
   - `Strong`
   - `Weak`
   - `Boson`
   - `Photon`
   - `Graviton`
   - `Gluon`
   - `Impulse`
   - domain-force manifestations

   Ensure the ontology reads cleanly in layers:

   - force
   - channel / carrier subtype
   - entity/content affected
   - domain-specific manifestation

   The reader must be able to distinguish:
   - force
   - protocol channel
   - structured content of change
   - ontological entity

   without ambiguity.

9. Tighten the same distinction in `docs/ARCHITECTURE.md`.

   Review all sections where protocol language appears and ensure architecture does not accidentally become a physics glossary.

   `docs/ARCHITECTURE.md` must remain architectural.

   That means:
   - architecture may reference `Photon`, `Graviton`, `Gluon`, and `Impulse`
   - but only in order to explain architectural responsibility and domain-crossing logic
   - detailed channel semantics should remain concentrated in `docs/PROTOCOL.md`

   Remove or shorten any protocol detail that belongs only in `docs/PROTOCOL.md` if it overloads architectural readability.

10. Tighten the scope of `docs/PROTOCOL.md`.

    Ensure `docs/PROTOCOL.md` is clearly the detailed source for:

    - force channels
    - carrier subtypes
    - content of change
    - field/value-change protocol details
    - the gluon octet mapping

    But also ensure it does not contradict or outgrow ontology and architecture.

    In practice:
    - `docs/PROTOCOL.md` should deepen the system
    - it should not redefine the ontology into something incompatible with `docs/ONTOLOGY.md`
    - it should not silently change architectural contracts

11. Re-check `README.md` as the entry point.

    Ensure the README introduces the protocol layer in a way that is:
    - brief
    - correct
    - non-contradictory
    - not overloaded with deep protocol detail

    It should mention the existence and purpose of `PROTOCOL.md`, but the README must not become the place where protocol theory is defined.

12. Preserve the already-correct results.

    During cleanup, do not undo the following:

    - the three-domain model (`Dark`, `Boundary`, `Bulk`)
    - `Dark` as hidden structure, memory, history, and evolution
    - `Boundary` as fixation, flattening, canonicalization, and computation
    - `Bulk` as manifestation, execution, process, and observable form
    - the softened architecture reading of `Dark`
    - the distinction between common hidden source and domain-local runtime ownership
    - the rule that `Dark` is not a storage folder or runtime duplicate
    - the rule that `Boundary × Strong` remains responsible for deduplication and compact canonical form

13. Do a final terminology harmonization pass.

    Ensure the wording is stable and consistent for the following families of terms:

    - hidden structure / hidden organization / hidden causality
    - fixed state / state / transition / process
    - protocol channel / carrier / subtype / transfer unit
    - structured change / content of change / impulse
    - observed propagation / internal protocol / manifested consequence

    Reduce unnecessary synonym drift where it weakens precision.

# Constraints

- Do not revert the three-domain model.
- Do not turn `Impulse` into a carrier.
- Do not turn `Boson` into an extra force.
- Do not collapse all channels back into a single universal `Electromagnetism` channel.
- Do not erase `Gluon` unless the repository documentation already clearly justifies such a decision.
- Do not weaken the role of `Boundary × Strong` in canonicalization, deduplication, interning, and compaction.
- Do not let `docs/ARCHITECTURE.md` become a protocol-only document.
- Do not let `docs/PROTOCOL.md` silently redefine ontology or architecture.
- Do not introduce new domains, forces, or protocol entities in this task.
- Keep the style precise, declarative, and compatible with the current documentation tone.

# Communication

The user communicates in Russian.

When interacting with the user, always use Russian.

Task instructions and technical sections are written in English, but any direct communication with the user must be in Russian.

# Expected Result

After the task is completed:

- the documentation reads as one coherent final system across `README.md`, `docs/ONTOLOGY.md`, `docs/ARCHITECTURE.md`, and `docs/PROTOCOL.md`
- `Impulse` is consistently described as content/composition of change, not as a carrier
- `Electromagnetism` is consistently described as the force of observable transfer/spread
- `Boson` is consistently described as the general carrier/protocol type
- `Photon`, `Graviton`, and `Gluon` are consistently described as channel subtypes with non-overlapping roles
- `Graviton` clearly belongs to hidden/internal organization rather than visible transport metaphor
- `Boundary × Strong` still clearly owns deduplication and compact canonical form
- protocol detail is concentrated in `docs/PROTOCOL.md` without breaking ontology or architecture
- the MetaFor documentation reaches a stable near-final wording state suitable for further architectural work