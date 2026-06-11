# Storage analysis — глубокий разбор хранилища MetaFor

> Актуальность: исторический аудит до текущего разворота на `store`.
> Текущий план и состояние на 2026-04-26 см. в `task/store-unification.md`.
> Протокольный транспорт после актуализации 2026-06 использует один
> `METAFOR_BROADCAST_CHANNEL`, а смысловая частица хранится в `part` каждого
> patch. Разделы про отдельные BroadcastChannel-каналы ниже описывают старое
> состояние.

> **Цель документа.** Свести в одно место (а) что было задумано про store/db с самого начала, (б) что было сделано на каждой эпохе, (в) что мы имеем сейчас в `arch`, (г) что хочет user сегодня, (д) разрыв между «хочу» и «имеем», (е) кандидаты-варианты, как закрыть разрыв.
>
> Документ редактируется по ходу обсуждения.

---

## TL;DR

В репозитории **уже было** реализовано «один и тот же API над SQLite/IDB с разной реализацией под капотом» — три раза, в трёх эпохах, и каждый раз почти полностью переписывалось. Сейчас в `arch` живут **три** параллельных абстракции:

1. **`store/meta/sqlite/`** (DSL-relational, ~33 таблицы) — нормализованный разбор DSL по 8 `*.sql` файлам; **только SQLite**, без IDB; пишется через `relation()`, читается через `readDarkParticleModel()`. Intermediate representation в pipeline.
2. **`pkg/db/` `DbBackend`** (canonical runtime, 24 таблицы) — `metas/wimps/field_values/entanglement_*` + meta-структура; SQLite + IDB; используется boundary-runtime, `materialize`-writer в dark.worker.
3. **`pkg/db/` `DbInstanceStore`** (render, 2 таблицы) — pre-computed `particle_shell` + `field_orbit`; SQLite + IDB; используется dark.worker → broadcast → client → bulk viewport.

Плюс: **четвёртая** IDB `metafor-app-web-ui` для UI-настроек (1 store, 1 запись, KV-стайл).

Все три «канонические» абстракции архитектурно дублируют идею (контракт + два реализатора), стиль рассогласован: store/meta/sqlite — write-once + read-back через `crypto.randomUUID()`; pkg/db — row-group writes + детерминированные `deriveUuid(seed)`; DbInstanceStore — per-row insert + Promise-based mirror. Mirror-канал и structural-barrier живут только над instance-store; SharedDb-write такой роскоши не имеет.

**За один `materialize`-pass dark.worker заполняет ВСЕ ТРИ схемы в один и тот же `.sqlite` файл** — DSL-relational + canonical + render. То есть это не «три разные базы», а «три параллельные схемы в одном носителе». Браузер же видит **только две** последние, а store/meta/sqlite в IDB не зеркалится — следствие: round-trip DSL ↔ DB на клиенте недоступен.

User в текущем обсуждении (2026-04-25): **хочет один контракт над SQLite/IDB с разной имплементацией под капотом**. Этот тезис — не про новый дизайн, а про возврат и доводку идеи, которая в репозитории уже была.

---

## 1. Историческая ретроспектива

### 1.1. Эпоха `DataStore` (q-эра, август-октябрь 2025)

Самая ранняя зафиксированная попытка единого store-контракта. Цель — персистентность акторов VanillaJS (Web Components) с одинаковым API на сервере (Bun + SQLite) и в браузере (IndexedDB).

#### Документ-замысел

`core/store/persistence.md` (commit `bb6b14ee`, 2025-10-24):

> Документ описывает модель персистентности акторов MetaFor, схему данных, API стора и сценарии ре-гидратации. Серверная реализация — SQLite, клиентская (план) — IndexedDB.
>
> - При монтировании (`connectedCallback`): `saveActorIsNotExist(meta, parent_id, idx)`
> - После `update()`, смены состояния и завершения процесса: `updateActorSnapshot(id, snapshot)`
> - Перед первым render: если найден `snapshot`, применяем `state` и значения `context` напрямую (без событий)

`roadmap.md` (commit `c44f3c1d`, 2025-08-08):

> 0.3.x: реализовать `IndexedDBStore` — методы `saveMetaIsNotExists`, `getMeta`, `saveActorIsNotExist`; схема object store `meta(meta, fingerprint)`, `actor(id, meta, parent_id, idx, snapshot, timestamp)`; индексы по `meta`, `parent_id`. Критерии: меты и актеры сохраняются/читаются, восстановление работает в перезагрузке.
>
> 0.4.0: полная персистентность акторов в браузере, восстановление актора по `meta` из IndexedDB, миграции схемы IndexedDB (версионирование).
>
> Конфигурация `persist`: на web — флаг `persist` активирует IndexedDBStore; без него — volatile-режим. На server — `SQLiteStore` как по умолчанию.

#### Контракт (commit `1c4f996f`, 2025-09-27)

```ts
// core/store.t.ts
interface Data {
  get(table: string, id: string): Promise<any | null>
  getAll(table: string): Promise<any[] | null>
  update(table: string, id: string, data: any): Promise<void>
  insert(table: string, data: any): Promise<void>
  delete(table: string, id: string): Promise<void>
  drop(table: string): Promise<void>
}
export interface DataStore extends Data {}
export interface ContextStore extends Data {}
```

Реализации:
- `server/store/data.ts` — `bun:sqlite`, WAL, схема `(id TEXT PK, value TEXT CHECK(json_valid))`, ленивое `CREATE TABLE IF NOT EXISTS`, кэш prepared statements.
- `web/store/data.ts` — `indexedDB.open` + ленивое создание object-store через version-bump.

#### Пик (commit `f5b8f984`, ~2025-09-28)

Контракт развился до schema-aware варианта:

```ts
interface ContextSchema {
  [fieldName: string]: {
    type: "string" | "number" | "boolean" | "enum"
    required?: boolean
    default?: any
    values?: readonly (string | number)[]
    id?: true
  }
}

interface DataStore {
  createTableIfNotExist(table: string, schema: ContextSchema): Promise<void>
  get(table, query: Record<string, any>): Promise<any | null>
  getAll(table, query?: Record<string, any>): Promise<any[]>
  update(table, query, data): Promise<void>
  insert(table, data): Promise<void>
  delete(table, query): Promise<void>
  drop(table): Promise<void>
}
```

Ключевые свойства:
- SQLite-реализация (`server/store/data.ts`, ~250 строк) — динамические колонки по `ContextSchema`, составной PRIMARY KEY по `id`-полям, `buildWhereClause()` для query-фильтрации.
- IDB-реализация (`web/store/data.ts`, ~365 строк) — динамическое version-bump, поддержка составных keypath, in-memory `filterData()` (т.к. IDB не умеет рапсильно фильтровать по нескольким колонкам без compound index).
- Поверх — `MetaStore` с `LoadPolicy` (Service-Worker-style): `cache-first | network-first | network-only | cache-only | stale-while-revalidate`.
- Параллельно `ActorStore` — наследник `DataStore` для дерева компонентов (`id, meta, parent_id, idx, snapshot, timestamp`).

#### Конец эпохи (commit `ee8a32a9`, 2025-10-09)

Полное удаление `server/store/`, `web/store/`. Commit message: «реструктуризация архитектуры и переименование пакета» — pivot на `everywhere-everything` v0.4.0, потом всё ушло в новую модель `dark/boundary/bulk`.

**Ключевые наблюдения** этой эпохи:
- Замысел чистый: один контракт, две реализации.
- Доменная модель — KV `(id, JSON value)` с ленивым CREATE TABLE → удобно для прототипа, но без relational целостности.
- Документ-намерение (`persistence.md`) ясно описывал семантику ре-гидратации.

---

### 1.2. Эпоха `SharedDbBackend` (март 2026)

После реорганизации в `dark/boundary/bulk` поднялась новая попытка единого API — уже не KV, а **полноценный реляционный backend** под канонические сущности MetaFor.

#### Линия issue

`#54` (Центральная DB), `#46` (разделение `shared/orm` ↔ `shared/db`), `#47` → `#48` → `#49` → `#61` → `#62` → `#63`.

`#47` (closed): «Зафиксировать общий backend-контракт `shared/db` и каноническую табличную форму».

`#62` (closed): «Довести SQLite и IndexedDB до общего канонического addressable backend-контракта без snapshot-cache режима»:

> SQLite уже ближе к правильному состоянию: реально пишет canonical row-groups в таблицы, не держит базу как временный in-memory snapshot. А текущий IndexedDB backend пока реализован переходно: при открытии читает всю базу целиком в память, дальше живёт через cache, persist делает полный clear+rewrite. То есть это не полноценный DB backend, а snapshot-cache adapter поверх IndexedDB.
>
> На текущем этапе нужно окончательно довести оба backend-а до одного общего канонического смысла:
> - база должна быть живым адресуемым relational слоем,
> - backend должен работать с сущностями и relation-groups напрямую,
> - backend не должен подменяться snapshot-cache режимом,
> - SQLite и IndexedDB должны быть двумя реализациями одного и того же окончательного DB-контракта.

#### Контракт (commit `fc23d96a`, 2026-03-25)

```ts
// pkg/db/backend.t.ts
export interface SharedDbBackend {
  readonly requiredIndexes: readonly SharedDbBackendIndexSpec[]
  close(): Awaitable<void>
  reset(): Awaitable<void>
  flush(): Promise<void>
  readData(): SharedDbData

  readMetaRows(metaId: string): Promise<SharedDbMetaRows | null>
  readWimpRows(wimpId: string): Promise<SharedDbWimpRows | null>
  readWimpEdge(childWimpId: string): Promise<SharedDbWimpEdgeRecord | null>
  readFieldValue(wimpFieldId: string): Promise<SharedDbFieldValueRecord | null>
  readFieldSource(childWimpFieldId: string): Promise<SharedDbFieldSourceRecord | null>
  readEntanglementFamily(entanglementId: string): Promise<SharedDbEntanglementFamilyRows | null>

  writeMetaRows(rows: SharedDbMetaRows): Awaitable<void>
  writeWimpRows(rows: SharedDbWimpRows): Awaitable<void>
  writeWimpEdge(row: SharedDbWimpEdgeRecord): Awaitable<void>
  deleteEntanglementFamily(id: string): Awaitable<void>
  writeEntanglementFamily(rows: SharedDbEntanglementFamilyRows): Awaitable<void>
  setFieldValue(wimpFieldId: string, value: unknown): Awaitable<void>
}
```

