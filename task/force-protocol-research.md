# Исследование протокола Force и рантайма

Дата: 2026-06-30. Ветка: `energy`.

Документ фиксирует состояние проекта после онтологического переименования Bulk и
готовит следующий архитектурный шаг: привести протокол Force и рантайм к форме,
которая соответствует WIMP, Fuzzy, MACHO, Axion и обычным полевым частицам.
Это не план механического переименования. Сначала закрепляем текущие потоки
данных, временные несовместимости и границы доменов, затем вводим слой
адаптеров, резолверов и оркестрации.

Главный вывод: Bulk уже говорит на правильном языке `BulkManifest`,
`BulkDarkParticle`, `BulkFieldParticle`, но поверхность Force и рантайма пока
смешивает три слоя:

- материализацию Boundary через `graviton`;
- временные частичные обновления AppWeb и Bulk через `value.fields`;
- старый слабый поток Energy/Bulk с `/field/...`, `/wimp/.../process/...` и
  `processId` в полезной нагрузке.

Следующий шаг должен быть маленьким и обратимо безопасным: закрепить закон Force,
добавить типизированные нормализаторы и резолверы, сохранить текущий
`value.fields` на границе Force и не протаскивать словарь Bulk в полезную
нагрузку протокола.

## 1. Карта дерева проекта

### 1.1. Корневой DSL и публичный API

Изученные области:

- `index.ts`;
- `metafor.ts`;
- `metafor.t.ts`;
- `fields.t.ts`;
- `matter.t.ts`;
- `process.t.ts`;
- `reactions.t.ts`;
- `superposition.t.ts`;
- `action.t.ts`;
- `finally.t.ts`.

Текущее состояние:

- Публичный DSL строит `MetaDSL` через цепочку
  `fields -> superposition -> mass -> processes -> reactions -> matter -> bulk`.
- Пользователь описывает декларацию WIMP через `MetaFor(name, config?)`.
- В корневом DSL ещё много старого языка: `atom`, `actor`, `meta`, `field`.
- `fields.t.ts` поддерживает `string`, `number`, `boolean`, `array`, `enum`.
- `enum` и `array` пока остаются публичным языком схемы, хотя целевая онтология:
  `enum -> Fuzzy`, `array -> MACHO`.
- `matter.t.ts` описывает иерархию через `<meta-for>` и допускает выбор
  связности по `state`, `enum`, `array`.
- `metafor.t.ts` определяет `ReactionPart` как `{ from?, op, path, value? }`
  без `part`. Это старый интерфейс реакции, а не финальный контракт Force.
- `reactions.t.ts` в комментариях использует старые примеры путей вроде
  `"/context"`, `"/state"`, `"/fields"`.

Вывод:

- Корневой DSL нельзя сейчас чистить механически. Это публичный авторский API.
- `enum` и `array` надо оставить до отдельной смысловой миграции.
- Нужно разделить язык описания WIMP и язык рантайм-импульсов: объявление схемы
  поля не равно обновлению значения поля.

### 1.2. Документация

Изученные области:

- `docs/ONTOLOGY.md`;
- `docs/ARCHITECTURE.md`;
- `docs/FORCE.md`;
- `docs/TOPOLOGY.md`;
- `docs/DEVELOPMENT.md`;
- `docs/proto/gravity.md`;
- `docs/proto/strong.md`;
- `docs/proto/weak.md`;
- `docs/proto/higgs.md`;
- `docs/proto/electromagnetism.md`;
- `task/render-projection.md`;
- `TODO.md`.

Актуальные положения:

- `docs/ONTOLOGY.md` и `docs/ARCHITECTURE.md` уже правильно разделяют
  `Dark`, `Boundary`, `Energy`, `Bulk`.
- Energy и Bulk не должны читать Boundary или SQLite напрямую.
- `docs/proto/strong.md` уже выводит `enum` и `array` из обычного потока Strong
  и Gluon.
- `docs/proto/higgs.md` трактует `enum` как выбор ветви связности, а `array` как
  множественность связности.
- `task/render-projection.md` уже обновлён под переименование Bulk: частицы Dark
  проявляются геометрией тора, полевые частицы проявляются геометрией сферы.
- `TODO.md` фиксирует незакрытые рантайм-задачи: Energy должен получать
  самодостаточный снимок рантайма, а старый `app/web/runtime/bulk.process.ts`
  ещё не переведён на проекционные данные.

Конфликтующие или исторические места:

- `docs/FORCE.md` концептуально полезен, но примеры всё ещё используют
  `/field/<uuid>`, `/wimp/<uuid>`, пути к действиям и процесс как payload.
- `docs/TOPOLOGY.md` допускает префиксы `w:`, `f:`, `m:`, `a:`. Их можно
  оставить только как внутреннюю запись графа скрытой связности Dark, но нельзя
  переносить в рантайм-поле `path`.
- Документация Store местами историческая. Её нужно читать как проектные заметки,
  а не как текущий контракт протокола.

### 1.3. Dark

Изученные области:

- `dark/dark.ts`;
- `dark/continuation.ts`;
- `dark/index.ts`;
- `dark/server.ts`;
- `dark/gravity/matter.ts`;
- `dark/em/index.ts`;
- `dark/gravity/channel.ts`;
- `dark/tests/*`.

Текущее состояние:

- `matter(src)` загружает `MetaDSL`, создаёт декларацию WIMP через
  `boundary.wimp.create(src, dsl)` при необходимости, затем создаёт корневой
  instance, значения, состояние, узлы связности и дочерние WIMP.
- Материализация идёт обходом matter-плана.
- Узел `wimp` в matter-плане создаёт дочерний instance WIMP.
- Узлы `fuzzy`, `axion`, `macho` создают `boundary.topology`.
- Observer в `dark/dark.ts` реагирует на
  `{ part: "graviton", op: "test", path: "wimp", value: src }`.
- `dark/continuation.ts` исключает `enum` и `array` из прямого source-связывания
  ordinary-полей.
- `dark/em/index.ts` всё ещё испускает изменения полей как `/field/${wimpFieldId}`.
- `dark/gravity/channel.ts` содержит устаревшие помощники `emitAdd(wimpId)`,
  `emitRemove(wimpId)`, `emitBarrier(path: "")`.

Вывод:

