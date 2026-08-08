# Hamiltonian

Это верхнеуровневый управляющий и peer-contour, выросший из изолированного
опыта `MF-412`. Теперь он входит в root workspace и использует только
presentation-пакеты MetaFor Engine/UI; production Dark, Boundary, Matrix,
Energy и Bulk по-прежнему не подключены. Испытательный peer не утверждает
production-протокол.

## Фактически собранная топология

Главное представление topology — живая интерактивная WebGPU HUD-сцена на
стартовой странице. ELK первоначально расставляет фактические host, Service
Worker, Window, Bun process и peer snapshots, а серверный Libavoid прокладывает
рёбра вокруг фиксированных нод. Статическая
[`TOPOLOGY.md`](TOPOLOGY.md) оставлена только как техническая справка.

Физически host держит ровно один listener. Control WSS переносит только
bootstrap-состояние, heartbeat, election и WebRTC signaling. Realtime payload
по нему запрещён валидатором. После знакомства один `RTCPeerConnection` имеет
два нативных ordered/reliable DataChannel: `oracle` для request/response и
`force` для последовательности событий. Эти имена — только испытательные lane,
а не перенос действующих Oracle RPC и Force MetaFor.

Серверный peer и две lifecycle-роли — обычные OS process через `Bun.spawn` и
IPC. Bun Worker не используется. Дочерние процессы не открывают собственного
фиксированного HTTP/WebSocket server; WebRTC peer использует временные ICE/UDP
endpoints. Режимы placement взаимоисключающие: в `browser` Bun-роли называются
`main-probe` и `worker-probe` и не получают authority; в `server` authority
получает только Bun `main`, а Window leader не избирается.

## Страница оркестрации

`@ui/node` владеет только generic node/port/edge model, ELK layout, viewport,
selection и WebGPU surfaces. Hamiltonian адаптирует собственные наблюдения в
эту модель и добавляет только уже существующие lifecycle actions.

Нодовая геометрия следует существующей Blender-derived дизайн-системе
владельца, а не отдельному стилю Hamiltonian. MetaFor Engine сначала точно
измеряет текст загруженного TrueType-шрифта, затем общий Flex plan определяет
intrinsic card size и позиции sockets. ELK получает именно эту геометрию, а
WebGPU рисует тот же plan. При первом snapshot ELK предлагает node positions.
При добавлении или удалении нод surviving nodes остаются на прежних
координатах, новый node получает свободную позицию из ELK proposal, после чего
`POST /node-system/route` на том же единственном listener пересчитывает
orthogonal edges через Libavoid. Telemetry-only update прежнего размера
сохраняет всю geometry и viewport.

Ноду можно перетащить непосредственно в сцене. Рамкой на пустом месте можно
выделить несколько нод, после чего drag любой выбранной карточки перемещает
всю группу одним изменением геометрии. Левую и правую границы карточки можно
тянуть для изменения ширины с удержанием противоположного края. Карточки,
sockets и connected endpoints меняются в graph coordinates сразу; на release
Hamiltonian сохраняет positions и widths в origin-local browser storage и
просит тот же listener повторно проложить рёбра. Renderer не заменяет
obstacle-safe route одной свободной кривой: он скругляет каждый Libavoid
waypoint локальным cubic Bézier segment.

Pan/zoom viewport сохраняется отдельно в `sessionStorage` конкретной Window и
восстанавливается после reload. Обычный drag пустого места строит selection
rectangle; pan выполняется Alt-drag или средней/правой кнопкой. Поэтому разные
вкладки могут иметь независимые точки наблюдения и не перезаписывают камеру
друг друга.

Service Worker публикует sanitised browser-local projection через versioned
`BroadcastChannel`. Новая Window получает initial snapshot по прежнему
направленному `MessagePort`, после чего сцена принимает live updates через
BroadcastChannel. Эта шина не переносит token, resume capability, SDP/ICE,
RPC или Particle и не заменяет control WSS, Bun IPC либо прямые
`oracle`/`force` DataChannel.

## Общие законы опыта

`core/runtime.js` не зависит от платформы и задаёт:

* раздельные identity: стабильный `deviceId`, `hostEpoch`, физический
  `connectionId`, `sessionEpoch`, incarnation процесса/страницы/Worker;
* lease с уникальным ID и возрастающим fencing token, поэтому прежний лидер не
  может продолжить main после handoff или restart host;