Доменная схема (24 таблицы):
- meta-уровень: `metas`, `meta_fields`, `meta_states`, `meta_transitions`, `meta_transition_conditions`, `meta_processes`, `meta_process_reads`, `meta_process_writes`, `meta_reactions`, `meta_reaction_states`, `meta_reaction_reads`, `meta_reaction_writes`, `meta_matter_nodes`, `meta_matter_edges`;
- instance-уровень: `wimps`, `wimp_fields`, `wimp_edges`, `field_values`, `field_sources`, `wimp_states`;
- entanglement: `entanglements`, `entanglement_members`, `entanglement_fields`, `entanglement_field_members`.

В `arch` после rename `@shared/db → @metafor/db` (commit `9c496255`) типы переименованы `SharedDb*` → `Db*`, файлы — те же.

#### Реализации

| Файл | Размер | Что |
|---|---:|---|
| `pkg/db/backend.t.ts` | 200 | Контракт `DbBackend`, типы row-групп |
| `pkg/db/backend.ts` | 669 | Хелперы + `dbRequiredBackendIndexes` (один список индексов на обе реализации) |
| `pkg/db/sqlite.ts` | 1598 | `openDbSqliteBackend({ filename? })` |
| `pkg/db/idb.ts` | 1035 | `openDbIndexedDbBackend({ databaseName? })` — IDB compound indexes, `putRows/deleteRowsById` транзакционная батчёвка |
| `pkg/db/backends.parity.spec.ts` | — | Прогон одинаковых сценариев на обеих реализациях, сравнение result-set-ов |
| `pkg/db/materialize.ts` | ~400 | DSL→DB конвертер: `openDbMaterializationWriter(backend)` → `saveMetaBundle()`, `saveWimpBundle()` |

`#61`-комментарий: «контракт нейтральный, IndexedDB backend — это второй реальный backend того же слоя мира: SQLite — для node/local/test flow, IndexedDB — для browser flow».

---

### 1.3. Эпоха `DbInstanceStore` (апрель 2026, текущая)

Свежая «третья» абстракция. Появилась в commit `1ff16f62` (DbInstanceStore SQLite + IDB и per-row db-sync канал) и `415de9bf` (`[feat/refactor] app/web - DB-стриминг через db-sync канал, browser держит свой IDB-зеркало`).

Возникла потому, что:
- viewport (Bulk) нужно постепенно строить world-граф (`#77` Incremental rendering): не snapshot-replace, а per-row append + lerp.
- writes идут из dark.worker, читает client.ts → `bulkViewport`. По центру — BroadcastChannel + WebSocket bridge.
- Существующий `DbBackend` row-group oriented (writeMetaRows целиком) — для постепенного materialize не подходит без серьёзной перетряски.

#### Контракт

```ts
// pkg/db/instance-store.t.ts
export interface DbInstanceStore {
  close(): Promise<void>
  clearWorld(rootSrc: string): Promise<void>
  insertParticleShell(rootSrc: string, shell: DbParticleShellRow): Promise<void>
  insertFieldOrbit(rootSrc: string, orbit: DbFieldOrbitRow): Promise<void>
  selectAllParticleShells(rootSrc: string): Promise<DbParticleShellRow[]>
  selectAllFieldOrbits(rootSrc: string): Promise<DbFieldOrbitRow[]>
  selectParticleShellsByParent(rootSrc, parentParticleId: string | null): Promise<DbParticleShellRow[]>
  selectFieldOrbitsByParticle(rootSrc, particleId: string): Promise<DbFieldOrbitRow[]>
}
```

Доменная схема (2 таблицы):
- `db_particle_shell` — pre-computed render-shell: координаты, scale, цвет, depth, label, parent.
- `db_field_orbit` — pre-computed render-orbit: координаты, sphereRadius, valueText, цвет.

#### Реализации

| Файл | Размер | Что |
|---|---:|---|
| `pkg/db/instance-store.t.ts` | 45 | Контракт |
| `pkg/db/sqlite-instance-store.ts` | 66 | `createSqliteDbInstanceStore({ filename })` — обёртка над `instance.ts` |
| `pkg/db/idb-instance-store.ts` | 238 | `createIdbDbInstanceStore({ databaseName })` — sentinel-строка `" root"` для null parent (IDB не индексирует null в compound key) |
| `pkg/db/instance.ts` | 392 | Низкоуровневый sync API над bun:sqlite: `insertDbParticleShell`, `clearDbWorld`, `selectAll*`, `selectBy*` |
| `pkg/db/instance-store-mirror.ts` | 84 | `createMirroredInstanceStore(local, publisher)` — wrap-store, каждый write публикует `DbSyncMessage`; `applyDbSyncMessage(store, msg)` — receive-side |
| `pkg/db/instance-store.parity.spec.ts` | — | Parity SQLite↔IDB |

#### Sync-канал и барьер

```ts
// protocol.ts
export const METAFOR_BROADCAST_CHANNEL = "metafor.protocol"
export type Part = "graviton" | "photon" | "gluon" | "higgs" | "w" | "-z" | "+z"
export type JsonPatchOperation = "add" | "remove" | "replace" | "move" | "copy" | "test"

export type ProtocolPatch = {
  part: Part
  op: JsonPatchOperation
  path: string
  value?: unknown
  from?: string
}
```

Поток:

```
dark.worker (bun)                                client (browser)
  │                                                │
  ├─ instanceStore = createMirroredInstanceStore(  │
  │     createSqliteDbInstanceStore({filename}),   │
  │     dbSyncChannel, "dark")                     │
  │                                                │
  ├─ streamDbWorldRows(rootSrc, …, instanceStore)  │
  │   ├─ instanceStore.clearWorld(rootSrc)         │
  │   │     → SQLite DELETE                        │
  │   │     → publish DbSyncMessage{clear-world}   │
  │   │                                            │
  │   └─ for each shell/orbit:                     │
  │      instanceStore.insertParticleShell(…)      │
  │        → SQLite INSERT                         │
  │        → publish DbSyncMessage{insert-particle}│
  │                                                │
  ├─ postProtocolPatches([{                       │
  │     part:"graviton", path:"/structural", …}]) │
  │                                                │
  ▼                                                │
BroadcastChannel("metafor.protocol")               │
  │                                                │
server.ts: валидирует и                            │
WebSocket.send({type:"protocol", patches})         │
  │                                                │
  ▼                                                ▼
                                  socket.onmessage:
                                    /db-sync    → applyDbSyncMessage(idbStore, op)
                                                  → IDB INSERT
                                    /structural → refreshViewportFromLocalStore
                                                  → idbStore.selectAll*
                                                  → bulkViewport.applyWorld(rows)
```

Гарантия порядка не должна жить в Promise-очереди client.ts. Если нужен строгий порядок, он задаётся store revision / transaction.

---

## 2. Что мы имеем сейчас (`arch`, ветка)

### 2.1. Параллельные базы и их назначение

| Окружение | Назначение | API | Файл / IDB-база |
|---|---|---|---|
| **bun (boundary server)** | Каноническая meta+wimp+entanglement база | `DbBackend` SQLite | `metafor-server.sqlite` (boundary/server.ts:6) |
| **bun (dark.worker)** | Materialize meta+wimp в каноническую DB **+** instance store для render | `DbBackend` SQLite **И** `DbInstanceStore` SQLite (один и тот же файл) | `dbFilename` из messageOptions (app/web/runtime/dark.worker.ts:387) |
| **bun (boundary worker)** | Чтение row-групп для weak-runtime | `DbBackend` SQLite | `app/web/runtime/boundary.worker.ts:23` |
| **bun (bulk worker)** | `readMetaRows` для weak-process исполнения | `DbBackend` SQLite | `app/web/runtime/bulk.worker.ts:1` |
| **browser (boundary)** | Зеркало meta+wimp канона на клиенте | `DbBackend` IDB | `metafor-web` (boundary/web.ts:6) |
| **browser (app/web client)** | Render-зеркало world-rows для bulk viewport | `DbInstanceStore` IDB | `metafor-app-instance` (app/web/client.ts:96) |

**Итого в браузере живут две независимые IDB:** `metafor-web` (полная meta+wimp реляционная схема) и `metafor-app-instance` (render-форма particle/field).

### 2.2. Кто кого зовёт

**`DbBackend` (SharedDb-эпохи)** — production вызовы:

| Call-site | Метод | Зачем |
|---|---|---|
| `boundary/server.ts:5` | `openDbSqliteBackend({filename:"metafor-server.sqlite"})` | bootstrap server-side boundary |
| `boundary/web.ts:5` | `openDbIndexedDbBackend({databaseName:"metafor-web"})` | bootstrap browser-side boundary |
| `boundary/database.ts:1230` | `backend.readMetaRows(metaId)` | operational read для runtime |
| `boundary/boundary.ts:433` | `backend.setFieldValue(wimpFieldId, value)` | persist field-update из weak-runtime |
| `app/web/runtime/dark.worker.ts:387,392` | `openDbSqliteBackend` + `openDbMaterializationWriter` | dark-pipeline пишет meta/wimp в каноническую DB |
| `app/web/runtime/boundary.worker.ts:23` | `openDbSqliteBackend` | boundary-runtime в worker-е |
| `app/web/runtime/bulk.worker.ts:1` | `openDbSqliteBackend` | bulk-process читает meta для исполнения |
| `app/web/runtime/bulk.process.ts:203` | `backend.readMetaRows(metaId)` | runtime-чтение из bulk |

`DbBackend` — **активный production контракт**, не архивный.

**`DbInstanceStore`** — production вызовы:

| Call-site | Что |
|---|---|
| `app/web/runtime/dark.worker.ts:48-49` | mirrored SQLite store (writer) |
| `app/web/runtime/dark.worker.ts:288` | `streamDbWorldRows(rootSrc, descriptors, settings, instanceStore)` |
| `app/web/client.ts:95` | IDB store (reader/replica) |
| `app/web/client.ts:400` | `applyDbSyncMessage(store, op)` на db-sync events |
| `bulk/gravity/layout/stream.ts:28` | `streamDbWorldRows` принимает sink:Pick<DbInstanceStore, …> |

### 2.3. Дублирование между двумя контрактами

| Аспект | `DbBackend` | `DbInstanceStore` |
|---|---|---|
| Open/close | `openDbSqliteBackend()` / `openDbIndexedDbBackend()` + `close()` | `createSqliteDbInstanceStore()` / `createIdbDbInstanceStore()` + `close()` |
| Lazy schema | да (в sqlite.ts/idb.ts) | да (в instance.ts / idb-instance-store.ts) |
| Required indexes spec | `dbRequiredBackendIndexes` (общий список) | inline в каждой реализации, без shared spec |
| Sync vs async | sync write в SQLite (`Awaitable`), async в IDB | везде async |
| Granularity | row-group (`writeMetaRows`, `writeWimpRows`) + точечные ops (`setFieldValue`, `writeWimpEdge`) | per-row insert (`insertParticleShell`, `insertFieldOrbit`) |
| Mirror на BroadcastChannel | **нет** | да (`createMirroredInstanceStore`) |
| Structural barrier | нет | да |
| Parity-test | `pkg/db/backends.parity.spec.ts` | `pkg/db/instance-store.parity.spec.ts` |
| Browser-safe entry | `pkg/db/browser.ts` (общий) | `pkg/db/browser.ts` (общий) |