- Dark уже материализует WIMP/Fuzzy/MACHO/Axion в Boundary.
- Помощники рантайм-сообщений ещё используют старую форму адреса `/field`.
- `graviton test wimp` можно сохранить как временный управляющий сигнал v0, но
  нужно отделить его от финального закона рантайм-импульсов.

### 1.4. Boundary

Изученные области:

- `boundary/force.t.ts`;
- `boundary/force.ts`;
- `boundary/sqlite.ts`;
- `boundary/runtime/bulk.ts`;
- `boundary/runtime/energy.ts`;
- `boundary/wimp/sqlite/*`;
- `boundary/actor/sqlite/*`;
- `boundary/topology/sqlite/*`;
- слой значений actor value.

Текущее состояние:

- `boundary/force.t.ts` определяет частицу Force как
  `{ part, op, path, value?, from?, ... }`.
- `boundary/force.ts` владеет `BroadcastChannel("force")` и поверхностью
  `observe`, `entropy`, `emit`, `absorb`.
- `boundary/sqlite.ts` применяет к SQLite только частицы `graviton` с путями
  `"wimp"`, `"actor"`, `"fuzzy" | "axion" | "macho"`.
- `boundary/sqlite.ts` сейчас игнорирует или возвращает `false` для `gluon`,
  `photon`, `higgs`, `w+`, `w-`, `z`.
- `BoundaryWimpSqlite.create()` испускает снимок декларации WIMP:
  `{ part: "graviton", op: "add", path: "wimp", value: { wimp, fields, enumVariants, states } }`.
- `BoundaryActorSqlite.create()` испускает:
  `{ part: "graviton", op: "add", path: "actor", value: actor.rows() }`.
- `BoundaryTopologySqlite.create()` испускает:
  `{ part: "graviton", op: "add", path: "fuzzy" | "axion" | "macho", value: topology }`.
- `bulkRuntime()` возвращает `BoundaryBulkRuntimeSnapshot` с actors, topologies,
  wimps, fields, enum variants, actor values, values, matter particles и
  binding paths.
- `energyRuntime()` возвращает `BoundaryEnergyRuntimeSnapshot` с текущими полями,
  branes, state names, индексами Strong и Weak.
- `BoundaryEnergyRuntimeSnapshot.strong.topologyWimpFieldIds` сейчас пустой. Это
  означает, что `enum` и `array` ещё не стали полноценной рантайм-связностью Energy.

Канонические данные:

- Декларация WIMP хранится в `wimp`, `field`, `field_enum_variant`, `state`,
  `transition`, `process`, `reaction`, `matter_particle`.
- Instance WIMP сейчас называется actor и хранится в `actor`, `actor_state`,
  `actor_value`, `value`, typed value tables, `value_list_item`.
- Runtime-связность хранится в `topology` с `kind = fuzzy | axion | macho`.
- Source/entanglement сейчас выражены через общий `value.id` в `actor_value`;
  отдельной таблицы source graph пока нет.

### 1.5. Energy

Изученные области:

- `energy/index.ts`;
- `energy/energy.ts`;
- `energy/channel.ts`;
- `energy/store.t.ts`;
- `energy/strong/*`;
- `energy/weak/*`;
- `energy/tests/*`;
- `energy/energy.spec.ts`.

Текущее состояние:

- `loadRuntimeSnapshot(snapshot)` загружает Boundary runtime projection в
  `energy$`, `gravity$`, `strong$`, `weak$`.
- Energy хранит branes, runtime fields, имена состояний, locks, weak runtime state
  и mapping caches.
- Публичная поверхность обновления значений ещё использует адресацию field-id:
  `requireFieldPartId(path)` ожидает `/field/<id>`.
- `applyRuntimeValueParts()` уже допускает `/field/<id>` или bare numeric id.
- `setValues()` принимает `Record<string, unknown>`, где ключи сейчас являются
  `wimpFieldId`.
- `publishPhotonChanges()` испускает:
  `{ part: "photon", op: "replace", path: String(wimpId), value: stateName }`.
- Важно: в `BoundaryEnergyRuntimeSnapshot` поле `wimpIds` сейчас фактически
  заполняется `actor.id`. Проблема не в том, что runtime реально шлёт WIMP src;
  проблема в неправильном имени `wimpIds` для actor-instance identity.
- `applyWeakResultPacket()` сейчас требует payload с `wimpId`, `processId` и
  внутренними `parts`, где поля всё ещё адресуются как `/field/<id>`.
- Сборка W-result читает `wimpId` и `processId` из дополнительных полей.
- Process-bound states уже есть через
  `weak$.stateProcessIdsByBraneIndex[braneIndex][stateIndex]`.
- Locks уже есть через `EnergyBraneRecord.lock` и weak heap lock updates.
- Topology runtime неполный: `topologyWimpFieldIds` пустой, `enum` и `array` ещё
  кодируются как field types.

Вывод:

- Energy уже содержит полезные resolver caches, но поверхность Force всё ещё
  пропускает URI-подобные `/field` и `processId` в payload.
- Перед переходом к минимальным ID нужен нормализатор и резолверный слой на основе
  `BoundaryEnergyRuntimeSnapshot`.
- Сначала нужно исправить именование identity: `wimpIds` в Energy runtime сейчас
  является actor identity, а WIMP declaration identity в Boundary — строковый `src`.

### 1.6. Bulk

Изученные области:

- `bulk/index.ts`;
- `bulk/gravity/layout/world.ts`;
- `bulk/gravity/layout/snapshot.ts`;
- `bulk/gravity/layout/stream.ts`;
- `bulk/web/index.ts`;
- `bulk/web/force-protocol.ts`;
- `bulk/web-navigation.ts`;
- `bulk/label-visibility.ts`;
- `bulk/weak/*`;
- `bulk/em/index.ts`.

Текущее состояние:

- Bulk layout contract после переименования чистый:
  `BulkManifest`, `BulkDarkParticle`, `BulkFieldParticle`.
- `BulkManifest` является runtime/projection contract, а не набором строк
  persistence.
- `bulk/web/force-protocol.ts` намеренно принимает только `value.fields` для
  текущих Force-патчей полей и отвергает `value.fieldParticles`.