* один transport router на входе и отдельные очереди, byte/frame limits и
  backpressure для `oracle` и `force`;
* request timeout, явную отмену вызывающей стороной и cancellation при потере
  session;
* per-lane и Force-event sequence: backpressure не расходует номер, а gap,
  чужой `sessionEpoch` или потеря одной lane fail-closed завершают всю peer
  session;
* детерминированный reconnect policy.

Service Worker координирует только свой browser profile/origin и сообщает host
все живые Window через `clients.matchAll()`. Сам host выдаёт глобальный lease,
поэтому одновременно main запускает не более одного Window даже при разных
браузерах и устройствах. Dedicated Worker остаётся per-Window и не считается
singleton.

Обычный website Service Worker может быть завершён браузером даже при открытой
Window. Поэтому стабильная resume-capability хранится на уровне browser
profile/origin, а не внутри incarnation Worker. Новый Worker и новый WSS могут
привязаться к прежним lease/fence и уже готовому direct peer до `expiresAt`.
Если peer ещё не был готов или успел сломаться, прежняя authority сохраняется,
но создаётся новая `peerGeneration/sessionEpoch`; потерянный signaling не
выдаётся за восстановленный.

Versioned module загружается с bearer token, проверяется по фактическим bytes
через SHA-256 и кладётся в Cache Storage. При чтении cache bytes хешируются
заново; одному заголовку доверия нет. Хранятся текущая и одна rollback-версия.
Main получает новую версию только после настоящего page reload. Dedicated
Worker и Bun process проходят cold rebirth: прежнее воплощение завершается до
нового. Одинаковые source bytes и SHA-256 используются во всех оболочках.

## Запуск

Локально:

```bash
cd /Users/zavx0z/repozitarium/metafor/hamiltonian
HAMILTONIAN_TOKEN=local-test HAMILTONIAN_VERSION=v1 bun run start
```

Открыть напечатанный адрес
`http://127.0.0.1:4400/?token=local-test`. Для другой версии host запускается с
тем же identity/token и новым `HAMILTONIAN_VERSION`; управляемая страница
подготавливает cache и выполняет reload.

По умолчанию используется `HAMILTONIAN_PLACEMENT=browser`. Для server-only
проверки без браузера:

```bash
HAMILTONIAN_PLACEMENT=server \
HAMILTONIAN_TOKEN=local-test \
bun run start
```

Каждый cold rebirth server `main` получает новый fencing token/lease; прежний
authority envelope после этого отвергается лабораторным acceptance gate.

Для другого устройства нужен доверенный HTTPS. Изолированный тестовый CA и
сертификат на 30 дней создаются без изменения trust store Mac:

```bash
cd /Users/zavx0z/repozitarium/metafor/hamiltonian
bun run tls:create
HAMILTONIAN_HOST=0.0.0.0 \
HAMILTONIAN_PORT=4400 \
HAMILTONIAN_TOKEN=replace-with-a-test-secret \
HAMILTONIAN_VERSION=v1 \
HAMILTONIAN_TLS_CERT=.tls/server-cert.pem \
HAMILTONIAN_TLS_KEY=.tls/server-key.pem \
bun run start
```

Private keys остаются в Git-ignored `.tls/`. Для Android сертификат CA —
`.tls/hamiltonian-ca.cer`. После опыта пользовательский CA нужно удалить с
устройства. `adb reverse tcp:4400 tcp:4400` может дать Android адрес
`https://localhost:4400`, но прямой LAN path также проверен.

`GET /lab/status` требует тот же bearer token и отдаёт bounded observability:
listener, host epoch, lease/fence, server incarnations, connection/challenge
ACK, peer channels/counters и signaling counters. Join token не является
production identity/auth design: он хранится в browser storage и присутствует
в URL WSS, поэтому стенд нельзя выставлять в Internet.

## Проверки

```bash
cd /Users/zavx0z/repozitarium/metafor/hamiltonian
bun test
cd /Users/zavx0z/repozitarium/metafor
bun test pkg/ui/node hamiltonian/browser/orchestration
bun run typecheck
cd /Users/zavx0z/repozitarium/metafor/hamiltonian
bunx tsc --ignoreConfig --noEmit --strict --module preserve \
  --moduleResolution bundler --target es2022 --types bun,@webgpu/types \
  --allowImportingTsExtensions --allowJs --skipLibCheck \
  ../types/module.d.ts ../pkg/ui/node/elk-worker-text.d.ts \
  types.d.ts *.ts peer/*.ts soak/*.ts
bun build public/app.js public/sw.js public/embodiment-worker.js \
  --outdir /tmp/hamiltonian-build-check --target browser \
  --external /core/runtime.js --external /core/cache.js \
  --external /core/browser-control.js --external /core/orchestration.js

HAMILTONIAN_TOKEN=local-test \
  bun run soak/run.ts http://127.0.0.1:4400
```

