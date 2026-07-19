# Force: текущая реализация

Концептуальная семантика Force принадлежит репозиторию `zavx0z/concept`. Этот
файл описывает реализованную границу центрального Force.

## Relay и transport

`force/force.ts` — runtime relay. Он получает одну типизированную Particle,
применяет вшитые routing laws и вызывает готовые каналы Store. В этом модуле нет
WebSocket client, server lifecycle или transport mock.

Экспортируемый пакетами доменов `new Force(domain)` — транспортный клиент из
`force/transport/`. Он сохраняет прежний WebSocket transport, порядок входящих
Particle, outbox до открытия и reconnect физического соединения.

Корневой package `force` экспортирует только этот transport client. Relay,
Store, Монада и их внутренние типы импортируются относительно внутри package;
fixtures доступны отдельно через test-only subpath `force/fixture`.

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

Переходное исключение — уже существующая Particle `z/test force/replay/...`,
которую старые transport clients пока испускают после подключения. Монада
временно поглощает её до relay. Это мок миграционного этапа, а не протокол
восстановления.

## Server lifecycle

Монада Force получает пять заранее созданных transport-каналов и ждёт
физического подключения Dark, Boundary, Matrix, Energy и Bulk. Только после
готовности всех пяти `GET /health` возвращает `running`, а relay принимает
Particle.

Потеря последнего соединения любого обязательного домена переводит Монаду в
`error` и закрывает общий relay gate. Transport может физически попытаться
подключиться повторно, но это не перезапускает runtime и не снимает ошибку.

## Routing laws

- agent Inflaton доставляется Dark и Bulk;
- Dark Inflaton доставляется Boundary и Bulk;
- uncommitted `gluon`/`higgs` mutation без `from` доставляется Boundary;
- остальные Particle доставляются всем доменам, кроме канала происхождения.

Настоящий числовой `z/test` Energy не совпадает с replay path и остаётся обычной
Particle.