- `bulk/web/index.ts` viewport adapter обрабатывает:
  `higgs` с `path = wimp src`, `value.fields = { fieldKey|order: schemaPatch }`;
  `gluon` с `path = actor id`, `value.fields = { fieldKey|order: scalar }`.
- Bulk direct adapter обновляет render records, но не пишет Boundary.
- `bulk/em/index.ts` остаётся историческим weak/process bridge:
  `/wimp/${wimpId}/process/${processId}`, `/field/${wimpFieldId}`,
  дополнительные `wimpId`, `processId`.

Вывод:

- Bulk rename нельзя ломать.
- `value.fields` на границе Force пока нельзя переименовывать в
  `value.fieldParticles`.
- Словарь `BulkManifest` должен оставаться словарём проекции, а не payload-словарём
  Force.

### 1.7. App Web

Изученные области:

- `app/web/server.ts`;
- `app/web/client.ts`;
- `app/web/world.ts`;
- `app/web/run.ts`;
- `app/web/settings.ts`;
- `app/web/app-config.ts`;
- `app/web/hud.ts`;
- `app/web/server.t.ts`;
- `app/web/runtime/bulk.process.ts`.

Текущее состояние:

- `server.ts` импортирует `dark/server`, открывает Boundary и ставит Dark observer.
- `buildSnapshot()` сейчас вызывает `boundary.bulkRuntime()` и строит
  `BoundaryBulkRuntimeSnapshot`; Energy snapshot пока не входит в основной WebApp
  bootstrap.
- HTTP `/force` вызывает `boundary.absorb()` и затем рассылает частицы клиентам.
- WebSocket обрабатывает `materialize` и `relayout`; общий route Force в Energy
  пока не собран.
- `client.ts` хранит `currentSnapshot`, применяет partial updates через
  `value.fields`, затем вызывает `bulkViewport.handleForce(part)`.
- `buildBoundaryBulkManifest()` в `app/web/world.ts` адаптирует Boundary snapshot
  в `BulkManifest`.
- `app/web/runtime/bulk.process.ts` остаётся старым процессным рантаймом монолита
  и импортирует устаревший слой DB; сервером сейчас не используется.

Вывод:

- Сейчас AppWeb фактически оркестрирует Boundary -> Bulk visualization.
- Energy runtime не является полноценным участником WebApp Force pipeline.
- Следующий шаг: не переписывать всё, а добавить слой оркестрации и runtime
  projection cache.

### 1.8. Store

Изученные области:

- `store/README.md`;
- `store/wimp/README.md`;
- `store/actor/README.md`;
- `store/sqlite.ts`;
- `store/meta/sqlite/*`;
- `store/actor/sqlite/*`;
- `store/topology/sqlite/*`.

Текущее состояние:

- Документация Store частично историческая, но полезна для понимания намерения:
  Store должен хранить declarations, instances, topology, values и shared values.
- Текущий runtime persistence фактически живёт в Boundary SQLite modules.
- Shared values/source/entanglement сейчас представлены через общий `value.id`.

Вывод:

- Store не должен становиться runtime dependency для Energy/Bulk.
- Resolver caches должны приходить из Boundary snapshot/projection.

### 1.9. Исторические ориентиры

Проверенные источники:

- `origin/ref:app/web/INTERACTION_FLOW.md`;
- `origin/ref:app/web/runtime/bulk.process.ts`;
- `origin/ref:bulk/em/index.ts`;
- `origin/ref:task/store-unification.md`;
- `origin/ref:task/issues-audit.md`;
- ветки `arch`, `ref`, `ui`.

Что история подтверждает:

- `photon` запускает process.
- `z` координирует claim/accept/release.
- `w+` и `w-` возвращают компактный результат процесса.
- success/error handlers собирают write-set.
- shared values/entanglement могут повторно запускать transitions.

Что нельзя копировать как финальный протокол:

- `/field/...`;
- `/wimp/.../process/...`;
- префиксы typed path как runtime path;
- обязательные `wimpId`/`processId` в payload там, где контекст выводится через
  resolver cache.

## 2. Текущий поток данных

### 2.1. Материализация

1. User/WebApp вызывает управляющий сигнал:
   `{ part: "graviton", op: "test", path: "wimp", value: src }`.
2. Dark observer принимает сигнал и вызывает `matter(src)`.
3. `matter(src)` загружает DSL, создаёт WIMP declaration при необходимости.
4. Dark создаёт WIMP instance, initial values, actor state.
5. Dark создаёт topology nodes для Fuzzy/MACHO/Axion matter plan.
6. Boundary испускает `graviton add` snapshots для WIMP, actor, topology.
7. Boundary SQLite применяет только эти materialization snapshots.

### 2.2. Снимок Bulk

1. AppWeb server вызывает `boundary.bulkRuntime()`.
2. Boundary возвращает `BoundaryBulkRuntimeSnapshot`.
3. `app/web/world.ts` строит `BulkManifest`:
   Boundary actor -> WIMP `BulkDarkParticle`;
   Boundary topology -> Fuzzy/MACHO/Axion `BulkDarkParticle`;
   ordinary field -> `BulkFieldParticle`.
4. Bulk layout строит geometry of torus/sphere.
5. Web viewport применяет `BulkManifest` к сцене.

### 2.3. Снимок Energy

1. Boundary умеет строить `BoundaryEnergyRuntimeSnapshot`.
2. Energy умеет `loadRuntimeSnapshot(snapshot)`.
3. WebApp server сейчас не делает Energy bootstrap частью основного пути.
4. Topology runtime в Energy пока неполный: `topologyWimpFieldIds` пустой.

### 2.4. Вход Force

1. `/force` в AppWeb вызывает `boundary.absorb(part)`.
2. Boundary применяет только те частицы, которые знает; сейчас это в основном
   `graviton`.
3. Server рассылает частицы клиентам.
4. Client применяет некоторые partial updates к `currentSnapshot`.
5. Client вызывает `bulkViewport.handleForce(part)` для прямого visual update.

### 2.5. Прямое частичное обновление области просмотра

- Для `gluon` и `higgs` Bulk/Web принимает текущую форму протокола через adapter:
  `value.fields`.
- `value.fieldParticles` специально не принимается.
- Это временная граница совместимости, а не новая онтология.

### 2.6. Путь исполнения процессов

