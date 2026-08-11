# WEBPUSH-001 — Переиспользуемый Web Push

## Коротко

Выделить полный Web Push в отдельный пакет `@metafor/web-push`, который можно
подключить к Service Worker другого проекта без переноса Hamiltonian-кода.
Пакет охватывает системное разрешение пользователя, PushSubscription, серверное
хранение и отправку, обработку `push`/`notificationclick`, подтверждение
регистрации и доставки, а также типизированный жизненный цикл для наблюдения.

Lifecycle и визуализация не являются второй реализацией механизма. Пакет
вызывает необязательный типизированный lifecycle hook при каждом фактическом
изменении Web Push. Hamiltonian подключает собственный hook, публикует из него
изменения через свой `BroadcastChannel` и строит причинную визуальную проекцию.
Другой проект может не передать hook вообще — тогда пакет ничего не публикует
и не создаёт каналов.

## Зачем

Сейчас Web Push распределён между `hamiltonian/web-push.ts`, HTTP/WSS host,
Page-кодом и Service Worker. Полезный общий механизм смешан с identity,
`wakeProof`, WSS и нодами Hamiltonian, поэтому его нельзя безопасно подключить
в другом приложении.

В истории `/Users/zavx0z/repozitarium/demo` уже есть более полный прикладной
опыт: permission, VAPID, восстановление и ротация подписки, SQLite-хранилище,
удаление `404/410`, `push` и `notificationclick`. Он служит проверенным
источником требований, но не переносится как готовый пакет из-за связи с
конкретными routes и UI demo.

## Связь с MF-428

`WEBPUSH-001` — самостоятельная задача, потому что её результат переиспользуем
в других проектах без Hamiltonian. `MF-428` зависит от неё и остаётся одной
технической и визуальной приёмкой своего механизма:

1. общий пакет выполняет Web Push и вызывает подключённый lifecycle hook;
2. Hamiltonian-адаптер добавляет устойчивую identity Service Worker,
   `wakeProof`, control WSS и delivery receipt;
3. живая нода и edges строятся по тем же событиям, а не по отдельной
   декоративной модели.

## Владелец контракта

Долговечный публичный контракт пакета находится в
`pkg/web-push/CONTRACT.md`. Эта карточка владеет только объёмом работы,
проверками и временными evidence.

## Граница пакета

Публичные entry points разделены по runtime:

* `@metafor/web-push/protocol` — безопасные типы, validation, correlation и
  lifecycle envelopes без side effects;
* `@metafor/web-push/client` — browser permission,
  subscribe/resubscribe/unsubscribe и подтверждение серверной регистрации;
* `@metafor/web-push/worker` — обработчики `push` и `notificationclick`,
  показ уведомления и подтверждение фактической обработки;
* `@metafor/web-push/lifecycle` — типизированный optional hook, безопасный
  emitter и композиция наблюдателей;
* `@metafor/web-push/server` — сервис подписок и отправки с dependency
  injection;
* `@metafor/web-push/server/bun` — Bun adapters для VAPID, `web-push` и
  долговечного хранилища.

Core пакета не знает о Hamiltonian, Graph, Force, WSS, `wakeProof`, нодах или
конкретном UI. Browser entry points не импортируют Bun, Node и server-only
dependencies.

## Lifecycle contract

* Каждое состояние выражается discriminated union event с `schema`, `type`,
  `eventId`, `operationId`, `at`, `source` и безопасными данными.
* Один `operationId` связывает permission/подписку, регистрацию, server send, получение
  Service Worker и delivery receipt. Отправка push service и исполнение на
  устройстве являются разными подтверждениями.
* `onLifecycle` является необязательной injected зависимостью. Если hook не
  передан, пакет не открывает каналы и не выполняет побочных публикаций.
* Hook является наблюдением: его ошибка изолируется и не меняет результат Web
  Push. Несколько observers подключаются явной композицией hooks.
  Policy/store/sender остаются отдельными injected зависимостями, а не
  скрытыми hooks.
* В lifecycle запрещены subscription endpoint, VAPID keys, auth/p256dh,
  произвольный push payload, capability и иные секреты. Допустимы только
  специально сформированные безопасные presentation data и digest.
* Пакет не знает о `BroadcastChannel` и не предоставляет готовый channel
  adapter. При необходимости приложение публикует event из собственного hook.
  Hamiltonian переносит нужные server events своим WSS и публикует browser-local
  изменения через уже принадлежащий ему `BroadcastChannel`.

Минимальные семейства событий:

* client: support, permission, subscription, server registration и
  unsubscribe;
* worker: push received/rejected, notification shown/failed/clicked и
  delivery receipt;
* server: VAPID readiness, subscription stored/replaced/removed,
  push queued/dispatched/accepted/failed и receipt confirmed/timed out.

## Разрешение и подтверждение

