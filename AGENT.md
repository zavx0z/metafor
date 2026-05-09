# MetaFor Agent Context

## Project Overview

MetaFor is an open-source environment for common AGI.
It treats intelligence not as an isolated model in a flat interface, but as a shared digital environment where people, agents, interfaces, memory, applications, devices, space, and action can coexist.

The current `arch` branch documentation is the source of truth.

## Communication

The user is Russian-speaking.
When communicating directly with the user, prefer Russian and use fewer unnecessary anglicisms in discussion.
Keep terminology accurate, but avoid English wording when a clear Russian equivalent exists.

## WebGPU Engine (`pkg/engine`)

The engine is a custom WebGPU renderer — no WebGL fallback.

**Coordinate system contract** (`pkg/engine/CONTRACT.md`):
- **Z-up, Right-Handed** — engineering / CAD convention (same as Blender)
- **+X** → right, **+Y** → depth (into screen), **+Z** → up
- **Unit**: 1 world unit = 1 mm. All positions, radii, distances, camera distances, and grid sizes must be in mm.
- **Depth clip space**: [0, 1] (WebGPU NDC).
- `store/db` stores data already in Z-up and mm. `bulk` and `app` layers must NOT re-convert axes or units — that belongs inside the engine layer only.

**Canvas**:
- One `HTMLCanvasElement` per `Renderer`, exposed as `renderer.canvas`.
- WebGPU context: `alphaMode: 'premultiplied'`.
- To capture a frame from JS: `renderer.canvas.toDataURL('image/png')`.
- Via `@meta/chrome` eval: `return document.querySelector('canvas').toDataURL('image/png')`.

**Key abstractions** (`pkg/engine/src/`):

| Class | File | Role |
|---|---|---|
| `Renderer` | `renderer/index.ts` | WebGPU device, pipelines, multi-pass render |
| `ViewPoint` | `core/ViewPoint.ts` | Unified camera + trackball (replaces Camera + OrbitControls) |
| `Object3D` | `core/Object3D.ts` | Base scene node: `position`, `rotation`, `quaternion`, `scale`, `modelMatrix`, `matrixWorld` |
| `Scene` | `scenes/Scene.ts` | Root scene graph container |
| `Mesh` | `core/Mesh.ts` | Geometry + material |
| `InstancedMesh` | `core/InstancedMesh.ts` | GPU instancing, one `Matrix4` per instance |
| `WireframeInstancedMesh` | `core/WireframeInstancedMesh.ts` | Instanced wireframe lines, per-instance color + glow |
| `BufferGeometry` | `core/BufferGeometry.ts` | GPU buffer attributes (position, normal, index) |

**Render pipelines** (all WGSL shaders in `renderer/shaders/`):
- `basicMeshPipeline` — flat color, no lighting
- `staticMeshPipeline` — Lambert diffuse lighting
- `instancedMeshPipeline` — instanced basic/Lambert
- `linePipeline` — single lines (basic or glow)
- `instancedLinePipeline` — instanced lines with glow
- `textStencilPipeline` / `textCoverPipeline` — 3D text

**When reading screenshots of the viewport**: Z is vertical (up). Positive Z = above ground. Grid aligns to XY plane. Camera trackball orbits around a target point. Distances on screen correspond to mm in world space.

## Core Architectural Reading

Always read the system as:

`Domain × Force × Entity`

The three fundamental domains are:

- `Dark` — hidden connectivity, memory, hierarchy, history, model evolution
- `Boundary` — flattening, fixation, canonicalization, state computation
- `Bulk` — manifestation, execution, process, volume, spatial form

Key invariants:

- `Dark`, `Boundary`, and `Bulk` are isolated domains.
- Production code must not use direct runtime imports across domains.
- Inter-domain communication belongs to protocol channels, not direct imports.
- `Boundary` is the flattening boundary.
- `Field` is the imprint layer after flattening and the bearer of values and differences.

## Required Reading Order

Before making code, architecture, or documentation changes:

1. Start with `README.md` or `README.ru.md`.
2. Read the relevant documents in `docs/`.
3. For architectural work, always review:
   - `docs/ONTOLOGY.md` / `docs/ONTOLOGY.ru.md`
   - `docs/ARCHITECTURE.md` / `docs/ARCHITECTURE.ru.md`
   - `docs/PROTOCOL.md` / `docs/PROTOCOL.ru.md`
   - `docs/DEVELOPMENT.md` / `docs/DEVELOPMENT.ru.md`

## Terminology Discipline

Always preserve the current `arch` terminology:

- `Dark`, `Boundary`, `Bulk`
- `Brane`, `Field`
- `State`, `Transition`, `Process`
- `Graviton`, `Photon`, `Gluon`, `Higgs boson`, `W boson`, `Z boson`
- `Impulse`
- `TAKT`

Do not replace these with older framework-era or `qTp` terms.

## Topology-Field Rules

Topology-fields are distinct from ordinary data-fields:

- `enum` is branch selection
- `array` is branch multiplicity and unfolding
- topology-field change goes through `Higgs boson`, not `Gluon`
- `array` does not participate in entanglement
- `array` changes only through the internal process of the atom via `State`

## Development Commands

Use the repository root for common tasks:

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run typegen`
- `bun run space:build`
- `bun run lint:md`

Prefer the smallest relevant verification for the files you change.

## Cross-Domain Rules

- Production code: direct imports across domains are forbidden.
- Test code: relative imports across domains are allowed for integration tests.
- Temporary test orchestration is allowed.
- Exporting one domain's internals as another domain's API is forbidden.

## Documentation Discipline

- Treat the current `arch` documentation as the source of truth.
- Preserve bilingual navigation on the public documentation surface.
- If documentation is edited, update both language versions immediately and keep them structurally mirrored.
- Prefer small, verifiable edits over large conceptual rewrites.

## Commit Discipline

- Treat the staged diff as the only source of truth for commit wording.
- Analyze only added and removed lines; file context is only for locating the change.
- Never describe code, methods, classes, or documents as changed if they are not touched in the diff.
- Prefer separate commits for separate concerns. Documentation and agent-rule changes should be committed separately from production code and tests unless they are inseparable.
- Classify changes by priority: `feat` -> `fix` -> `refactor` -> `type` -> `test` -> `docs`.
- Build the commit subject as `[type/type] scope - description` and keep it within 72 characters when possible.
- If multiple types are used, keep the description in the same semantic order as the types.
- Use repository-native scopes when possible: `dark`, `boundary`, `bulk`, `metafor`, `app`, `docs`, `agents`, `tests`, `repo`.
- Treat `package.json`, `bunfig.toml`, `tsconfig*`, scripts, and dependency updates as `refactor`-side changes unless the diff clearly introduces a new feature or fixes a bug.
- Treat `*.test.*` and `*.spec.*` changes as `test`; do not classify package or script changes as test fixes.
- When the user asks for a detailed commit description, format it in Markdown with sections only when they are non-empty:
  - `### Основные изменения:` for `feat`, `fix`, and behavior-relevant `type`
  - `### Улучшения кода:` for `refactor`, config, scripts, and dependencies
  - `### Исправления в тестах:` only when the diff touches `*.test.*` or `*.spec.*`
- For the actual `git commit`, use the one-line subject unless the user explicitly asks for an extended commit body.

## Contribution Context

Before changing architecture or semantics:

1. Preserve current `arch` terminology.
2. Explain architectural intent in plain language.
3. Link relevant documents or invariants when a change depends on ontology or architecture.
4. Keep public documentation bilingual.

See `CONTRIBUTING.md` and `CONTRIBUTING.ru.md` for repository guidance.
