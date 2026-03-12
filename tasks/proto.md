# Goal

Restructure and polish the protocol documentation so that:

- `docs/PROTOCOL.md` remains the single root entry point of the protocol layer
- detailed protocol documents are moved into `docs/proto/`
- `docs/proto/` contains only force-specific files
- links across the documentation are cleaned up and stabilized
- the protocol layer becomes easier to navigate without changing its conceptual model

# Context

The protocol model is already stable and should not be redesigned.

The current conceptual model already includes:

- `Dark`, `Boundary`, `Bulk`
- `Boson` as the general carrier/channel type
- `Impulse` as the content of change
- the force/channel symmetry:
  - `Gravity -> Graviton`
  - `Electromagnetism -> Photon`
  - `Strong -> Gluon`
  - `Weak -> W boson / Z boson`

The remaining work is structural and editorial.

The intended documentation model is:

- `docs/PROTOCOL.md` stays the main protocol document
- `docs/proto/` contains only detailed documents by force
- `docs/PROTOCOL.md` explains the protocol layer as a whole and links to those detailed documents
- no second protocol entry point should be created inside `docs/proto/`
- no non-force files should be added inside `docs/proto/`

# Required Actions

1. Create a dedicated protocol subdirectory under `docs/` named exactly:

   `docs/proto/`

   Do not use `Proto/`.
   Do not use `protocol/`.

2. Keep `docs/PROTOCOL.md` as the only root entry point of the protocol layer.

   Do not delete it.
   Do not reduce it to an empty stub.
   Do not create another overview-style entry point inside `docs/proto/`.

   After restructuring, `docs/PROTOCOL.md` must remain the primary protocol document that:

   - explains what the protocol layer is
   - defines the relation between force, `Boson`, channel subtype, and `Impulse`
   - presents the global symmetry:
     - `Gravity -> Graviton`
     - `Electromagnetism -> Photon`
     - `Strong -> Gluon`
     - `Weak -> W boson / Z boson`
   - points to the detailed force documents inside `docs/proto/`

3. Create the detailed protocol structure under `docs/proto/`.

   The target structure should be exactly:

   ```text
   docs/
     PROTOCOL.md
     proto/
       gravity.md
       electromagnetism.md
       strong.md
       weak.md

Do not create:
 • docs/proto/README.md
 • docs/proto/boson.md
 • any other extra overview file inside docs/proto/

 4. Keep the general protocol abstraction in docs/PROTOCOL.md.
docs/PROTOCOL.md must remain the place where the following are defined centrally:
 • the purpose of the protocol layer
 • the distinction between force and channel
 • Boson as the general carrier/channel type
 • Impulse as the content of change
 • the global symmetry of forces and channels
 • the relation between the protocol layer and ontology/architecture
These concepts must not be moved out into separate non-force files inside docs/proto/.
 5. Create docs/proto/gravity.md.
This file should focus only on the gravity interaction:
 • Gravity
 • Graviton
 • hidden organization
 • addressability
 • internal geometric/structural protocol
 • how gravity is read across Dark, Boundary, and Bulk
 6. Create docs/proto/electromagnetism.md.
This file should focus only on the electromagnetic interaction:
 • Electromagnetism
 • Photon
 • observable spread / signaling
 • transfer of State
 • boundary-visible and manifested propagation
 • how electromagnetic transport is read across Dark, Boundary, and Bulk
 7. Create docs/proto/strong.md.
This file should focus only on the strong interaction:
 • Strong
 • Gluon
 • change of Field values
 • cohesion / holding
 • relation to canonical structure
 • explicit preservation of the rule that Boundary × Strong still owns canonicalization, deduplication, interning, and compaction
The gluon-octet material may live in this file as a dedicated section or subsection.
Do not split it into a separate file unless explicitly requested later.
 8. Create docs/proto/weak.md.
This file should focus only on the weak interaction:
 • Weak
 • W boson
 • Z boson
 • transition / passage / mutation / mediation
 • the distinction between active transition and neutral transition mediation
 • how weak-channel transition is read across Dark, Boundary, and Bulk
 9. Refactor docs/PROTOCOL.md into a clean overview document.
Keep in it:
 • protocol-layer purpose
 • the distinction between force, Boson, subtype, and Impulse
 • the global symmetry
 • a short summary of each force interaction
 • links to:
 • ./proto/gravity.md
 • ./proto/electromagnetism.md
 • ./proto/strong.md
 • ./proto/weak.md
Move heavy force-specific detail out of the root file.
Do not turn docs/PROTOCOL.md into a mere link list.
It must still explain the protocol layer as a whole.
 10. Clean up links across the documentation.
Review and correct links in at least:
 • README.md
 • docs/ONTOLOGY.md
 • docs/ARCHITECTURE.md
 • docs/PROTOCOL.md
Ensure all protocol references are updated to the new structure.
Also fix the visible text of links so it is clean and not awkward.
Examples of what must be avoided:
 • duplicated directory prefixes in visible link text
 • visible text that says docs/... when the local document is already inside docs/
 • links that technically work but read poorly
 • inconsistent path display between documents
 11. Add and follow a stable link discipline during this task.
While editing links, apply these rules consistently:
 • visible link text should describe the document naturally, not expose awkward path repetition
 • relative paths must be correct from the location of the current file
 • local links inside docs/ must be written with awareness of current file depth
 • the same target document should not be referred to with inconsistent visible naming across files
 • after restructuring, no outdated path references must remain
The result should not only fix current link mistakes but also establish a stable pattern for future documentation edits.
 12. Preserve the current conceptual model.
During restructuring, do not change the already-stabilized meanings of:
 • Dark, Boundary, Bulk
 • Boson
 • Impulse
 • Photon
 • Graviton
 • Gluon
 • W boson
 • Z boson
 • Boundary × Strong
This task is about structure and clarity, not ontology redesign.

Constraints
 • Do not remove docs/PROTOCOL.md.
 • Do not create docs/proto/README.md.
 • Do not create docs/proto/boson.md.
 • docs/proto/ must contain only force-specific files.
 • Do not turn docs/PROTOCOL.md into only a directory listing.
 • Do not duplicate heavy force-specific explanations both in docs/PROTOCOL.md and in docs/proto/*.md.
 • Do not let docs/proto/*.md redefine ontology or architecture.
 • Do not weaken the force/channel symmetry already established.
 • Do not change the three-domain model.
 • Do not turn Impulse into a carrier.
 • Do not turn Boson into a force.
 • Do not weaken Boundary × Strong as the owner of canonicalization, deduplication, interning, and compaction.
 • Keep the documentation style precise, declarative, and consistent with the existing docs tone.

Communication

The user communicates in Russian.

When interacting with the user, always use Russian.

Task instructions and technical sections are written in English, but any direct communication with the user must be in Russian.

Expected Result

After the task is completed:
 • docs/PROTOCOL.md remains the main entry point for the protocol layer
 • a new docs/proto/ directory exists for detailed force-specific protocol documents
 • docs/proto/ contains only:
 • gravity.md
 • electromagnetism.md
 • strong.md
 • weak.md
 • general protocol concepts such as Boson, Impulse, and the overall symmetry remain centralized in docs/PROTOCOL.md
 • links across README.md, ontology, architecture, and protocol are corrected and stable
 • visible link text is cleaner and no longer contains awkward path mistakes
 • the protocol documentation becomes structurally scalable without changing the already-stabilized model
