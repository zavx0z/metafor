# Store load pipeline — `github/zavx0z/git`

Дата: 2026-04-27. Документ описывает pipeline наполнения `store` на текущем
примере `github/zavx0z/*`, с конкретным root src `zavx0z/git`.

Важно: `github/zavx0z` сейчас является namespace-директорией, а не отдельной
meta. Загружаемый адрес должен указывать на пакет с `meta.ts`, например:

```text
src:  zavx0z/git
file: github/zavx0z/git/meta.ts
```

Если когда-нибудь нужен прямой address `zavx0z`, в дереве должен появиться
`github/zavx0z/meta.ts`.

---

## 1. Input

Пользователь или runtime задаёт root src:

```ts
const src = "zavx0z/git"
```

На сервере `dark/load.ts` резолвит его в локальный TS-модуль:

```text
zavx0z/git -> github/zavx0z/git/meta.ts
```

В браузере тот же адрес резолвится как fetch:

```text
/github/zavx0z/git/meta.json
```

На практике текущий Bun path читает `meta.ts` через dynamic import и возвращает
`MetaDSL`.

---

## 2. Open Store

Целевой runtime должен открывать единый store:

```ts
import { open } from "store/sqlite"

const store = await open("metafor.sqlite")
```

`store/sqlite.ts` открывает один SQLite handle и применяет схемы на одной
БД:

```text
metaSchemaSql  -> декларативный DSL/meta слой
actorSchemaSql -> runtime actor/value/state слой
```

Результат:

```ts
store.meta
store.actor
store.sql // low-level handle только для adapter/tests/debug
```

Runtime-код должен работать через `store.meta` и `store.actor`. Прямой SQL
допустим только внутри store adapters, fixtures и миграций.

---

## 3. Meta Canonicalization

Первый фактический write в store — meta layer.

Текущий код:

```text
dark/load.ts
  readMetaDsl("zavx0z/git")
  -> import github/zavx0z/git/meta.ts
  -> relation/metaCreate(sql, dsl, "zavx0z/git")
```

Целевой store API:

```ts
const dsl = await readMetaDsl("zavx0z/git")
await store.meta.create("zavx0z/git", dsl)
```

Что появляется в `store.meta`:

```text
meta(src = "zavx0z/git")
field(...)
field_default(...)
field_enum_variant(...)
superposition(...)
transition(...)
process(...)
reaction(...)
matter_binding(...)
matter_particle(...)
matter_particle_wimp/fuzzy/axion/macho(...)
```

`meta` слой хранит декларацию, а не запущенные экземпляры. Для `zavx0z/git`
это описание командного узла, его fields/state/process/reaction/matter и
топологии дочерних meta через `matter`.

---

## 4. Read Runtime Meta Projection

После записи DSL в relational meta store Dark больше не должен обходить raw DSL.
Он читает runtime projection из `store.meta/sqlite`:

```ts
const model = await readDarkParticleModel(store.sql, "zavx0z/git")
```

Projection содержит:

```ts
{
  meta: MetaInit,
  particles: MatterParticlePlan[]
}
```

Для `zavx0z/git` `particles` описывает topology children: какие дочерние
`wimp/fuzzy/axion/macho` нужно создать, какие bindings передают поля, какие
child src могут появиться (`zavx0z/git-start`, `zavx0z/git-work`,
`zavx0z/git-history`, и т.д.).

---

## 5. Actor Materialization

На этом шаге Dark превращает `MatterParticlePlan` в runtime actors.

Текущий legacy path:

```text
dark/dark.ts
  matter(new Wimp({ src: "zavx0z/git" }))
  -> создаёт Wimp/Fuzzy/Axion/Macho object graph
  -> Wimp.toDbBundle()
  -> old DbMaterializationWriter / store/db
```

Целевой store path:

```text
MatterParticlePlan + parent actor context
  -> ActorRows
  -> store.actor.create(rows)
```

Минимальная запись root actor:

```text
actor(uuid, parent = null, meta = "zavx0z/git", position = 0)
actor_state(actor, metaState)
actor_value(actor, field, value)
value(uuid, kind)
value_<kind>(value, payload)
value_list_item(value, position, item_value)
```