* При состоянии `default` client напрямую вызывает системный
  `Notification.requestPermission()` без собственного pre-prompt: приложение
  запрашивает право на уведомления, а не просит пользователя разрешить запрос.
* `denied` является окончательным отказом для приложения: повторного запроса
  нет. Закрытый системный prompt оставляет `default`, поэтому запрос можно
  повторить после следующей загрузки. При `granted` существующая подписка
  восстанавливается без нового prompt.
* `granted` не считается подпиской. Успех client API возвращается только после
  получения server ACK, что валидированная подписка сохранена.
* Успешный ответ push service не считается доставкой в Service Worker.
  Фактическая доставка подтверждается отдельным receipt с тем же
  `operationId/messageId`; transport receipt внедряется приложением.
* Повторный запуск восстанавливает существующую подписку; смена VAPID identity
  или невалидная подписка приводит к контролируемой ротации, а не к
  параллельным активным записям.

## Границы

* Не показывать собственный pre-prompt перед системным запросом permission.
* Не повторять системный запрос после `denied`; закрытый prompt и явный отказ
  имеют разное поведение.
* Не скрывать отправку, доставку, показ уведомления и receipt за одним
  состоянием `success`.
* Не использовать частый Web Push как heartbeat Service Worker.
* Не добавлять `BroadcastChannel` или иной готовый transport в общий пакет.
* Не включать Hamiltonian identity, topology и визуальные ноды в общий пакет.
* Не хранить секреты или полные subscription endpoints в lifecycle и
  визуальной проекции.

## Критерии готовности

* `@metafor/web-push` имеет runtime-разделённые public exports и не затягивает
  server dependencies в browser bundle.
* Client напрямую запрашивает системный permission при `default`, корректно
  различает закрытый prompt и `denied`, восстанавливает/ротирует подписку и
  ждёт server ACK.
* Worker handlers обрабатывают валидный и невалидный push,
  `notificationclick`, показ уведомления и injected delivery receipt.
* Server service валидирует и заменяет подписки, отправляет Web Push,
  удаляет `404/410` и различает push-service acceptance и device receipt.
* Для всех переходов выпускаются валидированные безопасные lifecycle events;
  hooks получают их один раз и не ломают основной механизм при собственной
  ошибке.
* Проект может не подключать lifecycle hooks; в этом режиме механизм работает
  без публикаций и transport side effects.
* Hamiltonian использует пакет через adapter, публикует lifecycle в свой
  versioned `BroadcastChannel` и строит текущую Service Worker ноду, Push/WSS
  состояния и edges без дублирующей логики механизма.
* Focused tests, strict TypeScript и package export/browser build проходят.
* Живой HTTPS-сценарий обычного Chrome подтверждает системный permission,
  subscription ACK, server send, `push` в Service Worker, notification,
  receipt и соответствующие визуальные изменения.
* Готовый diff проходит независимое ревью; визуальный и технический результат
  MF-428 принимает владелец одним сценарием.

## Проверка результата

1. Проверить protocol и lifecycle unit tests, включая validation, correlation,
   hook isolation и отсутствие секретов.
1. Проверить client/worker через injected browser fakes, включая denied,
   rotation, malformed push, click и receipt failure.
1. Проверить server service и Bun adapters, включая persistence, replacement,
   `404/410` и restart.
1. Собрать каждый public browser entry point и проверить, что в bundle нет
   Bun/Node/server-only модулей.
1. Проверить работу без hook, с одним hook, с композицией hooks и с hook,
   бросающим ошибку.
1. Подключить Hamiltonian hook с его `BroadcastChannel` и прогнать focused
   host/lifecycle tests.
1. Выполнить живой HTTPS-сценарий и сохранить evidence в
   `project/artifacts/WEBPUSH-001/` до закрывающего коммита.

## Результат и closing handoff

### Точная граница результата

Готовый результат состоит из трёх последовательных коммитов одной ветки:

1. `347fca844567074652be18768133ad0ece1a369f` — общий Web Push package,
   Hamiltonian adapter, lifecycle/projection, документация, проверки и перевод
   задачи в `REVIEW`;
1. `dac31433bb4b1bddaf637f50f257a468e2e700c7` — закрытие замечаний первого
   review: строгий discriminated lifecycle union, запрет неизвестных и
   несогласованных полей, безопасный root browser export;
1. `a343bb1ecc1d9d4fd60e6076015b8fc2142ccad0` — исправление обнаруженного на
   exact clean runtime layout-regression для фактического порядка портов и
   отдельный regression test.

Фактическая implementation boundary — последний commit и его Git tree
`df1f4d0abb024a0b2b62fbfed9c42634ae8e2ff4`. Артефакты сняты после запуска
host именно из этого чистого состояния.

### Затронутые пакеты, домены и постоянные владельцы

