# Исследование протокола Force/runtime

Дата: 2026-06-30. Ветка: `energy`.

Этот документ фиксирует состояние проекта после онтологического переименования
Bulk и готовит следующий архитектурный шаг: привести Force/runtime protocol к
онтологической форме для WIMP/Fuzzy/MACHO/Axion и обычных полевых частиц. Это
не план механического переименования. Сначала нужно закрепить текущие потоки
данных, временные несовместимости и границы доменов, затем вводить слой
адаптеров и резолверов.

Главный вывод: Bulk-модель уже говорит на правильном языке
`BulkManifest`, `BulkDarkParticle`, `BulkFieldParticle`, но поверхность
Force/runtime пока смешивает три слоя:

- текущий поток материализации Boundary через `graviton`;
- временный поток частичных обновлений AppWeb/Bulk через `value.fields`;
- старый weak-поток Energy/Bulk с `/field/...`, `/wimp/.../process/...` и
  `processId` в payload.

Следующий шаг должен быть маленьким и обратимо безопасным: задокументировать
закон Force, добавить типизированные нормализаторы/резолверы, сохранить текущий
`value.fields` на границе Force и не протаскивать словарь Bulk в protocol
payload.

## 1. Карта дерева проекта

### Root DSL / публичный API

Минимально изученные файлы:

- `index.ts`
- `metafor.ts`
- `metafor.t.ts`
- `fields.t.ts`
- `matter.t.ts`
- `process.t.ts`
- `reactions.t.ts`
- `superposition.t.ts`
- `action.t.ts`
- `finally.t.ts`

Текущее состояние:

- Публичный DSL строит `MetaDSL` через chain API:
  `fields -> superposition -> mass -> processes -> reactions -> matter -> bulk`.
- Пользователь описывает WIMP declaration через `MetaFor(name, config?)`.
- В root DSL еще много старого языка: `atom`, `actor`, `meta`, `field`.
- `fields.t.ts` поддерживает `string`, `number`, `boolean`, `array`, `enum`.
- `enum` и `array` пока остаются public schema API, хотя целевая онтология:
  `enum -> Fuzzy`, `array -> MACHO`.
- `matter.t.ts` описывает иерархию actors через `<meta-for>` и допускает
  topology selection по `state`, `enum`, `array`.
- `metafor.t.ts` определяет `ReactionPart` как `{ from?, op, path, value? }`
  без `part`. Это старый reaction-facing shape, не финальный Force contract.
- `reactions.t.ts` в документации использует старые path examples:
  `"/context"`, `"/state"`, `"/fields"`.

Вывод:

- Root DSL нельзя сейчас чистить механически. Это public authoring API.
- `enum` и `array` надо оставить до отдельной semantic migration.
- Нужно разделить authoring schema language и runtime impulse language:
  field schema declaration не равен field value update impulse.

### Документация

Минимально изученные файлы:

- `docs/ONTOLOGY.md`
- `docs/ARCHITECTURE.md`
- `docs/FORCE.md`
- `docs/TOPOLOGY.md`
- `docs/DEVELOPMENT.md`
- `docs/proto/gravity.md`
- `docs/proto/strong.md`
- `docs/proto/weak.md`
- `docs/proto/higgs.md`
- `docs/proto/electromagnetism.md`
- `task/render-projection.md`
- `TODO.md`

Актуальные положения:

- `docs/ONTOLOGY.md` и `docs/ARCHITECTURE.md` уже правильно разделяют
  `Dark`, `Boundary`, `Energy`, `Bulk`.
- Energy и Bulk не должны читать Boundary/SQLite напрямую.
- `docs/proto/strong.md` уже выводит `enum`/`array` из ordinary Strong/Gluon flow.
- `docs/proto/higgs.md` трактует `enum` как topology branch selector, а `array`
  как topology multiplicity.
- `task/render-projection.md` уже обновлен под Bulk rename:
  Dark particles проявляются torus geometry, Field particles проявляются
  sphere geometry.
- `TODO.md` фиксирует текущие незакрытые runtime-задачи:
  `Energy` должен получать самодостаточный runtime snapshot, а
  `app/web/runtime/bulk.process.ts` еще не переведен на projection/runtime data.

Конфликтующие или исторические места:

- `docs/FORCE.md` концептуально полезен, но примеры все еще используют
  `/field/<uuid>`, `/wimp/<uuid>`, `./actions/detect`, `process`.
- `docs/TOPOLOGY.md` допускает typed prefixes `w:`, `f:`, `m:`, `a:`. Это можно
  оставить как Dark connectivity graph notation, но нельзя переносить в runtime
  Force `path`.
- Store docs местами исторические. Их нужно читать как design notes, а не как
  текущий protocol contract.

### Dark

Минимально изученные файлы:

- `dark/dark.ts`
- `dark/continuation.ts`
- `dark/index.ts`
- `dark/server.ts`
- `dark/gravity/matter.ts`
- `dark/em/index.ts`
- `dark/gravity/channel.ts`
- `dark/tests/*`

Текущее состояние:

- `matter(src)` загружает `MetaDSL`, создает WIMP declaration через
  `boundary.wimp.create(src, dsl)` при необходимости, затем создает root actor,
  values, actor state, topology nodes и child actors.
- Materialization идет BFS по matter plan.
- `wimp` plan создает child actor.
- `fuzzy`/`axion`/`macho` plan создает `boundary.topology` node.
- Boundary observer в `dark/dark.ts` реагирует на:
  `{ part: "graviton", op: "test", path: "wimp", value: src }`.
- `dark/continuation.ts` исключает `enum`/`array` из direct source
  entanglement для ordinary fields.
- `dark/em/index.ts` все еще emits field changes как `/field/${wimpFieldId}`.
- `dark/gravity/channel.ts` содержит legacy helpers:
  `emitAdd(wimpId)`, `emitRemove(wimpId)`, `emitBarrier(path: "")`.

Вывод:

- Dark уже материализует WIMP/Fuzzy/MACHO/Axion в Boundary, но runtime force
  helpers еще используют старую `/field` address form.
