# Store unification — актуальное состояние и план

Дата: 2026-04-26. Ветка: `arch`.

Этот документ заменяет старую рабочую картину из `task/storage-analysis.md` для текущего этапа. Старые документы полезны как исторический аудит `pkg/db`, но текущая архитектурная цель уже другая: довести `store` до полнофункционального единого источника истины, сначала на SQLite, затем на IDB, затем добавить sync и перевести проект на единый store API.

---

## 1. Текущий факт по `store`

В текущем `HEAD` нет `store/db`. Новый store состоит из:

- `store/server.ts` — server-side entrypoint, открывает одну `Bun.SQL` SQLite и применяет `metaSchemaSql + actorSchemaSql`.
- `@store/meta/sqlite` — нормализованная DSL/meta схема.
- `@store/actor/sqlite` — actor/value/state слой.

Публичный `store/package.json` сейчас экспортирует только:

```json
{
  "exports": {
    "./server": "./server.ts"
  }
}
```

Это означает: текущий публичный store ещё не является заменой старого `store/db`/`pkg/db` API для проекта. Большая часть runtime-кода всё ещё импортирует `store/db`, которого уже нет.

### Что работает

`store/meta/sqlite` живой:

```bash
bun test store/meta/sqlite/sqlite.spec.ts store/meta/sqlite/read.spec.ts
```

Результат на 2026-04-26: `8 pass`.

Meta-слой умеет:

- раскладывать DSL в 33 таблицы;
- читать particle-centric model для Dark;
- не хранить `has_processes/reactions/matter` как колонки, а вычислять через `EXISTS`.

### Что сейчас сломано

1. `store/server.open()` падает на actor DDL:

```text
SQLiteError: no such column: variant
```

Причина: `store/actor/sqlite/schema.ts` создаёт индекс:

```ts
{ name: "value_by_variant", table: "value", columns: ["variant"], unique: false }
```

Но `variant` лежит в `value_enum`, не в `value`.

Это симптом старой путаницы в actor docs/API: `store/actor/README.md` всё ещё
описывает `value.variant` как колонку root-таблицы `value`, но текущая схема уже
разнесла payload по typed subtable-ам:

```text
value(uuid, kind)
value_enum(value, variant)
```

Значит правильный индекс, если он нужен, должен быть на `value_enum(variant)`,
а не на `value(variant)`. В публичной терминологии actor-store нужно держать
жёсткое разделение:

- `field` — meta field identity (`field.uuid`);
- `actor_value.field` — ссылка актора на meta field;
- `actor_value.value` — ссылка на shared/local value identity;
- `value.kind` — только discriminator;
- `value_<kind>` — фактический payload.

2. Boundary tests уже не стартуют:

```bash
bun test boundary/tests/database.test.ts
```

Падает на:

```text
Cannot find module 'store/db/fixture'
```

3. Много production/test imports всё ещё смотрят в старый несуществующий API.

На 2026-04-26 grep показывает 20 реальных `import`-строк из `store/db*` в
коде и тестах, 28 совпадений вместе с документацией/комментариями:

- `app/web/runtime/*.ts`: `store/db`, `store/db/core`;
- `boundary/*.ts`, `boundary/tests/*.ts`: `store/db`, `store/db/core`, `store/db/fixture`;
- `dark/strong/Wimp.ts`, `dark/tests/*`, `fixture/dark.ts`: `store/db`;
- `dark/strong/MetaField.ts`: `store/db/uuid`;
- `dark/web.ts`, `boundary/web.ts`: `store/db/browser`.

4. `app/web/client.ts`, `app/web/runtime/dark.worker.ts`, `bulk/gravity/layout/*` частично переведены на `@store/actor`, но ожидают старые render/actor-row symbols:

- `DbActorStore`;
- `createIdbDbActorStore`;
- `createSqliteDbActorStore`;
- `createMirroredActorStore`;
- `DbParticleShellRow`, `DbFieldOrbitRow`, `DbWorldRows`.

Текущий `@store/actor` экспортирует ORM-классы actor/value/state, включая
type-specific subclasses (`BooleanValue`, `NumberValue`, `StringValue`,
`EnumValue`, `NullValue`, `ListValue`). Но он не экспортирует прежний
render-row store API и не содержит `DbParticleShellRow` / `DbFieldOrbitRow` /
`DbWorldRows`.

---

## 2. Старый DB-контракт, который ещё использует Boundary

Boundary сейчас завязан не на новый `@store/actor`, а на старый `DbData` shape из бывшего `pkg/db`.

Старый runtime-слой состоял из:

