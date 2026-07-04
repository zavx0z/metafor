# Поток Взаимодействия AppWeb

## Участники

- `Dark` открывает `Boundary`, держит серверный край и отдает `bulk/index.html`.
- `Boundary` отдаёт Bulk snapshot и публикует Force-события.
- `app/web` остаётся browser view shell: показывает Bulk-проекцию, но не владеет
  доменной истиной, interpreter lifecycle или процессной семантикой.
- `Bulk` в браузере применяет готовый snapshot/Force-поток к viewport.

## Browser Flow

1. Dark отдает `bulk/index.html`.
2. HTML напрямую загружает `app/web/client.ts`.
3. Клиент открывает `/ws`.
4. Клиент отправляет `{ type: "materialize", src, layoutSettings }`.
5. Dark берет snapshot из `boundary.bulkRuntime()`.
6. Dark отправляет `{ type: "snapshot", src, snapshot }`.
7. Клиент строит Bulk manifest и применяет его через `bulkViewport.applyManifest()`.
8. Последующие Force events приходят как `{ type: "force", parts }` и
   применяются к текущему snapshot/viewport.

## Settings Flow

1. `Settings` меняет `src`, `layoutSettings` или `renderSettings`.
2. `renderSettings` применяются сразу в браузере.
3. `src`/`layoutSettings` пересчитываются через `/ws` materialize/relayout.
4. Persistent browser settings хранятся в `bulk/settings`.

## Граница

AppWeb не содержит серверных endpoints. `/ws` и `/force` живут в Dark. Matrix и
Energy обрабатываются через свои локальные Force pipeline, а не через AppWeb
bridge.
