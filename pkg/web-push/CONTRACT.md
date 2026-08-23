# `@metafor/web-push` — контракт

## Назначение

Пакет предоставляет переиспользуемый Web Push без привязки к UI, графу,
конкретному runtime-контру или transport приложения. Он разделяет:

1. browser permission на уведомления;
2. создание и серверную регистрацию `PushSubscription`;
3. принятие сообщения push service;
4. исполнение `push` в Service Worker и показ уведомления;
5. отдельное подтверждение фактической обработки на устройстве.

Ответ push service не доказывает исполнение Service Worker. Эти факты всегда
имеют разные результаты и lifecycle-события, связанные общими
`operationId`/`messageId`.

## Runtime-границы

`protocol` и `lifecycle` не имеют side effects. `client` работает только в
Window, `worker` — только в Service Worker, `server` — в произвольном server
runtime, а `server/bun` содержит Bun/Node и `web-push` adapters. Browser entry
points не импортируют server-код. Корневой export содержит только
runtime-neutral `protocol` и `lifecycle`; исполняемые API импортируются через
явные subpath `client`, `worker`, `server` и `server/bun`.

Core не знает о WSS, Force, Oracle, identity внешней системы, `wakeProof`, нодах
и визуальной сцене.

## Разрешение на уведомления

`enable()` напрямую вызывает системный `Notification.requestPermission()`,
если текущее состояние равно `default`. Пакет не показывает собственный
pre-prompt и не заставляет приложение спрашивать разрешение дважды.

`denied` является явным отказом: повторного системного запроса нет.
Закрытый системный запрос оставляет `default`; `permissionDisposition()` снова
возвращает `request`, поэтому приложение может повторить запрос после следующей
загрузки. `granted` переводит client к созданию или восстановлению подписки.

`granted` не означает завершённую подписку. Успех возвращается только после
server ACK, подтверждающего validation и сохранение подписки.

## Lifecycle hooks

Каждый client, worker и server API принимает необязательный
`onLifecycle(event)`. Если hook отсутствует, пакет ничего не публикует, не
открывает каналов и не требует инфраструктуры наблюдения.

Hook наблюдает, но не управляет механизмом:

* синхронная ошибка и rejected promise hook изолируются;
* несколько hooks подключаются явной композицией;
* policy, sender, store и receipt являются отдельными зависимостями;
* событие содержит `schema`, `eventId`, `operationId`, `at`, `source`, `type` и
  только безопасные presentation data;
* public type является discriminated union: префикс `type` обязан совпадать с
  `source`, а detail проверяется по allowlist конкретного варианта; неизвестные
  top-level и detail-поля запрещены;
* событие никогда не содержит endpoint, VAPID/auth/p256dh keys, payload,
  capability или иной секрет; произвольный текст ошибки не публикуется, а
  неизвестная причина заменяется безопасной категорией `RedactedError`.

Worker может получить отдельный injected `beforeNotification(message)` для
прикладной обработки уже валидированного сообщения до показа. Это policy hook,
а не lifecycle observer: его ошибка прекращает показ и становится явным
`worker.notification-failed`.

Пакет не предоставляет `BroadcastChannel`. Потребитель при необходимости
передаёт hook, который публикует безопасный event в принадлежащий ему channel
или observer. Другой consumer может использовать иной observer или вообще не
подключать hooks.

## Subscription и VAPID

Subscription endpoint обязан использовать HTTPS; keys проходят строгую
проверку. При совпадении application server key client восстанавливает
существующую подписку. При смене key старая подписка отписывается и создаётся
ровно одна новая.

Server хранит subscription под application-owned `subscriptionId`. Повторная
регистрация заменяет запись атомарно с точки зрения store adapter. Ответы
push service `404` и `410` удаляют недействительную запись.

## Push и receipt

Сообщение имеет versioned envelope, `messageId`, `operationId`, notification и
application data. Worker валидирует envelope до показа. Невалидное сообщение
не показывает уведомление и выпускает только безопасный failure lifecycle.

Delivery receipt является injected callback. Его отсутствие допустимо. Его
наличие не меняет смысл push service acceptance: серверное и device
подтверждения остаются разными фактами.

## Безопасность

Пакет не определяет authentication/authorization HTTP routes. Приложение
передаёт уже авторизованный `subscriptionId` и само защищает transport.
Lifecycle hooks не являются authority или журналом. Push не используется как
частый скрытый heartbeat и не обходит browser permission/user-visible policy.