- `graviton test wimp` можно сохранить как v0 control signal, но нужно отделить
  его от финальной runtime impulse law.

### Boundary

Минимально изученные файлы:

- `boundary/force.t.ts`
- `boundary/force.ts`
- `boundary/sqlite.ts`
- `boundary/runtime/bulk.ts`
- `boundary/runtime/energy.ts`
- `boundary/wimp/sqlite/*`
- `boundary/actor/sqlite/*`
- `boundary/topology/sqlite/*`
- `boundary/value/*` через actor value layer

Текущее состояние:

- `boundary/force.t.ts` определяет единую Force particle:
  `{ part, op, path, value?, from?, ... }`.
- `boundary/force.ts` владеет `BroadcastChannel("force")` и API
  `observe`, `entropy`, `emit`, `absorb`.
- `boundary/sqlite.ts` применяет в SQLite только `graviton` particles:
  `path: "wimp"`, `path: "actor"`, `path: "fuzzy" | "axion" | "macho"`.
- `boundary/sqlite.ts` сейчас игнорирует или возвращает `false` для:
  `gluon`, `photon`, `higgs`, `w+`, `w-`, `z`.
- `BoundaryWimpSqlite.create()` emits full WIMP snapshot part:
  `{ part: "graviton", op: "add", path: "wimp", value: { wimp, fields, enumVariants, states } }`.
- `BoundaryActorSqlite.create()` emits:
  `{ part: "graviton", op: "add", path: "actor", value: actor.rows() }`.
- `BoundaryTopologySqlite.create()` emits:
  `{ part: "graviton", op: "add", path: "fuzzy" | "axion" | "macho", value: topology }`.
- `bulkRuntime()` возвращает `BoundaryBulkRuntimeSnapshot` с actors,
  topologies, wimps, fields, enum variants, actor values, values, matter
  particles и binding paths.
- `energyRuntime()` возвращает `BoundaryEnergyRuntimeSnapshot` с WIMP ids,
  runtime fields, branes, state names, strong/weak indexes.
- `BoundaryEnergyRuntimeSnapshot.strong.topologyWimpFieldIds` сейчас `[]`.
  Это означает, что enum/array еще не стали реальным Energy topology runtime.

Canonical data:

- WIMP declaration хранится в `wimp`, `field`, `field_enum_variant`, `state`,
  `transition`, `process`, `reaction`, `matter_particle`.
- WIMP instance сейчас называется actor и хранится в `actor`, `actor_state`,
  `actor_value`, `value`, typed value tables, `value_list_item`.
- Runtime connectivity хранится в `topology` с `kind = fuzzy | axion | macho`.
- Source/entanglement сейчас выражены через shared `value.id` в `actor_value`;
  отдельной source graph table пока нет.

### Energy

Минимально изученные файлы:

- `energy/index.ts`
- `energy/energy.ts`
- `energy/channel.ts`
- `energy/store.t.ts`
- `energy/strong/*`
- `energy/weak/*`
- `energy/tests/*`
- `energy/energy.spec.ts`

Текущее состояние:

- `loadRuntimeSnapshot(snapshot)` загружает Boundary runtime projection в
  `energy$`, `gravity$`, `strong$`, `weak$`.
- Energy хранит branes, runtime fields, state names, locks, weak runtime state
  и mapping caches.
- Public value application еще использует field-id addressing:
  `requireFieldPartId(path)` ожидает `/field/<id>`.
- `applyRuntimeValueParts()` уже допускает `/field/<id>` или bare numeric id.
- `setValues()` принимает `Record<string, unknown>`, keyed by `wimpFieldId`.
- `publishPhotonChanges()` emits:
  `{ part: "photon", op: "replace", path: String(wimpId), value: stateName }`.
- `applyWeakResultPacket()` сейчас требует payload:
  `{ wimpId, processId, parts: [{ op: "replace", path: "/field/<id>", value }] }`.
- W-result collection читает `wimpId` и `processId` из extra fields.
- Process-bound states уже есть через
  `weak$.stateProcessIdsByBraneIndex[braneIndex][stateIndex]`.
- Locks уже есть через `EnergyBraneRecord.lock` и weak heap lock updates.
- Topology runtime неполный: `topologyWimpFieldIds` пустой, enum/array еще
  encoded как field types.

Вывод:

- Energy уже имеет полезные resolver caches, но Force surface все еще протекает
  URI-like `/field` paths и `processId` в payload.
- До v1 minimal IDs нужен normalizer/resolver layer на основе
  `BoundaryEnergyRuntimeSnapshot`.

### Bulk

Минимально изученные файлы:

- `bulk/index.ts`
- `bulk/gravity/layout/world.ts`
- `bulk/gravity/layout/snapshot.ts`
- `bulk/gravity/layout/stream.ts`
- `bulk/web/index.ts`
- `bulk/web/force-protocol.ts`
- `bulk/web-navigation.ts`
- `bulk/label-visibility.ts`
- `bulk/weak/*`
- `bulk/em/index.ts`

Текущее состояние:

- Bulk layout contract после rename чистый:
  `BulkManifest`, `BulkDarkParticle`, `BulkFieldParticle`.
- `BulkManifest` является runtime/projection contract, а не persistence row-set.
- `bulk/web/force-protocol.ts` намеренно принимает только `value.fields` для
  текущих Force field patches и отвергает `value.fieldParticles`.
- `bulk/web/index.ts` viewport adapter обрабатывает:
  `higgs` with `path = wimp src`, `value.fields = { fieldKey|order: schemaPatch }`;
  `gluon` with `path = actor dark particle id`, `value.fields = { fieldKey|order: scalar }`.
- Bulk direct adapter обновляет render records, но не пишет Boundary.
- `bulk/em/index.ts` остается историческим weak/process bridge:
  `/wimp/${wimpId}/process/${processId}`, `/field/${wimpFieldId}`,
  extra `wimpId`, `processId`.

Вывод:

- Bulk rename нельзя ломать.
- `value.fields` на Force boundary пока нельзя переименовывать в
  `value.fieldParticles`.
