# MetaFor runtime audit

Дата: 2026-06-09.

Цель ревизии: понять текущие проблемы MetaFor как runtime-системы, не смешивая
MetaFor с интерпретатором.

## Главное

MetaFor сейчас находится в середине миграции с удаленного старого `store/db` на
новый `store` (`wimp` + `actor` + `topology`).

Из-за этого есть две разные картины одновременно:

- новый `Dark -> store` путь уже живой и проходит тесты;
- старый `Boundary / app/web / Bulk render / process runtime` путь еще импортит
  `store/db`, которого больше нет.

Поэтому текущая проблема не в том, что в проекте вообще нет исполнения. Проблема
в том, что сквозной контур исполнения MetaFor разорван на границе нового store.

## Что Уже Работает

### Store

`store/sqlite.open()` поднимает единую SQLite БД с декларативным `wimp`-слоем,
runtime `actor/value/state`-слоем и `topology`.

Проверено:

```sh
bun test store/store.spec.ts store/tests/github-zavx0z.test.ts
```

Результат: green.

Работает:

- `graviton`-патчи декларации;
- `gluon`-патчи values и actor value links;
- `photon`-патчи actor state;
- shared value через общий `value.uuid`;
- чтение через ORM `store.wimp`, `store.actor`, `store.topology`.

### Dark

Текущий `dark/dark.ts` уже пишет не в старый `DbMaterializationWriter`, а в
новый `store`.

Проверено:

```sh
bun test dark/dark.spec.ts dark/server.spec.ts dark/tests/matter.test.ts dark/tests/matter-step.test.ts dark/wimp.spec.ts
```

Результат: green.

Работает:

- `matter("zavx0z/git")` разворачивает дерево;
- root actor создается и привязан к `zavx0z/git`;
- topology-узлы `Fuzzy` / `Axion` создаются;
- дочерние wimp-ветви материализуются;
- `git-start.args` shares `value.uuid` с root `git.args`;
- `dark/server.ts` слушает `gravity` add `/wimp/<src>` и материализует дерево в
  store.

### Bulk process executor

Чистый executor и загрузка action-модулей работают.

Проверено:

```sh
bun test bulk/weak/execute.spec.ts bulk/weak/load.spec.ts app/web/runtime/bulk.process.spec.ts
```

Результат: green.

Работает:

- dynamic import action-модуля;
- выполнение sync/async action;
- success/error handler;
- возврат UUID-addressed values для W-result.

Важно: `app/web/runtime/bulk.process.spec.ts` проверяет target-level executor,
но не проверяет реальные worker entrypoints.

## Что Сейчас Сломано

### 1. App runtime workers не стартуют

Прямой импорт worker entrypoints падает:

```sh
bun -e 'await import("./app/web/runtime/boundary.worker.ts")'
bun -e 'await import("./app/web/runtime/bulk.worker.ts")'
bun -e 'await import("./app/web/runtime/dark.worker.ts")'
```

Все три падают на:

```text
Cannot find module 'store/db'
```

Это означает: `app/web/server.ts` может поднять HTTP/WS оболочку, но при
materialize/runtime boot worker-слой MetaFor не сможет подняться.

### 2. Boundary runtime все еще зависит от старого `DbBackend / DbData`

`boundary/boundary.ts`, `boundary/database.ts`, `boundary/boot.ts` импортят:

```ts
store/db/core
```

Тесты Boundary/Weak падают до выполнения:

```sh
bun test boundary/tests/db.runtime.test.ts boundary/weak/tests/weak.cpu.test.ts boundary/weak/tests/weak.parity.test.ts
```

Основная причина:

```text
Cannot find module 'store/db/core'
```

Boundary пока не умеет читать новый `store.wimp + store.actor + store.topology`
как runtime fragment.

### 3. Bulk render projection привязана к старому `@store/actor` render API

`app/web/client.ts`, `app/web/runtime/dark.worker.ts`,
`bulk/gravity/layout/*`, `bulk/web/index.ts` импортят из `@store/actor` старые
render-row symbols:

```ts
DbActorStore
createIdbDbActorStore
createSqliteDbActorStore
createMirroredActorStore
applyDbSyncMessage
DbParticleShellRow
DbFieldOrbitRow
DbWorldRows
```

Текущий `@store/actor` их не экспортирует. Он экспортирует ORM actor/value/state,
а не render projection store.