**Перекрытий по таблицам нет.** Это два разных среза мира:
- `DbBackend` хранит «что можно собрать обратно в DSL и из чего собрать boundary-runtime».
- `DbInstanceStore` хранит «как это нарисовать в viewport-е» (pre-computed координаты, цвета, scale).

### 2.4. Materialize-pipeline

`pkg/db/materialize.ts` — мост DSL → row-groups:

```ts
const writer = openDbMaterializationWriter(backend)  // принимает DbBackend
await writer.saveMetaBundle(metaBundle)               // → backend.writeMetaRows
await writer.saveWimpBundle(wimpBundle)               // → backend.writeWimpRows
                                                       // → backend.writeWimpEdge
                                                       // → backend.writeEntanglementFamily
```

Использование (production):
- `app/web/runtime/dark.worker.ts:392` — dark.worker пишет materialize-result через writer.
- `boundary/tests/db.runtime.test.ts` (multiple) — fixture-setup в тестах.

В `dark.worker.ts` сейчас **в один и тот же `dbFilename` пишут два разных контракта**: каноническая DB через `DbBackend` (meta/wimp/entanglement-таблицы) и render-копия через `DbInstanceStore` (particle_shell/field_orbit-таблицы). Schemas не пересекаются, но один файл — это удобно (одна транзакция/одна точка чтения), и физически этим уже сейчас пользуемся.

### 2.5. `pkg/db/browser.ts` как мост

`pkg/db/index.ts` тащит `bun:sqlite` через `core.ts → sqlite.ts → instance.ts → import { Database } from "bun:sqlite"` — этот импорт ломает любой browser-bundle. `pkg/db/browser.ts` re-exports только то, что не зависит от bun:sqlite:

```ts
// pkg/db/browser.ts
export { createIdbDbInstanceStore } from "./idb-instance-store.ts"
export { createMirroredInstanceStore, applyDbSyncMessage } from "./instance-store-mirror.ts"
export { openDbIndexedDbBackend } from "./idb.ts"
export { openDbMaterializationWriter, createDbEntanglementFamilyId } from "./materialize.ts"
export { dbRequiredBackendIndexes, createEmptyDbData, normalizeDbData, readDbData } from "./backend.ts"
// + все nominal types из *.t.ts
```

Это **нужный шов**, без него браузерный бандл не собирается. Но он же фиксирует асимметрию: server-сторона импортирует и SQLite, и IDB; browser-сторона — только IDB. Один контракт, два потребителя.

---

## 3. Что хочет user (тезисы из текущих обсуждений)

Реконструкция намерения по сообщениям пользователя в этом и предыдущих чатах + комментариям в issue.

### 3.1. Один API над SQLite/IDB с разной имплементацией

Прямая цитата (этот чат):

> у db должен быть один и тот же api для sqlite idxdb но реализация под капотом специфичная для конкретной базы

Цитата из `#62`:

> SQLite и IndexedDB должны быть двумя реализациями одного и того же окончательного DB-контракта, а не «почти похожими» механизмами.

Это уже сделано **дважды**: для `DbBackend` (canonical) и для `DbInstanceStore` (instance). Оба контракта symmetric, оба парятся parity-тестами. Желание сводится к: «нужен ОДИН такой контракт, а не два».

### 3.2. IDB как живое зеркало в браузере, без снапшотов

> вообще нужно на web idxdb аналогично сделать хранилищем как в server sqlite … и механизм синхронизации до момента отправки сигналов … от снепшотов нужно избавляться в пользу db

Это уже сделано на уровне `DbInstanceStore` — снапшоты выпилены, per-row sync идёт через единый protocol channel как `/db-sync` patch, structural barrier идёт как `/structural` patch. Но **аналогичного per-row sync для `DbBackend` пока нет** — boundary в браузере (`metafor-web`) живёт через `openDbIndexedDbBackend`, наполняется как? — не через стрим из bun-стороны, а через свою materialize-цепочку (нужно проверить отдельно).

### 3.3. Source of truth — DB, не in-memory snapshot

Из `#77` (комментарии user):

> Переход на incremental materialization rendering означает, что dark больше не должен работать как in-memory store полного дерева частиц. Каноническим источником истины уже является база. Поэтому не нужно держать полный graph частиц в памяти.

Из `#67` (closed):

> Source of truth для сущностей, их свойств и связей должна быть SQLite, а не TS-структуры поверх неё.

Из memory user (`project_streaming_architecture`): «DB = store для WebGPU-памяти; минимум in-memory, инкрементальная materialize; bulk лениво читает из DB».

### 3.4. Per-row materialize в DB

Из `#55` (closed):

> никакого полного assemble-path быть не должно. После создания базы Dark должна записывать канонические строки в таблицы сразу, как только для конкретной сущности появился минимально достаточный факт.

Сейчас `materialize.ts` делает это **row-group oriented** — `writer.saveMetaBundle()` собирает все meta-rows в bundle и пишет одним `writeMetaRows`. Между старым assemble-everything и желаемым per-entity это **промежуточная** гранулярность; user сам это явно отметил в `#56`:

> сейчас допустим промежуточный режим: writeMetaRows / writeWimpRows / writeEntanglementFamily. Но позже нужно отдельно проверить, достаточно ли этого для динамического изменения меты.

`#56` — открытый TODO «опускать write path от row-group к entity-stage».

### 3.5. Одна канон-схема, без дублирующих хранилищ

Тезисная связка `#54`+`#46`+`#47`+`#62`:

> что именно является каноническими сущностями модели, которые рождаются из DSL/AST … shared/db не должен становиться вторым источником истины поверх Dark, но должен быть единым источником данных для Dark, Boundary и будущего Bulk.

Сейчас есть **два** хранилища в браузере (`metafor-web` для boundary + `metafor-app-instance` для render) — это растёт из «канон vs render-форма», и это потенциально нарушает «один источник».

---

## 4. Gap-анализ

| # | Тезис user-а | Состояние | Gap |
|---|---|---|---|
| 1 | Один API над SQLite/IDB | **Сделано дважды**: `DbBackend` + `DbInstanceStore` | Дублируется идея; нет одного контракта на оба слоя данных |
| 2 | Без снапшотов; per-row sync через broadcast | **Сделано** для render-формы (`DbInstanceStore` + `db-sync` канал) | Не сделано для канонической DB (`DbBackend`): boundary в браузере — отдельный store, не зеркало bun-стороны |
| 3 | DB = единственный источник истины | Канонические meta+wimp в `DbBackend`; render-форма продублирована в `DbInstanceStore` | `DbInstanceStore` — *вторая* копия данных в иной форме; формально два source-of-truth |
| 4 | Per-row materialize | Row-group oriented (`writeMetaRows` целиком) | TODO `#56`; `materialize.ts` сейчас собирает bundle → одним `writeMetaRows` |
| 5 | Одна канон-схема для Dark/Boundary/Bulk | `DbBackend` это и есть, но **bulk render не использует его напрямую** | Bulk читает свою `DbInstanceStore`, не `DbBackend`; чтобы рендерить, нужно знать координаты, которых в `DbBackend` нет |
| 6 | Browser = живое зеркало server-а | Только для `DbInstanceStore` через `db-sync` | Для `DbBackend` зеркало есть (IDB реализация), но **процесс наполнения** не унифицирован: boundary в браузере писал бы сам, а bun-сторона пишет в свой SQLite |

### Узкий вопрос: «можно ли убрать `DbInstanceStore` совсем?»

Аргументы «за»:
- Один контракт, одна канон-схема → меньше когнитивной нагрузки.
- `DbBackend` уже умеет SQLite+IDB+parity, mirror тоже можно надстроить сверху.

Аргументы «против»:
- Координаты shell/orbit — это **derived render-данные**, не канон. Класть их в `metas/wimps/field_values` — смешать canonical and derived.
- Render-схема сильно ýже (2 таблицы vs 24) — лишний overhead индексов и схем не нужен viewport-у.
- Layout зависит от настроек (levelSizeMultiplier, rootInnerDiameterMm) — пересчитываются часто, переналивать canonical DB на каждое изменение настроек неправильно.
- `streamDbWorldRows` (per-row append + lerp) — естественнее на узком render-контракте, чем поверх row-group `writeMetaRows`.

→ Render-store должен остаться, но его контракт можно **переформулировать как «специализация общего DB-API»**, а не как параллельную абстракцию.

---

## 5. Варианты дальнейших действий

### Вариант A — «Минимальное вмешательство»

Оставить две абстракции, **только привести их API к одной форме**:

- `DbBackend` остаётся row-group-oriented для canon (это уже отвечает на `#56`-TODO как «промежуточная гранулярность»).
- `DbInstanceStore` остаётся per-row для render.
- Свести **именования и сигнатуры** к одной форме: `open*Backend` / `create*Store`, `readData`/`select*` — единый стиль; одна точка `dbRequiredIndexes`; единый mirror-механизм поверх обоих.
- Вынести mirror (`createMirroredInstanceStore` + `applyDbSyncMessage`) в общий слой `pkg/db/mirror.ts`, чтобы он работал и над `DbBackend` (для канона тоже нужен per-row sync — `#56`).

Плюсы: минимум переписки, фокус на устранении именованных рассогласований.
Минусы: остаётся «две абстракции», просто причёсаны.

### Вариант B — «Один общий контракт, две специализации»

Ввести **общий базовый контракт** `DbStore<TableSpec>` и сделать обе текущие абстракции его инстанцированиями:

```ts
interface DbStore<Tables extends Record<string, RowType>> {
  open(options): Promise<this>
  close(): Promise<void>
  readonly indexes: readonly DbIndexSpec<Tables>[]
  put<K extends keyof Tables>(table: K, row: Tables[K]): Promise<void>
  delete<K extends keyof Tables>(table: K, key: PrimaryKey<Tables[K]>): Promise<void>
  select<K extends keyof Tables>(table: K, query: Query<Tables[K]>): Promise<Tables[K][]>
  // …
}

const canonical: DbStore<CanonicalTables> = openDbBackend(…)
const instance: DbStore<InstanceTables>  = openDbInstanceStore(…)
```

И mirror, и parity-test, и schema-init, и required indexes spec — поверх общего контракта.

Плюсы: одна абстракция; canon и render — это разные **scheme**, не разные API; mirror одинаковый; легко добавить третью специализацию (settings IDB, например).
Минусы: переписка средней цены — не неделя, но и не вечер. `DbBackend` нужно рефакторить под generic-схемы; row-groups (`DbMetaRows` как bundle нескольких таблиц) не вписываются в чистый `put<K>(table, row)` — нужен `transaction(callback)`-паттерн.

