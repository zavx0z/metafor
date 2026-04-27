# Render projection — граница store и визуального слоя

Дата: 2026-04-26. Детализация к `task/store-unification.md`.

## Проверенный текущий факт

`bulk/web` и `bulk/gravity/layout` сейчас импортируют render-row типы из
`@store/actor`:

- `DbParticleShellRow`;
- `DbFieldOrbitRow`;
- `DbWorldRows`;
- `DbActorStore`.

Текущий `@store/actor` этих типов не экспортирует. Это не просто missing export:
render rows больше не должны быть частью canonical actor store.

## Где сейчас живёт layout/render config

- Domain layout law: `bulk/gravity/layout/settings.t.ts` (`BulkLayoutSettings`).
- Snapshot config: `bulk/gravity/layout/settings.ts`.
- App/web viewport/camera constants: `app/web/settings.ts`
  (`appWebLayoutConfig.viewport`).
- User UI settings persisted in IDB: `app/web/ui-settings-idb.ts`.
- Transient viewport runtime state lives in `bulk/web/index.ts`.

## Target boundary

Canonical store:

- `store.meta` — декларации;
- `store.actor` — actors, values, links, state.

Render projection:

- reads `meta + actor + layout settings`;
- produces `DbWorldRows` or incremental row events;
- may cache rows in browser/server for performance;
- is invalidated by store events;
- is not source of truth.

## Следующий шаг

Вернуть render-row types/API в Bulk/render module, не в `@store/actor`.
После этого `app/web/client.ts`, `app/web/runtime/dark.worker.ts` и
`bulk/gravity/layout/*` должны перестать ожидать `createIdbDbActorStore` /
`createSqliteDbActorStore` от canonical actor package.
