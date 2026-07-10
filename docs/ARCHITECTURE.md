# Архитектура

MetaFor переводит онтологию `Domain × Force × Entity` в исполняемые границы.
`meta` является источником declaration, Boundary — владельцем canonical
persistence, а каждый runtime-домен удерживает только собственную локальную
проекцию.

## Голографический инвариант

MetaFor рассматривает целое через границу, но не передаёт целое одним снимком.
Граница фиксирует причинное изменение, после чего это изменение проявляется в
других доменах минимальными particles.

Из этого следуют обязательные правила:

1. домен не читает runtime или persistence другого домена;
2. каждый домен поддерживает внутренний store своей проекции и локальные
   parent-child/dependency индексы;
3. одна изменённая сущность пересекает Force как один impulse с одной Particle;
4. неизменённые сущности и их identity не пересоздаются;
5. snapshot, `type:"create"`, reset, очистка мира и полная рематериализация
   запрещены;
6. cold start и reconnect используют поток обычных idempotent particles.

Это архитектурная дисциплина, а не буквальная симуляция физики.

## Причинный поток

```text
meta/WIMP source
  -> Dark local declaration store and diff
  -> one inflaton particle per declaration entity
  -> Force
  -> Boundary one-entity transaction
  -> local materialization consequences after commit
  -> one graviton/gluon/higgs/photon particle per changed runtime entity
  -> Force
  -> Matrix / Energy / Bulk local stores
```

Короткая формула:

```text
Dark различает возможность.
Boundary фиксирует действительность.
Force переносит причинный импульс.
Matrix проводит состояние.
Energy исполняет процесс.
Bulk проявляет форму.
```

## Локальная проекция

Внутренний store не является копией чужой БД. Он содержит только данные и
индексы, необходимые домену:

- Dark: declaration entities, root ownership, parent-child references;
- Boundary: canonical rows, declaration-to-actor и topology-to-instance links;
- Matrix: branes/actors, parent-child structure, fields и state graph;
- Energy: actors, process descriptors и их WIMP/state links;
- Bulk: visual instances, parent-child links, layout и positions.

Проекция создаётся и изменяется одним и тем же способом — применением
упорядоченных particles. Отдельного bootstrap/reset-протокола нет.

## Dark

Dark читает DSL/meta и нормализует каждую declaration entity отдельно.

Первое чтение даёт `inflaton/add`; повторное чтение сравнивается с внутренним
store и даёт только:

- `add` для новой entity;
- `remove` для исчезнувшей entity;
- `replace` с изменившимися свойствами для изменённой entity.

Адрес collection entity:

```text
<wimp src>/<section>/<local id>
```

Singleton sections (`meta`, `mass`, `bulk`) не имеют последнего сегмента.
Каждый message содержит ровно одну Particle. Зависимости добавляются до
ссылающихся entities и удаляются после удаления ссылок. Финальный
`inflaton/test` — только marker завершения потока; он не запускает rebuild.

Dark не создаёт actor, topology instance или value и не открывает Boundary DB.

## Boundary

Boundary применяет один Inflaton patch в одной SQLite transaction. После commit
он вычисляет только последствия адресованной entity.

Boundary поддерживает индексы:

```text
parent -> children
declaration -> actors
topology declaration -> runtime instances
```

Поэтому:

- новый child создаёт только свою ветвь;
- remove удаляет только адресованную ветвь;
- declaration replace патчит только зависящие actors/instances;
- ID неизменённых rows, actors и topologies сохраняются.

Derived entity адресуется непосредственно:

```text
actor/<runtime id>
topology/<runtime id>
declaration/<wimp src>/<section>/<local id>
```

`add` несёт одну самодостаточную entity, `replace` — только delta, `remove` не
несёт прежний подграф. Derived particles отправляются только после commit и
каждая отправляется отдельным Force impulse.

## Force

Force — один WebSocket/HTTP transport без semantic state, snapshot cache и
replay log. Его единственный control payload — регистрация соединения.

Обычный контракт:

```ts
interface ForceMessage {
  parts: [Particle]
}
```

Force сохраняет порядок сообщений, не возвращает WebSocket impulse его
отправителю и не интерпретирует доменный смысл Particle.

При подключении runtime запрашивает replay обычным marker:

```ts
{parts: [{part: "z", op: "test", path: "force/replay/<domain>/<id>"}]}
```

Владельцы локальных stores отвечают последовательностью обычных `add`
particles. Force ничего не сохраняет для такого replay.

## Matrix

Matrix постепенно строит actor/brane projection, field values, state graph и
parent-child indices. Structural Graviton меняет только адресованную entity;
Gluon меняет одно обычное field, Higgs — одно topology-зависимое field или
ветвь, Photon — state одного actor.

Process source в Matrix не передаётся. Matrix хранит только marker связи state
с process и замороженные fields для выбранного Energy.

## Energy

Energy накапливает actors и process descriptors поштучно. Изменение одного
process descriptor не очищает store и не прерывает unrelated executions.

Рабочий flow:

```text
Matrix -> photon/test(actor, state)
Energy -> z/test(actor, energy)
Matrix -> z/copy(actor, frozen fields)
Energy -> execute stored descriptor
Energy -> w+ | w-
Matrix -> apply local write-set
```

Runtime mass принадлежит Energy. Большие results принадлежат mass/artifact
layer, а не Force или Matrix fields.

## Bulk

Bulk хранит визуальные instances, parent-child links, layout и позиции. Он
применяет structural/field particles к адресованным объектам и не заменяет всю
сцену. Локальный relayout допускается только для реально затронутой ветви.

Bulk не читает Boundary DB и не просит Boundary построить сцену целиком.

## Identity

Declaration identity детерминирована:

```text
(section/table, wimp src, local number)
```

Runtime identity (`actor`, `topology`, `value`) создаёт Boundary. Изменение key,
label, position или parent link не меняет ID самой неизменённой entity.

Replay `add` является idempotent upsert той же identity, а не созданием нового
экземпляра.

## Изоляция доменов

- Dark не импортирует Boundary и не открывает SQLite.
- Boundary не исполняет process actions.
- Matrix не получает process source и не читает Boundary.
- Energy не владеет Matrix store.
- Bulk не становится вторым canonical store.
- Production-взаимодействие проходит только через Force.

Тестовая склейка может открывать store напрямую для assertions, но не становится
production API.

## Tool boundary

Внешний tool contract остаётся adapter-слоем:

```text
external tool call
  -> adapter
  -> MetaFor field/state particle
  -> Matrix + Energy
  -> mass/artifact result
  -> external tool result
```

Агент снаружи не обязан знать WIMP, actor ID или Force. Текущие filesystem
actions являются test fixtures, а не общим Codex-compatible adapter.

## Финальные инварианты

1. Один logical change — один Force impulse — одна Particle.
2. Payload содержит только адресованную entity или её delta.
3. Каждый домен владеет локальной проекцией и её dependency indices.
4. Boundary применяет каждый patch атомарно.
5. Derived particles выходят только после commit.
6. Identity неизменённых сущностей сохраняется.
7. Cold start и reconnect используют обычный replay stream.
8. Snapshot, create, reset и полный rebuild запрещены.