- `wimps`;
- `wimp_fields`;
- `wimp_edges`;
- `field_values`;
- `field_sources`;
- `wimp_states`;
- `entanglements`;
- `entanglement_members`;
- `entanglement_fields`;
- `entanglement_field_members`.

Boundary читает эти данные в `boundary/database.ts` и собирает derived runtime:

```text
DbData -> BoundaryDatabaseData -> Boundary Data -> boundary$ / weak$
```

Ключевые функции:

- `prepareBoundaryDatabaseData(rawData)`;
- `buildBoundaryRuntimeFieldRegistry(data)`;
- `prepareBoundaryEntanglementProjection(data, runtimeFieldIndexByDbFieldIndex)`;
- `prepareBoundaryRuntimeLoadedFragmentFromDbOperational(backend)`;
- `persistRuntimeChanges(changes, weakUpdates)`.

### Как Boundary использует fields

Для каждого `wimp`:

1. Берёт `wimp_fields` по `ownerWimpId`.
2. Находит meta field через `metaFieldId`.
3. Создаёт `BoundaryDatabaseFieldRecord` с:
   - `wimpFieldId`;
   - `key`;
   - `schema`;
   - `ownerBraneIndex`.
4. Значение берёт из `field_values.ownerWimpFieldId`.

Это даёт brane-local поле.

### Как Boundary использует source / entanglement

`field_sources` нужен для source-chain:

```text
childWimpFieldId -> parentWimpFieldId -> ... -> rootFieldId
```

Эта цепочка используется, чтобы:

- при загрузке фрагмента подтянуть parent package wimps, если child field зависит от parent field;
- вычислить root field id;
- получить `entanglementId = createDbEntanglementFamilyId(rootFieldId)`;
- прочитать соответствующую entanglement-family.

`entanglement_*` таблицы Boundary использует не как бизнес-истину, а как заранее подготовленную projection:

- `entanglements.membershipKey` группирует shared block по набору wimp-ов;
- `entanglement_members` даёт brane membership;
- `entanglement_fields` даёт seed runtime field, representative field, `payloadIds`, `semanticKeys`;
- `entanglement_field_members` связывает shared field с конкретными wimp fields.

Важно: Boundary **не выводит entanglement из равных значений**. Он принимает готовую projection и только валидирует её (`boundary/strong/entangled.ts`).

### Как Boundary пишет обратно

`boundary/boundary.ts -> persistRuntimeChanges()` пишет runtime changes обратно в old backend:

```ts
for (const [runtimeFieldIndex, value] of nextFieldValues.entries()) {
  const wimpFieldIds = strong$.wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] ?? []
  await Promise.all(wimpFieldIds.map((wimpFieldId) => backend.setFieldValue(wimpFieldId, value)))
}
```

То есть shared runtime field может соответствовать нескольким UUID-addressed fields. Старый backend обновлял каждую `field_values` запись отдельно. В новом actor-store при shared `value.uuid` это должно стать одним `UPDATE value...` по shared value, а не N записей.

---

## 3. Как entanglement был устроен раньше

Dark строил source на уровне object graph.

Файлы:

- `dark/strong/fields.ts`;
- `dark/strong/Field.ts`;
- `dark/strong/Wimp.ts`.

Правило source:

1. `resolveNodeFieldInits()` вычисляет значения child fields из matter binding.
2. `resolveDirectFieldSources()` пытается доказать прямую связь вида:

```ts
{ childKey: _[index] }
```

где `_[index]` пришёл из path `/value/<parentField>` или `/fields/<parentField>`.

3. Source ставится только если:

- binding expression является простым object-literal mapping;
- source field найден у parent;
- source schema ordinary;
- child schema ordinary.

`enum` и `array` намеренно исключены:

```ts
field.type !== "enum" &&
field.type !== "array" &&
!field.type.startsWith("enum<") &&
!field.type.startsWith("array<")
```

Значит старая canonical entanglement-семантика была уже узкой:

- direct ordinary field source -> entanglement;
- topology fields (`enum`, `array`) получают значение, но не source;
- dynamic expression не становится shared identity, это вычисленное значение.

`Wimp.toDbBundle()` переносил это в DB через:

```ts
if (field.source) fieldBundle.sourceWimpFieldId = field.source.id
```

Старый materialization writer строил:

- `field_sources` для direction/provenance;
- entanglement family по root source field;
- representative field;
- members;
- payload ids;
- semantic keys.

---

## 4. Что значит это для текущего `@store/actor`

Текущая модель:

```text
actor(uuid, parent, meta, position)
value(uuid, kind)
value_<kind>(value, ...)
value_list_item(value, position, item_value)
actor_value(actor, field, value)
actor_state(actor, metaState)
```

