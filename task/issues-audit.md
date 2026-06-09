# Issues audit

> Актуальность: аудит issues от 2026-04-25. Часть ссылок на `pkg/db`/`store/db`
> уже историческая. Текущее состояние store и план переноса см. в
> `task/store-unification.md`.

Дата: 2026-04-25, ветка `arch`.

Аудит **всех open issues** репозитория `zavx0z/metafor` и их проекция на актуальный код. Сводка-таблица в конце.

---

## #77 — Incremental materialization rendering из Dark вместо snapshot-отрисовки сцены

**Цель issue.** Сцена должна *проявляться постепенно*: частица появилась в Dark → сразу отображается, пересчиталась → плавно lerp; render loop останавливается, когда сцена стабилизировалась. Без полной пересборки snapshot.

**Что сделано на текущем этапе.**

- Per-row sync events теперь идут через единый `METAFOR_BROADCAST_CHANNEL` как protocol patches с `part: "graviton"` и техническим path `/db-sync`.
- `dark.worker` пишет per-row через `mirroredStore` (`pkg/db/instance-store-mirror.ts`); каждый `insertParticleShell` / `insertFieldOrbit` публикует event.
- Browser держит свой `createIdbDbInstanceStore({databaseName:"metafor-app-instance"})` и applies events через тот же `DbInstanceStore` API.
- Lerp/easeOutCubic уже есть в `bulk/web/index.ts updateAnimatedRecords` и применяется при transition scale/opacity.

**Гэп.**

- Client больше не копит sync events в локальную Promise-очередь; обработка идёт напрямую из protocol patches.
- На барьер делает batch refresh: `refreshViewportFromLocalStore(rootSrc)` → `selectAllParticleShells + selectAllFieldOrbits + bulkViewport.applyWorld({rootSrc, particles, fields})`. Внутри `applyWorldRowsToScene` пересобирает множество (`upsertShellRecord` для каждой row), а потом удаляет «нелишние» через diff `nextShellIds`.
- То есть инфраструктурно per-row есть, но контракт viewport-а — `applyWorld(world: DbWorldRows)` — целое множество за раз.

**Что нужно для закрытия.**

- В `bulk/web/index.ts` добавить incremental методы:
  - `upsertParticleShell(row: DbParticleShellRow): void`
  - `upsertFieldOrbit(row: DbFieldOrbitRow): void`
  - `removeParticleShell(particleId: string): void`
  - `removeFieldOrbit(fieldId: string): void`
- Внутри они делают то же что `applySnapshotToScene` для одного row (есть уже `upsertShellRecord` / `upsertFieldRecord` / `removeShellRecord` / `removeFieldRecord` — нужно вынести в публичный API).
- В `app/web/client.ts` на каждый patch `/db-sync` сразу применяется IDB mirror. Следующий шаг — звать нужный метод viewport-а без чтения IDB.
- `/structural` patch должен стать сигналом «render frame settled» (для метрик / снятия submit-disabled), а не trigger-ом для full re-apply.
- `applyWorld(world)` остаётся как convenience для тестов/первичной заливки, но в runtime не зовётся.

**Связанные коммиты.** `1ff16f62`, `415de9bf`, `10e0129c`, `cc552e10`, `0fd219a9`.

---

## #73 — sqlite: подготовить каноническую dark-проекцию из реляционной схемы вместо прямой загрузки raw DSL

**Цель issue.** `Dark` должен получать данные не из raw `meta.json` DSL, а из реляционной SQLite-проекции, собранной `store/meta/sqlite/relation.ts`. Никакого второго источника истины в виде raw DSL.

**Что сделано.**

- `store/meta/sqlite/relation.ts` уже раскладывает MetaDSL в реляционные таблицы `meta`, `fields`, `superposition`, `processes`, `reactions`, `matter`.
- `store/meta/sqlite/read.ts` (наш C1, commit `cc552e10`) — `readDarkParticleModel(db, src)` читает particle-плана **из SQLite**.
- `dark/dark.ts matter()` использует `readDarkParticleModel` для materialize.

