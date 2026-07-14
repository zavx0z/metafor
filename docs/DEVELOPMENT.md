# Разработка MetaFor

Этот документ описывает только активное ядро и его воспроизводимый запуск.
Исторические product shells не участвуют в сборке и runtime.

## Домены

| Domain   | Default port | Entry                |
| -------- | ------------ | -------------------- |
| Force    | 4000         | `force/server.ts`    |
| Boundary | 4001         | `boundary/server.ts` |
| Dark     | 4002         | `dark/server.ts`     |
| Matrix   | 4003         | `matrix/server.ts`   |
| Bulk     | 4004         | `bulk/server.ts`     |
| Energy   | 4005         | `energy/server.ts`   |

Основной причинный контур:

```text
Meta / DSL
→ Dark / Inflaton
→ Boundary materialization
→ Matrix gravity → strong → weak
→ Photon
→ Energy Process
→ Boundary Process commit
→ Reaction signal
→ Energy Reaction
→ Boundary Reaction commit
→ Matrix next State
```

Boundary является единственной канонической materialized persistence. Matrix,
Energy и Bulk не читают Boundary SQLite напрямую и не владеют второй world truth.

## Низкоуровневый запуск

Поднять домены без автоматической загрузки Meta:

```bash
bun run runtime
```

С полными Impulse logs:

```bash
bun run runtime:logs
```

Backend Matrix:

```bash
bun run runtime:cpu
bun run runtime:gpu
```

`runtime:gpu` является строгим режимом и завершается ошибкой без WebGPU. Default
`auto` предпочитает WebGPU и использует CPU только как fallback/reference.

Полный контур с Bulk:

```bash
bun run force
```

Команда `force` остаётся низкоуровневым параллельным запуском доменных серверов
без встроенной Meta и проверки итогового State. Meta для текущей итерации
создаётся в `github/` и загружается явно.

## Canonical external input

Uncommitted world mutation:

```text
Gluon/Higgs without from
```

Force доставляет её только Boundary. Если HTTP-запрос не может быть передан
Boundary, Force возвращает `503` вместо ложного успеха.

После atomic commit Boundary выпускает consequence с causal namespace:

```text
boundary:<uuid>
```

Reaction field consequence использует:

```text
reaction:<reactionExecutionId>
```

Process result сохраняет собственный ненеймспейсный `processExecutionId`, потому
что Matrix должна сопоставить его с текущим lock и снять lock только после
Boundary `W/copy` acknowledgment.

## Process

```text
Matrix Photon/test + processExecutionId
→ Energy Z/test
→ Matrix Z/copy frozen fields
→ Energy W proposal
→ Boundary validates Actor, State, Process, Energy and write set
→ atomic Boundary field commit
→ Gluon/Higgs consequences
→ Boundary W/copy
→ Matrix unlock and Weak re-evaluation
```

Energy вычисляет результат, но не коммитит world. Matrix не применяет raw W
proposal.

## Reaction

```text
committed source consequence
→ Boundary selects active target Reaction
→ Reaction Photon
→ Energy claim and filter/update
→ W proposal
→ Boundary validates target State and write set
→ same world writer
→ namespaced field consequence
→ Matrix re-evaluation
```

Reaction JavaScript исполняется в Energy. Boundary хранит identity и выполняет
commit. Matrix занимается только State/Transition.

## Наблюдаемость

```text
METAFOR_LOG_IMPULSES=0
METAFOR_LOG_IMPULSES=compact
METAFOR_LOG_IMPULSES=full
```

Фильтры:

```text
METAFOR_LOG_DOMAINS=force,boundary,matrix,energy
METAFOR_LOG_PARTS=inflaton,graviton,gluon,higgs,photon,z,w+,w-
```

Логи фиксируют фактические send/receive Impulse, но не заменяют нативную
эволюционную Летопись.

## Проверка

Полная локальная проверка:

```bash
bun test
bun run tsc --noEmit
```

Критические отдельные suites:

```bash
bun test force/server.test.ts
bun test boundary/input.spec.ts
bun test boundary/state.spec.ts
bun test boundary/execution.spec.ts
bun test boundary/reaction.spec.ts
bun test matrix/runtime.parity.spec.ts
bun test energy/energy.spec.ts
bun test energy/reaction.spec.ts
```

CPU и WebGPU backend должны давать одинаковые State, lock, frozen fields и
Photon traces; это проверяется локальными suites.

## Изоляция

Production domains общаются только через Force. Сквозные tests и launcher создают
новые processes и отдельную Boundary database. Test-only чтение SQLite допустимо
только для assertions и не становится runtime API.

Исторический код до очистки сохранён в
`archive/pre-core-split-2026-07-11`.
