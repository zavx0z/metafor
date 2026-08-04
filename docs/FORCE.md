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

Одноразовый internal command перехода Inference→Lada и его приватные domain
adapters удалены после завершения перехода. Общий write method в Monad или
`/force` не добавлен. Повторная активация старого сценария невозможна;
переиспользуемые causal admission, checkpoint, rollback и dissolve primitives
остаются внутренними строительными блоками для отдельно утверждённой общей
операции.

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
`acceptedAt`. Принятая через типизированный authoring RPC Particle в той же
атомарной строке дополнительно связывается с immutable cause: RPC source,
`operationId`, digest нормализованного request и точные before/after source
revisions. Cause не входит в Particle или Force wire и отсутствует у обычных и
старых history rows.

Одинаковая пара `(rpcSource, operationId)` не может появиться во второй строке.
Повтор с тем же request digest находит существующую acceptance identity, а с
другим digest отклоняется до новой mutation. Accepted Particle и patch не
копируются в отдельный operation journal. Сегменты ограничены 4096 Particles.
Ни snapshot, ни Mass, ни Store, ни service/process log или другой event не
может быть строкой этой history.

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

Dark Monad публикует `dark.force.history.read`: exact current frontier либо
bounded acceptance-sequence range над этой же history. Service не становится
владельцем persistence, не копирует строки и не публикует clear/rewrite.
Authoring RPC использует сохранённую в той же строке cause как единственную
привязку request к принятому изменению; отдельный operation-service log для
Matter или declaration authoring не создаётся. Enum variants одной принятой
Field Inflaton и Transition/Condition одной принятой State Inflaton остаются
составом payload своих entity; производные Boundary Gravitons не становятся
отдельными пользовательскими operations. Metadata, Mass, Reaction, Process и
Bulk также принимаются по одной entity в одном `ForceMessage`.

Если contour завершился после durable acceptance, но до applied-ack одного из
доменов, startup берёт незакрытые receipt из checkpoint control и доставляет
именно сохранённую Particle из Force history только этим доменам. Новая
acceptance и новый пользовательский patch не создаются; уже подтверждённые
домены повторной доставки не получают. Обычный ingress остаётся закрыт до
завершения recovery, а несоответствие receipt и history приводит к fail-stop.

## Текущая пауза и один шаг

Dark Monad уже публикует `dark.force.pause`, `dark.force.step`,
`dark.force.stack` и `dark.force.resume`.

`pause` закрывает только внешний вход Agent Particle и ждёт согласованную
причинную границу существующего checkpoint. `step` временно отпускает эту
границу, принимает ровно одну Agent Particle и снова устанавливает границу.
`stack` возвращает границы, накопленные в текущей паузе. `resume` открывает
внешний вход и очищает этот временный список.

Это не чтение Particle history, не переход к произвольной прошлой точке, не
шаг назад и не изолированная ветвь исполнения. Текущий список существует только
в памяти процесса и не переживает новый запуск.

## Relay, lifecycle и service transport

Dark Force владеет:

- server и внешним Particle ingress;
- REST/WebSocket transport;
- particle relay и routing laws;
- `ForceLifecycle` и общим causal gate;
- domain channel Store;
- fixtures, health и `/force`.

Текущие `/force` и `/ws` задают передачу, но не задают проверку полномочий
внешнего клиента. До отдельного решения доверительной границы они допустимы
только внутри доверенного контура и не являются безопасным публичным сетевым
интерфейсом.

Dark Monad владеет `MonadRouter`, service RPC и `/monad/*`. Оба слоя находятся
в одном Dark process и используют локальную границу вместо self-WebSocket.
Потеря обязательного domain channel сохраняет fail-stop law; перенос не
разрешает hot reload или частичный restart contour.

Routing решает, какие домены получают принятую Particle, но не может обойти
Dark Force history. Gluon/Higgs и Inflaton проходят один ingress независимо от
набора конечных потребителей.

Предметный RPC `meta.field.value.apply` планирует внутренний Field address в
Boundary, затем условно принимает одну agent Gluon/Higgs только при совпадении
ожидаемой history frontier. Acceptance возвращается из той же append-only
history; отдельная запись runtime operation рядом с Particle не создаётся.

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
