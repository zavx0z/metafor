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

Для causal `dissolve` multi-entity Boundary commit не становится batch wire
message. Non-live admission protocol сохраняет ordered post-commit plan:
Energy retarget завершается первым; затем target promotion и каждое реально
перепривязанное runtime entity получают отдельный consequence entry; source
Atom remove идёт после сохранённых replacements; verified Bulk promotion
receipt применяется только к post-commit projection; admission открывается
только после complete ordered receipt. Каждый entity entry требует ровно один
`ForceMessage` с одной Particle. Service admission/quiescence, Energy fence
receipt и Bulk projection receipt не являются Particles и не добавляются в
Particle history.

Persistent admission hold относится только к входу этой structural operation:
он не означает stop/restart процессов либо уничтожение Лады. Exact held
applied-through frontier, candidate/stage receipts и commit являются
обязательными causal guards. Текущий срез не публикует endpoint, не принимает
live command и не маршрутизирует эти consequences.

Owner-approved MF-117 открывает ровно один internal command для
`zavx0z/inference → zavx0z/lada`. Он доступен только loopback caller с
отдельной owner capability и закрытым request shape; Monad channel и `/force`
не получают общего write method. До command Boundary commit Dark закрывает
только external agent admission, вызывает quiescence всех пяти domains и
удерживает exact applied-through frontier. Causal domain outputs продолжают
приниматься до fixed point; процессы и transports не останавливаются.
Единственный разрешённый installation lifecycle выполняется раньше: после
clean implementation commit и checks caller устанавливается ровно одним
обычным полным restart `metafor-inference-universe.service`, без изменения
config, environment или ports, и только затем запускается fresh preflight.
Сам preflight и causal transition не выполняют stop/start/restart либо hot
reload.

После commit Dark проводит сохранённый plan в точном порядке: Energy retarget,
отдельные target/scope replacements, source Atom remove, verified Bulk
promotion, retained evidence и release. Каждая entity consequence сначала
durably принимается обычной Dark Force history и только затем маршрутизируется.
Повтор command с тем же operation/evidence продолжает durable receipt;
другая capability, cut, sequence или evidence fail closed. Preflight failure
открывает agent admission без world mutation. После первого world commit
автоматический rollback или открытие admission при незавершённых последствиях
запрещены: восстановление продолжает тот же plan, а verified rollback package
сохраняется для отдельного recovery.

## Particle history

Dark Force владеет полной append-only filesystem history всех принятых
Particles. Particle не считается принятой Dark Force, если её запись в history
не состоялась. History сохраняет саму Particle и порядок принятия, достаточные
для объяснения причинного Particle-пути.

Первый unified contour открывает новый portable versioned каталог
`.metafor/dark-force-history/v1/`. `manifest.json` содержит только immutable
cut metadata: `cutId`, время начала, `retroactiveComplete: false`, отметку о
удалённой после verified pre-cut backup legacy history и размер сегмента.
Запуск, создающий каталог, обязан
получить `DARK_FORCE_HISTORY_CUT_ID`. Существующий
`.metafor/dark-history.jsonl` хешируется и сохраняется только во внешнем
pre-cut backup, затем удаляется из active contour. Dark больше не создаёт этот
файл и не exposes legacy `dark.history.read/clear`.

Истиной history являются только файлы
`segments/<first-sequence-20-digits>.ndjson`. Каждая строка содержит ровно одну
принятую `SourcedParticle` вместе с её стабильным record ID
`<cutId>:<acceptance-sequence>`, монотонной acceptance sequence и
`acceptedAt`. Сегменты ограничены 4096 Particles. Ни snapshot, ни Mass, ни
Store, ни service/process log или другой event не может быть строкой этой
history.

`catalog.json` содержит только производный rebuildable индекс сегментов:
границы sequence, `acceptedAt`, authored `particle.ts` и число записей. Он не
является источником истины и его отсутствие или stale содержимое исправляется
сканированием NDJSON без изменения Particles. Основной cursor — пара
`(cutId, sequence)`; время принятия Force и authored Particle time остаются
разными фильтрами.

Append NDJSON и filesystem sync завершаются до routing. Только после durable
append Particle считается принятой. Ошибка append закрывает causal gate и не
допускает доставку этой Particle. Повреждённый, разорванный или имеющий gap
segment приводит к fail-stop без auto-truncate, cleanup или переписывания
Particle history. Формат использует только UTF-8 JSON/NDJSON и обычные filesystem
операции; он не зависит от Bun storage API.

Dark Monad может предоставлять read/query service над этой history, но не
становится владельцем её persistence. Отдельный operation-service log, если он
будет утверждён, может описывать только фазы Monad до или вокруг Particle
acceptance и не заменяет Force history.

## Relay, lifecycle и service transport

Dark Force владеет:

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

## Реализация и cold-cut boundary

Canonical source содержит server, ingress, `MonadRouter`, `ForceLifecycle`,
relay/routing, channel Store, fixtures, health, `/force` и `/monad/*` внутри
Dark. `dark/server.ts` слушает совместимый public ingress `4000`; тот же process
может держать health-only compatibility listener `4002`. Локальный Dark
adapter заменяет self-WebSocket, а Boundary, Matrix, Energy и Bulk сохраняют
прежний remote wire.

Standalone `force` workspace, entry и process в canonical source отсутствуют.
Предыдущий live contour остаётся pre-cut фактом до отдельного полного cold
restart. Source parity и isolated five-process birth не являются утверждением,
что live cut уже выполнен. Hot reload и частичный restart запрещены.
