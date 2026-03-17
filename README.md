# MetaFor

<div align="center">
  <img src="shared/img/metafor.gif" alt="MetaFor animated overview" width="444" />
</div>

**English** | [Русский](README.ru.md)

MetaFor is an open-source environment for common AGI. It treats intelligence not as an isolated model in a flat interface, but as a shared environment where people, agents, interfaces, memory, applications, devices, space, and action can coexist.

## Purpose

MetaFor is built as a common digital environment rather than another closed AI tool.
Its working assumption is that intelligence becomes real through participation in a world: through memory, interfaces, processes, devices, language, visual forms, and practical action.

The current `arch` branch is the active source of truth for this architecture.
Its central discipline is the distinction between:

- `Dark` as hidden connectivity, historical continuity, structured change, and model evolution,
- `Boundary` as the flattening boundary where connectivity receives an addressable imprint as `Field`,
- `Bulk` as manifested execution, composition, process, and spatial form.

## Status

MetaFor is in an open architectural formation stage.
The ontology and architecture documented in this branch are current, but the project is not presented as a stable production platform yet.

## Documentation

The public documentation layer is bilingual.
Each public document links to its English and Russian counterpart.

- [Philosophy](docs/PHILOSOPHY.md) explains the project worldview and the role of metaphor as architectural discipline.
- [Ontology](docs/ONTOLOGY.md) defines what exists in MetaFor across `Dark`, `Boundary`, and `Bulk`.
- [Architecture](docs/ARCHITECTURE.md) maps the ontology into domain responsibilities, invariants, and repository projection.
- [Topology](docs/TOPOLOGY.md) formalizes hidden connectivity in `Dark` through connectivity particles and connectivity threads.
- [Protocol](docs/PROTOCOL.md) explains forces, bosonic channels, and the transport form of change.
- [Development](docs/DEVELOPMENT.md) records the current practical development mode before full inter-domain protocols exist.

## Participation Paths

### For learning and discussion

If you want to better understand MetaFor, discuss its ideas, architecture, infrastructure, comparisons with physics, cosmology, neural networks, AGI, and related directions, or bring your own questions and proposals, use [Discussions](https://github.com/zavx0z/metafor/discussions).

### For contribution and delivery

If you want to define a concrete task, discuss a specific change, or join the practical work of the project, use [Issues](https://github.com/zavx0z/metafor/issues) and the active [Project](https://github.com/zavx0z/metafor/projects/2).

- [Issues](https://github.com/zavx0z/metafor/issues) — for concrete tasks, problems, bug reports, changes, and expected result boundaries.
- [Project](https://github.com/zavx0z/metafor/projects/2) — for current task state, priorities, and delivery flow.

## Development Entry

MetaFor is organized as a Bun workspace repository.
For local work, start from the root:

- `bun install`
- `bun run dev`
- `bun run lint:md`

When changing architecture or documentation, use the current `arch` terminology and keep `Dark`, `Boundary`, `Bulk`, `Field`, and the protocol channels semantically stable.

## Contributing

Contribution guidance is intentionally minimal and tied to the repository as it exists today.
Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

MetaFor is an original long-term project created and developed by [Vladimir Filipenko (zavx0z)](https://career.habr.com/zavx0z).

## License

MetaFor is licensed under [GNU Affero General Public License v3.0 or later](LICENSE).