- BulkManifest vocabulary должен оставаться projection vocabulary, не Force payload.

### App Web

Минимально изученные файлы:

- `app/web/server.ts`
- `app/web/client.ts`
- `app/web/world.ts`
- `app/web/run.ts`
- `app/web/settings.ts`
- `app/web/app-config.ts`
- `app/web/hud.ts`
- `app/web/server.t.ts`
- `app/web/runtime/bulk.process.ts`

Текущее состояние:

- `server.ts` imports `dark/server`, opens Boundary and installs Dark observer.
- `buildSnapshot()` сейчас вызывает `boundary.bulkRuntime()` и строит
  `BoundaryBulkRuntimeSnapshot`; Energy snapshot в WebApp bootstrap пока не входит.
- HTTP `/force` вызывает `boundary.absorb()` и затем broadcasts particle.
- WebSocket handles `materialize` и `relayout`; generic Force routing в Energy
  пока не собран.
- `client.ts` хранит `currentSnapshot`, применяет partials через `value.fields`,
  затем вызывает `bulkViewport.handleForce(part)`.
- `buildBoundaryBulkManifest()` в `app/web/world.ts` адаптирует Boundary snapshot
  в `BulkManifest`.
- `app/web/runtime/bulk.process.ts` остается старым monolith process runner и
  импортирует старый `boundary/db/core`; сервером сейчас не используется.

Вывод:

- Сейчас AppWeb фактически orchestrates Boundary -> Bulk visualization.
- Energy runtime не является полноценным участником WebApp force pipeline.
- Следующий шаг: не переписывать всё, а добавить orchestrator route и runtime
  projection cache.

### Store

Минимально изученные файлы:

- `store/README.md`
- `store/wimp/README.md`
- `store/actor/README.md`
- `store/sqlite.ts`
- `store/meta/sqlite/*`
- `store/actor/sqlite/*`
- `store/topology/sqlite/*`

Текущее состояние:

- Store docs в основном исторические, но полезны для понимания намерения:
  Store должен хранить declarations, instances, topology, values и shared values.
- Текущий runtime persistence фактически живет в Boundary SQLite modules.
- Shared values/source/entanglement сейчас представлены через общий `value.id`.

Вывод:

- Store не должен становиться runtime dependency для Energy/Bulk.
- Resolver caches должны приходить из Boundary snapshot/projection.

### Тесты

Наблюдения:

- Bulk layout/navigation tests уже покрывают Bulk rename behavior.
- `bulk/web/force-protocol.spec.ts` покрывает важный invariant:
  `value.fields` принимается, `value.fieldParticles` не принимается.
- Energy tests покрывают часть `/field` behavior и photon/state behavior.
- Нет интеграционного теста, который проверяет полный AppWeb path:
  Force `{ part: "gluon", value: { fields } }` -> client snapshot partial ->
  `bulkViewport.handleForce()` -> visual field particle update.
- Нет теста orchestrator responsibilities Boundary/Energy/Bulk.

### Исторические reference-ветки

Проверенные ориентиры:

- `origin/ref:app/web/INTERACTION_FLOW.md`
- `origin/ref:app/web/runtime/bulk.process.ts`
- `origin/ref:bulk/em/index.ts`
- `origin/ref:task/store-unification.md`
- `origin/ref:task/issues-audit.md`
- ветки `arch`, `ref`, `ui`

Семантический свидетель из истории:

- `photon` запускает process.
- `z` координирует claim/accept/release.
- `w+`/`w-` возвращают compact process result.
- success/error handlers собирают write-set.
- shared values/entanglement могут retrigger transitions.

Что нельзя копировать как финальный протокол:

- `/field/...`
- `/wimp/.../process/...`
- typed path prefixes as runtime path
- обязательные `wimpId`/`processId` в payload там, где resolver cache может
  вывести контекст.

## 2. Текущий поток данных

### Материализация

1. User/WebApp вызывает `graviton` control signal:
   `{ part: "graviton", op: "test", path: "wimp", value: src }`.
2. Dark observer принимает signal и вызывает `matter(src)`.
3. `matter(src)` загружает DSL, создает WIMP declaration при необходимости.
4. Dark создает actor instance, initial values, actor state.
5. Dark создает topology nodes для Fuzzy/MACHO/Axion matter plan.
6. Boundary emits `graviton add` snapshots для WIMP, actor, topology.
7. Boundary SQLite применяет только эти materialization snapshots.

### Bulk-снимок

1. AppWeb server вызывает `boundary.bulkRuntime()`.
2. Boundary возвращает `BoundaryBulkRuntimeSnapshot`.
3. `app/web/world.ts` строит `BulkManifest`:
   Boundary actor -> WIMP `BulkDarkParticle`;
   Boundary topology -> Fuzzy/MACHO/Axion `BulkDarkParticle`;
   ordinary field -> `BulkFieldParticle`.
4. Bulk layout строит torus/sphere geometry.
5. Web viewport применяет `BulkManifest` к сцене.

### Energy-снимок

1. Boundary умеет строить `BoundaryEnergyRuntimeSnapshot`.
2. Energy умеет `loadRuntimeSnapshot(snapshot)`.
3. WebApp server сейчас не делает Energy bootstrap частью основного route.
4. Topology runtime в Energy пока неполный: `topologyWimpFieldIds` пустой.

### Вход Force

1. `/force` в AppWeb вызывает `boundary.absorb(part)`.
2. Boundary применяет только те parts, которые знает; сейчас это в основном
   `graviton`.
3. Server broadcasts particle клиентам.
4. Client применяет некоторые partials к `currentSnapshot`.
5. Client вызывает `bulkViewport.handleForce(part)` для direct visual update.

### Прямое частичное обновление области просмотра

- Для `gluon` и `higgs` Bulk/Web принимает текущий protocol shape через adapter:
  `value.fields`.
- `value.fieldParticles` специально не принимается.
- Это временная compatibility boundary, а не новая ontology.

### Путь исполнения процессов

- Исторический path существует в `app/web/runtime/bulk.process.ts` и
  `bulk/em/index.ts`, но он не является текущим полноценным AppWeb runtime.