- Исторический путь существует в `app/web/runtime/bulk.process.ts` и
  `bulk/em/index.ts`, но это ещё не текущий полноценный рантайм AppWeb.
- Energy имеет weak store/process state и W-result handlers.
- Не хватает оркестратора, который связывает вход Force в AppWeb, проекцию Boundary,
  шаг Energy и обновление Bulk visualization.

## 3. Онтология после переименования Bulk

### 3.1. Частицы Dark Matter

- `WIMP`;
- `Fuzzy`;
- `MACHO`;
- `Axion`.

В Bulk они проявляются как `BulkDarkParticle` и геометрия тора.

### 3.2. Обычные полевые частицы

- `StringField`;
- `NumberField`;
- `BooleanField`.

В Bulk они проявляются как `BulkFieldParticle` и геометрия сферы.

### 3.3. Переходные варианты

- `enum` сейчас ещё может жить как legacy field variant.
- Целевая онтология: `enum -> Fuzzy`.
- `array` сейчас ещё может жить как legacy field variant.
- Целевая онтология: `array -> MACHO`.
- `other` остаётся compatibility bucket до очистки.

### 3.4. Actor/topology как термины Boundary

- `actor` сейчас означает запущенный instance WIMP в Boundary/storage/runtime.
- `topology` сейчас означает persisted hidden connectivity node.
- Эти слова можно сохранять в Boundary implementation, но не делать ими публичную
  Bulk/Force ontology.

## 4. Закон протокола Force

Force — это domain-scoped JSON Patch-like operation.

Текущая реализация пока ближе к этому типу:

```ts
type CurrentParticle = {
  part: Part
  op: ParticleOperation
  path: string
  value?: unknown
  from?: string
  [key: string]: unknown
}
```

Целевой протокольный тип должен быть шире:

```ts
type DomainPath = string | number

type ForceParticle = {
  part: Part
  op: ParticleOperation
  path: DomainPath
  value?: unknown
  from?: DomainPath
}
```

Инварианты:

- `part` выбирает переносчик и адресное пространство.
- `path` является opaque ID внутри адресного пространства выбранного `part`.
- `part x path -> resolver`.
- `op x value -> impulse`.
- `value` несёт минимальный impulse, не полный объект, кроме bootstrap/projection
  snapshots.
- `path` не является URI.
- Не использовать path prefixes: `/field/...`, `/wimp/...`, `actor:...`,
  `w:...`, `f:...`.
- Не пихать тип сущности в `path`.
- Не передавать `actorId` внутри `value`, если `path` уже является actor id.
- Не передавать `wimpId`, `stateId`, `processId`, `braneIndex`,
  `runtimeFieldIndex`, `fieldAddressId`, если это выводится через projection cache.
- Cache miss означает ошибку projection contract или необходимость projection update.
  Это не повод Energy/Bulk читать Boundary/SQLite.
- Словарь `BulkManifest` не должен попадать в Force payload.
- В текущем v0 Bulk/Web adapter продолжает принимать `value.fields`.
- Force payload не переименовывается в `value.fieldParticles`.

Исключение:

- `graviton` bootstrap/materialization snapshots могут временно нести полный
  projection object. Это управляющее или проекционное событие, а не обычный
  runtime impulse.

## 5. Матрица адресации Force v0

### 5.1. `graviton`

Назначение:

- существование;
- материализация;
- размещение;
- parent/depth/connectivity projection;
- bootstrap snapshot.

Владелец:

- Dark создаёт materialization intent.
- Boundary применяет persistent materialization.
- AppWeb использует результат для projection refresh.

Адрес `path` v0:

- `"wimp"` для снимка или управляющего события декларации WIMP;
- `"actor"` для снимка instance WIMP;
- `"fuzzy" | "macho" | "axion"` для снимка связности;
- это legacy/control space, а не финальная форма runtime address.

Форма `value` v0:

- full WIMP snapshot для declaration;
- full actor snapshot для instance;
- topology snapshot для Fuzzy/MACHO/Axion;
- `src` для текущего `test` materialization trigger.

Допустимые операции v0:

- `test` как текущий materialization trigger;
- `add`;
- `remove` позже;
- `replace` только для явно типизированного projection snapshot.

Нужный cache:

- Boundary WIMP/actor/topology ids;
- AppWeb Boundary snapshot cache.

Наблюдатели:

- Dark observer для `test`;
- Boundary SQLite для `add`;
- AppWeb server/client для snapshot refresh;
- Bulk через `BulkManifest`.

Недопустимые примеры:

- `path: "/wimp/foo"`;
- `path: "w:foo"` как runtime Force path;
- payload с `darkParticles` или другими именами Bulk-проекции.

Нужная миграция:

- Оставить v0 compatibility.
- Ввести typed guard для materialization trigger.
- Отделить bootstrap/projection snapshots от обычных runtime impulses.
- Не делать `"wimp"`, `"actor"`, `"fuzzy"` финальной моделью адресации.

### 5.2. `gluon`

Назначение:

- обновление значений обычных `StringField`, `NumberField`, `BooleanField`.

Владелец:

- Boundary фиксирует принятые значения.
- Energy применяет runtime value impulses.
- Bulk/Web наблюдает изменение текста, цвета и подписи поля.

Адрес `path` v0:

- `ActorId` как строка или число.
- Это ближайшая безопасная форма для AppWeb/Bulk: instance WIMP является областью,
  внутри которой резолвится `value.fields`.

Форма `value` v0:

```ts
{
  fields: Record<string, string | number | boolean | null>
}
```

Ключи в `fields`:

- v0: `fieldKey` или текущий field order/key, как уже делают AppWeb/Bulk;
- Boundary/Energy normalizer должен уметь резолвить это в field id через projection
  cache.

Допустимые операции v0:

- `replace`;
- `remove` только для сброса nullable/deleted value, не для удаления схемы;
- `add` только если семантика значения доказана отдельным тестом.

Нужный cache:

- `actorId -> wimpSrc`;
- `wimpSrc + fieldKey -> fieldId`;
- `actorId + fieldId -> valueId`;
- `fieldId -> runtimeFieldIndex` в рамках actor;
- `runtimeFieldIndex -> braneIndex`;
- Bulk `actorId -> darkParticleId`;
- Bulk `fieldKey -> fieldParticleId` внутри actor scope.

Наблюдатели:

- Boundary value commit;
- Energy Strong runtime;
- Bulk direct adapter;
- AppWeb snapshot partial updater.

Недопустимые примеры:

- `path: "/field/123"`;
- `value: { fieldParticles: ... }`;
- `value: { actorId, fields }`, если `path` уже является actor id;
- `path: "fieldParticle:123"`.

Нужная миграция:

- v0 сохраняет `value.fields`.
- v1 может перейти к `path = FieldAddressId | ActorFieldAddressId` и
  `value = scalar`, но только после появления resolver cache и после того, как все
  потребители смогут резолвить адрес без чтения Boundary.

### 5.3. `higgs`

Назначение:

- изменение связности;
- выбор ветви Fuzzy;
- изменение множественности MACHO;
- изменение логики Axion;
- изменение topology contract WIMP.

Владелец:

- Boundary владеет persistent topology.
- Energy владеет runtime topology resolution после projection.
- Bulk наблюдает изменённую связность как проявление Dark particles.

Адрес `path` v0:

- для текущих compatibility-патчей AppWeb: WIMP `src` или ActorId, в зависимости
  от источника;
- для runtime selection: ActorId-scoped connectivity до появления стабильного
  ConnectivityId в projection.

Форма `value` v0:

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

- Текущий Bulk/Web direct adapter опирается на `value.fields` для визуального
  schema-like patch behavior. Не переименовывать это в `fieldParticles`.
- `value.fields` внутри `higgs` v0 является compatibility-поверхностью, а не
  финальным доказательством, что ordinary field schema принадлежит Higgs.

Допустимые операции v0:

- `replace`;
- `add`;
- `remove`;
- `test` для guarded topology transition, если понадобится.

Нужный cache:

- ActorId -> WIMP src;
- WIMP src + enum key -> Fuzzy topology id;
- WIMP src + array key -> MACHO topology id;
- Axion ids from topology projection;
- topology id -> affected child actors;
- topology id -> BulkDarkParticle id.

Наблюдатели:

- Boundary topology persistence;
- Energy topology resolver;
- Bulk hidden connectivity tree;
- AppWeb snapshot builder.

Недопустимые примеры:

- `path: "/field/enumX"`;
- `path: "f:123"` in runtime Force;
- payload with `BulkDarkParticle`.

Нужная миграция:

- Фаза 1: задокументировать и охранять текущую форму.
- Фаза 2: заполнить topology runtime в Energy.
- Фаза 3: ввести opaque ConnectivityId path для Fuzzy/MACHO/Axion impulses.

### 5.4. `photon`

Назначение:

- сигнал состояния;
- сигнал активности;
- сигнал superposition;
- trigger process-bound state, если state связан с process.

Владелец:

- Energy владеет вычислением runtime state transition.
- Boundary фиксирует принятый persistent state.
- Bulk наблюдает activity/visual state.

Адрес `path` v0:

- ActorId или WIMP instance id.
- Текущий код Energy берёт адрес из массива, который называется `wimpIds`, но этот
  массив сейчас фактически заполнен `actor.id`. Значит runtime-address ближе к
  actor-instance id, а не к WIMP declaration id. Нужно исправить именование, а не
  считать это доказательством WIMP src address.

Форма `value` v0:

```ts
"stateName"
```

или:

```ts
{ state: "stateName" }
```

Предпочтение v0:

- оставить scalar string для текущего Energy emission;
- adapter может нормализовать `{ state }` для входящих AppWeb-сообщений.

Допустимые операции v0:

- `replace`;
- `test` для state guard, если это используют реакции.

Нужный cache:

- ActorId -> braneIndex;
- stateName -> stateIndex;
- stateIndex -> processId, если state связан с process;
- process lock by brane.

Наблюдатели:

- Energy weak runtime;
- Bulk activity/render;
- Boundary actor_state commit;
- process orchestrator.

Недопустимые примеры:

- payload с `processId`, если resolver cache может вывести процесс;
- `path: "/wimp/123/state"`;
- раздутый полный actor state object для простого перехода.

Нужная миграция:

- Переименовать `wimpIds` / `getWimpId` в Energy runtime, если они фактически
  содержат actor ids.
- Добавить явные `actorIdByBraneIndex` и `braneIndexByActorId`.
- Добавить typed guard и тесты для минимального photon.
- Использовать resolver cache для запуска process-bound state.

### 5.5. `z`

Назначение:

- нейтральная координация;
- claim/release/accept/reject;
- lock lifecycle.

Владелец:

- Process orchestrator;
- Energy weak runtime;
- Boundary фиксирует только итоговые принятые state/value changes, а не каждое
  transient-событие lock, если durability не требуется.

Адрес `path` v0:

- ActorId как область процесса;
- если несколько process-bound states могут быть активны, после claim может
  появиться `ProcessRunId`.

Форма `value` v0:

```ts
{
  action: "claim" | "accept" | "reject" | "release"
  token?: string
  reason?: string
}
```

Допустимые операции v0:

- `test` для claim precondition;
- `replace` для lock state;
- `remove` для release.

Нужный cache:

- ActorId -> active brane;
- brane -> state/process mapping;
- lock token -> process run;
- process run -> pending write-set.

Наблюдатели:

- Energy weak runtime;
- AppWeb HUD/debug;
- process runner.

Недопустимые примеры:

- `path: "/wimp/1/process/2"`;
- payload с redundant `wimpId` и `processId`, если путь и cache выводят контекст.

Нужная миграция:

- Формализовать `ProcessRunId` и lifecycle lock token.
- В v0 держать форму маленькой.
- Не persist-ить все transient `z` events без доказанной необходимости.

### 5.6. `w+`

Назначение:

- успешный результат слабого перехода или процесса.

Владелец:

- Process runner испускает.
- Energy применяет runtime write-set.
- Boundary фиксирует принятые persistent changes.

Адрес `path` v0:

- ActorId или `ProcessRunId`.
- Старый поток сейчас использует payload `{ wimpId, processId, parts }`.

Legacy-compatible форма `value` v0:

```ts
{
  parts: Array<{
    op: "add" | "replace" | "remove" | "test"
    path: string
    value?: unknown
  }>
}
```

Эта форма является compatibility packet, а не финальным Force impulse.

Целевая форма после появления process run cache:

```ts
type WeakSuccessImpulse = {
  writes?: Array<
    | { part: "gluon"; path: string | number; value: unknown }
    | { part: "higgs"; path: string | number; value: unknown }
  >
  state?: string
  token?: string
}
```

Compatibility:

- Внутренний `parts[].path` может всё ещё быть `/field/<id>` до миграции Energy adapter.
- Новый код не должен показывать URI-like path в публичных примерах.

Допустимые операции v0:

- outer `replace` или `add` для доставки результата;
- inner JSON Patch-like ops внутри compatibility packet.

Нужный cache:

- ProcessRunId -> ActorId;
- ActorId -> brane/process context;
- field id -> runtime field index;
- write-set -> Boundary commit mapping.

Наблюдатели:

- Energy weak;
- Boundary commit;
- Bulk через последующий `gluon` или snapshot update;
- AppWeb process HUD.

Недопустимые примеры:

- outer `path: "/wimp/1/process/2"`;
- payload, требующий `wimpId` и `processId`, после появления ProcessRunId.

Нужная миграция:

- Фаза 0 сохраняет старые result packets.
- Фаза 1 нормализует старые packets в internal `ProcessResult`.
- Фаза 2 убирает публичную зависимость от `/field`.

### 5.7. `w-`

Назначение:

- ошибочный результат слабого перехода или процесса.

Владелец:

- Process runner испускает.
- Energy снимает lock и применяет error transition, если он настроен.
- Boundary фиксирует error state, если результат принят.

Адрес `path` v0:

- ActorId или `ProcessRunId`.

Форма `value` v0:

```ts
{
  error: string
  details?: unknown
}
```

Для совместимости может приниматься old packet shape, но он должен проходить через
normalizer.

Допустимые операции v0:

- `replace` или `add` для доставки результата.

Нужный cache:

- ProcessRunId -> ActorId;
- ActorId -> current process-bound state;
- error transition mapping.

Наблюдатели:

- Energy weak;
- Boundary state commit;
- Bulk activity/render;
- AppWeb HUD.

Недопустимые примеры:

- полный process object в payload;
- redundant `wimpId`/`processId`, когда run id уже выводит контекст.

Нужная миграция:

- Нормализовать старую форму W-result failure.
- Добавить release/unlock через `z` или implicit release on `w-`.

## 6. Пользовательские сценарии

| # | Действие | Текущий путь | Желаемый путь | `part` | `path` v0 | Payload v0 | Нужный cache | Нельзя передавать |
|---:|---|---|---|---|---|---|---|---|
| 1 | Создать WIMP declaration | `MetaFor` -> `boundary.wimp.create` -> `graviton add wimp` | Dark authoring -> Boundary declaration snapshot | `graviton` | `wimp` | full WIMP snapshot | src -> WIMP declaration | Bulk projection names |
| 2 | Изменить metadata WIMP | частично отсутствует | Boundary declaration patch -> projection refresh | `graviton` | Wimp src или legacy `wimp` | metadata patch | Wimp src resolver | `/wimp/...` |
| 3 | Добавить/изменить StringField schema | root DSL -> WIMP fields snapshot | schema patch, затем projection refresh | `graviton` | Wimp src | `fields` schema patch | Wimp src + field key | `fieldParticles` |
| 4 | Добавить/изменить NumberField schema | как StringField | как StringField | `graviton` | Wimp src | `fields` schema patch | Wimp src + field key | Bulk names |
| 5 | Добавить/изменить BooleanField schema | как StringField | как StringField | `graviton` | Wimp src | `fields` schema patch | Wimp src + field key | Bulk names |
| 6 | Удалить ordinary field schema | не оформлено | schema remove + value cleanup | `graviton` | Wimp src | field schema remove patch | field key -> field id | `/field/...` |
| 7 | Добавить/изменить Fuzzy declaration вместо enum | enum field legacy | topology declaration patch | `higgs` | Wimp src или FuzzyId позже | connectivity patch | enum key -> topology id | enum as ordinary field |
| 8 | Добавить/изменить MACHO declaration вместо array | array field legacy | topology declaration patch | `higgs` | Wimp src или MachoId позже | connectivity patch | array key -> topology id | array as ordinary field |
| 9 | Добавить/изменить Axion declaration | topology exists | topology declaration patch | `higgs` | Wimp src или AxionId позже | predicate/logic patch | axion id resolver | path prefix |
| 10 | Изменить superposition/state graph | WIMP states snapshot | state graph declaration patch | `graviton` for declaration, `photon` for runtime | Wimp src | state graph patch | stateName/id map | full runtime object |
| 11 | Изменить process declaration | DSL process exists | declaration patch + runtime cache rebuild | `graviton` | Wimp src | process schema patch | state -> process map | processId in runtime impulse if resolvable |
| 12 | Изменить reaction declaration | DSL old `ReactionPart` | declaration patch | `graviton` | Wimp src | reaction schema patch | reaction id map | `/fields` path examples |
| 13 | Изменить matter plan | Dark matter plan materializes actors/topology | declaration patch + rematerialization policy | `higgs` | Wimp src | matter plan patch | matter particle ids | DB rows |
| 14 | Изменить binding/source/entanglement declaration | shared value ids implicit | explicit source projection | `higgs` | source id later | binding patch | value/source resolver | actorId in value if path resolves |
| 15 | Создать WIMP instance/current actor | `matter(src)` -> actor create | materialization intent -> Boundary actor snapshot | `graviton` | legacy `actor` | full actor snapshot | actor id | Bulk record |
| 16 | Удалить WIMP instance | not fully wired | actor removal + projection refresh | `graviton` | actor id later | remove snapshot | actor id -> children | direct SQLite from Bulk |
| 17 | Переместить WIMP/Fuzzy/MACHO/Axion в hidden tree | topology create currently | topology patch + Bulk relayout | `higgs` | ActorId/topology id later | connectivity move patch | topology tree cache | torus names in payload |
| 18 | Изменить ordinary value | AppWeb/Bulk `value.fields`; Energy `/field` | v0 ActorId + `value.fields`; v1 field address + scalar | `gluon` | ActorId | `{ fields }` | actor+field -> value/runtime index | `fieldParticles` |
| 19 | Изменить Fuzzy branch selection | enum legacy, fuzzy activity branch exists | topology selection impulse | `higgs` | ActorId/FuzzyId later | selection | fuzzy id, branch actor ids | enum as ordinary field long-term |
| 20 | Изменить MACHO multiplicity | array legacy | multiplicity impulse | `higgs` | ActorId/MachoId later | multiplicity delta | macho id, child mapping | array as ordinary field long-term |
| 21 | Изменить Axion logical condition/result | topology exists, runtime incomplete | logical impulse | `higgs` | AxionId later | predicate/result | axion id resolver | path prefixes |
| 22 | State transition | Energy photon with misleading `wimpIds` naming | ActorId-scoped photon | `photon` | ActorId | stateName | actor -> brane/state | processId unless needed |
| 23 | Process-bound state photon | weak maps exist | photon triggers process claim | `photon` + `z` | ActorId | stateName | state -> process | full process declaration |
| 24 | Process claim | historical `z` | lock token claim | `z` | ActorId/ProcessRunId | claim token | lock cache | `/wimp/.../process/...` |
| 25 | Process accept/reject | historical flow | `z` accept/reject | `z` | ProcessRunId | decision | run cache | redundant ids |
| 26 | Process success | old `w+` payload requires ids | result normalized by run cache | `w+` | ProcessRunId | write-set | run -> actor/process | `wimpId`/`processId` when resolvable |
| 27 | Process error | old `w-` | error result + unlock | `w-` | ProcessRunId | error | run cache | full process object |
| 28 | Process release/unlock | historical `z` release | release lock | `z` | ProcessRunId | release | lock token | direct DB unlock from Bulk |
| 29 | Reaction firing | root reactions old shape | resolved runtime reaction impulse | effect-specific | ActorId or reaction id later | minimal effect | reaction resolver | `/context` path |
| 30 | Source/entanglement propagation | shared `value.id` | propagation graph event | `gluon` or `higgs` | source id later | delta | source/value resolver | full fanout payload |
| 31 | Bulk manifest partial update | Bulk direct `handleForce` | observer only | observer | follows source part | no Bulk names | Bulk projection cache | `fieldParticles` in Force |
| 32 | Energy weak step | Energy APIs exist, not routed | orchestrated Energy step | `photon`, `z`, `w+`, `w-` | ActorId/RunId | minimal impulse/result | BoundaryEnergyRuntimeSnapshot | SQLite reads |
| 33 | Boundary persistent commit | `boundary.absorb` only graviton | commit accepted parts by owner | owner-specific | owner path | minimal patch | persistence resolver | Bulk geometry |

