# Force: текущая реализация

Концептуальная семантика Force принадлежит репозиторию `zavx0z/concept`. Этот
файл описывает реализованную границу центрального Force.

## Relay и transport

`force/force.ts` — runtime relay. Он получает одну типизированную Particle,
применяет вшитые routing laws и вызывает готовые каналы Store. В этом модуле нет
WebSocket client, server lifecycle или transport mock.

Используемый доменами `new Force(domain)` — transport client из public subpath
`shared/transport/force`. Conditional exports package `shared` выбирают
`server.ts` для Bun/Node и `web.ts` для browser. Оба сохраняют единый порядок
Particle, outbox до открытия и reconnect физического соединения.

Wire contract один для обеих сред и экспортируется из
`shared/protocol/force/*`. Package `force` больше не экспортирует production
transport: relay, Store, `ForceLifecycle` и `MonadRouter` остаются его внутренней
implementation; fixtures доступны отдельно через test-only subpath
`force/fixture`.

## Создание канала

Доменный transport добавляет `domain` и `id` в HTTP Upgrade URL. Force server
читает identity до открытия WebSocket и оборачивает физический socket в канал
соответствующего домена. Отдельного WebSocket-сообщения `register` нет.

После Upgrade WebSocket передаёт только:

```ts
interface ForceMessage {
  parts: [Particle]
}
```

Readiness, health, snapshot, replay, pause, error и прочие служебные payload по
этому каналу не передаются. JSON decoding остаётся технической операцией
transport-а; повторной Particle-валидации в Монаде и relay нет.

Открытие transport-а само по себе не испускает Particle. Первым сообщением
канала становится только фактический доменный Impulse.

## ForceLifecycle

`ForceLifecycle` получает пять заранее созданных `ForceChannel` и ждёт готовности
Dark, Boundary, Matrix, Energy и Bulk. Он не знает о WebSocket, REST, WebRTC и
RPC. Только после готовности всех пяти `GET /health` возвращает `running`, а
relay принимает Particle.

Потеря последнего соединения любого обязательного домена переводит lifecycle в
`error` и закрывает общий relay gate. Transport может физически попытаться
подключиться повторно, но это не перезапускает runtime и не снимает ошибку.

## MonadRouter

Служебные RPC проходят через отдельные `MonadChannel`. Их identity не ограничена
пятью runtime-доменами. `MonadRouter` проверяет provider/method, передаёт запрос и
возвращает коррелированный ответ, не управляя `ForceLifecycle` и runtime Force.

## Routing laws

- agent Inflaton доставляется Dark и Bulk;
- Dark Inflaton доставляется Boundary и Bulk;
- uncommitted `gluon`/`higgs` mutation без `from` доставляется Boundary;
- остальные Particle доставляются всем доменам, кроме канала происхождения.

Числовой `z/test` Energy остаётся обычной Particle.