### Вариант C — «Сначала вернуть и стабилизировать DataStore-контракт»

Поднять старый `DataStore` (Sept 2025) в `pkg/db/kv-store.{t.ts, sqlite.ts, idb.ts}` как **третий слой** для простых KV-нужд (UI-настройки, локальные кэши, и т.п.) — не вмешиваясь в `DbBackend` и `DbInstanceStore`. Сначала проверить идею «один API под капотом разные реализации» на простой схеме `(id, JSON value)`, потом решать про слияние.

Плюсы: низкорисковая «разогревочная» задача; гарантированно встанет на место для UI-настроек (сейчас они через свой `ui-settings-idb.ts`).
Минусы: не решает основную проблему дублирования; добавляет третью абстракцию вместо двух.

### Вариант D — «Снести `DbInstanceStore`, оставить только `DbBackend`»

Render-rows (`particle_shell`, `field_orbit`) хранить как ещё две таблицы внутри `DbBackend`. Убрать `DbInstanceStore`/`sqlite-instance-store`/`idb-instance-store`/`instance-store-mirror`. Mirror сделать общий поверх `DbBackend.writeRow` API.

Плюсы: один контракт, одна схема, одно зеркало в браузере (`metafor-web` поглощает `metafor-app-instance`).
Минусы: смешивает canon и derived в одной схеме (см. возражения в `#4`); `DbBackend` row-group-oriented — придётся либо обламывать row-groups до per-row (что и так в TODO `#56`), либо нести render через row-groups, что уродует render-pipeline.

---

## 6. Открытые вопросы (для обсуждения)

1. **Canon vs derived.** Render-rows (координаты, цвета, scale) — это canon или derived? От этого зависит, в одной они схеме с meta+wimp или в отдельной. Я склоняюсь к «derived → отдельная схема, но единый контракт».
2. **Сколько IDB-баз должно быть в браузере?** Сейчас 3: `metafor-web` (boundary canon), `metafor-app-instance` (render), `metafor-app-web-ui` (UI settings). Это правильное разделение или склеивать?
3. **Кто пишет в браузерный canon (`metafor-web`)?** Mirror через `db-sync` для canon-таблиц — это тот самый «не сделано» из gap-анализа. Если делать — это отдельный канал `db-sync-canon` или расширение текущего? Структура `DbSyncMessage.op` сейчас знает только про particle/field, расширение её до `writeMetaRows`/`writeWimpRows` сильно увеличит payload.
4. **Per-row vs row-group.** TODO `#56` — нужно ли опускать `writeMetaRows` до per-row writes, и где граница (DSL fields пишутся атомарно или по одному)?
5. **Settings.** UI-настройки (`ui-settings-idb.ts`) — отдельный store с другим контрактом. Поднимать его на общий API или оставить отдельным?
6. **Plan vs продакшен.** План `bulk-viewport-snug-wand.md` (этот чат) был про передачу snapshot через WS — он закрыт переходом на per-row sync. Закрывать его явно или удалить?

---

## 7. Архивная справка по коммитам

### Эпоха 1 (q-эра, август-октябрь 2025)
- `c44f3c1d` (2025-08-08) — roadmap.md с планом IndexedDBStore, версионированием, persist-флагом
- `bb6b14ee` (2025-10-24) — `core/store/persistence.md`
- `1c4f996f` (2025-09-27) — заглушки `server/store/data.ts` + `web/store/data.ts`
- `1706bfb0` (2025-09-27) — полные реализации SQLite+IDB
- `f5b8f984` (≈2025-09-28) — Context Schema
- `f675ef70`, `fac6bd05`, `5555eee1`, `c1b3e92d`, `3be0bc42`, `42d3a0bd`, `93bcb9c5`, `5e98d378` — итеративные refactor-ы
- `9d99c55b`, `01073074` — SQLiteStore + персистентность
- `ee8a32a9` (2025-10-09) — снос store (pivot на v0.4.0)

### Эпоха 2 (shared/db → @metafor/db, март 2026)
- `45`-`47` (issues) — разделение `shared/orm` ↔ `shared/db`, фиксация контракта
- `#48` → `9383e11` — первый SQLite backend
- `#61` → `fc4c939b` (2026-03-25) — первый IDB backend
- `fc23d96a` (2026-03-25) — async API + addressable read + parity-spec
- `#62` → `fc23d96a` (closed) — оба backend-а до общего канонического смысла
- `776527ff` — boundary persist-back (`#63` closed)
- `334e4f6d` (2026-03-26) — rename indexeddb.ts → idb.ts
- `9c496255` — rename @shared/db → @metafor/db

### Эпоха 3 (`DbInstanceStore`, апрель 2026)
- `1ff16f62` — DbInstanceStore + db-sync канал
- `415de9bf` — DB-стриминг через db-sync, browser держит свой IDB-зеркало
- `10e0129c` — снос `DbWorldSnapshot`, переход на rows / world
- `cc552e10` — streaming через sink (`DbWorldRowSink`)
- `51d3dd9f` — pkg/db/browser.ts (browser build не должен тащить bun:sqlite)
- `0fd219a9` — client.ts: db-sync apply + structural-барьер
- `0261991a` — выпиливание debug-логов

---

## 8. Inventory всех persistence touchpoints (полный sweep)

После расширенного исследования собрал ВСЕ места, где что-то сохраняется, кэшируется или передаётся как state. Картина шире, чем выглядела в §1–§3.

### 8.1. SQLite файлы (`bun:sqlite`)

**Open-points:** `new Database(filename)` встречается ровно в трёх местах:

| Open-point | Файл | Schema | Кто открывает |
|---|---|---|---|
| `store/meta/sqlite/sqlite.ts:103` (`getMetaDB`) | любой path | 33 DSL-таблицы из `*.sql` | dark.worker, dark/load.context (`:memory:`), tests, fixtures |
| `pkg/db/sqlite.ts:1497` (`openDbSqliteBackend`) | options.filename ?? `:memory:` | 24 canonical (lazy CREATE) | boundary/server.ts, app/web boundary/bulk/dark workers |
| `pkg/db/instance.ts:174` (`openDbInstanceSqlite` через `createSqliteDbInstanceStore`) | options.filename | 2 render (lazy CREATE) | dark.worker (mirror writer) |

WAL включается в (2) и (3), не в (1). PRAGMA `synchronous=NORMAL`, `busy_timeout=5000`.

**Физические `.sqlite` файлы в репо:**
- `app/web/tmp/metafor-app.sqlite` (~1.3 MB) — runtime, создаётся `app/web/server.ts`. Шарится **тремя schemas одновременно**: store/meta/sqlite (33), DbBackend (24), DbInstanceStore (2) = 59 таблиц в одном файле. Всё через WAL.
- `dark/tests/tmp/metafor-issue-52-materialized.sqlite` — тестовый артефакт.
- `github/zavx0z/git/meta.sqlite` — workspace-fixture.

### 8.2. IndexedDB-базы (`indexedDB.open`)

**Open-points** — три явных:

| База | Файл | Stores | Тип | Цель |
|---|---|---|---|---|
| `metafor-db` (default name `DbBackend`) | `pkg/db/idb.ts:841` (`openDbIndexedDbBackend`) | 24 (зеркало canonical) | structured | используется через `boundary/web.ts` (имя `metafor-web`) — standalone bootstrap, не в active app/web flow |
| `metafor-app-web-ui` | `app/web/ui-settings-idb.ts:24` | 1 (`ui_settings`) | KV (1 запись `display_settings`) | UI-настройки + revision-маркер |
| `metafor-instance-store` (default), но в `app/web/client.ts:96` называется `metafor-app-instance` | `pkg/db/idb-instance-store.ts:5` (`createIdbDbInstanceStore`) | 2 (`db_particle_shell`, `db_field_orbit`) | structured | live-render зеркало через `db-sync` канал |

**Активные в app/web client:** только `metafor-app-instance` + `metafor-app-web-ui`. `metafor-web` — standalone путь boundary, в основном flow не открывается.

### 8.3. Protocol channel (`protocol.ts`)

| Transport | Payload | Cемантика |
|---|---|---|
| `METAFOR_BROADCAST_CHANNEL` | `{patches: ProtocolPatch[]}` | единый runtime transport |

Смысловой маршрут задаётся не физическим каналом, а `part` внутри каждого patch:

| `part` / path | Семантика |
|---|---|
| `graviton` | UUID-структурные изменения |
| `graviton`, `/db-sync` | per-row sync для browser IDB-зеркала |
| `graviton`, `/structural` | barrier-сигнал «перечитайте всё» |
| `photon` | string state transfer |
| `gluon` | value replacements |
| `higgs` | topology changes |
| `w` | Weak process result |
| `+z` | Weak positive coordination: claim/accept |
| `-z` | Weak negative coordination: reject/release |

### 8.4. In-memory кэши

**`boundary/database.ts`:**
- `BoundaryRuntimeOperationalCache` — 6 Map: `entanglementFamilyById`, `fieldSourceByChildId`, `metaRowsById`, `wimpEdgeByChildId`, `wimpFieldById`, `wimpRowsById`. Per-request кэш runtime.
- `BoundaryRuntimeEntanglementIndex` — 3 Map для derived entanglement projections.

**`pkg/db/materialize.ts:589` (`openDbMaterializationWriter`):**
- `bundlesById`, `metaSignatureById`, `metaContextById` — кэш всех wimp-bundle и idempotency-сигнатуры мет.
- `wimpOrderById`, `nextEdgeOrderByParentId`, `wimpEdgesByChildId` — порядок и edges.
- `savedFieldIdsByWimpId`, `savedFieldsById` — отслеживание изменений по wimp.
- `entanglementFamiliesByRootFieldId` — для пересчёта families.

Это **существенный CPU-side state** — ровно то, что user в `#77` ругал: «не нужно держать полный graph частиц в памяти».

**`app/web/runtime/dark.worker.ts:304`:**
```ts
let currentRootSrc: string | null = null
let currentDescriptorRoots: DbWorldParticleDescriptor[] = []
let currentDbFilename: string | null = null
let instanceStore: DbInstanceStore | null = null
```

Кэш последней успешной materialization для `relayout` без полного re-materialize.

### 8.5. Worker postMessage flows

**MaterializeMessage:**
```ts
{ type: "materialize", src: string, dbFilename: string, layoutSettings?: Partial<AppWebLayoutSettings> }
```
Server → dark.worker. Триггерит весь pipeline.

**RelayoutMessage:**
```ts
{ type: "relayout", src, layoutSettings? }
```
Server → dark.worker. Перепубликовать structural без re-materialize, используя кэш `currentDescriptorRoots`.

