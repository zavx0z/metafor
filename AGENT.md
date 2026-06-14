# Контекст агента MetaFor

## Обзор проекта

MetaFor - open-source среда для общего AGI.
Она рассматривает интеллект не как изолированную модель в плоском интерфейсе, а как общую цифровую среду, где люди, агенты, интерфейсы, память, приложения, устройства, пространство и действие могут сосуществовать.

Текущая документация ветки `arch` является источником истины.
Для существенной работы также читай `AGENT_MEMORY.md` как долговечный живой контекст текущего стартового доведения.

## Живой общий контекст

Контекстное окно чата временное: оно может сжиматься или теряться.
Не считай текущий диалог долговечной памятью работы.
Долговечная общая память должна жить в репозитории, состоянии интерпретатора, патчах, снапшотах, истории процессов, документации и agent-правилах.

Когда пользователь уточняет фундаментальную идею, которая влияет на дальнейшую разработку, закрепляй ее маленьким патчем в ближайшем долговечном слое, а не оставляй только в текущем разговоре.
Предпочтительный порядок:

1. `AGENT.md` - правила, которые будущие агенты обязаны соблюдать.
2. `AGENT_MEMORY.md` - живая память текущего стартового доведения.
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

## Дисциплина правок через Interpreter API

Когда интерпретатор запущен или работа идёт внутри interpreter/debugger session, не редактируй файлы репозитория по привычке локальными patch-инструментами. По умолчанию считай, что interpreter API доступен; используй `/context` или нужный endpoint `/processes/:id/...` и сопоставляй целевой файл с активным process/display/source context. Не вызывай `/health` как обычный preflight.

Если целевой файл относится к активному процессу, открытому source интерпретатора или текущему общему debugging context, правки должны идти только через interpreter API:

- `POST /processes/:id/apply_patch` for raw patches;
- `POST /processes/:id/source` for full source replacement.

Перед каждой такой правкой явно называй маршрут: `Правлю через interpreter API: <processId>`. Не используй локальный `apply_patch`, `sed`, shell-write, редактор или formatter для этих файлов. Локальные правки допустимы только после явного подтверждения, что файл вне активного interpreter context, или когда interpreter API не может адресовать этот файл и пользователь принимает fallback. `/health` используй только как диагностику после API failure, отсутствующего process, restart/close или неизвестного context.

## Общение

Пользователь говорит по-русски.
В прямом общении с пользователем предпочитай русский язык и избегай лишних англицизмов.
Терминологию сохраняй точной, но не используй английскую формулировку там, где есть ясный русский эквивалент.

## Дисциплина локального браузера

- Используй существующее окно Google Chrome и активную вкладку для локальной проверки, если пользователь явно не попросил новую вкладку, новое окно или отдельный профиль.
- Для локальных URL предпочитай `@meta/chrome` `POST /navigate` в текущей вкладке. Не запускай Chrome с `--app`, `--new-window` или временным `--user-data-dir` для обычных проверок.
- Перед открытием чего-либо в Chrome проверь существующие окна/вкладки через `@meta/chrome` и дальше используй выбранные `windowId`/`tabIndex`.
- Не используй Puppeteer, Playwright или другие browser automation libraries для локальной работы с браузером. Используй `@meta/chrome`, `@meta/screen` и связанные REST API.
- Если browser REST services недоступны, сообщи об этом blocker-е и не переходи на Puppeteer или Playwright.
- Не запускай отдельный CDP Chrome profile (`bun run cdp`), если CDP-only функциональность не нужна и пользователь не одобрил это.
- Если уже есть дублирующиеся app-mode Chrome instances, сообщи о них и спроси перед закрытием или kill process.

## WebGPU Engine (`pkg/engine`)

Engine - кастомный WebGPU renderer без WebGL fallback.

**Контракт системы координат** (`pkg/engine/CONTRACT.md`):
- **Z-up, Right-Handed** - инженерная / CAD convention, как в Blender.
- **+X** -> вправо, **+Y** -> глубина в экран, **+Z** -> вверх.
- **Unit**: 1 world unit = 1 mm. Все позиции, радиусы, расстояния, camera distances и grid sizes должны быть в mm.
- **Depth clip space**: [0, 1] (WebGPU NDC).
- `store/db` хранит данные уже в Z-up и mm. Слои `bulk` и `app` не должны повторно конвертировать оси или единицы; это относится только к engine layer.

**Canvas**:
- Один `HTMLCanvasElement` на `Renderer`, доступный как `renderer.canvas`.
- WebGPU context: `alphaMode: 'premultiplied'`.
- Захват кадра из JS: `renderer.canvas.toDataURL('image/png')`.
- Via `@meta/chrome` eval: `return document.querySelector('canvas').toDataURL('image/png')`.