**Гэп.**

- `dark/load.ts loadMeta(address)` всё ещё через `readMetaDsl(address)` (см. `store/meta/sqlite/...`?) грузит **raw `meta.json`/`meta.ts` DSL** и затем дёргает `relation()` для канонизации. Источник остаётся raw DSL, SQLite — лишь промежуточная форма.
- Чтобы `Dark` имел только один path, `loadMeta` должен:
  1. Получить SQLite handle (есть в worker как `metaDb`).
  2. Через `relation()` уже однажды записанные данные читать через **read-функции** реляционной проекции — без обращения к `meta.json`.
- Меньше runtime-связь между `dark/load.ts` и `store/meta/sqlite/`: dark становится consumer-ом реляционных rows, не автором.

**Что нужно для закрытия.**

- Добавить `store/meta/sqlite/read-meta-projection.ts` (или расширить `store/meta/sqlite/read.ts`): `readMetaProjection(db, src)` → возвращает структуру с теми же полями, что нынешний `MetaDSL`, но собранную из таблиц.
- `dark/load.ts loadMeta` отказывается от `readMetaDsl`: на вход — только SQL handle и src.
- `Meta` constructor (`dark/strong/Meta.ts`) принимает projection-shape, не AST.

**Контекст.** Парная issue #74 (убрать AST из публичных имён + переименовать в `loadMeta`) закрыта; осталось вытеснить даже `MetaDSL`-типы из public dark API через SQLite-проекцию.

---

## #65 — Упрощение протокольного взаимодействия до минимальной событийной модели

**Цель issue.** Зонтичная — последовательное упрощение протокола до минимальной событийной модели без ложной адресности и без дублирования транспортной информации.

**Что сделано.**

- `METAFOR_PROTOCOL_KIND`, `protocol`, `target` больше не входят в protocol payload.
- Текущий envelope не содержит `channel`, `source`, `boson` и не содержит общий `part`: частица находится внутри каждого patch.
- Валидаторы и тесты выровнены.

**Гэп.** Нет по минимизации payload. Если origin снова понадобится, он должен появиться как metadata transport layer, а не как поле protocol message.

**Что нужно для закрытия.** Закрыть issue после smoke-проверки runtime path.

---

## #64 — Weak-процессы: добавить W/+Z/-Z поверх существующего lock в Boundary

**Цель issue.** Lock уже принадлежит Boundary (есть `brane.lock`, `unlock(indexes)`). Bulk не должен владеть lock lifecycle. W/+Z/-Z — это координация executor-а между Boundary и Bulk, не сам lock.

**Что сделано.**

- `protocol.ts` определяет один `METAFOR_BROADCAST_CHANNEL` и `Part`.
- W/Z идут через patches с отдельными `part`: `w`, `+z`, `-z`.
- Z coordination patch `{ part:"+z"|"-z", op:"claim"|"accept"|"reject"|"release", wimpId, processId, executorId? }` — neutral mediation.
- W result patches `{ part:"w", op:"replace"|"result", wimpId, processId, ... }` — active transition с патчами.
- `boundary/boundary.ts unlock(indexes: number[])` снимает блок с бран по индексам.
- `boundary/boundary.ts` имеет `applyWeakResultPacket()` и `subscribeBoundaryWeakResultBroadcast()` — приём W-result envelope и unlock после apply (по docstring модуля).
- `bulk/em/index.ts` публикует `+z` для `claim/accept`, `-z` для `reject/release`, `w` для result patches.
- `app/web/runtime/bulk.process.ts` уже отправляет `+z claim/accept`, `w` result и `-z release` вокруг исполнения process.
- `boundary/weak/cpu/step.ts` ставит `brane.lock = true` при step.

**Гэп.**

- Единый protocol channel мирится server-ом в UI, а `subscribeBoundaryWeakResultBroadcast()` группирует W result patches.
- Boundary-side Z arbitration (`claim` → `accept`/`reject` → `release`) ещё не подключён к lock-state: `+z/-z` публикуются, но Boundary пока не принимает решение по claim/release.
- Нет smoke-сценария полного Weak path.