| Граница | Постоянный владелец | Что сверять |
| --- | --- | --- |
| `@metafor/web-push`, workspace exports и зависимости | `pkg/web-push/CONTRACT.md`; usage — `pkg/web-push/README.md`; карта — `docs/README.md` | runtime-разделение, permission, subscription, send/receipt correlation, safe optional lifecycle hook |
| Hamiltonian host, Page, Service Worker и lifecycle projection | `hamiltonian/README.md` | adapter к общему package, стабильная Service Worker identity, wake proof, Cache bootstrap, WSS/Web Push edges и текущая проекция |
| `@nodes/layout` placement и rectilinear routing | `pkg/nodes/layout/requirements/COMMON.md`, `RIGHT.md`, `DOWN.md`; карта пакета — `pkg/nodes/layout/README.md` | существующие законы детерминизма, bounded search, terminal direction и shared-port split; семантический закон не менялся, исправлен выбор детерминированного edge schedule |
| Граф исполнения и зависимость `MF-428` | процесс — `project/README.md`; текущее состояние — `project/TODO.md` и `project/tasks/MF-428.md` | `MF-428` остаётся отдельной технической и визуальной приёмкой Hamiltonian и разблокируется только после закрытия этой задачи |

### Добавленные, изменённые и отменённые формулировки

* Добавлен переиспользуемый runtime-разделённый package. Он не знает о Graph,
  Hamiltonian и `BroadcastChannel`; приложение передаёт hook и policy через
  dependency injection.
* Permission запрашивается напрямую системным API при `default`; после
  `denied` приложение не пристаёт, закрытый prompt оставляет возможность нового
  запроса при следующей загрузке. `granted` без подходящей подписки запускает
  восстановление или ротацию.
* Push-service acceptance и фактическая обработка устройством являются двумя
  разными receipt; correlation требует точные `operationId` и `messageId`.
* Lifecycle event является строгим безопасным discriminated union: source,
  type и detail взаимно согласованы, неизвестные поля и secret-shaped data
  отвергаются.
* Hamiltonian строит одну стабильную Service Worker ноду и реальные Web Push,
  WSS, controller и MessagePort edges из тех же lifecycle events. Внутренняя
  runtime incarnation остаётся фактом ноды, а не отдельной визуальной
  сущностью.
* Устарели: monolithic Hamiltonian-only Web Push, успешный HTTP/push-service
  ответ как доказательство доставки, произвольный lifecycle detail, отдельная
  `ServiceWorkerGlobalScope` нода и декоративная визуализация вне технического
  механизма.
* Для layout новых смысловых правил нет. Исправлена реализация уже действующих
  законов: маршрутизатор пробует canonical, прямой и обратный геометрические
  порядки edge, оставаясь конечным и детерминированным.

`MF-424.2` (цвета transport family и легенда) не входит в этот результат и
остаётся отдельной подзадачей визуальной приёмки.

### Проверки и evidence

* `bun run check`: `2484 passed`, `0 failed`, включая root typecheck и
  expect-error proof.
* `bun test hamiltonian`: `149 passed`, `0 failed`.
* `bun test pkg/nodes/layout/src/layout.test.ts
  pkg/nodes/layout/src/route-graph.test.ts`: `15 passed`, `0 failed`; тот же
  измеренный contour без нового schedule воспроизводил
  `NO_LEGAL_LAYOUT: 32/43`, после исправления возвращает `12/10`.
* `pkg/web-push` check: `21 passed`, `0 failed`, strict TypeScript и пять
  browser-safe exports.
* Exact Chrome 151 HTTPS run: permission `granted`, активный controller,
  существующая subscription, `12 нод · 10 связей · живой режим`.
* Wake `476ab1f7-1600-496c-93ba-0febc97b45b3` прошёл цепочку
  `push-armed → push-sent → push-service-accepted →
  push-reconnect-confirmed`; после idle runtime сменился с `22018090…` на
  `bc3016a7…`, identity осталась `8f762ecc…`, Cache bootstrap —
  `pushReady: true`, pending wake отсутствует.
* `project/artifacts/WEBPUSH-001/live-after-push.png` — SHA-256
  `236ea270aa631340052c954c78399920f09d050b8ac812c2b6d28fe0821087ba`.
* `project/artifacts/WEBPUSH-001/runtime-evidence.json` — SHA-256
  `e0eb450ae9e04026b281e9cbe389a211629f2d40306fbe1764019e33b8cc01d5`;
  внутри записаны exact implementation commit/tree, host source и SHA-256 всех
  реально отданных browser-бандлов.

### История независимого review

Первое review точного result commit `347fca844…` не было положительным: оно
нашло широкий lifecycle validator, неполный closing handoff и недостаточную
привязку live evidence к exact tree. Validator и browser export исправлены в
`dac31433…`; clean runtime затем обнаружил отдельный layout-regression,
исправленный в `a343bb1e…`. Текущий closing handoff и новые exact artifacts
должны пройти повторное независимое review. До его явного положительного
verdict карточка, запись `TODO.md` и артефакты не удаляются.