**WorkerStatusMessage:**
```ts
{ type: "worker-status", worker: "dark"|"boundary"|"bulk", status: "idle|ready|started|done|error", src?, error? }
```
Worker → server.

**Boot:**
```ts
{ type: "boot", dbFilename: APP_DB_FILENAME }
```
Server → boundary.worker, bulk.worker.

### 8.6. WebGPU (state на GPU, не диск)

- Bulk viewport (`bulk/web/index.ts`) держит `THREE.Mesh`/`InstancedMesh` буферы, обновляемые через `applyWorld(rows)`.
- Это derived от IDB `metafor-app-instance` и не персистентно.

### 8.7. Что **не** найдено

- Никаких `localStorage`, `sessionStorage`, `Cache API`, `caches.open`.
- Никаких production-deps типа `idb`, `dexie`, `lowdb`, `kysely`, `drizzle`, `prisma`, `better-sqlite3`, `node-cache`, `lru-cache`. Вся persistence — на нативных API.
- `fake-indexeddb` — только в `devDependencies`, в production не используется.

### 8.8. Сводная картина persistence

```
┌─────────────────────────────────────────────────────────────────┐
│ SERVER (Bun)                                                     │
├─────────────────────────────────────────────────────────────────┤
│ app/web/tmp/metafor-app.sqlite (один файл, WAL)                 │
│ ├─ schema A: store/meta/sqlite (33 таблицы, DSL-relational, write-only)│
│ ├─ schema B: pkg/db DbBackend (24 таблицы, canonical runtime)   │
│ └─ schema C: pkg/db DbInstanceStore (2 таблицы, render)         │
│                                                                  │
│ open-handles: dark/boundary/bulk worker — ОДИН файл, разные      │
│ Database connections, разные API.                                │
└─────────────────────────────────────────────────────────────────┘
                       ↓ db-sync + structural
                       ↓ через WebSocket
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER                                                           │
├─────────────────────────────────────────────────────────────────┤
│ metafor-app-instance (IDB)                                       │
│   └─ schema C': только render-зеркало                            │
│        ↑ live через applyDbSyncMessage                           │
│                                                                  │
│ metafor-app-web-ui (IDB)                                         │
│   └─ KV: ui_settings (1 запись)                                  │
│                                                                  │
│ metafor-web (IDB) — STANDALONE, не в active flow                 │
│   └─ schema B': зеркало canonical (24 таблицы)                   │
└─────────────────────────────────────────────────────────────────┘
```

**Ключевое наблюдение:** browser **не имеет копии schema A** (DSL-relational). Это значит — никакого DSL-emit на клиенте, только сервер может делать round-trip. Это ограничение `#66` (DSL ↔ DB round-trip) на клиенте.

---

## 9. Глубокий разбор `store/meta/sqlite/` (DSL-relational, 33 таблицы)

### 9.1. Группы таблиц

#### Группа 1: meta-структура (3 таблицы)
- `meta` — корневая запись DSL: `src PK, name, desc, view_css, has_processes, has_reactions, has_matter`
- `meta_mass_value` — **рекурсивное JSON-дерево** mass-конфига; узлы object/array/string/number/boolean/null с `entry_key` для object-keys и `entry_order` для array-items. Type-specific колонки (`text_value`, `number_value`, `boolean_value`).

#### Группа 2: поля (8 таблиц)
- `field` — `uuid PK, meta FK, key, type, required, label`. UNIQUE `(meta, key)`.
- `field_default` — marker «у поля есть default».
- `field_string_default`, `field_number_default`, `field_boolean_default` — type-specific 1:1 значения.
- `field_array_default_item` — упорядоченные элементы array-default.
- `field_enum_variant` — варианты enum (`{position, item_value}`).
- `field_enum_default` — указатель на default-variant.

#### Группа 3: states + transitions (5 таблиц)
- `superposition` — состояния машины состояний (`uuid, meta, name, position`). UNIQUE `(meta, name)`, `(meta, position)`.
- `transition` — переход (`from_superposition, to_superposition, position`).
- `condition` — условие на переходе по конкретному полю (`transition, field`). UNIQUE `(transition, field)`.
- `condition_predicate` — **нормализованный** predicate: `subject_kind ∈ {value, length}`, `operator ∈ {eq, neq, gt, lt, gte, lte, in, not_in, include, not_include, is_empty}`, type-specific `value_*` колонки.
- `condition_list_item` — items для `in/not_in/include/not_include` операторов.

#### Группа 4: процессы (7 таблиц)
- `process` — базовая запись (`type ∈ {action, finally}`).
- `process_env` — multi-row для env-список (`browser/node/worker/server/any`).
- `process_action`, `process_action_read`, `process_action_write` — для action-процессов (3 фазы: action, success, error).
- `process_finally`, `process_finally_read` — для finally-процессов (1 фаза: before).

#### Группа 5: реакции (4 таблицы)
- `reaction` — определение (`cond_source, update_source` — string source code).
- `reaction_superposition` — на каких states активна.
- `reaction_read`, `reaction_write` — какие поля читает/пишет.

#### Группа 6: matter-граф (8 таблиц)
- `matter_binding` — литерал/expr/переменная (`binding_kind ∈ {static, variable, dynamic}`).
- `matter_binding_dep` — зависимости binding-а (`path` строки).
- `matter_particle` — базовая node с `particle_kind ∈ {wimp, fuzzy, axion, macho}` + `edge_slot ∈ {root, child, then, else, branch}`.
- `matter_particle_wimp/fuzzy/axion/macho` — type-specific subtype-данные.

### 9.2. `relation(db, meta, src)` — write-only mapping

Однонаправленное отображение `MetaDSL → SQLite`, всё в одной транзакции:
1. `createMetafor()` — meta + recursive `meta_mass_value`
2. `createFields()` — fields + 6 default-таблиц + enum
3. `createSuperposition()` — states + transitions + conditions + predicates
4. `createProcess()` — processes + env + action/finally + reads/writes
5. `createReactions()` — reactions + state-bindings + reads/writes
6. `createMatter()` — bindings + particles + subtypes

UUID-генерация — `crypto.randomUUID()` (нестабильна между запусками).

### 9.3. `store/meta/sqlite` vs `pkg/db` (canonical) — gaps в обе стороны

| Аспект | store/meta/sqlite (33 табл.) | pkg/db (24 табл.) |
|---|---|---|
| **Mass tree** | `meta_mass_value` рекурсивно | `metas.mass` JSON-blob |
| **Field defaults** | 6 type-specific таблиц | **отсутствуют в canonical** ⚠️ |
| **Conditions** | `condition_predicate` + `condition_list_item` (нормализованы) | `meta_transition_conditions.condition` JSON |
| **Matter** | `matter_particle` + 4 subtype + `matter_binding` + `matter_binding_dep` | `meta_matter_nodes` + `meta_matter_edges` (generic + JSON payload) |
| **Process env** | `process_env` (multi-row) | **отсутствует** ⚠️ |
| **Initial state** | **отсутствует** ⚠️ | `meta_states.initial` |
| **Bulk config** | только `view_css` | `metas.bulk` JSON |
| **Schema topology** | неявно из type='enum' | `meta_fields.schemaTopology` |
| **Instance-слой** | **отсутствует** (DSL-only) | `wimps`, `wimp_fields`, `field_values`, `entanglement_*`, `wimp_states` |

**Ни одна из схем сама не достаточна для full DSL round-trip.** Идеальная единая схема — superset обеих.

### 9.4. Уникальная роль store/meta/sqlite сейчас

**Только intermediate representation внутри `canonicalizeMetaGraph` в dark.worker:**

```ts
// app/web/runtime/dark.worker.ts:308
const canonicalizeMetaGraph = async (dbFilename, rootSrc) => {
  const metaDb = getMetaDB(dbFilename)              // store/meta/sqlite open
  while (queue.length > 0) {
    const dsl = await readMetaDsl(src)              // JS import
    relation(metaDb, dsl, src)                      // → 33 таблицы
    const particleModel = readDarkParticleModel(    // ← 33 таблицы
      metaDb, src
    )
    // recurse children
  }
}
```

То есть store/meta/sqlite — это **write → read-back в одном passе**. После этого 33 таблицы лежат в `.sqlite` файле как **dead state** до следующего materialize.

**Будь store/meta/sqlite ушёл, что потеряли бы?**
- DSL-полнота: `meta_mass_value`, `condition_predicate` нормализация, `field_*_default` детализация. Это нужно для `#66` (DSL ↔ DB round-trip).
- В active production-flow ничего не сломалось бы — `readDarkParticleModel` нужно перевести на чтение из pkg/db canonical (с обогащёнными недостающими полями).

---

## 10. Полный pipeline `materialize` за один pass

```
┌──────────────────────────────────────────────────────────────────┐
│ dark.worker.ts onmessage(MaterializeMessage{src, dbFilename})    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────┐
  │ Stage 0: Reset                                   │
  │  - resetDarkRuntime()                            │
  │  - closeInstanceStore()                          │
  │  - openDbSqliteBackend({filename: dbFilename})   │
  │  - backend.reset()  (DROP+CREATE 24 canonical)   │
  └─────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────┐
  │ Stage 1: canonicalizeMetaGraph                   │
  │   for each meta in BFS(rootSrc):                 │
  │     readMetaDsl(src)            JS import        │
  │     relation(metaDb, dsl, src)  → store/meta/sqlite     │
  │                                   (33 таблицы)   │
  │     readDarkParticleModel(metaDb, src)           │
  │                                 ← store/meta/sqlite     │
  │     particleModelsBySrc.set(src, model)          │
  └─────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────┐
  │ Stage 2: matter() pipeline                       │
  │   matter(Wimp(rootSrc), {                        │
  │     dbWriter: openDbMaterializationWriter(       │
  │       backend                                    │
  │     ),                                           │
  │     sqliteDb: metaDb,                            │
  │     onMaterializedStep: emitSnapshot             │
  │   })                                             │
  │                                                  │
  │   Внутри matter():                               │
  │     для каждой раскрытой Wimp:                   │
  │       writer.saveMetaBundle(meta)  → pkg/db      │
  │                                      (24 табл.)  │
  │       writer.saveWimpBundle(wimp)  → pkg/db      │
  │                                      (entangle.) │
  │       emitSnapshot()  → publishStructural...     │
  └─────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────┐
  │ emitSnapshot (вызывается N+1 раз):              │
  │   createRuntimeParticleDescriptors(...)          │
  │   await publishStructuralSignal(...)             │
  │     ↓                                            │
  │     streamDbWorldRows(rootSrc, descriptors,      │
  │       layoutSettings, instanceStore):            │
  │       instanceStore.clearWorld(rootSrc)          │
  │         → SQLite DELETE                          │
  │         → DbSyncMessage(clear-world)             │
  │       for each shell/orbit:                      │
  │         instanceStore.insertParticleShell/      │
  │           insertFieldOrbit                       │
  │           → SQLite INSERT                        │
  │           → DbSyncMessage(insert-particle/field) │
  │     ↓                                            │
  │     structuralChannel.postMessage(barrier)       │
  └─────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────┐
  │ Stage 3: backend.flush() + final emitSnapshot    │
  │ Worker → "done"                                  │
  └─────────────────────────────────────────────────┘
```