**Что нужно для закрытия.**

- В `boundary/boundary.ts` или отдельном `boundary/weak/protocol-bridge.ts`:
  - Subscriber на Z coordination patches: на `claim` от bulk-executor — проверка lock и accept/reject. На `release` — `unlock([braneIndex])`.
  - Smoke-тест, который проходит `Photon -> +z claim/accept -> w result -> -z release`.

---

## #66 — DSL ↔ DB: разбор MetaFor DSL в таблицы и обратная сборка DSL

**Цель issue.** Authoring round-trip: TS DSL module → DB tables → TS DSL module. Два отдельных пакета:
1. parser DSL → реляционные таблицы.
2. generator реляционные таблицы → TypeScript DSL файл (нормальный authoring-файл проекта, в стиле проекта).

**Что сделано.**

- Forward path: `store/meta/sqlite/relation.ts` раскладывает MetaDSL в таблицы `meta`, `fields`, `superposition`, `processes`, `reactions`, `matter`.

**Гэп.**

- Reverse path **отсутствует**. Нет пакета, генерирующего TS DSL модуль из таблиц.
- Полнота forward path не проверена round-trip-тестами — нет уверенности что схема достаточна для обратной сборки.

**Что нужно для закрытия.**

- Создать `pkg/dsl-emit/` (или `metafor/emit-dsl/`): функция `emitMetaDslTs(db, src) → string`, которая собирает TypeScript-модуль с chain-API в стиле проекта.
- Нормировать форматирование (Bun/biome/prettier с проектным конфигом).
- Round-trip тесты: `parse(file.ts) → tables → emit() → file2.ts`, `expect(file2 ≈ file)`.
- Если поле round-trip не выживает — расширять схему таблиц.

---

## #57 — TODO: остаётся ли DB reset-from-zero основным режимом или нужен compare/update protocol

**Текущий код.** `app/web/server.ts createRuntime → terminateRuntime → resetAppRuntimeFiles → rmSync(.sqlite, .sqlite-shm, .sqlite-wal)`. Полный wipe файла на каждый materialize.

**Связь с #77.** Reset-from-zero **противоречит** incremental rendering: browser получает `clear-world` event (стирает свою IDB), потом N insert-events. На client сцена сначала пустая, потом наполняется. lerp/transition не имеют смысла в этой модели — изменение всегда «от нуля».

**Возможные направления.**