## 7. Нужные additions для `BoundaryEnergyRuntimeSnapshot`

Energy v0 не должен получать `/field/...` как публичный runtime address. Для этого
Boundary projection должен явно дать resolver caches.

Минимально нужная форма:

```ts
type BoundaryEnergyRuntimeSnapshot = {
  version: 1
  ids: {
    actorIds: number[]
    topologyIds: number[]
    wimpSrcs: string[]
  }
  resolver: {
    wimpSrcByActorId: Record<number, string>
    braneIndexByActorId: Record<number, number>
    actorIdByBraneIndex: number[]

    fieldIdByWimpSrcFieldKey: Record<string, number>
    runtimeFieldIndexByActorFieldKey: Record<string, number>
    runtimeFieldIndexByActorFieldId: Record<string, number>
    valueIdByActorFieldKey: Record<string, number>

    topologyIdByActorConnectivityKey: Record<string, number>
    darkParticleIdByActorOrTopologyId?: Record<string, number>
  }
}
```

Ключи `Record<string, ...>` должны быть deterministic composite keys, например
`"${actorId}:${fieldKey}"`, но это внутренний ключ проекции, а не Force `path`.

Что это решает:

- `gluon.path = ActorId` + `value.fields` можно применить в Energy без `/field/...`.
- `photon.path = ActorId` можно резолвить в brane/state/process.
- `higgs.path = ActorId` можно резолвить в Fuzzy/MACHO/Axion topology.
- `w+`/`w-` можно применять через ProcessRunId/ActorId без передачи `wimpId` и
  `processId` в payload.

Важно: `WIMP declaration` сейчас идентифицируется строковым `src`. Поэтому не
использовать `wimpIdByActorId: Record<number, number>`, пока в Boundary нет
отдельного числового WIMP id.

## 8. План миграции

### Фаза 0: сохранить текущее поведение

- Не менять Force payload `value.fields`.
- Не добавлять `value.fieldParticles`.
- Не менять словарь `BulkManifest`.
- Не ломать `/force`, AppWeb snapshot partials и Bulk direct visual updates.
- Не трогать SQLite schema.

### Фаза 1: закрепить закон протокола и типизированные адаптеры

- Добавить документы с законом Force и матрицей v0.
- Добавить type guards:
  `isForceFieldsPayload`, `isGluonActorFieldsImpulse`,
  `isPhotonStateImpulse`, `isWeakResultImpulse`.
- Расширить тесты:
  `value.fields` accepted;
  `value.fieldParticles` rejected;
  `/field/...` accepted only through legacy Energy adapter, not new public examples.

### Фаза 2: провести Force через оркестратор

- В AppWeb server добавить слой оркестрации:
  Boundary owner, Energy owner, Bulk observer.
- `/force` должен направлять impulse владельцу домена, а не просто вызывать
  `boundary.absorb()` и broadcast.
- Energy должен получать runtime updates и испускать photon.
- Bulk должен наблюдать projection/runtime signals.

### Фаза 3: убрать `/field/...` из публичной поверхности Energy

- Добавить normalizer для `gluon.path = ActorId` + `value.fields`.
- Сохранить legacy `/field` только внутри adapter.
- Добавить тесты, что новый публичный путь не требует URI-like path.

### Фаза 4: довести topology runtime Energy

- Заполнить `topologyWimpFieldIds` или заменить это поле на явную
  connectivity projection.
- Начать миграцию `enum -> Fuzzy`, `array -> MACHO`.
- Не делать это одним коммитом с protocol guards.

### Фаза 5: интегрировать process runner

- Ввести `ProcessRunId` и lock token.
- `photon` process-bound state запускает `z claim`.
- `w+`/`w-` возвращают compact result через normalizer.
- Energy применяет write-set и снимает lock.
- Boundary фиксирует accepted write-set.