**В один SQLite-файл за один pass пишется ТРИ независимые схемы**:
- 33 таблицы DSL-relational (через `store/meta/sqlite/relation`)
- 24 таблицы canonical (через `pkg/db DbBackend`)
- 2 таблицы render (через `DbInstanceStore`)

**В браузер уезжает только третья** через `db-sync` канал. Остальные две существуют только на сервере.

---

## 10.5. Производственный data flow: пять форм одних данных

После разбора `boundary/database.ts` (1585 строк) стало понятно, что persistence — только часть истории. В системе одни и те же данные **live в пяти формах**, и storage отвечает за переходы между двумя из них (формы 2↔3). Остальные переходы — отдельные слои, не сторадж.

### Пять форм

| # | Форма | Где живёт | Identity | Назначение |
|---|---|---|---|---|
| **1** | **DSL** (TS modules) | `github/zavx0z/*/meta.ts`, in-memory `MetaDSL` | строки src | source of truth, написана человеком |
| **2** | **DSL-relational** | `store/meta/sqlite` (33 таблицы), SQLite-файл | `crypto.randomUUID()` (нестабильна) | нормализованный разбор DSL для query / round-trip / canonicalization |
| **3** | **Canonical `DbData`** | `pkg/db DbBackend` (24 таблицы), SQLite + IDB | `deriveUuid(seed-strings)` (стабильна) | runtime-семантика: meta + wimp + entanglement + field_values + states |
| **4** | **`BoundaryDatabaseData`** | в памяти `boundary/database.ts` (10 flat-таблиц) | numeric `index` (позиционная) | runtime-ready flat layout для CPU/GPU computation |
| **5** | **`Data` / `PreparedData` / `BoundaryRuntimeForceData`** | в памяти `@boundary/gravity`, `@boundary/strong` | array offsets + Map-индексы | runtime: weak-step, em, gpu buffers |

Плюс отдельная **render-форма** `DbInstanceStore` (2 таблицы) — ответвление от формы 3 для viewport.

### Переходы между формами

```
Форма 1 (DSL TS)
   ↓ JS-импорт ── readMetaDsl(src)
Форма 1 (in-memory MetaDSL)
   ↓ relation(db, dsl, src) ── транзакция, 6 модулей
Форма 2 (store/meta/sqlite, 33 таблицы)
   ↓ readDarkParticleModel(db, src) ── чтение обратно
DarkMetaParticleModel (in-memory derived)
   ↓ matter() pipeline ── dark.worker
   ↓ writer.saveMetaBundle/saveWimpBundle ── pkg/db materialize
Форма 3 (pkg/db DbData, 24 таблицы)
   ↓ prepareBoundaryDatabaseData(rawData) ── boundary/database.ts:716
   ↓ denormalize: UUID-FK → numeric index, fieldOffset/fieldCount
Форма 4 (BoundaryDatabaseData, 10 flat-таблиц)
   ↓ prepareBoundaryWriteData(data) ── runtime field registry
   ↓ flattenBoundaryData() ── @boundary/gravity
   ↓ assembleStoredBoundaryData() ── @boundary/strong
Форма 5 (PreparedData) — runtime CPU/GPU buffers
   ↓ weakRunStep / em-channel / gpu-step
   → photon/gluon/higgs broadcasts
```

И параллельно — render-ветка:
```
Форма 3 (DbData)
   ↓ canonicalizeMetaGraph + matter
   → particle-descriptors (in-memory) ── dark.worker
   ↓ streamDbWorldRows(rootSrc, descriptors, settings, sink)
   ↓ resolveLevelGeometry(depth, settings) ── bulk/gravity/level
   → DbInstanceStore (particle_shell + field_orbit, 2 таблицы)
   ↓ db-sync mirror → IDB metafor-app-instance
   ↓ structural barrier → bulk viewport applyWorld
Форма 4' (Three.js InstancedMesh + GPU buffers, derived)
```

### Где живут какие identity

- **UUID-стабильные (deriveUuid)** — формы 2 (canonical), 3 (DbBackend). Можно безопасно `put()` идемпотентно.
- **UUID-нестабильные (crypto.randomUUID)** — форма 2 в store/meta/sqlite. Каждый прогон даёт разные ID. Поэтому `relation()` всегда **переписывает** через DROP+CREATE, не INSERT-IF-NOT-EXISTS.
- **Numeric index** — формы 4 и 5. `field.index` — позиция в массиве `fields`, который дальше идёт в GPU buffer как `[fieldIndex, value][]`. Это **runtime contract с runtime**, не identity сама по себе.

### Что есть `boundary/database.ts`

**Не storage**, а **derived projection layer** между формой 3 и формой 4 (с дальнейшим углублением в форму 5). Содержит:

#### Структуры данных

```ts
// boundary/database.t.ts
interface BoundaryDatabaseData {
  branes: BraneRecord[]                            // index, fieldOffset, fieldCount
  fields: FieldRecord[]                            // index, ownerBraneIndex, wimpFieldId, key, schema
  fieldValues: FieldValueRecord[]                  // fieldIndex, value
  entanglementBlocks: BlockRecord[]                // index, key
  entanglementBlockMembers: BlockMemberRecord[]    // blockIndex, memberIndex, braneIndex
  entanglementFields: EntanglementFieldRecord[]    // index, blockIndex, ...
  entanglementFieldMembers: EntFieldMemberRecord[] // entFieldIndex, memberIndex, braneIndex, fieldIndex
  stateSeedStates: StateSeedRecord[]               // ownerBraneIndex, stateIndex, ...
  stateSeedTransitions: TransitionSeedRecord[]
  stateSeedConditions: ConditionSeedRecord[]
}

interface BoundaryRuntimeForceData {
  runtimeFieldIndexByWimpFieldId: Map<string, number>
  wimpFieldIdsByRuntimeFieldIndex: string[][]
  braneIndexByWimpFieldId: Map<string, number>
  topologyWimpFieldIds: Set<string>
  stateMetaStateIdsByBraneIndex: string[][]
  stateProcessIdsByBraneIndex: Array<Array<string | undefined>>
}
```

10 flat-таблиц вместо 24, **numeric `index`-identity** вместо UUID-FK. `fieldOffset/fieldCount` — диапазоны в массиве `fields`, принадлежащие конкретной brane (компактнее чем JOIN).

#### Operational cache

```ts
type BoundaryRuntimeOperationalCache = {
  entanglementFamilyById: Map<string, DbEntanglementFamilyRows | null>
  fieldSourceByChildId: Map<string, DbFieldSourceRecord | null>
  metaRowsById: Map<string, DbMetaRows>
  wimpEdgeByChildId: Map<string, DbWimpEdgeRecord | null>
  wimpFieldById: Map<string, DbWimpFieldRecord>
  wimpRowsById: Map<string, DbWimpRows>
}
```

Это **адресуемый кэш поверх `DbBackend`** — boundary читает только row-groups для конкретных `wimpId`, через `backend.readMetaRows(metaId)` / `readWimpRows(wimpId)` / `readEntanglementFamily(id)`. Не делает `readData()` (full dump). Реализует то, что заявлено в issue `#62`: «addressable backend, не snapshot-cache».

#### Ключевые функции (export)

| Функция | Что делает |
|---|---|
| `prepareBoundaryRuntimeData(rawData, options) → Data` | форма 3 → данные для `@boundary/gravity` |
| `prepareBoundaryRuntimeStore(rawData, options) → PreparedData` | форма 3 → assembled boundary store со state-graph + collapses |
| `prepareBoundaryRuntimeStoreFromDb(backend, options) → PreparedData` | через `readDbData(backend)` (full dump) — для тестов и bootstrap |
| `prepareBoundaryRuntimeForceData(fragment) → BoundaryRuntimeForceData` | индексы для weak/em runtime |
| `prepareBoundaryRuntimeLoadedFragmentFromDbOperational(backend, activeWimpIds?)` | **аддресуемое чтение** через operational cache, fragment по wimp-ids |

#### Кто использует

`boundary/boundary.ts` (838 строк) — главный orchestrator:
- `boundary.ts:375` — `prepareBoundaryRuntimeForceData(fragment)` для force computation
- `boundary.ts:395` — `prepareBoundaryRuntimeStore(fragment)` для full assembled store
- `boundary.ts:469` — `prepareBoundaryRuntimeStoreFromDb(backend)` — bootstrap из открытой DB
- `boundary.ts:532,547` — `prepareBoundaryRuntimeLoadedFragmentFromDbOperational(backend)` для частичной materialization при `boot()` и `update()`

То есть `boundary/database.ts` — **главный мост** между storage (форма 3) и boundary runtime (формы 4 и 5).

### Что это значит для финального дизайна (§11)

**Дополнения к §11:**

1. **Форма 4 (`BoundaryDatabaseData`) и форма 5 (`PreparedData`/`BoundaryRuntimeForceData`) — НЕ persistent.** Это in-memory derived projections от формы 3. Storage за них не отвечает.

2. **`boundary/database.ts` остаётся как есть** в финальном дизайне — это правильное разделение ответственности:
   - **Storage** (`DbStore` контракт) — даёт row-groups через адресуемые reads.
   - **Projection layer** (`boundary/database.ts`) — превращает row-groups в runtime-form (numeric index, flat layout).
   - **Runtime** (`@boundary/gravity`/`strong`/`weak`/`em`) — потребляет runtime-form.

3. **`BoundaryRuntimeOperationalCache` уже использует адресуемые reads контракта** (`readMetaRows`, `readWimpRows`, `readFieldValue`, `readFieldSource`, `readEntanglementFamily`, `readWimpEdge`). Финальный `DbStore` должен **сохранить эти методы** или их generic-эквивалент — иначе boundary придётся рефакторить.

4. **Денормализация UUID → numeric index — runtime contract, не storage.** Финальный storage хранит UUID-identity (как сейчас в pkg/db). Index присваивается на лету в `buildBoundaryRuntimeFieldRegistry()` для CPU/GPU buffer-ов.

5. **Render-форма (`DbInstanceStore`) — отдельная derived projection** от формы 3. Её можно хранить, потому что dark.worker её **уже вычислил** (через `streamDbWorldRows`+`resolveLevelGeometry`), и пересчитывать на каждое чтение дороже, чем хранить. Storage здесь работает как **memoization layer**: формы 4'/5' для viewport.