Entanglement выражен как:

```text
actor_value(actorA, fieldX, valueV)
actor_value(actorB, fieldY, valueV)
```

Это покрывает главный runtime-effect: запись в один shared `value.uuid` видна всем owners.

### Что shared value покрывает хорошо

- shared ordinary field value;
- N акторов в одной shared family;
- read owners: `SELECT actor, field FROM actor_value WHERE value = ?`;
- write-back из Boundary одним update по `value`;
- fork/share операции (`link.fork`, `link.share`).

### Что shared value не хранит

- направление `parent -> child`;
- binding/provenance, через который связь появилась;
- root source field id;
- stable representative, если нельзя вывести его из actor hierarchy/order;
- отличие “direct source” от “ручного share”.

Это не обязательно плохо. Для runtime Boundary direction почти не нужен, если мы умеем вывести shared block из `actor_value` groups. Но для отладки, объяснимости, стабильного representative и реконструкции source-chain direction может понадобиться.

### Вывод по спорному месту

Минимальная схема `actor_value -> value` правильная как каноническая модель shared state.

Но для полного переноса старого Boundary поведения есть три варианта:

1. **Без отдельной source-таблицы.**
   - Entanglement projection выводится из shared `value`.
   - Membership = owners одного `value`.
   - Representative = стабильный первый actor по actor tree order/position.
   - Field name = representative field key.
   - Direction не хранится.

2. **С nullable provenance-колонками прямо в `actor_value`.**
   - Добавить `source_actor` + `source_field`.
   - `NULL/NULL` = manual/local link.
   - non-null pair = ссылка на исходный `(actor, field)`.
   - Это компактно, но смешивает hot link-row с optional provenance и требует
     аккуратных правил для `share` / `fork`: manual share должен чистить source,
     source-share должен сохранять direction, delete/update source row не должен
     оставлять actor без значения.

3. **С минимальной source/provenance-таблицей.**
   - Shared value остаётся source of truth.
   - Добавляется не старая entanglement-family, а только provenance:

```sql
actor_value_source(
  actor TEXT NOT NULL,
  field TEXT NOT NULL,
  source_actor TEXT NOT NULL,
  source_field TEXT NOT NULL,
  binding TEXT,
  PRIMARY KEY(actor, field),
  FOREIGN KEY(actor, field) REFERENCES actor_value(actor, field) ON DELETE CASCADE,
  FOREIGN KEY(source_actor, source_field) REFERENCES actor_value(actor, field) ON DELETE CASCADE,
  FOREIGN KEY(binding) REFERENCES matter_binding(uuid) ON DELETE SET NULL
)
```

Этот вариант сохраняет direction и root-chain без возврата 4 entanglement-таблиц. Entanglement blocks всё равно выводятся запросом из shared `value`.

Решение: для первого DDL-fix не добавлять provenance. Перед переносом Boundary
нужно проверить, можно ли заменить source-chain запросами owners-by-value. Если
нельзя, предпочтительнее отдельная `actor_value_source`, а не nullable-колонки:
она держит основной `actor_value` простым и позволяет удалять/перестраивать
provenance независимо от link-row.

---

## 5. Целевая модель единого store

Публичный API должен быть единым:

```ts
import { open } from "store/server"
// позже:
import { open } from "store/browser"

const store = await open(...)
```

Namespace-ы:

```ts
store.meta
store.actor
```

На первом этапе render rows (`particle_shell`, `field_orbit`) не должны быть частью store. Они вычислимы из `meta + actor + layoutConfig`, значит это Bulk/render projection.

### SQLite-first минимум

Чтобы SQLite-store был полнофункциональным, нужно закрыть:

1. `store/server.open()` должен стабильно открывать БД.
2. `store/package.json` должен экспортировать нужные subpath-ы:
   - `.` или `./server`;
   - `./server`;
   - возможно `./fixture` только для тестов;
   - не возвращать `store/db`.
3. `@store/meta` и `@store/actor` должны иметь общие типы, не привязанные к `bun:SQL` в публичном уровне.
4. До нового writer-а нужно зафиксировать identity strategy.
5. Нужен writer/materializer из Dark object graph в `store.actor`, заменяющий старый `openDbMaterializationWriter`.
6. Нужен Boundary adapter, который читает из `store` адресно, а не через old `DbData`.
7. Тестовый full read может жить только в `fixture.ts`, не в runtime API.

### Actor materialization из Dark

Новый writer должен:

1. Сохранять meta через `store.meta.create(src, dsl/projection)`.
2. Создавать actor по Wimp:
   - `actor.uuid = wimp.id`;
   - `actor.parent = parent Wimp id | null`;
   - `actor.meta = wimp.meta.src`;
   - `actor.position = sibling order`;
   - `actor_state.metaState = initial superposition`.
3. Для каждого field:
   - field id брать из `field.uuid` по `(meta, key)`;
   - если direct source exists и ordinary: `actor_value.value = source actor_value.value`;
   - иначе создать новый `value` + type-specific rows;
   - для list записать `value_list_item`.
4. Для topology fields (`enum`, `array`) source не шарить, как раньше.
5. Для dynamic expression source не шарить, а записывать вычисленное значение.

### Identity strategy перед writer-ом

Это не side-note, а pre-step перед заменой `store/db` writer-а.

Факты в текущем коде:

- `store/meta/sqlite/*.C.ts` генерирует UUID через `crypto.randomUUID()`;
- `store/actor/sqlite/actor.C.ts` принимает IDs извне в `ActorRows`;
- `dark/strong/Field.ts` и `dark/strong/part.ts` генерируют random UUID;
- `dark/strong/MetaField.ts` сейчас импортирует `deriveUuid` из удалённого
  `store/db/uuid` и ожидает deterministic id для `(meta src, field key)`.

Варианты:

1. deterministic IDs там, где identity выводима из semantic key:
   - meta field: `(meta src, field key)`;
   - enum variant: `(meta src, field key, variant position/value)`;
   - state: `(meta src, state name/position)`;
   - actor: либо explicit external id, либо deterministic от materialization path.
2. random IDs, но writer всегда передаёт ids явно, а sync-события всегда несут
   уже созданный id. Тогда нужна отдельная conflict policy для offline same-entity.

Для SQLite-only можно жить с random internal rows, если writer читает UUID по
уникальным `(meta, key)` после `meta.create`. Для sync и repeatable materialize
лучше не откладывать решение: stable semantic rows должны иметь deterministic
identity или жёсткий unique natural key + conflict policy.

### Boundary adapter без old `DbData`

Boundary нужно перевести с:

```text
DbBackend / DbData / wimp_* / entanglement_*
```

на:

```text
store.meta + store.actor -> BoundaryDatabaseData
```

Адресные запросы, которые нужны Boundary:

- list active/root actors;
- get actor head;
- list children by parent;
- get actor values with meta field rows and value rows;
- get current actor state;
- get owners by value;
- get meta fields/states/transitions/conditions/processes/reactions by meta src.

Boundary `BoundaryDatabaseData` можно собирать напрямую:

- actor -> brane;
- actor_value + field + value -> field/value;
- actor.parent -> structural edge;
- actor_state -> state seed;
- owners одного `value` с count > 1 -> entanglement projection.

Старый `DbData` после этого должен исчезнуть из production path. Если нужен compatibility helper для тестов, он должен лежать в fixture/debug модуле.

### IDB этап

После SQLite:

1. Повторить `meta` и `actor` schemas в IndexedDB.
2. Сохранить тот же публичный API `open` и те же namespace-ы.
3. Сделать parity tests SQLite <-> IDB на:
   - meta create/get/delete;
   - actor create/get/delete;
   - value set/list/fork/share;
   - owners by value;
   - Boundary adapter result equivalence.

### Sync этап

Sync должен идти по store-level operations, а не по render rows.

Минимальный event set:

- `meta.upsert(src)`;
- `meta.delete(src)`;
- `actor.create(uuid)`;
- `actor.delete(uuid)`;
- `actor.value.set(valueUuid, payload)`;
- `actor.value.item.write(valueUuid, position, payload)`;
- `actor.value.item.truncate(valueUuid, fromPosition)`;
- `actor.link.share(actor, field, valueUuid)`;
- `actor.link.fork(actor, field, newValueUuid)`;
- `actor.state.set(actor, metaState)`.

Browser IDB применяет те же операции. Boundary/Bulk на клиенте получают invalidation или derived projection events уже поверх store sync.

---

## 6. Порядок работ

### Шаг 1 — SQLite store привести в рабочее состояние

- 1.1. Исправить DDL:
  - удалить `value_by_variant`, если нет read-side use-case;
  - или перенести его на `value_enum(variant)`, если появится запрос по variant;
  - обновить `store/actor/README.md`, где ещё описан несуществующий `value.variant`.
- 1.2. Добавить server integration smoke:
  - `open()` на чистой `:memory:` БД;
  - `meta.create`;
  - `actor.create`;
  - `actor.value.get` / type-specific read;
  - `actor.link.share` / `actor.link.fork`;
  - `close()`.