### Фаза 6: очистить документацию и тесты

- Обновить `docs/FORCE.md`, `docs/TOPOLOGY.md`, proto docs и root reaction docs.
- Убрать public examples с `/field/...` и `/wimp/...`.
- Оставить typed prefixes только в Dark topology docs, если они описывают graph
  notation, а не runtime Force path.
- Добавить integration tests для AppWeb Force -> Energy/Bulk/Boundary flow.

## 9. Задачи по файлам

### `docs/FORCE.md`

Почему трогать:

- Сейчас содержит старые path examples.

Изменение:

- Переписать под `part x path -> resolver`, `op x value -> impulse`.
- Добавить различие v0/v1.
- Убрать `/field/...` и `/wimp/...` из новых публичных примеров.

Тесты:

- docs only, но желательно добавить protocol guard tests рядом с кодом.

### `boundary/force.t.ts`

Почему трогать:

- Текущий `path` типизирован как `string`, а целевой `DomainPath` должен
  поддерживать `string | number`.

Изменение:

- После аудита call sites ввести `DomainPath`.
- Не делать это первым коммитом, если есть риск сломать текущие callers.

Тесты:

- typecheck после миграции call sites.

### `bulk/web/force-protocol.ts`

Почему трогать:

- Это текущая защитная граница от протекания словаря Bulk в Force.

Изменение:

- Сохранить acceptance only for `value.fields`.
- Не принимать `value.fieldParticles`.
- Можно добавить named guard for `gluon`/`higgs` fields payload.

Тесты:

- `bun test bulk/web/force-protocol.spec.ts`.

### `app/web/client.ts`

Почему трогать:

- Здесь current snapshot partials применяются через `value.fields`.

Изменение:

- Вынести normalizer for Force fields partials.
- Не переименовывать payload.
- Добавить regression test for `value.fields`.

Тесты:

- relevant `app/web/*.spec.ts`.

### `app/web/server.ts`

Почему трогать:

- Сейчас `/force` в основном route-ится в Boundary и broadcast.

Изменение:

- Фаза 2: ввести orchestrator shell.
- Развести владельцев доменов: Boundary, Energy, Bulk observer.
- Не делать broad rewrite в фазе 1.

Тесты:

- AppWeb force route/orchestrator tests.

### `boundary/runtime/energy.ts`

Почему трогать:

- Energy нужны resolver caches.
- Текущее поле `wimpIds` фактически содержит `actor.id`.

Изменение:

- Добавить ActorId/fieldKey/topology resolver projection.
- Явно добавить `wimpSrcByActorId`, `actorIdByBraneIndex`,
  `braneIndexByActorId`.
- Переименовать misleading identity fields после проверки потребителей.
- Заполнить topology runtime после начала миграции `enum/array`.

Тесты:

- Boundary energy runtime snapshot tests.
- Energy loadRuntimeSnapshot tests.

### `energy/energy.ts`

Почему трогать:

- Public Energy Force surface still uses `/field`.

Изменение:

- Добавить normalizer accepting v0 ActorId + `value.fields`.
- Keep legacy `/field` only behind adapter during migration.
- Clarify photon path ActorId vs misleading `wimpIds` naming.

Тесты:

- `energy/energy.spec.ts`.
- Tests for no URI-like public paths in new adapter.

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

### Корневые DSL-файлы

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

- ActorId + field key resolves to `fieldId`, `runtimeFieldIndex`, `braneIndex`.
- Photon ActorId + stateName resolves to brane/state index.
- Process-bound state resolves to process without payload `processId`.
- Current misleading `wimpIds` naming does not leak into public protocol.

Bulk direct Force adapter tests:

- manifest with field particle;
- Force `{ part: "gluon", path: ActorId, value: { fields: { key: scalar } } }`;
- `bulkViewport.handleForce()` updates field particle visual value;
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

- no `Row`/`Shell`/`Orbit` as Bulk model entities;
- no `value.fieldParticles` in Force protocol;
- no new `/field/...` public caller after adapter migration.

## 11. Риски и антицели

Антицели:

- Не ломать Bulk rename.
- Не возвращать `Row`, `Shell`, `Orbit` как model/entity names.
- Не протаскивать `BulkManifest`, `BulkDarkParticle`, `BulkFieldParticle` в
  Force payload.
- Не заставлять Energy/Bulk читать SQLite.
- Не копировать старый monolith path protocol.
- Не раздувать `photon` payload.
- Не использовать `processId` в photon, если resolver cache может вывести process
  from state.
- Не делать `enum/array` semantic migration в одном коммите с protocol guards.
- Не менять SQLite schema без отдельного storage migration plan.

Риски:

- ActorId, WIMP src и misleading `wimpIds` сейчас местами смешаны, особенно для
  `photon`.
- Bulk visual ids не равны Boundary ids во всех случаях: actor id и topology id
  адаптируются в `app/web/world.ts`.
- `fieldParticleId` в Bulk не является автоматически правильным Force address id.
- Shared values/entanglement выражены через общий `value.id`, поэтому v1 field
  addressing должен учитывать fanout.
- AppWeb сейчас не имеет Energy orchestrator route; прямое добавление Energy в
  client-side flow создаст дублирование владения.

## 12. Следующий минимальный шаг

Рекомендуемый следующий коммит должен быть маленьким:

1. Перенести стабильную часть этого документа в `docs/FORCE.md` после ревью.
2. Добавить typed Force normalizers без изменения поведения рантайма:
   - `resolveForceFieldsPayload(value)` остаётся текущим Bulk/Web adapter;
   - новый `resolveGluonActorFieldsImpulse(part)` может жить рядом с AppWeb/Energy
     adapter layer;
   - `value.fieldParticles` остаётся rejected.
3. Добавить тесты на v0 invariants:
   - `value.fields` accepted;
   - `value.fieldParticles` rejected;
   - no Bulk vocabulary in Force payload.
4. После этого проектировать AppWeb orchestrator:
   Boundary владеет persistence, Energy владеет runtime transitions/processes,
   Bulk наблюдает manifestation.

До появления resolver cache не переходить на:

- `gluon.path = FieldParticleId`;
- `higgs.path = FuzzyId | MachoId | AxionId`;
- `w+`/`w-` without compatibility normalizer.

Такой переход должен быть v1, а не v0.
