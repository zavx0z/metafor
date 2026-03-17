# MetaFor — Project Context

## Project Overview

**MetaFor** is an open-source environment for common AGI (Artificial General Intelligence). It treats intelligence not as an isolated model in a flat interface, but as a **shared digital environment** where people, agents, interfaces, memory, applications, devices, space, and action can coexist.

### Core Philosophy

MetaFor is built on the assumption that intelligence becomes real through participation in a world — through memory, interfaces, processes, devices, language, visual forms, and practical action.

The architecture is organized around three fundamental **domains**:

| Domain | Role | Key Characteristics |
|--------|------|---------------------|
| **Dark** | Hidden connectivity, memory, hierarchy, history, model evolution | Particles (`Wimp`, `Fuzzy`, `Macho`, `Axion`), connectivity threads, schema history, fixed states |
| **Boundary** | Flattening, fixation, canonicalization, state computation | Imprint layer where connectivity receives addressable form as `Field` |
| **Bulk** | Manifestation, execution, process, volume, spatial form | Volumetric manifestation, actors, processes, execution |

### Key Architectural Invariants

1. **Domain Isolation**: `Dark`, `Boundary`, and `Bulk` are isolated domains that must not be direct production dependencies of each other
2. **Protocol-based Communication**: Inter-domain communication happens only through force channels (protocols), not direct imports
3. **Three-domain Reading**: The system is read as `Domain × Force × Entity`
4. **Bilingual Documentation**: All public documentation exists in both English and Russian

## Technology Stack

