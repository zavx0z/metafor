## Goal

Implement a complete entanglement pipeline from `bulk.gravity` AST to `Matrix` so that:

- `bulk.gravity` becomes the upstream source of actor connectivity and entanglement structure,
- the parsed gravity tree is flattened into a connectivity-preserving actor graph,
- `strong` builds entanglement blocks from that flattened graph,
- `boundary` receives only a prepared shared-fields projection,
- `boundary/fields` stops owning entanglement discovery and only materializes prepared blocks into execution-ready data for `Matrix`.

## Context

The current architecture places entanglement ownership too low in the stack. Right now `boundary/fields/entangled.ts` derives entangled groups from field-value equality and then builds shared/local mappings from that late-stage comparison. This makes `boundary/fields` the owner of entanglement origin, which conflicts with the project ontology and with the intended separation of responsibilities.  [oai_citation:4‡entangled.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/fields/entangled.ts)

Project ontology and repository docs establish these important boundaries:

- `Bulk.gravity` is the manifestation of actor hierarchy through `<meta-for>`, not merely a visual HTML template.  [oai_citation:5‡README.md](https://github.com/zavx0z/metafor/blob/arch/README.md)  [oai_citation:6‡ONTOLOGY.md](https://github.com/zavx0z/metafor/blob/arch/ONTOLOGY.md)
- `Boundary` is the field/mechanics layer and must not own semantic origin or structural meaning.  [oai_citation:7‡README.md](https://github.com/zavx0z/metafor/blob/arch/README.md)  [oai_citation:8‡ONTOLOGY.md](https://github.com/zavx0z/metafor/blob/arch/ONTOLOGY.md)
- Earlier entanglement planning already points toward moving entanglement origin upstream from `boundary/fields`, even though that planning is outdated in some details.  [oai_citation:9‡entangled-plan.md](https://github.com/zavx0z/metafor/blob/arch/tasks/entangled-plan.md)

For this task, the entanglement model must follow these clarified project decisions:

- entanglement originates from `bulk.gravity`,
- `mass` does **not** participate in entanglement for this task,
- `weak` is out of scope and must not be changed,
- regular HTML nodes (`div`, `span`, text, styles, events, visual-only structure) must not participate in the entanglement model,
- only actor-relevant parts of parsed `gravity` are relevant:
  - `meta` nodes,
  - `logical` / `condition` / `map` scopes,
  - `fields` dependencies,
  - actor hierarchy,
  - connectivity derived from gravity structure.

The repository already provides the upstream ingredients:

- MetaFor DSL compiles `bulk.gravity` through `parse(...)` into a template AST.  [oai_citation:10‡metafor.ts](https://github.com/zavx0z/metafor/blob/arch/metafor/dsl/metafor.ts)  [oai_citation:11‡index.ts](https://github.com/zavx0z/metafor/blob/arch/metafor/template/index.ts)
- Parsed template nodes already encode data paths and expressions for `meta`, `logical`, and `map` structures.  [oai_citation:12‡index.ts](https://github.com/zavx0z/metafor/blob/arch/metafor/template/index.ts)  [oai_citation:13‡parser.ts](https://github.com/zavx0z/metafor/blob/arch/metafor/template/parser.ts)  [oai_citation:14‡meta.ts](https://github.com/zavx0z/metafor/blob/arch/metafor/template/node/meta.ts)  [oai_citation:15‡logical.ts](https://github.com/zavx0z/metafor/blob/arch/metafor/template/node/logical.ts)  [oai_citation:16‡map.ts](https://github.com/zavx0z/metafor/blob/arch/metafor/template/node/map.ts)
- Current `force/force.ts` still assembles branes and sends them directly to `fieldsWrite(...)`, without an upstream entanglement-preparation stage.  [oai_citation:17‡force.ts](https://github.com/zavx0z/metafor/blob/arch/force/force.ts)

The required architectural correction is therefore:

`bulk.gravity AST -> flattened gravity connectivity graph -> strong entanglement blocks -> boundary shared-fields projection -> fields materialization -> prepared matrix input`

## Required Actions

1. Inspect and trace the current execution path from MetaFor DSL to `Matrix`, including at minimum:
   - `metafor/dsl/metafor.ts`,
   - `metafor/template/*`,
   - actor-relevant parsed gravity structures,
   - `force/force.ts`,
   - `boundary/fields/*`,
   - any preparation/materialization path that produces execution input for `Matrix`.

2. Introduce a dedicated actor-only gravity extraction layer above `force` that transforms parsed `bulk.gravity` AST into a flattened connectivity-preserving structure.

   This extraction layer must:
   - read only actor-relevant nodes from parsed gravity,
   - ignore regular HTML element nodes and visual-only template content,
   - preserve structural scopes from `logical`, `condition`, and `map`,
   - preserve actor manifestation only from `meta` nodes,
   - preserve actor hierarchy and connectivity,
   - preserve field-origin relationships needed to derive entanglement.

3. Define and implement a stable flattened gravity structure contract that is sufficient for entanglement construction in `strong`.

   The flattened structure must include, at minimum:
   - gravity scopes,
   - flattened actor/manifests,
   - connectivity links,
   - field-origin or field-propagation information required to group entanglement.

   The structure must not include:
   - regular HTML presentation nodes,
   - `mass`,
   - backend-specific layout/materialization details.

4. Make the flattening step explicitly preserve connectivity rather than producing a disconnected flat list.

   The flattened result must preserve enough structure to answer:
   - which actor node came from which gravity scope,
   - which actor node is parent/child to which other actor,
   - which actors are connected by gravity hierarchy, conditional manifestation, iteration, or projection,
   - which field paths participate in those links.

5. Implement entanglement block construction inside `strong`, using the flattened gravity structure as input.

   `strong` must:
   - build semantic/stable entanglement blocks,
   - determine which flattened actor nodes belong to the same entanglement block,
   - determine which fields are shared inside each block,
   - remain independent of heap/layout/materialization logic,
   - avoid late-stage equality-based discovery from `boundary/fields`.

6. Define and implement a boundary projection step from strong-level entanglement blocks to a boundary-ready shared-fields representation.

   This projection must:
   - map entanglement blocks to boundary-level actor/brane membership,
   - convert shared field paths or names into field ids required downstream,
   - contain only the minimal information required for `boundary/fields` materialization,
   - exclude source-of-truth semantics about why the entanglement exists.

7. Refactor `boundary/fields` so that it no longer discovers entanglement by itself.

   Specifically:
   - remove `findEntangledGroups(values)` from the role of entanglement source-of-truth,
   - keep `boundary/fields` responsible for:
     - validation,
     - shared/local mapping,
     - heap/build,
     - packing,
     - prepared execution structures,
   - make it consume the prepared boundary entanglement projection instead of inferring entanglement from raw values.

8. Preserve the existing downstream execution architecture after the entanglement projection point.

   The path from prepared boundary input to `Matrix` must remain mechanically correct, but shared blocks must now come from upstream entanglement blocks rather than from local equality discovery.

9. Update `force/force.ts` and any adjacent preparation code so that the runtime path becomes:

   - assemble actor-relevant gravity source,
   - flatten gravity into a connectivity graph,
   - build entanglement blocks in `strong`,
   - project them into boundary-ready shared-field blocks,
   - pass the resulting prepared input into the existing `boundary` write/materialization path.

10. Add or update tests that verify the new architecture at the right boundaries.

    Cover at least:
    - parsed gravity -> actor-only flattened structure,
    - preservation of connectivity in the flattened graph,
    - construction of entanglement blocks in `strong`,
    - absence of entanglement ownership in `boundary/fields`,
    - correct materialization of shared blocks into execution-ready data,
    - end-to-end path from gravity-derived entanglement to prepared matrix input.

11. Keep the implementation iterative internally, but complete enough that the repository ends up with a working architectural path, not just scaffolding.

    The final local state after this task must already contain:
    - the flattening layer,
    - strong-level entanglement blocks,
    - boundary projection,
    - fields materialization consuming prepared entanglement input.

## Constraints

- Do not involve `mass` in entanglement for this task.
- Do not change or extend `weak`.
- Do not include regular HTML nodes or visual presentation structures in the entanglement model.
- Do not keep `boundary/fields` as the owner of entanglement discovery.
- Do not reintroduce value-equality discovery as the fundamental source of entanglement.
- Do not mix semantic entanglement origin with heap/layout/backend-specific details.
- Do not over-expand the task into unrelated ontology or bulk-runtime redesign.
- Do not break the existing level separation between `Bulk`, `Force`, and `Boundary`.
- Do not push backend-specific concerns into the flattened gravity structure or into `strong`.
- Do not treat the flattened structure as a generic UI AST; it is an actor-connectivity model only.
- Keep changes minimal but structurally complete for the path `gravity AST -> strong -> boundary -> Matrix`.

## Expected Result

After completion, the project should have a working upstream entanglement architecture with these properties:

- `bulk.gravity` is effectively treated as the source of actor entanglement structure,
- parsed gravity is transformed into a flattened actor-only structure that preserves connectivity,
- the flattened structure contains the information needed to derive entanglement without relying on late equality checks,
- `strong` constructs entanglement blocks from the flattened gravity structure,
- `boundary` receives only a prepared shared-fields projection of those blocks,
- `boundary/fields` no longer invents entanglement from raw values and instead only validates and materializes the prepared model,
- shared blocks that reach heap/prepared execution data originate from upstream gravity-derived entanglement rather than from local discovery in `fields`,
- the final prepared execution path still ends in valid input for `Matrix`,
- `mass`, `weak`, and regular HTML content remain outside the scope of this entanglement implementation,
- the repository ends up in a state where this entanglement path is executable and testable locally from gravity AST down to matrix preparation.
