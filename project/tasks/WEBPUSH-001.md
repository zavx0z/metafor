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

## Результат проверки перед REVIEW

* Browser/server exports разделены; общий пакет не предоставляет
  `BroadcastChannel`, а Hamiltonian подключает наблюдение своим lifecycle hook.
* Прошёл 21 package test, 38 focused browser/layout/projection tests и 149 Hamiltonian
  tests; strict TypeScript пакета, root typecheck и `git diff --check` успешны.
* В обычном Chrome 151 на HTTPS подтверждены `granted`, сохранённая подписка и
  неизменная стабильная identity Service Worker при смене его внутреннего
  runtime incarnation.
* Для `wakeId` `a710ec3f-de44-4990-98d1-bb17cff5acab` наблюдены
  `push-armed`, `push-sent`, `push-service-accepted` и
  `push-reconnect-confirmed`; после подтверждения `pendingWakeIds` пуст. Затем
  Chrome сменил внутренний runtime incarnation, а восстановленный bootstrap
  остался `pushReady: true`, без ложного красного состояния стабильной ноды.
* Живая проекция содержит 12 нод и 10 связей без orphan roots. Один выходной
  IPC-параметр host совместно используется тремя IPC edges, Web Push и WSS
  остаются отдельными связями.
* Повторяемые runtime-данные и визуальный снимок сохранены в
  `project/artifacts/WEBPUSH-001/`. Независимое предварительное implementation
  review не нашло P0/P1; его единственный P2 о stale live evidence устранён
  повторным HTTPS-capture финального runtime с module SHA-256, checksum обоих
  артефактов и проверкой следующего browser-managed incarnation. После
  перевода задачи в `REVIEW` точный result commit отдельно проходит
  обязательную closing-проверку по `project/README.md`; только её verdict
  разрешает закрывающий коммит.