**Ключевые абстракции** (`pkg/engine/src/`):

| Class | File | Роль |
|---|---|---|
| `Renderer` | `renderer/index.ts` | WebGPU device, pipelines, multi-pass render |
| `ViewPoint` | `core/ViewPoint.ts` | Единая camera + trackball вместо Camera + OrbitControls |
| `Object3D` | `core/Object3D.ts` | Базовый scene node: `position`, `rotation`, `quaternion`, `scale`, `modelMatrix`, `matrixWorld` |
| `Scene` | `scenes/Scene.ts` | Root container scene graph |
| `Mesh` | `core/Mesh.ts` | Geometry + material |
| `InstancedMesh` | `core/InstancedMesh.ts` | GPU instancing, один `Matrix4` на instance |
| `WireframeInstancedMesh` | `core/WireframeInstancedMesh.ts` | Instanced wireframe lines, per-instance color + glow |
| `BufferGeometry` | `core/BufferGeometry.ts` | GPU buffer attributes: position, normal, index |

**Render pipelines**: все WGSL shaders лежат в `renderer/shaders/`.
- `basicMeshPipeline` - flat color без lighting.
- `staticMeshPipeline` - Lambert diffuse lighting.
- `instancedMeshPipeline` - instanced basic/Lambert.
- `linePipeline` - одиночные lines, basic или glow.
- `instancedLinePipeline` - instanced lines with glow.
- `textStencilPipeline` / `textCoverPipeline` - 3D text.

**При чтении screenshot-ов viewport-а**: Z вертикален и направлен вверх. Положительный Z находится над ground. Grid выровнен по XY plane. Camera trackball вращается вокруг target point. Расстояния на экране соответствуют mm в world space.

## Базовое архитектурное чтение

Всегда читай систему как:

`Domain × Force × Entity`

Три базовых домена:

- `Dark` - скрытая связность, память, иерархия, история, эволюция модели.
- `Boundary` - уплощение, фиксация, каноникализация, вычисление состояния.
- `Bulk` - проявление, исполнение, процесс, объём, пространственная форма.

Ключевые инварианты:

- `Dark`, `Boundary` и `Bulk` являются изолированными доменами.
- Production-код не должен использовать прямые runtime imports между доменами.
- Междоменное взаимодействие принадлежит Force channels, а не прямым imports.
- `Boundary` - граница уплощения.
- `Field` - слой отпечатка после уплощения и носитель значений и различий.

## Обязательный порядок чтения

Перед изменениями кода, архитектуры или документации:

1. Начни с `README.md`.
2. Прочитай релевантные документы в `docs/`.
3. Для архитектурной работы всегда пересматривай:
   - `docs/ONTOLOGY.md`
   - `docs/ARCHITECTURE.md`
   - `docs/FORCE.md`
   - `docs/DEVELOPMENT.md`

## Дисциплина терминологии

Всегда сохраняй текущую терминологию `arch`:

- `Dark`, `Boundary`, `Bulk`
- `Brane`, `Field`
- `State`, `Transition`, `Process`
- `Graviton`, `Photon`, `Gluon`, `Higgs boson`, `W boson`, `Z boson`
- `Impulse`
- `TAKT`

Не заменяй эти понятия старыми терминами framework-эпохи или `qTp`.

## Правила topology-полей

Topology-поля отличаются от обычных data-fields:

- `enum` - выбор ветви.
- `array` - множественность ветвей и разворачивание.
- изменение topology-field проходит через `Higgs boson`, а не через `Gluon`.
- `array` не участвует в entanglement.
- `array` меняется только через внутренний процесс atom через `State`.

## Команды разработки

Для общих задач используй корень репозитория:

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run typegen`
- `bun run space:build`
- `bun run lint:md`

Предпочитай самую маленькую релевантную проверку для изменённых файлов.

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

## Междоменные правила

- Production-код: прямые imports между доменами запрещены.
- Test-код: относительные imports между доменами допустимы для integration tests.
- Временная test orchestration допустима.
- Экспорт внутренних частей одного домена как API другого домена запрещён.

## Дисциплина документации

- Считай текущую документацию `arch` источником истины.
- Публичная документация ведётся на русском языке как основном источнике.
- Если старый английский Markdown-документ не имеет русской версии, переведи его на русский вместо добавления второго файла.
- Предпочитай маленькие проверяемые правки большим концептуальным переписываниям.

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

## Контекст участия

Перед изменением архитектуры или семантики:

1. Сохраняй текущую терминологию `arch`.
2. Объясняй архитектурный смысл простым языком.
3. Ссылайся на релевантные документы или инварианты, если изменение зависит от онтологии или архитектуры.
4. Веди публичную документацию на русском языке как основном источнике.

См. `docs/CONTRIBUTING.md` для правил участия в репозитории.