Автоматические проверки покрывают один listener, TLS-neutral HTTP surface,
auth/hash/cache, Bun process birth/rebirth и concurrent rebirth, global
election/fencing, stale MessagePort generation, reconnect, две независимые
logical lane, frame/queue backpressure, ordering/gap, RPC timeout/session loss,
caller-driven RPC cancellation, WSS resume без смены logical authority, RTC
repair с новой peer generation, stale session rejection, запрет realtime на
WSS, browser/server placement и прямой Bun↔Bun WebRTC через `werift`.
Отдельные `@ui/node` и orchestration fixtures проверяют ссылки node graph,
детерминированный ELK placement, точные Flex/card metrics, сохранение
координат surviving nodes при add/remove, Bun/WASM Libavoid routing,
fit/pan/zoom/selection, drag/persisted anchors, Bézier rounding сохранённого
route, разделение control WSS, BroadcastChannel и direct
Oracle/Force lines, monotonic projection revision и сохранение geometry при
telemetry-only update.

Живая матрица и исходные JSON/screenshot находятся в
[`project/artifacts/MF-412`](../project/artifacts/MF-412/README.md). На
2026-08-08 проверены macOS Chrome, Yandex и Safari, Android Chrome и Yandex,
несколько вкладок, handoff лидера, полный quit/reopen browser process,
force-stop Android и screen-off.

Двухминутный Chrome open-tab soak v11 сохранил все 9 raw samples: две
подтверждённые смены non-null Worker incarnation, пять изменений физического
WSS-состояния и три detached-пробы при неизменных lease/fence и peer/session;
heartbeat вырос на 9, обе realtime lane — на 12, control relay остался 0.
Этот live-прогон был выполнен до переименования испытательной RPC lane, поэтому
raw evidence честно сохраняет прежние wire-name и имя счётчика. Он доказывает
восстановление control и прямой двухканальный carrier, но не является
live-приёмкой нынешнего browser adapter с lane `oracle`. Текущий `oracle` path
дополнительно принят свежим Chrome-прогоном v12: host status фиксирует channels
`oracle`/`force`, рост обоих счётчиков и нулевой realtime relay через control
WSS; DOM и screenshot показывают успешные Oracle response и Force echo.
Исходные файлы находятся в `project/artifacts/MF-412`. Более ранняя сводка v9
остаётся только историческим evidence.

## Границы доказанного

* Обычный web Service Worker может создать WebSocket, но не является daemon.
  При закрытии всех страниц поведение зависит от браузера; при полном завершении
  browser process прежний TCP/TLS/WSS физически исчезает. Восстанавливаются
  identity и state, а не тот же socket.
* Android Yandex потерял соединение через 30 секунд screen-off. Chrome Android
  закрыл его почти сразу после последней Window. Chrome macOS сохранял WSS на
  пятой секунде без Window, Safari закрыл позднее. Это измерения версий, не
  переносимый lifetime contract.
* Safari выполнил peer proof, видимый со стороны host, но DOM не автоматизирован:
  в Safari отключён Allow Remote Automation.
* Bun 1.3.14 не предоставляет native `RTCPeerConnection`; стенд использует
  `werift@0.24.3`. Совместимость production-платформ, remote ICE, STUN/TURN,
  trust/authorization и migration MetaFor этим опытом не решены.
* `RTCPeerConnection` в browser создаётся в Window. Опыт не утверждает перенос
  RTCDataChannel в Service Worker и не предполагает, что WebRTC разбудит
  завершённый Worker.
* Live JSON и screenshots v7—v11 относятся к прежнему имени RPC lane и не
  переписываются задним числом. Текущий `oracle` label отдельно доказан
  свежими v12 status, DOM и screenshot.
* Production Dark, Boundary, Matrix, Energy, Bulk и их State не подключены.
  Hamiltonian здесь проверяет placement/lifecycle/signaling, а не становится
  realtime causal coordinator.