- **Append-only DB** на runtime: каждый materialize не reset-ит, а пишет diff. Требует identity-модели (#58) для понимания «та же ли это particle».
- **Compare/update**: на materialize читать текущее состояние, считать diff, применять только нужные insert/update/delete events. Browser получает minimum.

Архитектурный вопрос — не для одной итерации.

---

## #56 — TODO: row-group vs entity-stage writes в shared/db

**Текущий код.**

- `pkg/db/backend.ts` (canonical Boundary/Dark relational data): `writeMetaRows(metaId, rows)`, `writeWimpRows(wimpId, rows)`, `writeEntanglementFamily(...)` — row-group, целая meta или wimp за раз.
- `pkg/db/instance.ts` + `pkg/db/instance-store.t.ts` (instance-level world): `insertDbParticleShell(rootSrc, row)`, `insertDbFieldOrbit(rootSrc, row)`, `clearDbWorld(rootSrc)` — **per-row API уже есть**.
- То есть для viewport-side гранулярность достигнута, для metainfra — пока row-group.

**Когда станет недостаточно.**

- Динамический rename одной meta-field без переписи всей wimp.
- Frame-by-frame patch state без переписи всех processes/reactions.

**Связь с #58 (identity).** Per-entity write requires per-entity stable id. Сейчас `meta.id = src` — нормально, но при rename это ломается.

---

## #58 — TODO: identity-модель для динамической меты

**Состояние.** Текущее переходное:
- `Meta.id = src`,
- часть id random,
- часть через `deriveUuid(...)`.

**Открытые вопросы.**

- Что переживает rename полей / state / structure?
- Stable identity vs semantic key.
- Bridge / provenance / history.

Архитектурный вопрос, в одну итерацию не решается. Привязан к #56 и #57.

---

## #53 — Использовать web-gpu-engine как основу Bulk-инспектора MetaFor

**Состояние.** Активно используется. `pkg/engine` (в монорепе) — это и есть `web-gpu-engine`. `bulk/web/index.ts` импортирует:
- `Renderer`, `Scene`, `ViewPoint`, `Vector3`, `Matrix4`, `Quaternion`, `Object3D`
- `LineSegments`, `LineGlowMaterial`, `BufferGeometry`, `BufferAttribute`
- `Text`, `TextMaterial`, `TrueTypeFont`
- `Raycaster`, `Color`, `GridHelper`, `SphereGeometry`

**Issue зафиксирована** как направление, фактически уже выполняется.

---

## #68 — MetaFor как self-authoring мультивселенная

**Состояние.** Видение / архитектурная позиция, не задача в коде.

Фиксирует что MetaFor должен развиваться как:
- мультивселенная,
- пространственная среда программирования,
- среда редактирования логики, связности, поведения, структуры.

Это контекст для долгосрочной работы. Не закрывается коммитом.

---

## Сводная таблица

| # | Заголовок | Состояние | Что осталось | Связано |
|---|---|---|---|---|
| 31 | Общий Dark pipeline | ✅ закрыт по существу | Закрыть на GitHub | — |
| 53 | web-gpu-engine как Bulk-инспектор | ✅ активно используется | (видение, оставить open) | — |
| 64 | Weak W/+Z/-Z поверх Boundary lock | ⚠️ bridge частично есть | Boundary-side Z arbitration + smoke | — |
| 65 | Минимизация протокола | ✅ закрыт по существу | Закрыть на GitHub после smoke-проверки | — |
| 66 | DSL ↔ DB round-trip | ❌ половина (forward есть, reverse нет) | `pkg/dsl-emit` + round-trip тесты | #58 |
| 68 | Self-authoring мультивселенная | 📌 видение | — | — |
| 73 | Каноническая dark-проекция из SQLite | ⚠️ ~50% | `loadMeta` через реляционные `meta_*` таблицы, не `readMetaDsl` | — |
| 75 | Единый расчёт уровня | ✅ фактически закрыт | Закрыть на GitHub | — |
| 77 | Incremental materialization rendering | ⚠️ инфраструктура есть, viewport не incremental | upsert/remove API в `bulk/web`, client применяет per-event без барьерного refresh | #57 |
| 56 | row-group vs entity-stage writes | 🔍 TODO-вопрос | Архитектурный анализ | #58 |
| 57 | Reset-from-zero vs compare/update | 🔍 TODO-вопрос | Архитектурный анализ | #58, #77 |
| 58 | Identity-модель | 🔍 TODO-вопрос | Архитектурный анализ | #56, #57 |

**Легенда.** ✅ — закрыто; ⚠️ — частично; ❌ — не сделано; 🔍 — открытый вопрос; 📌 — видение.

---

## Приоритизация

**Высокий приоритет (закрывает архитектурную цель текущей ветки).**
- **#77 incremental viewport apply** — добивает streaming-flow на client-стороне; lerp/transition становятся осмысленными.
- **#73 dark на SQLite-проекцию** — убирает дуальность DSL/SQLite в Dark; вытесняет даже `MetaDSL` из публичных типов.

**Средний приоритет (косметика и расширения).**
- **#65 минимизация протокола** — низкий риск, но широкий refactor.
- **#64 W/+Z/-Z поверх lock** — закрывает белое пятно weak-flow.

**Низкий приоритет (требуют архитектурного анализа).**
- **#57 reset vs compare/update**, **#58 identity**, **#56 granularity** — взаимосвязанный кластер.

**Чистка.**
- **#53, #68** — оставить open как направление-видение.

**#66 round-trip DSL ↔ DB** — отдельный пакет, не блокирующий, но фундаментальный для authoring-цели #68.