Правила:

- `actor.meta` хранит `meta.src`.
- `actor.parent` хранит uuid parent actor, а не object reference.
- `actor.position` фиксирует порядок среди siblings.
- `actor_state.metaState` берётся из initial superposition.
- `actor_value.field` ссылается на `field.uuid` из `store.meta`.
- `actor_value.value` ссылается на shared/local `value.uuid`.
- payload лежит только в `value_<kind>`.

Dark object graph может существовать как traversal/execution layer, но
canonical state должен быть в `store.actor`.

---

## 6. Field Binding And Shared Values

Когда `zavx0z/git` порождает child actor, например `zavx0z/git-start`, binding
может передать child fields из parent fields.

Текущая Dark-логика:

```text
resolveNodeFieldInits()
resolveDirectFieldSources()
materializeFields()
```

Прямая ordinary field-связь распознаётся только для простого случая:

```ts
{ childKey: _[index] }
```

где `_[index]` пришёл из `/value/<parentField>` или `/fields/<parentField>`.
`enum` и `array` не считаются direct source для entanglement.

Целевое store-представление:

```text
parent actor_value -> value V
child  actor_value -> value V
```

То есть entanglement — это shared `value.uuid`, а не отдельный объектный link.

Если позже нужен direction/provenance (`parent field -> child field`), его
нужно хранить отдельно, например в `actor_value_source`, не возвращая старые
`entanglement_*` таблицы.

---

## 7. Recursive Loading

Когда root `zavx0z/git` materialize-ит child `zavx0z/git-start`, pipeline
повторяется для child src:

```text
loadMeta("zavx0z/git-start")
  -> github/zavx0z/git-start/meta.ts
  -> store.meta.create("zavx0z/git-start", dsl)
  -> readDarkParticleModel("zavx0z/git-start")
  -> create child actors
```

Store должен быть idempotent на уровне meta src: повторная загрузка уже
канонизированной meta не должна плодить дубли декларации.

Actor layer, наоборот, создаёт runtime экземпляры: два запуска одного src могут
создать разные actors, если caller явно не передал тот же actor id.

---

## 8. Resulting Store Shape

После загрузки root `zavx0z/git` и одного дочернего `zavx0z/git-start` store
должен иметь:

```text
meta
  zavx0z/git
  zavx0z/git-start

field
  fields of zavx0z/git
  fields of zavx0z/git-start

matter_particle
  topology plan rows for both metas

actor
  root actor for zavx0z/git
  child actor for zavx0z/git-start

actor_value
  root field links
  child field links

value / value_<kind>
  local values
  shared values for direct ordinary bindings

actor_state
  current state per actor
```

Boundary and Bulk should consume this through store-level read APIs/adapters.
They must not depend on old `store/db` dumps or render-row tables as source of
truth.

---

## 9. Current Gaps

This is the intended store-filling pipeline, but current code still has gaps:

1. Some runtime code still imports old `store/db*`.
2. Dark still calls `DbMaterializationWriter` and `Wimp.toDbBundle()`.
3. Boundary still expects old `DbData` / `wimp_*` / `entanglement_*` rows.
4. Render rows (`DbWorldRows`, `DbParticleShellRow`, `DbFieldOrbitRow`) are still
   referenced as if they belonged to `@store/actor`; they should move to
   Bulk/render projection.
5. Identity strategy must be fixed before sync:
   - semantic meta rows should have stable identity or unique natural keys;
   - actor ids must be explicit from caller/materializer or deterministic by
     materialization path;
   - sync events must carry ids, not rely on local random generation.

---

## 10. Target Sequence

Implementation order for this pipeline:

1. Keep `store/sqlite.open()` green with integration smoke.
2. Use `store.meta.create(src, dsl)` as the only meta write path.
3. Add a store materializer that converts Dark runtime plans to `ActorRows`.
4. Replace `Wimp.save()` / `toDbBundle()` persistence with that materializer.
5. Build Boundary adapter from `store.meta + store.actor`.
6. Move render-row types/API out of `@store/actor`.
7. Add `store/browser` IDB implementation against the same public API.
8. Add store-level sync operations.