- Energy имеет weak store/process state и W-result handlers.
- Не хватает orchestrator, который связывает AppWeb Force ingress,
  Boundary projection, Energy runtime step и Bulk visualization update.

## 3. Онтология после Bulk rename

### Частицы Dark Matter

- `WIMP`
- `Fuzzy`
- `MACHO`
- `Axion`

В Bulk они проявляются как `BulkDarkParticle` и torus geometry.

### Обычные полевые частицы

- `StringField`
- `NumberField`
- `BooleanField`

В Bulk они проявляются как `BulkFieldParticle` и sphere geometry.

### Переходные legacy-варианты

- `enum` сейчас еще может жить как legacy field variant.
- Целевая онтология: `enum -> Fuzzy`.
- `array` сейчас еще может жить как legacy field variant.
- Целевая онтология: `array -> MACHO`.
- `other` остается compatibility bucket до очистки.

### Actor/topology как Boundary-термины

- `actor` сейчас означает запущенный instance WIMP в Boundary/storage/runtime.
- `topology` сейчас означает persisted hidden connectivity node.
- Эти слова можно сохранять в Boundary implementation, но не делать ими
  публичную Bulk/Force ontology.

## 4. Закон протокола Force

Force — это domain-scoped JSON Patch-like operation.

Базовая форма:

```ts
type ForceParticle = {
  part: string
  op: string
  path: string
  value?: unknown
  from?: string
}
```

Инварианты:

- `part` выбирает carrier и address space.
- `path` является opaque ID внутри address space выбранного `part`.
- `part x path -> resolver`.
- `op x value -> impulse`.
- `value` несет минимальный impulse, не полный объект, кроме bootstrap/projection
  snapshots.
- `path` не является URI.
- Не использовать path prefixes: `/field/...`, `/wimp/...`, `actor:...`,
  `w:...`, `f:...`.
- Не пихать тип сущности в `path`.
- Не передавать `actorId` внутри `value`, если `path` уже является actor id.
- Не передавать `wimpId`, `stateId`, `processId`, `braneIndex`,
  `runtimeFieldIndex`, `fieldAddressId`, если это выводится через projection cache.
- Cache miss означает ошибку projection contract или необходимость projection
  update. Это не повод Energy/Bulk читать Boundary/SQLite.
- BulkManifest vocabulary не должен попадать в Force payload.
- В текущем v0 Bulk/Web adapter продолжает принимать `value.fields`.
- Force payload не переименовывается в `value.fieldParticles`.

Исключение:

- `graviton` bootstrap/materialization snapshots могут временно нести full
  projection object. Это control/projection event, не ordinary impulse.

## 5. Матрица адресации Force v0

### `graviton`

Назначение:

- existence;
- materialization;
- placement;
- parent/depth/connectivity projection;
- bootstrap snapshot.

Owner:

- Dark создает materialization intent.
- Boundary применяет persistent materialization.
- AppWeb использует результат для projection refresh.

Path kind v0:

- `"wimp"` для WIMP declaration snapshot/control.
- `"actor"` для WIMP instance snapshot.
- `"fuzzy" | "macho" | "axion"` для connectivity snapshot.
- Это legacy/control space; не переносить как pattern в остальные parts.

Value shape v0:

- full WIMP snapshot для declaration;
- full actor snapshot для instance;
- topology snapshot для Fuzzy/MACHO/Axion;
- `src` для текущего `test` materialization trigger.

Valid ops v0:

- `test` как current materialization trigger;
- `add`;
- `remove` позже;
- `replace` только для projection snapshot, если явно typed.

Required cache:

- Boundary WIMP/actor/topology ids;
- AppWeb Boundary snapshot cache.

Observers:

- Dark observer for `test`;
- Boundary SQLite for `add`;
- AppWeb server/client for snapshot refresh;
- Bulk via `BulkManifest`.

Invalid examples:

- `path: "/wimp/foo"`;
- `path: "w:foo"` as runtime Force path;
- payload с Bulk-specific `darkParticles`.

Required migration:

- Оставить v0 compatibility.
- Ввести typed guard для materialization trigger.
- Отделить bootstrap/projection snapshots от ordinary runtime impulses.

### `gluon`

Назначение:

- ordinary String/Number/Boolean value updates.

Owner:

- Boundary persists committed values.
- Energy applies runtime value impulses.
- Bulk/Web observes visual value label/color/text changes.

Path kind v0:

- `ActorId` as string. Это текущий closest safe path для AppWeb/Bulk:
  actor/WIMP instance является scope для `value.fields`.

Value shape v0:

```ts
{
  fields: Record<string, string | number | boolean | null>
}
```

Keys in `fields`:

- v0: `fieldKey` или current field order/key, как уже делает AppWeb/Bulk.
- Boundary/Energy normalizer должен уметь резолвить это в WIMP field id через
  projection cache.

Valid ops v0:

- `replace`;
- `add` only if schema/runtime semantics prove it;
- `remove` only for nullable/deleted values, not schema deletion.

Required cache:

- `actorId -> wimpId`;
- `wimpId + fieldKey -> wimpFieldId`;
- `actorId + wimpFieldId -> valueId`;
- `wimpFieldId -> runtimeFieldIndex`;
- `runtimeFieldIndex -> braneIndex`;
- Bulk `actorId -> darkParticleId`;
- Bulk `fieldKey -> fieldParticleId` within actor scope.

Observers:

- Boundary value commit;
- Energy Strong runtime;
- Bulk direct adapter;
- AppWeb snapshot partial updater.

Invalid examples:

- `path: "/field/123"`;
- `value: { fieldParticles: ... }`;
- `value: { actorId, fields }` if `path` is already actor id.
- `path: "fieldParticle:123"`.

Required migration:

- v0 keeps `value.fields`.
- v1 may move to `path = FieldAddressId | ActorFieldAddressId` and
  `value = scalar`, but only after resolver cache exists and all consumers can
  resolve it without Boundary reads.

### `higgs`

Назначение:

- connectivity/topology updates;
- Fuzzy branch selection;
- MACHO multiplicity;
- Axion logical condition/result;
- WIMP topology contract updates.

Owner:

- Boundary owns persistent topology.
- Energy owns runtime topology resolution after projection.
- Bulk observes changed connectivity as Dark particle/torus manifestation.

Path kind v0:

- For current AppWeb schema-like updates: WIMP `src` или ActorId, depending on
  caller.
- For runtime selection: ActorId scoped connectivity until stable
  ConnectivityId exists in projection.

Value shape v0:

```ts
{
  fields?: Record<string, unknown>
  connectivity?: {
    kind: "fuzzy" | "macho" | "axion"
    key?: string
    selection?: unknown
    multiplicity?: unknown
    predicate?: unknown
  }
}
```

Compatibility note:

- Current Bulk/Web direct adapter only relies on `value.fields` for visual
  schema/field patch behavior. Do not rename this to `fieldParticles`.

Valid ops v0:

- `replace`;
- `add`;
- `remove`;
- `test` for guarded topology transition if needed.

Required cache:

- ActorId -> WIMPId;
- WIMPId + enum key -> Fuzzy topology id;
- WIMPId + array key -> MACHO topology id;
- Axion ids from topology projection;
- topology id -> affected child actors;
- topology id -> BulkDarkParticle id.

Observers:

- Boundary topology persistence;
- Energy topology resolver;
- Bulk hidden connectivity tree;
- AppWeb snapshot builder.

Invalid examples:

- `path: "/field/enumX"`;
- `path: "f:123"` in runtime Force;
- payload with `BulkDarkParticle`.

Required migration:

- Phase 1: document/guard current shape.
- Phase 2: populate Energy topology runtime.
- Phase 3: introduce opaque ConnectivityId path for Fuzzy/MACHO/Axion impulses.

### `photon`

Назначение:

- state/activity/superposition signal;
- process-bound state signal;
- process start trigger if state maps to a process.

Owner:

- Energy owns runtime state transition evaluation.
- Boundary commits accepted persistent state.
- Bulk observes activity/visual state.

Path kind v0:

- `ActorId` or WIMP instance id as string.
- Current Energy emits `path = String(wimpId)`. This must be clarified:
  it is currently WIMP declaration id, not actor id. That is a mismatch.

Value shape v0:

```ts
"stateName"
```

or:

```ts
{ state: "stateName" }
```

Preferred v0:

- keep scalar string for current Energy emission;
- adapter may normalize `{ state }` for incoming AppWeb messages.

Valid ops v0:

- `replace`;
- `test` for state guard if used by reactions.

Required cache:

- ActorId -> braneIndex;
- stateName -> stateIndex;
- stateIndex -> processId if process-bound;
- process lock by brane.

Observers:

- Energy weak runtime;
- Bulk activity/render;
- Boundary actor_state commit;
- process orchestrator.

Invalid examples:

- payload with `processId` unless no resolver cache exists;
- `path: "/wimp/123/state"`;
- inflated full actor state object for simple transition.

Required migration:

- Resolve ActorId vs WimpId mismatch.
- Add typed guard and tests for minimal photon.
- Use resolver cache to start process-bound state.

### `z`

Назначение:

- neutral coordination;
- claim/release/accept/reject;
- locks.

Owner:

- Process orchestrator / Energy weak runtime.
- Boundary persists final accepted state/value changes, not every lock unless
  needed for durability.

Path kind v0:

- `ActorId` as process scope.
- If several process-bound states can be active, path may become
  `ProcessRunId` after claim creates it.

Value shape v0:

```ts
{
  action: "claim" | "accept" | "reject" | "release"
  token?: string
  reason?: string
}
```

Valid ops v0:

- `test` for claim precondition;
- `replace` for lock state;
- `remove` for release.

Required cache:

- ActorId -> active brane;
- brane -> state/process mapping;
- lock token -> process run;
- process run -> pending write-set.

Observers:

- Energy weak runtime;
- AppWeb HUD/debug;
- process runner.

Invalid examples:

- `path: "/wimp/1/process/2"`;
- payload with redundant `wimpId` and `processId` if path/cache resolves it.

Required migration:

- Formalize process run ids and lock token lifecycle.
- Keep v0 small; do not persist all transient z events unless required.

### `w+`

Назначение:

- successful weak/process result.

Owner:

- Process runner emits.
- Energy applies runtime write-set.
- Boundary commits accepted persistent changes.

Path kind v0:

- `ActorId` or `ProcessRunId`.
- Current old flow uses payload `{ wimpId, processId, parts }`.

Value shape v0:

```ts
{
  parts: Array<{
    op: "add" | "replace" | "remove" | "test"
    path: string
    value?: unknown
  }>
}
```

Compatibility:

- Inner `parts[].path` may still be `/field/<id>` until Energy adapter is
  migrated.
- New code should accept bare field id and reject new URI-like public examples.

Valid ops v0:

- outer `replace` or `add` for result delivery;
- inner JSON Patch-like ops.

Required cache:

- ProcessRunId -> ActorId;
- ActorId -> brane/process context;
- field id -> runtime field index;
- write-set -> Boundary commit mapping.

Observers:

- Energy weak;
- Boundary commit;
- Bulk through subsequent `gluon`/snapshot update;
- AppWeb process HUD.

Invalid examples:

- outer `path: "/wimp/1/process/2"`;
- payload requiring `wimpId` and `processId` after ProcessRunId exists.

Required migration:

- Phase 0 preserves old result packets.
- Phase 1 normalizes old packets into internal `ProcessResult`.
- Phase 2 removes public dependency on `/field`.

### `w-`

Назначение:

- failed weak/process result.

Owner:

- Process runner emits.
- Energy releases lock and applies error transition if configured.
- Boundary commits error state if accepted.

Path kind v0:

- `ActorId` or `ProcessRunId`.

Value shape v0:

```ts
{
  error: string
  details?: unknown
}
```

Valid ops v0:

- `replace` or `add` for result delivery.

Required cache:

