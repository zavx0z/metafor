# Energy runtime

Energy исполняет Process/Reaction и владеет локальными Mass и живыми runtime-
сущностями. Проверяемые законы находятся в
[`docs/domains/ENERGY.md`](../docs/domains/ENERGY.md), Process wire flow — в
[`docs/proto/weak.md`](../docs/proto/weak.md), общая карта — в
[`docs/README.md`](../docs/README.md). Принятая работа находится в
[`графе исполнения`](../project/TODO.md), а ещё не принятые вопросы — в
[`накопителе`](../project/BACKLOG.md). Совместные риски Matrix и Energy раскрыты в
карточках [`MTX-004`](../project/tasks/MTX-004.md) и
[`ENG-001`](../project/tasks/ENG-001.md).

Этот README описывает только точки реализации и не создаёт второй контракт.

## Рождение

`energy/server.ts` сначала открывает MonadChannel, читает
`boundary.initialProjection.read` и гидратит `EnergyCatalogStore`. Только после
этого он подключает обязательный `Force("energy")` channel. После рождения
изменения catalog приходят по одному обычными Graviton; RPC на каждый claim нет.

## Точки реализации

* `catalog.ts` — Atom/WIMP/Process/continuation projection и индексы;
* `energy.ts` — Photon/Z/W, Process execution, binding, rebuild и Atom cleanup;
* `reaction.ts` — Reaction execution;
* `mass.ts` — filesystem catalog, атомарная запись и gated Mass handles;
* `runtime.ts` — живые Energy-сущности и их release;
* `monad.ts` — initial projection RPC;
* `server.ts` — process lifecycle и transport wiring.

Точные Process payload определены в
`shared/protocol/force/execution.ts`: claim и grant несут
`processExecutionId`, а W от Energy является proposal для Boundary. Matrix
снимает lock только по committed `w+/w- copy` от Boundary.

Action invocation имеет форму:

```ts
await fn({field, value, mass, energy, self, signal})
```

Mass и Energy хранятся раздельно. Default Mass store открывает только разрешённые
Boundary key IDs как handles плоского filesystem-каталога; bytes не проходят
через Force/Boundary. Версионирование не входит в текущий контракт.

Изменение Mass declaration приходит через общий `meta.declaration.apply` и
материализуется Boundary. Energy не читает declaration table: после commit она
получает обычную полную Atom replacement с обновлённым разрешённым Mass
составом. Сам Mass declaration Graviton не несёт bytes и не является handle.

## Проверка

Основные suites:

```bash
bun test energy/energy.spec.ts
bun test energy/reaction.spec.ts
```

Root `bun run test` использует недоступный внешний Force и проверяет пакет в
изолированном contour.