6. **Форма 2 (store/meta/sqlite) — кандидат на удаление.** Сейчас она используется только как промежуточная таблица в одном passе (`canonicalizeMetaGraph`). Если форма 3 (canonical DbData) становится superset формы 2 (после поглощения mass-tree, normalized predicates, particle subtypes — см. §11.2), форма 2 не нужна. Path: dark.worker идёт `MetaDSL` → `matter()` напрямую в форму 3, минуя форму 2.

### Обновлённая диаграмма pipeline (после dедуплификации)

```
DSL (форма 1)                    [читается напрямую, не сохраняется]
   ↓ readMetaDsl()
in-memory MetaDSL
   ↓ matter() pipeline (dark.worker)
   ↓ DbStore.transaction() — per-row writes
Canonical DbData (форма 3)        [persistent, в одном DbStore]
   ├─ адресуемые reads через operational cache
   │     ↓ prepareBoundaryRuntimeLoadedFragmentFromDbOperational
   │  BoundaryDatabaseData (форма 4)
   │     ↓ prepareBoundaryWriteData → flattenBoundaryData
   │  PreparedData / BoundaryRuntimeForceData (форма 5)  [in-memory only]
   │     → @boundary runtime → photon/gluon/higgs/weak broadcasts
   │
   └─ derived render через streamDbWorldRows + resolveLevelGeometry
      DbInstanceStore (форма 4', persistent в том же DbStore через mirror)
         ↓ db-sync → browser IDB
         ↓ structural barrier
      Three.js InstancedMesh / GPU buffers (форма 5', in-memory only)
```

**Persistent — только формы 3 и 4'.** Все остальные — derived, in-memory, восстанавливаются из persistent при необходимости. Это правильная иерархия: storage хранит минимум, runtime делает работу.

---

## 11. Финальный единый дизайн

### 11.1. Принципы

1. **Один контракт `DbStore<TableSpec>`** над `bun:sqlite` и IndexedDB. Generic по schema-описанию; реализации скрыты под капотом. Тот же mirror, тот же parity-test, тот же index-spec.
2. **Один логический файл/IDB на runtime** (не три). На сервере — один SQLite-файл с одной схемой; в браузере — одна IDB с теми же object-store-ами по тем же именам.
3. **Multi-tier schema** в одной базе: DSL-canonical → runtime → render → settings. Слои разделены по namespace таблиц, но живут в одной DB и одном контракте.
4. **Per-row writes как первичные**, row-group — вторично. `#56` TODO решается на уровне контракта.
5. **Per-row mirror** работает над любой таблицей контракта, не только над render-rows.
6. **Детерминированная identity** через `deriveUuid(seed-strings)` для **всех** ID, во всех слоях. Это убирает разнобой `crypto.randomUUID()` в store/meta/sqlite vs `deriveUuid` в pkg/db.
7. **Browser-safety** через явный entry-point без `bun:sqlite` import.
8. **DSL round-trip достаточный** — schema хранит всё, что нужно для emit обратно в TS DSL (mass-tree, normalized predicates, particle subtypes, defaults, env-list, initial-state, bulk-config, schema-topology).

### 11.2. Проектируемая схема (superset)

Пять логических слоёв в одной базе. Нумерация namespace-префиксов таблиц:

#### Слой 1 — `meta_*`: DSL-canonical (~25 таблиц)
Объединение того, что есть в `store/meta/sqlite` + что есть в `pkg/db.metas`:
- `meta` (`id PK, src UNIQUE, name, desc, view_css, bulk JSON, has_processes, has_reactions, has_matter, initial_state_id FK`)
- `meta_mass_node` (рекурсивное JSON-дерево из store/meta/sqlite, **переименовано** в `_node` для consistency)
- `meta_field` + `meta_field_default` + 6 type-specific default-таблиц + `meta_field_enum_variant` + `meta_field_enum_default`
- `meta_state` (с `initial` флагом)
- `meta_transition` + `meta_transition_condition` + `meta_transition_predicate` + `meta_transition_predicate_list_item` (нормализованные predicates)
- `meta_process` + `meta_process_env` + `meta_process_action` + `meta_process_finally` + reads/writes
- `meta_reaction` + reads/writes + `meta_reaction_state`
- `meta_matter_binding` + `meta_matter_binding_dep` + `meta_matter_particle` + 4 subtype-таблицы (`_wimp`/`_fuzzy`/`_axion`/`_macho`)

**Итого ≈ 28 таблиц meta-слоя** (superset; теряем ничего из обеих текущих схем).

#### Слой 2 — `wimp_*`: instance-runtime (~6 таблиц)
- `wimp` (`id PK, meta_id FK, wimp_order, mass_override JSON?`)
- `wimp_field` (`id PK, wimp_id FK, meta_field_id FK, field_order`)
- `wimp_edge` (`id PK, parent_wimp_id, child_wimp_id, edge_order`)
- `wimp_state` (`id PK, wimp_id FK, meta_state_id FK`)
- `field_value` (`id PK, wimp_field_id FK, value JSON`)
- `field_source` (`id PK, child_wimp_field_id FK, parent_wimp_field_id FK`)

**Итого 6 таблиц instance-слоя** (как сейчас в pkg/db, без изменений).

#### Слой 3 — `entanglement_*`: связи (4 таблицы)
- `entanglement` (`id PK, membership_key, provenance`)
- `entanglement_member` (`entanglement_id, wimp_id, member_order`)
- `entanglement_field` (`id PK, entanglement_id FK, semantic_key, field_name, ...`)
- `entanglement_field_member` (`field_id FK, wimp_field_id FK, member_order`)

#### Слой 4 — `view_*`: pre-computed render (2 таблицы)
- `view_particle_shell` (`particle_id PK, root_src, parent_particle_id, kind, src, meta_src, label, depth, shell_order, local_x/y/z, shell_scale/radius/tube, color_r/g/b`)
- `view_field_orbit` (`id PK, root_src, particle_id, field_key, field_label, field_order, value_kind, value_text, local_x/y/z, sphere_radius, color_r/g/b`)

**Итого 2 таблицы render-слоя.**

#### Слой 5 — `app_*`: KV-настройки (1 таблица)
- `app_setting` (`key PK, value JSON, revision INTEGER`) — для UI-настроек, любых будущих per-app конфигов; revision-маркер встроен.

**Полный итог: ~41 таблица в одной базе.** Меньше, чем сумма (33+24+2+1=60), за счёт устранения дублирования.

### 11.3. Контракт `DbStore`

```ts
// pkg/db/store.t.ts (предлагаемое)

export interface DbStore<TTables extends DbStoreTableMap> {
  /** Закрыть все handles. */
  close(): Promise<void>

  /** Стереть всю БД (DROP + CREATE заново). */
  reset(): Promise<void>

  /** Выполнить N writes в одной транзакции; коллбэк получает per-table API. */
  transaction<T>(callback: (tx: DbStoreTransaction<TTables>) => Promise<T>): Promise<T>

  /** Per-row write. Если запись с тем же PK уже есть — идемпотентный replace. */
  put<K extends keyof TTables>(table: K, row: TTables[K]): Promise<void>

  /** Per-row delete. */
  delete<K extends keyof TTables>(table: K, key: PrimaryKeyOf<TTables[K]>): Promise<void>

  /** Адресуемое чтение по PK. */
  get<K extends keyof TTables>(table: K, key: PrimaryKeyOf<TTables[K]>): Promise<TTables[K] | null>

  /** Адресуемое чтение по compound-индексу. */
  selectByIndex<K extends keyof TTables>(
    table: K,
    indexName: string,
    range: IDBKeyRange | IndexQuery,
  ): Promise<TTables[K][]>

  /** Полный select (для тестов / debug). */
  selectAll<K extends keyof TTables>(table: K): Promise<TTables[K][]>

  /** Описание схемы и индексов; для миграций и parity-test. */
  readonly spec: DbStoreSpec<TTables>
}

export interface DbStoreSpec<TTables> {
  tables: { [K in keyof TTables]: DbTableSpec<TTables[K]> }
  indexes: readonly DbIndexSpec[]
  schemaVersion: number
}

export interface DbTableSpec<TRow> {
  name: string
  primaryKey: keyof TRow | readonly (keyof TRow)[]
  fields: { [K in keyof TRow]: DbFieldSpec }
}

export interface DbIndexSpec {
  name: string
  table: string
  columns: readonly string[]
  unique: boolean
}
```

**Реализации:**
- `createSqliteDbStore<T>(options: { filename, spec }): DbStore<T>` — `bun:sqlite`, генерирует `CREATE TABLE` / `CREATE INDEX` из spec, prepared statements в кэше, WAL.
- `createIdbDbStore<T>(options: { databaseName, spec }): DbStore<T>` — `indexedDB.open`, генерирует object-stores и indexes из spec в `onupgradeneeded`, версионирование через `spec.schemaVersion`.

Оба строятся **из одной declaration**, не дублируют schema-логику.

### 11.4. Mirror и sync

Mirror работает поверх контракта, не привязан к конкретному слою:

```ts
export interface DbStoreMirrorOptions<TTables> {
  store: DbStore<TTables>
  publisher: DbSyncPublisher
  /** Какие таблицы зеркалить (whitelist). Render-слой — всегда; meta-слой — опционально. */
  mirroredTables: readonly (keyof TTables)[]
}

export const createMirroredDbStore = <T>(
  options: DbStoreMirrorOptions<T>,
): DbStore<T> => { ... }

// DbSyncMessage расширяется до universal:
export interface DbSyncMessage {
  rootSrc: string
  op:
    | { kind: "clear-world" }
    | { kind: "put", table: string, row: unknown }
    | { kind: "delete", table: string, key: unknown }
}
```

Сейчас `DbSyncMessage` знает только про `insert-particle`/`insert-field`. После обобщения — любая таблица любого слоя может быть зеркалена per-row.

### 11.5. Идемпотентность и identity

**Все ID детерминированы через `deriveUuid(seed-strings…)`** — как сейчас в pkg/db.materialize:
- `meta.id = deriveUuid("meta", src)` — стабильно между запусками, можно безопасно идемпотентно `put`.
- `meta_field.id = deriveUuid("meta-field", meta_id, field_key)`
- `meta_state.id = deriveUuid("meta-state", meta_id, state_name)` — etc.
- `wimp.id` — на основе path в matter-графе (`deriveUuid("wimp", parent_wimp_id, slot, order)`).
- `view_particle_shell.particle_id` — на основе wimp_id или матч-графа path.

Это убирает `crypto.randomUUID()` из store/meta/sqlite и **гарантирует**, что повторный materialize той же DSL → той же базе → идентичные ID. После этого `put()` становится по-настоящему идемпотентным; удаление + повторный insert не нужно.

