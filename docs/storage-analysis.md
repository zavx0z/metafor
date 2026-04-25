# Storage analysis — глубокий разбор хранилища MetaFor

> **Цель документа.** Свести в одно место (а) что было задумано про store/db с самого начала, (б) что было сделано на каждой эпохе, (в) что мы имеем сейчас в `arch`, (г) что хочет user сегодня, (д) разрыв между «хочу» и «имеем», (е) кандидаты-варианты, как закрыть разрыв.
>
> Документ редактируется по ходу обсуждения.

---

## TL;DR

В репозитории **уже было** реализовано «один и тот же API над SQLite/IDB с разной реализацией под капотом» — три раза, в трёх эпохах, и каждый раз почти полностью переписывалось. Сейчас в `arch` живут одновременно две таких абстракции:

1. **`DbBackend`** (старая, ~3300 строк) — каноническая реляционная схема (`metas`, `meta_fields`, `wimps`, `wimp_fields`, `field_values`, `field_sources`, `entanglements`*, `wimp_states`); SQLite + IDB реализации; используется boundary-runtime + `materialize`-pipeline в dark/web/bulk worker-ах.
2. **`DbInstanceStore`** (новая, ~400 строк) — узкий API для render-rows (`particle_shell`, `field_orbit`); SQLite + IDB реализации; используется dark.worker → BroadcastChannel → client → bulk viewport.

Эти две абстракции **не пересекаются по таблицам**, но архитектурно дублируют идею (контракт + два реализатора). Соответственно — рассогласование стилей: одна делает row-group writes (`writeMetaRows`, `writeWimpRows`), другая — per-row inserts (`insertParticleShell`). Mirror-канал и structural-barrier живут только над instance-store; SharedDb-write такой роскоши не имеет.

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

Свежая «третья» абстракция. Появилась в commit `1ff16f62` (`[feat] pkg/db, pkg/protocol - DbInstanceStore (SQLite + IDB) и per-row db-sync канал`) и `415de9bf` (`[feat/refactor] app/web - DB-стриминг через db-sync канал, browser держит свой IDB-зеркало`).

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
| `pkg/db/instance-store-mirror.ts` | 84 | `createMirroredInstanceStore(local, publisher, source)` — wrap-store, каждый write публикует `DbSyncMessage`; `applyDbSyncMessage(store, msg)` — receive-side |
| `pkg/db/instance-store.parity.spec.ts` | — | Parity SQLite↔IDB |

#### Sync-канал и барьер

```ts
// pkg/protocol/index.ts
export const DB_SYNC_BROADCAST_CHANNEL = "metafor.db-sync"
export interface DbSyncMessage {
  channel: "db-sync"
  source: ProtocolDomain
  rootSrc: string
  op:
    | { kind: "clear-world" }
    | { kind: "insert-particle"; row: DbParticleShellRow }
    | { kind: "insert-field"; row: DbFieldOrbitRow }
}

export const STRUCTURAL_BROADCAST_CHANNEL = "metafor.structural"
export interface StructuralSignalMessage {
  channel: "structural"
  source: ProtocolDomain
  rootSrc: string
  scope: { kind: "world" } | { kind: "subtree"; parentParticleId: string }
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
  ├─ structuralChannel.postMessage(barrier-signal) │
  │                                                │
  ▼                                                │
BroadcastChannel("metafor.db-sync")                │
BroadcastChannel("metafor.structural")             │
  │                                                │
server.ts (protocolMirrors): валидирует и          │
WebSocket.send({type:"protocol", channel, message})│
  │                                                │
  ▼                                                ▼
                                  socket.onmessage:
                                    db-sync     → applyDbSyncMessage(idbStore, op)
                                                  → IDB INSERT
                                    structural  → refreshViewportFromLocalStore
                                                  → idbStore.selectAll*
                                                  → bulkViewport.applyWorld(rows)
```

Гарантия порядка: единая Promise-цепочка `pendingSyncQueue` в client.ts.

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

Это уже сделано на уровне `DbInstanceStore` — снапшоты выпилены, идёт per-row sync через `DB_SYNC_BROADCAST_CHANNEL`, structural barrier триггерит `selectAllParticleShells/Orbits` из IDB. Но **аналогичного per-row sync для `DbBackend` пока нет** — boundary в браузере (`metafor-web`) живёт через `openDbIndexedDbBackend`, наполняется как? — не через стрим из bun-стороны, а через свою materialize-цепочку (нужно проверить отдельно).

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

## 8. История правок документа

- 2026-04-25 — первичная версия (Vladimir + claude). Структура: история → текущее состояние → намерение → gap → варианты → вопросы.