- 1.3. Предпочесть dynamic DDL smoke статическому парсингу SQL:
  - `open()` уже ловит индекс на несуществующей колонке;
  - отдельный static check `index -> existing column` возможен, но будет хрупким
    без полноценного SQL parser-а.
- 1.4. Разорвать ложные imports `@store/actor` render API:
  - `DbParticleShellRow`, `DbFieldOrbitRow`, `DbWorldRows` не должны жить в
    `@store/actor`;
  - их нужно вернуть/перенести в Bulk/render projection module.

### Шаг 1.5 — Identity strategy

- Зафиксировать deterministic-vs-random правило до нового writer-а.
- Убрать зависимость `dark/strong/MetaField.ts` от удалённого `store/db/uuid`.
- Решить, кто владеет actor id:
  - Dark object graph;
  - store writer;
  - caller через explicit id.
- Для repeatable materialize и будущего sync не оставлять semantic rows только на
  `crypto.randomUUID()`.

### Шаг 2 — заменить старый `store/db` writer

- Создать новый materializer в store или dark-adapter:
  - `saveMeta(...)`;
  - `saveActor(...)`;
  - `saveMatterTree(...)` / streaming over Wimp graph.
- Перевести `dark/strong/Wimp.save()` и `dark/dark.ts matter()` с `DbMaterializationWriter` на новый store writer.
- Убрать `store/db/uuid`; `deriveUuid` либо перенести в общий helper, либо полностью заменить стабильной identity strategy внутри store.

### Шаг 3 — Boundary adapter

- Детальный scope вынести в `task/boundary-unification.md`.
- Написать `boundary/database.store.ts` или заменить `boundary/database.ts` по частям.
- Не собирать полный `DbData` как runtime path.
- Сначала сделать SQLite-only adapter поверх `store.server.sql`.
- Переписать `boundary/tests/database.test.ts` на новый store fixture.
- Сохранить строгий принцип: Boundary получает prepared entanglement projection, но projection выводится из store actor shared values.

### Шаг 4 — Удалить old `store/db` imports

Текущие группы imports:

- app web workers;
- boundary runtime/tests;
- dark writer/tests;
- fixture db helpers;
- dark/web and boundary/web browser db stubs.

Их нельзя чинить косметически. Нужно заменить на реальные `store/server` / будущий `store/browser` paths.

### Шаг 5 — IDB parity

- Детальный scope вынести в `task/idb-parity.md`.
- Добавить `store/browser.ts`.
- Реализовать `@store/meta/idb` и `@store/actor/idb` или общий IDB backend под те же entity APIs.
- Parity tests должны сравнивать наблюдаемое поведение API, не внутренние таблицы.

### Шаг 5.5 — Render projection boundary

- Детальный scope вынести в `task/render-projection.md`.
- `layoutConfig` должен быть конкретизирован:
  - domain layout law (`BulkLayoutSettings`);
  - viewport/camera config (`appWebLayoutConfig.viewport`);
  - user UI settings (`app/web/ui-settings-idb.ts`);
  - transient frame/camera runtime state, который не должен становиться store truth.
- Render rows могут быть cache/projection, но не частью canonical `store.actor`.

### Шаг 6 — Sync

- Store-level sync events.
- IDB mirror применяет operations.
- Boundary/Bulk перестают читать render rows из mirror DB.
- Render projection пересчитывается из actor/meta по событию или батч-барьеру.

---

## 7. Blockers / open questions

1. **Нужен ли `actor_value_source`?**
   - Если Boundary projection стабильно выводится из shared `value`, не нужен.
   - Если нужен direction/root/source provenance, добавить минимальную таблицу provenance, не возвращать старые entanglement tables.

2. **Как создавать actor values из meta defaults?**
   - Сейчас actor writer принимает `ActorRows`.
   - Нужен high-level create, который сам читает meta field defaults.

3. **Как хранить list element type?**
   - `value_list_item.item_value TEXT` требует восстановления типа из meta.
   - Для Boundary сейчас `array` всегда numeric (`elementType: "number"`). Это нужно либо зафиксировать как контракт, либо расширить meta field schema элементным типом.

4. **Что делать с render rows?**
   - Не хранить в store как канон.
   - Для app/web можно оставить render cache в Bulk/IDB позже, но это не store source of truth.

5. **Identity strategy ещё не зафиксирована.**
   - Это уже вынесено в Шаг 1.5.
   - Пока решение не принято, нельзя честно закрыть writer/sync дизайн.

6. **Boundary working memory.**
   - `boundary$`, `gravity$`, `weak$`, `strong$` сейчас остаются in-memory derived runtime.
   - Это допустимо как execution/cache layer, но canonical actor/meta state должен жить в store.
