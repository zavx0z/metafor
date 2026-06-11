# MetaFor Agent Context

## Project Overview

MetaFor is an open-source environment for common AGI.
It treats intelligence not as an isolated model in a flat interface, but as a shared digital environment where people, agents, interfaces, memory, applications, devices, space, and action can coexist.

The current `arch` branch documentation is the source of truth.
Для существенной работы также читай `AGENT_MEMORY.ru.md` как долговечный живой контекст текущего стартового доведения.

## Живой общий контекст

Контекстное окно чата временное: оно может сжиматься или теряться.
Не считай текущий диалог долговечной памятью работы.
Долговечная общая память должна жить в репозитории, состоянии интерпретатора, патчах, снапшотах, истории процессов, документации и agent-правилах.

Когда пользователь уточняет фундаментальную идею, которая влияет на дальнейшую разработку, закрепляй ее маленьким патчем в ближайшем долговечном слое, а не оставляй только в текущем разговоре.
Предпочтительный порядок:

1. `AGENT.md` - правила, которые будущие агенты обязаны соблюдать.
2. `AGENT_MEMORY.ru.md` - живая память текущего стартового доведения.
3. `docs/` - публичные или архитектурные объяснения.
4. Package-local `AGENTS.md` / docs - поведение конкретного пакета.
5. Состояние интерпретатора, процессы, снапшоты или тесты - когда знание является исполняемым поведением.

Каждое обновление должно быть фактическим, коротким и применимым к дальнейшей работе.
Не превращай живую память в стенограмму.

## Текущая модель совместной работы

Пользователь и агент находятся в одной живой среде разработки.
Пользователь может редактировать, запускать, смотреть и менять контекст напрямую; агент не является внешним оператором, работающим отдельно.

Голосовой ввод является частью этой общей среды.
Повторы и исправления нужно читать как живой устный поток: последнее уточнение важнее предыдущей формулировки.

Интерпретатор - не просто временный UI и не просто отладчик.
Это первый рабочий interpreter world: общий живой контекст, где source, runtime, fields, state, actions, patches, terminal output, breakpoints и внимание к процессу можно наблюдать и менять без глобальной остановки системы.

Разработку MetaFor нужно читать через физику полей и контекста, а не через выполнение команд как первичную модель:

`значения полей -> контекст -> состояние -> переход -> процесс -> новые значения полей`

В этой модели агент не должен мыслить прежде всего командами вроде "сделай задачу X".
Он должен мыслить созданием или изменением условий в контексте, при которых нужный процесс может протекать.

## Дисциплина непрерывной памяти

Во время существенной работы держи короткое рабочее понимание того, что стало яснее про MetaFor.
Если это понимание меняет будущие инженерные решения, обнови долговечную память в той же рабочей сессии.

Цикл:

1. Прочитать текущий долговечный контекст перед архитектурными или смысловыми изменениями.
2. Работать через interpreter/API/source так, как требует активный контекст.
3. Когда становится понятен новый инвариант, исправление или практика, записать минимальный долговечный патч.
4. Проверить, что патч виден в том месте, которое будут читать будущие агенты.
5. Продолжать разработку из обновленного контекста, а не из памяти текущего чата.

Не говори, что система только "пытается" это сделать, если репозиторий или контекст пользователя говорят, что основание уже реализовано и сейчас связывается, уточняется или доводится до связного стартового состояния.

## Interpreter API Edit Discipline

When the interpreter is running or the work is happening inside the interpreter/debugger session, do not edit repository files by habit with local patching tools. Assume the interpreter API is available by default; use `/context` or the relevant `/processes/:id/...` endpoint and map the target file to the active process/display/source context. Do not call `/health` as routine preflight.

If the target file belongs to an active process, an open interpreter source, or the current shared debugging context, edits must go through the interpreter API only:

- `POST /processes/:id/apply_patch` for raw patches;
- `POST /processes/:id/source` for full source replacement.

Before every such edit, state the route being used: `Правлю через interpreter API: <processId>`. Do not use local `apply_patch`, `sed`, shell writes, editor writes, or formatter writes for those files. Use local edits only after explicitly confirming the file is outside the active interpreter context or when the interpreter API cannot address that file and the user accepts the fallback. Use `/health` only as diagnostics after an API failure, missing process, restart/close, or unknown context.

## Communication

The user is Russian-speaking.
When communicating directly with the user, prefer Russian and use fewer unnecessary anglicisms in discussion.
Keep terminology accurate, but avoid English wording when a clear Russian equivalent exists.

## Local Browser Discipline

- Reuse the existing Google Chrome window and active tab for local inspection unless the user explicitly asks for a new tab, a new window, or a separate profile.
- For local URLs, prefer `@meta/chrome` `POST /navigate` on the current tab. Do not launch Chrome with `--app`, `--new-window`, or a temporary `--user-data-dir` for ordinary checks.
- Before opening anything in Chrome, inspect existing windows/tabs through `@meta/chrome` and carry the selected `windowId`/`tabIndex` through later calls.
- Do not use Puppeteer, Playwright, or other browser automation libraries for local browser work. Use the `@meta/chrome`, `@meta/screen`, and related REST APIs instead.
- If the browser REST services are unavailable, report that blocker and do not fall back to Puppeteer or Playwright.
- Do not start a separate CDP Chrome profile (`bun run cdp`) unless CDP-only functionality is required and the user approves it.
- If duplicate app-mode Chrome instances already exist, report them and ask before closing or killing any process.

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

## Interpreter Editing Rule

Когда человек и агент совместно работают над кодом, который открыт или запущен в интерпретаторе, все изменения этого кода выполняются **только через API интерпретатора**. Это строгое правило, а не рекомендация.

- `POST /processes/:id/apply_patch` для raw `apply_patch`;
- `POST /processes/:id/source` для сохранения полного текста source.

Перед правкой кода сначала прочитай `GET /context` и определи текущий `processId` и `source.identity.sourceUrl` / `source.identity.scriptUrl`. Если файл относится к текущему process/display или открыт в source интерпретатора, не правь его локальным `apply_patch`, `sed`, редактором, форматтером или shell-write командой в обход интерпретатора.

После правки через API проверь, что интерпретатор получил изменение: `source-patched`, replay/restart при необходимости, новый `/context` или `GET /processes/:id/source`.

Иначе интерпретатор не видит patch-flow, не обновляет breakpoints, source-patched/replay и текущий runtime/source context.

Обычные локальные инструменты можно использовать для документации, правил, внешних meta-файлов и кода, который не является текущим совместно отлаживаемым process.

## TODO Discipline

Если агент завершил пункт из `TODO.md`, он обязан отметить этот пункт выполненным в TODO-списке и убедиться, что обновление видно в HUD ToDoPane или в `/context.hud.todo`. Нельзя оставлять выполненную работу как незакрытый пункт.

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