- ProcessRunId -> ActorId;
- ActorId -> current process-bound state;
- error transition mapping.

Observers:

- Energy weak;
- Boundary state commit;
- Bulk activity/render;
- AppWeb HUD.

Invalid examples:

- full process object in payload;
- redundant `wimpId`/`processId` once run id exists.

Required migration:

- Normalize old W-result failure shape.
- Add release/unlock path through `z` or implicit release on `w-`.

## 6. Runtime-жизненный цикл и пользовательские сценарии

| # | Действие | Существующий путь | Желаемый путь | `part` | `path` v0 | Payload v0 | Cache | Нельзя передавать |
|---:|---|---|---|---|---|---|---|---|
| 1 | Создать WIMP declaration | `MetaFor` -> `boundary.wimp.create` -> `graviton add wimp` | Dark authoring -> Boundary declaration snapshot | `graviton` | `wimp` | full WIMP declaration snapshot | src -> wimpId | Bulk `darkParticles` |
| 2 | Изменить metadata WIMP | частично через declaration update отсутствует | Boundary declaration patch -> projection refresh | `graviton` или `higgs` для topology contract | `wimp` или WimpId | minimal metadata patch | WimpId resolver | `/wimp/...` |
| 3 | Добавить/изменить StringField schema | root DSL -> WIMP fields snapshot | schema patch, затем Bulk projection | `higgs` для contract, `graviton` for snapshot | WimpId/src v0 | `fields` schema patch | WimpId + field key | `fieldParticles` |
| 4 | Добавить/изменить NumberField schema | как StringField | как StringField | `higgs` | WimpId/src v0 | `fields` schema patch | WimpId + field key | Bulk names |
| 5 | Добавить/изменить BooleanField schema | как StringField | как StringField | `higgs` | WimpId/src v0 | `fields` schema patch | WimpId + field key | Bulk names |
| 6 | Удалить ordinary field schema | не оформлено | schema remove + value cleanup | `higgs` | WimpId/src v0 | field schema remove patch | field key -> field id | `/field/...` |
| 7 | Добавить/изменить Fuzzy declaration вместо enum | enum field сейчас legacy | topology declaration patch | `higgs` | WimpId or FuzzyId later | connectivity patch | enum key -> topology id | enum as ordinary field |
| 8 | Добавить/изменить MACHO declaration вместо array | array field сейчас legacy | topology declaration patch | `higgs` | WimpId or MachoId later | connectivity patch | array key -> topology id | array as ordinary field |
| 9 | Добавить/изменить Axion declaration | topology nodes exist | topology declaration patch | `higgs` | WimpId or AxionId later | predicate/logic patch | axion id resolver | path prefix |
| 10 | Изменить superposition/state graph | WIMP states snapshot | state graph declaration patch | `photon` for runtime, `higgs`/`graviton` for declaration | WimpId | state graph patch | stateName/id map | full runtime object |
| 11 | Изменить process declaration | DSL process exists, weak maps loaded | declaration patch + runtime cache rebuild | `higgs` or dedicated declaration graviton | WimpId/process declaration id | process schema patch | state -> process map | processId in runtime impulse if resolvable |
| 12 | Изменить reaction declaration | DSL old `ReactionPart` | declaration patch, not runtime Force directly | `higgs` | WimpId | reaction schema patch | reaction id map | `/fields` path examples |
| 13 | Изменить matter plan | Dark matter plan materializes actors/topology | declaration patch + rematerialization policy | `graviton`/`higgs` | WimpId/src | matter plan patch | matter particle ids | DB rows |
| 14 | Изменить binding/source/entanglement declaration | shared value ids implicit | explicit source projection | `higgs` | source/entanglement id later | binding patch | value/source resolver | actorId in value if path resolves |
| 15 | Создать WIMP instance/current actor | `matter(src)` -> actor create | materialization intent -> Boundary actor snapshot | `graviton` | `actor` v0 | full actor snapshot | actor id | Bulk record |
| 16 | Удалить WIMP instance | not fully wired | actor removal + projection refresh | `graviton` | `actor` v0 | actor id/snapshot | actor id -> children | direct SQLite from Bulk |
| 17 | Переместить WIMP/Fuzzy/MACHO/Axion в hidden connectivity tree | topology create currently | topology patch + Bulk relayout | `higgs` | ActorId/topology id later | connectivity move patch | topology tree cache | torus names in payload |
| 18 | Изменить ordinary value | AppWeb/Bulk `value.fields`; Energy `/field` | v0 ActorId + `value.fields`; v1 FieldAddressId + scalar | `gluon` | ActorId | `{ fields }` | actor+field -> value/runtime index | `fieldParticles` |
| 19 | Изменить Fuzzy branch selection | enum legacy, fuzzy activity branch exists in Bulk bridge | topology selection impulse | `higgs` | ActorId/FuzzyId later | selection | fuzzy id, branch actor ids | enum as field value long-term |
| 20 | Изменить MACHO multiplicity | array legacy | multiplicity impulse | `higgs` | ActorId/MachoId later | multiplicity delta | macho id, child mapping | array as ordinary field long-term |
| 21 | Изменить Axion logical condition/result | topology exists, runtime incomplete | logical impulse | `higgs` | AxionId later | predicate/result | axion id resolver | path prefixes |
| 22 | State transition | Energy photon `path=String(wimpId)` | ActorId-scoped photon | `photon` | ActorId v0 target | stateName | actor -> brane/state | processId unless needed |
| 23 | Process-bound state photon | weak maps exist | photon triggers process claim | `photon` + `z` | ActorId | stateName | state -> process | full process declaration |
| 24 | Process claim | historical `z` | lock token claim | `z` | ActorId/ProcessRunId | claim token | lock cache | `/wimp/.../process/...` |
| 25 | Process accept/reject | historical flow | `z` accept/reject | `z` | ProcessRunId | decision | run cache | redundant ids |
| 26 | Process success | old `w+` payload requires ids | result normalized by run cache | `w+` | ProcessRunId | write-set | run -> actor/process | `wimpId`/`processId` when resolvable |
| 27 | Process error | old `w-` | error result + unlock | `w-` | ProcessRunId | error | run cache | full process object |
| 28 | Process release/unlock | historical `z` release | release lock | `z` | ProcessRunId | release | lock token | direct DB unlock from Bulk |
| 29 | Reaction firing | root reactions old shape | resolved runtime reaction impulse | `photon`/`higgs`/`gluon` depending effect | ActorId or reaction id later | minimal effect | reaction resolver | `/context` path |
| 30 | Source/entanglement propagation | shared `value.id` | propagation graph event | `gluon` or `higgs` for source graph | source id later | delta | source/value resolver | fanout payload with full actors |
| 31 | Bulk manifest partial update | Bulk direct `handleForce` | observer only, no protocol ownership | observer | follows source part | no Bulk names | Bulk projection cache | `fieldParticles` in Force |
| 32 | Energy weak step | Energy APIs exist, not routed | orchestrated Energy step | `photon`, `z`, `w+`, `w-` | ActorId/RunId | minimal impulse/result | BoundaryEnergyRuntimeSnapshot | SQLite reads |
| 33 | Boundary persistent commit | `boundary.absorb` only graviton | commit accepted parts by owner | owner-specific | owner path | minimal patch | persistence resolver | Bulk geometry |

