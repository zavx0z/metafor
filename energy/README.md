# Energy runtime

Energy исполняет Process/Reaction и владеет локальными Mass и живыми runtime-
сущностями. Проверяемые законы находятся в
[`docs/domains/ENERGY.md`](../docs/domains/ENERGY.md), Process wire flow — в
[`docs/proto/weak.md`](../docs/proto/weak.md), общая карта — в
[`docs/README.md`](../docs/README.md). Общесистемные расхождения находятся в
[`центральном TODO`](../task/graph-monad-force-todo.md), а совместные вопросы
жизненного цикла Matrix и Energy — в [`Matrix TODO`](../matrix/TODO.md).

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

## Проверка

Основные suites:

```bash
bun test energy/energy.spec.ts
bun test energy/reaction.spec.ts
```

Root `bun run test` использует недоступный внешний Force и проверяет пакет в
изолированном contour.
