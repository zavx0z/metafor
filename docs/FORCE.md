# Force

Force — законы существования и единый причинный канал Particles. В целевой
архитектуре Force не является отдельным доменом, package или process: он
является равноправным слоем Dark рядом с Monad.

```text
Dark
├── Monad — законы мироздания и service level
└── Force — законы существования и Particle causality
```

Dark Monad решает, каким должно стать устройство мира: читает, создаёт и
обновляет Meta-пакеты и Processes, ведёт собственные service Stores, проверяет
структурное намерение и подготавливает Particles. Dark Force делает принятое
изменение фактом живой Вселенной: принимает Particle, сохраняет её в полной
filesystem history, проводит причинный порядок и маршрутизирует обязательным
потребителям.

## Единый Particle path

Force переносит все виды Particles, в том числе:

- Gluon/Higgs — изменения текущих Field values;
- Inflaton — изменения структуры;
- Graviton и остальные объявленные Particles.

Структурное изменение начинается в Dark Monad:

```text
structural intent
→ Dark Monad validate/create/update/normalize
→ Inflaton
→ Dark Force persist/route
→ Boundary materialization
→ derived Particles через тот же Dark Force
```

Dark Monad не пишет декларации напрямую в Boundary SQLite. Изменение, которое
должно стать фактом существующей Вселенной, выражается Particle через Dark
Force.

Одна изменённая entity передаётся одним `ForceMessage` с одной `Particle`.
Общий wire language остаётся в `shared/protocol/force`; его совместное
использование доменами не создаёт отдельный Force domain.

## Particle history

Dark Force владеет полной append-only filesystem history всех принятых
Particles. Particle не считается принятой Dark Force, если её запись в history
не состоялась. History сохраняет саму Particle и порядок принятия, достаточные
для объяснения причинного Particle-пути.

Dark Monad может предоставлять read/query service над этой history, но не
становится владельцем её persistence. Отдельный operation-service log, если он
будет утверждён, может описывать только фазы Monad до или вокруг Particle
acceptance и не заменяет Force history.

## Relay, lifecycle и service transport

После migration Dark Force владеет:

- server и внешним Particle ingress;
- REST/WebSocket transport;
- particle relay и routing laws;
- `ForceLifecycle` и общим causal gate;
- domain channel Store;
- fixtures, health и `/force`.

Dark Monad владеет `MonadRouter`, service RPC и `/monad/*`. Оба слоя находятся
в одном Dark process и используют локальную границу вместо self-WebSocket.
Потеря обязательного domain channel сохраняет fail-stop law; перенос не
разрешает hot reload или частичный restart contour.

Routing решает, какие домены получают принятую Particle, но не может обойти
Dark Force history. Gluon/Higgs и Inflaton проходят один ingress независимо от
набора конечных потребителей.

### Wire и channel compatibility

Доменные transports из `shared/transport/force` сохраняют один порядок
Particles, outbox до открытия и reconnect физического соединения. Domain и
channel identity определяются до открытия WebSocket; отдельного wire-message
`register` нет.

После Upgrade WebSocket передаёт только:

```ts
interface ForceMessage {
  parts: [Particle]
}
```

Readiness, health, snapshot, replay, pause, error и service RPC не добавляются
в Particle channel. Открытие transport само по себе не испускает Particle.

### Lifecycle compatibility

Dark Force lifecycle ждёт готовности локального Dark adapter и четырёх
обязательных remote domain channels: Boundary, Matrix, Energy и Bulk. Только
после их готовности общий causal gate принимает Particles. Потеря последнего
обязательного channel переводит lifecycle в `error`; физический reconnect не
оживляет Universe и не снимает fail-stop.

### MonadRouter compatibility

Service RPC проходят постоянными `MonadChannel`. `MonadRouter` связывает
identity/capabilities при создании channel, маршрутизирует call в target и
correlated response обратно в source. RPC payload не может объявить или
подменить source. Router не интерпретирует domain data и не управляет Dark
Force lifecycle.

### Routing compatibility

Behavior-preserving migration сохраняет действующие routing results:

- agent Inflaton доставляется Dark Monad adapter и Bulk;
- подготовленный Dark Monad Inflaton доставляется Boundary и Bulk;
- uncommitted Gluon/Higgs mutation без `from` доставляется Boundary;
- остальные Particles доставляются всем релевантным доменам, кроме source.

Каждый из этих случаев сначала проходит единый Dark Force ingress и history.
Изменение routing semantics требует отдельного owner decision и не маскируется
под перенос package/process ownership.

## Текущее расхождение реализации

До выполнения `MF-102` repository всё ещё содержит активный standalone
`force/` workspace и `force/server.ts`, а launcher рождает отдельные Force и
Dark processes. Это pre-migration implementation debt, а не целевая
архитектура.

`MF-102` выполняет behavior-preserving перенос server, ingress, transports,
`MonadRouter`, `ForceLifecycle`, relay/routing, channel Store, fixtures,
health, `/force`, `/monad/*`, tests и документации в Dark. После parity и
полного cold proof standalone Force package/entry/process удаляются.

До этого cut текущие endpoints и process topology остаются фактическим
описанием работающего contour. Их нельзя частично переключать или hot reload.