### 11.6. Per-row materialize вместо row-group

`materialize.ts` переписывается на **per-row writes** в transaction:

```ts
// Вместо:
await backend.writeMetaRows(buildMetaRows(meta))
// → собирает 12+ row-array в bundle, пишет одним atomic block

// Будет:
await store.transaction(async (tx) => {
  await tx.put("meta", { id, src, name, ... })
  for (const field of meta.fields) {
    await tx.put("meta_field", { id: deriveUuid(...), ... })
    if (field.default !== undefined) {
      await tx.put("meta_field_default", { ... })
      await tx.put(`meta_field_${type}_default`, { ... })
    }
  }
  // ... etc
})
```

Решает `#56` (row-group → entity-stage). Транзакция гарантирует atomicity, mirror внутри transaction сериализуется в правильный порядок (см. `instance-store-mirror.spec.ts`-style tests).

### 11.7. Browser-safe entry

`pkg/db/browser.ts` остаётся, но сужается до:
```ts
export { createIdbDbStore } from "./idb-store.ts"
export type { DbStore, DbStoreSpec, DbStoreMirrorOptions } from "./store.t.ts"
export { createMirroredDbStore, applyDbSyncMessage } from "./store-mirror.ts"
export { metaforDbStoreSpec } from "./schema.ts"
// + чистые types
```

Server-side `pkg/db/index.ts` дополнительно тянет `createSqliteDbStore` из `./sqlite-store.ts` (с `bun:sqlite`).

### 11.8. Миграции

**Schema-version-based** через `spec.schemaVersion`:
- При open: читаем `app_setting.key='schema_version'`, сравниваем с `spec.schemaVersion`.
- Mismatch → запускаем миграции (`migrations[oldVersion → newVersion]`) или `reset()` (для DSL-canonical, который пересобирается из DSL).
- Render-слой можно reset при mismatch — он derived.
- Settings-слой — миграции через revision-маркер (как сейчас).

Это убирает `APP_CONFIG_REVISION` руками и `backend.reset()` в dark.worker (он сейчас обнуляет всё на каждый materialize).

### 11.9. Зеркалирование на клиент

Только два варианта зеркала:
1. **Render-слой** (`view_*`) — обязательно, через текущий `db-sync` механизм. Live live live.
2. **Meta-слой** (`meta_*`, `wimp_*`, `entanglement_*`) — **опционально**, по флагу: если клиенту нужен DSL-emit или встроенный inspector — включаем зеркало; иначе клиент работает только через server-side API (RPC через WebSocket).

Это даёт ответ на §6.3 (кто пишет в браузерный canon): mirror работает **универсально** через `DbSyncMessage`, тот же контракт — ничего нового.

### 11.10. Что физически живёт

```
SERVER (Bun)                                BROWSER
─────────────────────────────────────       ─────────────────────────────
{appName}.sqlite (один файл, WAL)           {appName} (одна IDB)
  ├─ meta_*           28 таблиц               ├─ meta_*           28 stores (если зеркалим)
  ├─ wimp_*            6 таблиц               ├─ wimp_*            6 stores (если зеркалим)
  ├─ entanglement_*    4 таблицы              ├─ entanglement_*    4 stores (если зеркалим)
  ├─ view_*            2 таблицы              ├─ view_*            2 stores (всегда зеркалим)
  └─ app_*             1 таблица              └─ app_*             1 store
```

**Один файл / одна IDB на runtime.** Не три SQLite-схемы и не три IDB-базы.

### 11.11. Что удаляется

| Текущий код | Куда уходит |
|---|---|
| `store/meta/sqlite/` (вся директория) | superset-схема `meta_*` поглощает 33 таблицы; функциональность `relation()` → `materialize.ts` (с per-row writes); `getMetaDB()` → `createSqliteDbStore({spec: metaforDbStoreSpec})` |
| `*.sql` файлы в корне репо | `pkg/db/schema/{meta,wimp,entanglement,view,app}.ts` — declaration-based |
| `pkg/db/backend.t.ts`, `backend.ts`, `sqlite.ts` (1598 строк), `idb.ts` (1035 строк) | `pkg/db/store.t.ts`, `pkg/db/sqlite-store.ts`, `pkg/db/idb-store.ts` (общая generic-логика, ≈400-500 строк суммарно) |
| `pkg/db/instance-store.t.ts`, `sqlite-instance-store.ts`, `idb-instance-store.ts`, `instance.ts` | `view_*` слой в общем контракте |
| `pkg/db/instance-store-mirror.ts` | обобщённый `pkg/db/store-mirror.ts` поверх контракта |
| `pkg/db/materialize.ts` (per-row writes без in-memory bundle) | существенно упрощается — нет signature-cache, нет `bundlesById` (per-row writes идемпотентны через `deriveUuid`) |
| `store/meta/sqlite/sqlite.spec.ts`, `pkg/db/backend.spec.ts`, `pkg/db/instance.spec.ts`, `pkg/db/backends.parity.spec.ts`, `pkg/db/instance-store.parity.spec.ts` | один parity-test поверх spec; один schema-integrity test; один mirror test |
| `boundary/server.ts` standalone (если не нужен) | удалить или явно пометить как `dev-only` |
| `boundary/web.ts` standalone | удалить или явно пометить как `dev-only` |
| `app/web/ui-settings-idb.ts` (отдельная IDB) | `app_setting` таблица в общей IDB; `loadPersistedAppWebUiSettings` → `store.get("app_setting", "ui_display")` |

### 11.12. Что **остаётся**

- `protocol.ts` — корневые имена каналов без shared payload types.
- `dark.worker.ts` `canonicalizeMetaGraph` — упрощается: вместо 3-stage (`relation` → `readDarkParticleModel` → `matter`) остаётся один stage `matter` с per-row writes в общий store. `readMetaDsl` остаётся как JS-import.
- `boundary/database.ts` operational caches — это derived проекции от store; остаются.
- BroadcastChannel-каналы — `db-sync` обобщается, остальные без изменений.

### 11.13. Проблемные точки

1. **`meta_mass_value` дерево + IDB compound indexes.** Рекурсивная структура в IDB требует sentinel-pattern для null-parent (как сейчас в `idb-instance-store`). Можно упростить через `mass JSON-blob` в `meta` row + отдельная denormalize-проекция, но это отказ от reactor-стиля DSL → mass tree (gap для round-trip). Tradeoff: либо queryable mass tree (28 таблиц), либо JSON-blob (1 колонка).
2. **`condition_predicate` нормализация в IDB.** Те же compound indexes; реализуемо.
3. **`matter_particle` 4 subtypes.** В IDB можно держать одной таблицей с `kind` discriminator + JSON `payload`; в SQLite — отдельные subtype-таблицы. Контракт скрывает это.
4. **`wimp_id` стабильность.** Сейчас в pkg/db `wimp.id` строится из `parent_wimp_id, slot, order` через `deriveUuid` — но при пересборке matter-графа порядок может меняться. Нужно проверить, что после relayout-а ID стабильны.
5. **Размер IDB.** Browser-side 41 таблица — много object-stores. IDB не имеет ограничений на их количество, но `onupgradeneeded` версионирование становится нетривиальным. Можно держать только render+settings в IDB, остальное — server-side через RPC.

### 11.14. Этапы реализации (предложение)

1. **Spec-first:** написать `pkg/db/schema/{meta,wimp,entanglement,view,app}.ts` — declarations таблиц + индексов + типов. Это первый коммит, без изменения runtime.
2. **Generic store:** реализовать `createSqliteDbStore<T>(spec)` и `createIdbDbStore<T>(spec)` поверх contract. Покрыть parity-spec поверх любого spec.
3. **Wire-up render:** перевести `DbInstanceStore` на новый `DbStore<{view_particle_shell, view_field_orbit}>`. Это минимальная замена (текущий instance-store = подмножество нового).
4. **Wire-up canonical:** перевести `DbBackend` (24 таблицы) на новый контракт. `materialize.ts` остаётся row-group oriented, но через generic API.
5. **Поглощение store/meta/sqlite:** добавить недостающие meta-таблицы (`meta_mass_node`, нормализованные predicates, particle subtypes, type-specific defaults). Удалить `store/meta/sqlite/`. Удалить `*.sql` файлы.
6. **Per-row materialize:** переписать `materialize.ts` на per-row writes, убрать in-memory bundle-кэши.
7. **Universal mirror:** обобщить `DbSyncMessage` до `{kind: put|delete, table, row|key}`. Mirror работает на любых таблицах из whitelist.
8. **Settings:** мигрировать `ui-settings-idb` в `app_setting` таблицу общей IDB. Удалить отдельную IDB.
9. **Cleanup:** удалить `boundary/server.ts`, `boundary/web.ts` standalone-точки или пометить как dev-only.

### 11.15. Открытые вопросы дизайна

1. **Нужно ли зеркалить meta+wimp+entanglement в браузер?** Если только render — IDB маленькая (3 stores). Если хотим клиентский DSL-emit или client-side query — большая (41 store). Зависит от UX-требований.
2. **`meta_mass_node` дерево vs `meta.mass` JSON-blob.** Tradeoff queryable vs simplicity. Рекомендую: blob по умолчанию (один источник для round-trip), denormalized projection если понадобятся mass-queries.
3. **WAL / busy_timeout на стороне SQLite в один файл с тремя open-handles.** Сейчас всё работает на WAL, но конкурентность чтения/записи может стать узким местом. Можно ли все handles вести через один — централизованный — `DbStore`, а воркерам передавать ссылку через postMessage transferable? (нет — `Database` не transferable). Альтернатива: один SQLite-файл, но через server-side RPC (worker pool).
4. **Скорость per-row vs row-group.** SQLite транзакция с 1000 INSERT-ов медленнее чем `INSERT INTO ... VALUES (...), (...), ...`. Нужен бенчмарк.
5. **IDB versioning при добавлении таблиц.** Каждая новая таблица в `meta_*` слое требует `version + 1` IDB-миграции. Это рвёт open-handles браузера. Возможное решение: единая `db_v1` IDB с одним store `__rows__` где ключ = `${tableName}|${primaryKey}` — тогда добавление таблицы не требует version-bump. Но потеряем typed object-stores.

---

## 12. История правок документа

- 2026-04-25 — первичная версия (Vladimir + claude). Структура: история → текущее состояние → намерение → gap → варианты → вопросы.
- 2026-04-25 — добавлены §8 (полный inventory persistence touchpoints), §9 (глубокий разбор store/meta/sqlite — 33 таблицы), §10 (полный pipeline materialize), §11 (финальный единый дизайн с superset-схемой, generic-контрактом, миграциями, этапами реализации).