| Category | Technology |
|----------|------------|
| **Runtime** | [Bun](https://bun.sh/) (JavaScript/TypeScript runtime) |
| **Language** | TypeScript 5.9+ (ESNext, strict mode) |
| **Package Manager** | Bun (workspaces) |
| **Type Definitions** | `@types/bun`, `@types/node`, `@webgpu/types`, `bun-webgpu` |
| **Documentation** | Markdown (with `markdownlint` validation) |
| **API Documentation** | TypeDoc with module merging |

## Repository Structure

```
metafor/
├── dark/              # Dark domain: hidden connectivity, particles, threads
│   ├── gravity/       # Schema loading, path formation, connectivity structure
│   ├── strong/        # Cohesion, relation retention, connected flat form
│   ├── weak/          # Structural transformation, transition preparation
│   ├── em/            # Projection and export contracts
│   └── types/         # Domain type definitions
├── boundary/          # Boundary domain: flattening, fixation, canonicalization
│   ├── gravity/       # Geometry, index space, arrangement, flattening
│   ├── strong/        # Canonicalization, compaction, entanglement
│   ├── weak/          # State transition, weak change
│   └── em/            # Transfer, serialization, signal
├── bulk/              # Bulk domain: manifestation, execution
│   ├── gravity/       # Structural organization, hierarchy, addressability
│   ├── strong/        # Binding, entanglement projection
│   ├── weak/          # Process execution, continuation
│   └── em/            # Event delivery, signal propagation
├── metafor/           # Core DSL and AST contracts
│   ├── dsl/           # Declarative descriptions
│   └── ast/           # Serializable contracts
├── app/               # Applications
│   └── web/           # Web application
├── docs/              # Documentation (bilingual)
├── tests/             # Integration tests
├── fixture/           # Test fixtures
└── types/             # Shared type definitions
```

## Building and Running

### Prerequisites

- [Bun](https://bun.sh/) installed (latest version)

### Installation

```bash
bun install
```

### Development Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server (runs `@app/web dev`) |
| `bun run build` | Build `@metafor/dsl` package |
| `bun run typegen` | Generate types for `@metafor/dsl` |
| `bun run space:build` | Build `metafor.ts` with sourcemaps |
| `bun run lint:md` | Lint all Markdown files |
| `bun run upd` | Update all dependencies to latest |
| `bun run clear` | Clean all node_modules and rebuild |

### Workspace-specific Commands

```bash
# Build zavx0z packages
bun run zavx0z:build

# Watch mode for zavx0z packages
bun run zavx0z:watch

# Clean zavx0z build artifacts
bun run zavx0z:clean
```

## Development Conventions

### Architectural Terminology

Always preserve the current `arch` branch terminology:

- `Dark`, `Boundary`, `Bulk` — the three domains
- `Field` — bearer of values and differences
- `Brane` — bearer of configuration, state, and connectivity
- `State`, `Transition`, `Process` — entity types
- `Boson` subtypes: `Graviton`, `Photon`, `Gluon`, `Higgs boson`, `W boson`, `Z boson`
- `Impulse` — content of change (may be expressed as JSON Patch)
- `TAKT` — minimal quantum of system state and execution rhythm

### Cross-Domain Import Rules

| Context | Allowed? |
|---------|----------|
| Production code: direct imports across domains | ❌ Forbidden |
| Test code: relative imports across domains | ✅ Allowed (for integration tests) |
| Temporary test orchestration | ✅ Allowed |
| Exporting one domain's internals as another's API | ❌ Forbidden |

### Documentation Rules

1. **Bilingual Requirement**: When editing public documentation, update both English and Russian versions
2. **Navigation Preservation**: Keep top-level language switches between counterparts
3. **Small Edits**: Prefer small, verifiable edits over large conceptual rewrites
4. **Terminology Consistency**: Do not reintroduce older `qTp` framing as replacement for current terminology

### Code Style

- **Module System**: ES Modules (`"type": "module"`)
- **Module Resolution**: Bundler mode with `verbatimModuleSyntax`
- **Strictness**: Full strict mode enabled (`strict: true`)
- **Safety Flags**:
  - `noUncheckedIndexedAccess: true`
  - `noImplicitOverride: true`
  - `exactOptionalPropertyTypes: true`
  - `noFallthroughCasesInSwitch: true`

### Testing Practices

1. Run the smallest relevant verification for changed files
2. For Markdown: `bun run lint:md`
3. For code: targeted checks in affected workspace
4. Integration tests may use relative imports across domains
5. Test-only infrastructure may include reset/snapshot operations (not for production)

## Key Entities and Forces

### Four Universal Forces

| Force | Channel (Boson) | Responsibility |
|-------|-----------------|----------------|
| **Gravity** | `Graviton` | Hidden organization, addressability, schema relations |
| **Electromagnetism** | `Photon` | Observable propagation, state transport |
| **Strong** | `Gluon` | Retention, cohesion, stability, ordinary field changes |
| **Weak** | `W boson`, `Z boson` | Transition, mutation, transformation, state evolution |

### Topology-Fields (Higgs)

Topology-fields are distinct from ordinary data-fields:

- `enum` — branch selection (not just bounded literals)
- `array` — branch multiplicity and unfolding (not ordinary collections)
- Changed via `Higgs boson` (not `Gluon`)
- `array` does not participate in entanglement
- `array` changes only through internal atom process via `State`

### Identity vs Index

| Concept | Purpose | Scope |
|---------|---------|-------|
| **UUID** | Stable identity | Persists across `Dark`, `Boundary`, `Bulk` |
| **Index** | Runtime address | Local geometric address in `Boundary` or `Bulk` |

## Current Project Status

MetaFor is in **open architectural formation stage**. The ontology and architecture documented in the `arch` branch are current, but the project is not yet presented as a stable production platform.

### Development Mode

Until full inter-domain protocols exist:

1. Domains are developed and tested separately
2. End-to-end verification happens only in integration tests
3. No premature protocol design before domain logic is stable
4. Temporary test orchestration is acceptable but must not become production norm

## Documentation Index

| Document | Purpose |
|----------|---------|
| [PHILOSOPHY.md](docs/PHILOSOPHY.md) | Project worldview, role of metaphor as architectural discipline |
| [ONTOLOGY.md](docs/ONTOLOGY.md) | What exists in MetaFor: domains, forces, entities |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Domain responsibilities, invariants, repository projection |
| [TOPOLOGY.md](docs/TOPOLOGY.md) | Hidden connectivity in `Dark`: particles and threads |
| [PROTOCOL.md](docs/PROTOCOL.md) | Forces, bosonic channels, transport form of change |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Current practical development mode |

## Contributing

Before contributing:

1. Read relevant docs (especially Ontology, Architecture, Development)
2. Preserve current `arch` terminology
3. Keep documentation bilingual for public entries
4. Explain architectural intent in plain language
5. Link relevant documents when changes depend on ontology/architecture

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidance.

## License

GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