Значит render rows нужно вынести в отдельный Bulk/render projection module или
вернуть как отдельный package, но не смешивать с canonical `@store/actor`.

### 4. `app/web/runtime/dark.worker.ts` устарел относительно нового Dark

Worker все еще содержит старый путь:

- `openDbMaterializationWriter`;
- `openDbSqliteBackend`;
- `StoreWimpSqlite` напрямую;
- старые `Wimp/Fuzzy/Axion/Macho` из `@dark/strong`;
- `load.context`;
- прямой `dbWriter` route вокруг `matter(...)`.

Текущий `dark/index.ts` и `dark/dark.ts` работают иначе:

```ts
globalThis.store = await open(...)
await matter("zavx0z/git")
```

То есть standalone Dark уже переехал, а app worker остался на старой модели.

### 5. Process runtime не связан с новым store

`app/web/runtime/bulk.process.ts` уже знает, как выполнить process target, но
его resolver читает старый `DbBackend`:

```ts
backend.readWimpRows(...)
backend.readMetaRows(...)
backend.readWimpEdge(...)
```

После миграции нужно новое чтение:

```text
store.actor + store.wimp + store.topology -> process target
```

Пока этого нет, `Bulk` не сможет исполнять реальные process-bound states из
нового store.

### 6. Документы и task-файлы частично исторические

Некоторые документы все еще описывают `store/db` как активный слой или говорят,
что Force-каналы еще не были введены.

Факт на 2026-06-09:

- `store/db` в коде отсутствует;
- новый store частично работает;
- `Dark` уже пишет в новый store;
- Force types и channel существуют;
- app/runtime еще не переведен.

Старые документы полезны как история, но не должны быть текущим планом без
актуализации.

## Typecheck

Команда:

```sh
bunx tsc --noEmit --pretty false
```

Результат: fail.

Главные MetaFor-группы ошибок:

- missing `store/db`;
- missing render-row exports from `@store/actor`;
- stale Dark exports in `app/web/runtime/dark.worker.ts` and fixtures;
- old Boundary tests/fixtures tied to `DbData`;
- secondary strict TS errors in unrelated packages.

## Диагноз

Сейчас живой центр MetaFor уже сместился в новый store:

```text
Dark -> store.wimp / store.actor / store.topology
```

Но исполняющий и проявленный контур все еще частично старый:

```text
Boundary -> old DbData
Bulk process -> old DbBackend
app/web workers -> old store/db
Bulk render -> old @store/actor render store
```

Поэтому MetaFor не может считаться рабочей как цельная runtime-система, пока
эти контуры не читают один и тот же новый store.

## Ближайший Рабочий Маршрут

Не начинать с интерпретатора. Интерпретатор нужен как среда работы, но проблема
сейчас в MetaFor runtime.

Ближайшая цель:

```text
Dark materializes store -> Boundary observes store -> Bulk executes process -> Boundary applies result -> Bulk/App sees change
```

Порядок работ:

1. Обновить `app/web/runtime/dark.worker.ts` на текущий `dark/index.ts` /
   `dark/dark.ts` путь через `store/sqlite.open()`, без `store/db`.
2. Вынести render-row API из `@store/actor` в отдельный Bulk/render projection
   слой и обновить `app/web/client.ts`, `bulk/web`, `bulk/gravity/layout`.
3. Сделать Boundary adapter поверх нового store:
   `store.wimp + store.actor + store.topology -> BoundaryDatabaseData /
   prepared runtime`.
4. Перевести `app/web/runtime/boundary.worker.ts` на этот adapter.
5. Перевести `app/web/runtime/bulk.process.ts` target resolver с `DbBackend` на
   новый store.
6. Поднять один вертикальный сценарий process execution на `zavx0z/git`:
   state enters process -> Boundary emits photon -> Bulk executes action ->
   Bulk emits W result -> Boundary applies parts/unlocks -> value/state visible
   in store and UI.

## Чего Не Делать

Не восстанавливать старый `store/db` как финальную совместимость.

Такой shim может временно скрыть ошибки импорта, но вернет проект к двойному
источнику истины и снова отложит главный переход: единый store как world/runtime
layer.

Если нужен временный compatibility helper для tests, он должен жить в
`fixture`/debug слое и не становиться production path.
