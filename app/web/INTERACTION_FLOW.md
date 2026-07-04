# Поток Взаимодействия AppWeb

## Участники

- `Dark` открывает `Boundary` и держит серверную истину.
- `Boundary` отдаёт Bulk snapshot и публикует Force-события.
- `app/web` остаётся browser view shell: показывает Bulk-проекцию, но не владеет
  доменной истиной, interpreter lifecycle или процессной семантикой.
- `Bulk` в браузере применяет готовый snapshot/Force-поток к viewport.

## Browser Flow

1. Клиент открывает `/ws`.
2. Клиент отправляет `{ type: "materialize", src, layoutSettings }`.
3. Сервер берёт snapshot из `boundary.bulkRuntime()`.
4. Сервер отправляет `{ type: "snapshot", src, snapshot }`.
5. Клиент строит Bulk manifest и применяет его через `bulkViewport.applyManifest()`.
6. Последующие Boundary Force events приходят как `{ type: "force", parts }` и
   применяются к текущему snapshot/viewport.

## Settings Flow

1. `Settings` меняет `src`, `layoutSettings` или `renderSettings`.
2. `renderSettings` применяются сразу в браузере.
3. `src`/`layoutSettings` пересчитываются через `/ws` materialize/relayout.
4. Persistent browser settings хранятся в `bulk/settings`.

## Force HTTP

`POST /force` принимает тело:

```json
{ "parts": [] }
```

Сервер отдаёт частицы в `boundary.absorb(...)` и ретранслирует результат текущим
браузерным клиентам и bridge-подключениям.

## Matrix / Energy Bridge

Текущий AppWeb server всё ещё содержит приватные `/matrix/ws` и `/energy/ws`
bridge endpoints. Они не должны превращать AppWeb в доменный центр: AppWeb здесь
только сетевой край текущего контура, пока серверный центр переносится в Dark.
