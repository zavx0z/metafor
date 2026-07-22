# Force: текущая реализация

Этот файл является действующим контрактом реализованной границы центрального
Force. Общая карта документов находится в [`docs/README.md`](README.md).

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

Служебные RPC проходят через отдельные постоянные `MonadChannel`. Их identity не
ограничена пятью runtime-доменами. Канал умеет только `send`, `subscribe` и
`close`; он не является client или provider. Каждая Монада использует
`MonadRpcPeer` над своим каналом и может одновременно вызывать чужие методы и
предоставлять собственные.

Первый REST adapter открывает `MonadChannel` только локальному серверному
процессу, один раз связывает identity/capabilities с непрозрачным токеном и затем
получает source из состояния этого канала. RPC payload не может объявить или
подменить source. `MonadRouter` маршрутизирует call в target channel и response
обратно в source channel по correlation id, не управляя `ForceLifecycle` и
runtime Force. Для межхостового transport-а потребуется собственная авторизация
identity при создании канала.

## Routing laws

- agent Inflaton доставляется Dark и Bulk;
- Dark Inflaton доставляется Boundary и Bulk;
- uncommitted `gluon`/`higgs` mutation без `from` доставляется Boundary;
- остальные Particle доставляются всем доменам, кроме канала происхождения.

Числовой `z/test` Energy остаётся обычной Particle.