## 7. `BoundaryEnergyRuntimeSnapshot`: нужные resolver-добавления

Energy v0 не должен получать `/field/...` как публичную runtime address. Для
этого Boundary projection должен явно дать resolver caches.

Минимально нужные additions:

```ts
type BoundaryEnergyRuntimeSnapshot = {
  ids: {
    actorIds: number[]
    wimpIds: number[]
    topologyIds: number[]
  }
  resolver: {
    wimpIdByActorId: Record<number, number>
    braneIndexByActorId: Record<number, number>
    actorIdByBraneIndex: Record<number, number>
    wimpFieldIdByActorFieldKey: Record<string, number>
    runtimeFieldIndexByActorFieldKey: Record<string, number>
    valueIdByActorFieldKey: Record<string, number>
    topologyIdByActorConnectivityKey: Record<string, number>
    darkParticleIdByActorOrTopologyId?: Record<string, number>
  }
}
```

Ключи `Record<string, ...>` должны быть deterministic composite keys, например
`"${actorId}:${fieldKey}"`, но это internal projection key, не Force `path`.

Что это решает:

- `gluon.path = ActorId` + `value.fields` можно применить в Energy без
  `/field/...`.
- `photon.path = ActorId` можно резолвить в brane/state/process.
- `higgs.path = ActorId` можно резолвить в Fuzzy/MACHO/Axion topology.
- `w+`/`w-` можно применять через ProcessRunId/ActorId без передачи
  `wimpId`/`processId` в payload.

## 8. План миграции

### Фаза 0: сохранить текущее поведение

- Не менять Force payload `value.fields`.
- Не добавлять `value.fieldParticles`.
- Не менять BulkManifest vocabulary.
- Не ломать `/force`, AppWeb snapshot partials и Bulk direct visual updates.
- Не трогать SQLite schema.

### Фаза 1: закрепить закон протокола и типизированные адаптеры

- Добавить docs/notes с Force law и v0 matrix.
- Добавить type guards:
  `isForceFieldsPayload`, `isGluonActorFieldsImpulse`,
  `isPhotonStateImpulse`, `isWeakResultImpulse`.
- Расширить tests:
  `value.fields` accepted;
  `value.fieldParticles` rejected;
  `/field/...` accepted only through legacy Energy adapter, not new public examples.

### Фаза 2: провести Force через оркестратор

- В AppWeb server добавить orchestrator layer:
  Boundary owner, Energy owner, Bulk observer.
- `/force` должен направлять impulse владельцу домена, а не просто
  `boundary.absorb()` + broadcast.
- Energy должен получать runtime snapshot/cache before handling runtime parts.
- Bulk остается observer/direct visualization, не owner persistence.

### Фаза 3: убрать `/field/...` из публичной поверхности Energy

- Сначала Energy adapter принимает bare field id и ActorId-scoped fields.
- Потом старый `/field/...` оставить только в legacy normalizer tests.
- Новые callers не должны генерировать `/field/...`.

### Фаза 4: topology runtime в Energy

- Заполнить `topologyWimpFieldIds` и topology resolver data.
- Перевести enum branch behavior в Fuzzy runtime.
- Перевести array multiplicity behavior в MACHO runtime.
- Ordinary Strong/Gluon оставить только для string/number/boolean.

### Фаза 5: интеграция process runner

- Ввести ProcessRunId или equivalent lock token.
- `photon` triggers process-bound state.
- `z` claim/accept/reject/release координирует lock.
- `w+`/`w-` доставляют compact result без redundant ids after resolver exists.
- Boundary commits accepted write-set.

### Фаза 6: очистка документации и тестов

- Обновить `docs/FORCE.md`, `docs/TOPOLOGY.md`, proto docs и root reaction docs.
- Убрать public examples с `/field/...` и `/wimp/...`.
- Оставить typed prefixes только в Dark topology docs, если они описывают
  graph notation, а не runtime Force path.
- Добавить integration tests для AppWeb Force -> Energy/Bulk/Boundary flow.

## 9. Задачи по файлам

### `docs/FORCE.md`

Почему трогать:

- Сейчас содержит старые path examples.

Изменение:

- Переписать под `part x path -> resolver`, `op x value -> impulse`.
- Добавить v0/v1 distinction.
- Убрать `/field/...` и `/wimp/...` из новых public examples.

Тесты:

- docs only, но желательно добавить protocol guard tests рядом с кодом.

### `bulk/web/force-protocol.ts`

Почему трогать:

- Это текущая защитная граница от протекания Bulk vocabulary в Force.

Изменение:

- Сохранить acceptance only for `value.fields`.
- Не принимать `value.fieldParticles`.
- Можно добавить named guard for `gluon`/`higgs` fields payload.

Тесты:

- `bun test bulk/web/force-protocol.spec.ts`

### `app/web/client.ts`

Почему трогать:

- Здесь current snapshot partials применяются через `value.fields`.

Изменение:

- Вынести normalizer for Force fields partials.
- Не переименовывать payload.
- Добавить regression test for `value.fields`.

Тесты:

- relevant `app/web/*.spec.ts`

### `app/web/server.ts`

Почему трогать:

- Сейчас `/force` routes mostly to Boundary and broadcast.

Изменение:

- Phase 2: ввести orchestrator shell.
- Развести owner domains: Boundary, Energy, Bulk observer.
- Не делать broad rewrite в Phase 1.

Тесты:

- AppWeb force route/orchestrator tests.

### `boundary/runtime/energy.ts`

Почему трогать:

- Energy needs resolver caches.

Изменение:

- Добавить ActorId/fieldKey/topology resolver projection.
- Заполнить topology runtime after enum/array semantic migration begins.

Тесты:

- Boundary energy runtime snapshot tests.
- Energy loadRuntimeSnapshot tests.

### `energy/energy.ts`

Почему трогать:

- Public Energy Force surface still uses `/field`.

Изменение:

- Add normalizer accepting v0 ActorId + `value.fields`.
- Keep legacy `/field` only behind adapter during migration.
- Clarify photon path ActorId vs WimpId.

Тесты:

- `energy/energy.spec.ts`
- tests for no URI-like public paths in new adapter.

### `energy/channel.ts`

Почему трогать:

- W-result packets currently include redundant ids.

Изменение:

- Normalize `w+`/`w-` result shape.
- Keep old shape while ProcessRunId does not exist.

Тесты:

- weak result packet tests.

### `bulk/em/index.ts`

Почему трогать:

- Historical process bridge still emits `/wimp/.../process/...` and `/field/...`.

Изменение:

- Mark as legacy or route through new process result normalizer.
- Do not copy current path shape into docs.

Тесты:

- legacy compatibility tests until replaced.

### `app/web/runtime/bulk.process.ts`

Почему трогать:

- Old monolith process runtime imports stale DB layer and is not current
  orchestrator.

Изменение:

- Either retire/mark legacy or rewrite later against Boundary/Energy runtime
  projection.

Тесты:

- process lifecycle tests after orchestrator exists.

### Root DSL-файлы

Почему трогать:

- Public docs/types still use old atom/actor/meta and reaction path examples.

Изменение:

- Later docs/type cleanup only after protocol law is accepted.
- Do not break public DSL while runtime migration is incomplete.

Тесты:

- type tests for DSL compatibility.

## 10. Нужные тесты

Protocol parser/guard tests:

- `value.fields` accepted.
- `value.fieldParticles` rejected.
- `gluon.path` ActorId + `value.fields` normalizes.
- `/field/...` not used in new public v0 examples.

Energy resolver tests:

- ActorId + field key resolves to `wimpFieldId`, `runtimeFieldIndex`, `braneIndex`.
- Photon ActorId + stateName resolves to brane/state index.
- Process-bound state resolves to process without payload `processId`.

Bulk direct Force adapter tests:

- manifest with field particle;
- Force `{ part: "gluon", path: ActorId, value: { fields: { key: scalar } } }`;
- `bulkViewport.handleForce()` updates field particle visual value.
- `value.fieldParticles` does not update.

AppWeb snapshot/partial tests:

- client partial updates `currentSnapshot` through `value.fields`;
- relayout/rebuild preserves same value;
- no BulkManifest vocabulary in Force payload.

Process lifecycle tests:

- photon transition starts process-bound state;
- z claim locks brane;
- w+ applies compact write-set;
- w- releases lock and records error path;
- Boundary commit happens only after accepted result.

Regression tests:

- no `Row`/`Shell`/`Orbit` as Bulk model entities.
- no `value.fieldParticles` in Force protocol.
- no new `/field/...` public caller after adapter migration.

## 11. Риски и антицели

Anti-goals:

- Не ломать Bulk rename.
- Не возвращать `Row`, `Shell`, `Orbit` как model/entity names.
- Не протаскивать `BulkManifest`, `BulkDarkParticle`, `BulkFieldParticle` в
  Force payload.
- Не заставлять Energy/Bulk читать SQLite.
- Не копировать старый monolith path protocol.
- Не раздувать `photon` payload.
- Не использовать `processId` в photon, если resolver cache может вывести
  process from state.
- Не делать enum/array semantic migration в одном коммите с protocol guards.
- Не менять SQLite schema без отдельного storage migration plan.

Риски:

- `ActorId` vs `WimpId` сейчас местами смешаны, особенно для `photon`.
- Bulk visual ids не равны Boundary ids во всех случаях:
  actor id namespace and topology id namespace adapted in `app/web/world.ts`.
- `fieldParticleId` в Bulk не обязательно является правильным Force address id.
- Shared values/entanglement expressed through shared `value.id`, so v1 field
  addressing must account for fanout.
- AppWeb currently lacks Energy orchestrator route; adding Energy directly to
  client-side flow would duplicate ownership.

## 12. Следующий минимальный шаг

Рекомендуемый следующий коммит должен быть маленьким:

1. Перенести этот документ или его стабильную версию в `docs/FORCE.md` после
   ревью.
2. Добавить typed Force normalizers без изменения runtime behavior:
   - `resolveForceFieldsPayload(value)` остается current Bulk/Web adapter;
   - новый `resolveGluonActorFieldsImpulse(part)` может жить рядом с AppWeb/Energy
     adapter layer;
   - `value.fieldParticles` остается rejected.
3. Добавить тесты на v0 invariants:
   - `value.fields` accepted;
   - `value.fieldParticles` rejected;
   - no Bulk vocabulary in Force payload.
4. После этого проектировать AppWeb orchestrator:
   Boundary owns persistence, Energy owns runtime transitions/processes,
   Bulk observes manifestation.

До появления resolver cache не переходить на:

- `gluon.path = FieldParticleId`;
- `higgs.path = FuzzyId | MachoId | AxionId`;
- `w+`/`w-` without compatibility normalizer.

Такой переход должен быть v1, а не v0.
