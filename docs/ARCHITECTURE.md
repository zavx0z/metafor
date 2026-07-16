# Архитектура реализации

Канонические ontology, causality, identity, cardinality и visual laws находятся
в [`zavx0z/concept`](https://github.com/zavx0z/concept). Этот документ описывает
только наблюдаемую структуру текущего runtime и не разрешает расхождения с
concept.

## Активный package graph

Root workspace graph задан явным списком в `package.json`:

- contracts: `types`;
- transport: `force`;
- domains: `dark`, `boundary`, `matrix`, `energy`, `bulk`;
- domain packages: `dark/{gravity,strong}`,
  `boundary/{atom,topology,wimp}`, `matrix/{gravity,strong,weak}`,
  `bulk/{gravity,strong,weak}`;
- reusable implementation: `pkg/engine`, `pkg/template`,
  `ui/{elements,components,hud}`, `fixture`;
- constructor and operational DSL: `create-metafor`.

Каталог `github/` остаётся локальной площадкой для временных Meta, но не
является workspace и не содержит subrepository configuration.

## Runtime entries

| Process  | Entry                | Default port |
| -------- | -------------------- | ------------ |
| Force    | `force/server.ts`    | 4000         |
| Boundary | `boundary/server.ts` | 4001         |
| Dark     | `dark/server.ts`     | 4002         |
| Matrix   | `matrix/server.ts`   | 4003         |
| Bulk     | `bulk/server.ts`     | 4004         |
| Energy   | `energy/server.ts`   | 4005         |

Root scripts запускают эти entries либо в hot development mode, либо обычными
Bun processes. Они не загружают Meta автоматически.

## Реализованное соединение

- `force/server.ts` принимает HTTP и WebSocket `ForceMessage`.
- Domain transports подключаются к `ws://127.0.0.1:4000/ws`, если
  `FORCE_ADDRESS` не задан.
- Domain handlers применяют входные particles к собственным runtime structures.
- `boundary/server.ts` открывает SQLite и публикует результаты реализованных
  materialization/replay paths через Force.
- `bulk/server.ts` обслуживает web entry, шрифт, browser WebSocket и связывает
  browser manifestation с Force.
- Matrix weak backend выбирается через `METAFOR_WEAK_BACKEND=auto|cpu|gpu`.

Это описание фиксирует поведение кода, а не объявляет его канонически верным.
В частности, существующие snapshot/create/replay-related paths не
переопределяются этой cleanup-задачей.

## Persistence

Boundary development server по умолчанию использует
`.metafor/dev.sqlite`. Путь можно явно задать первым позиционным аргументом или
`BOUNDARY_PATH`.

Boundary suites открывают изолированные `:memory:` databases и закрывают их в
`afterEach`. Они не используют development database.

## Bulk и renderer

Сохранены source-backed world projection, generic viewport, navigation,
fullscreen, HUD, retained UI packages и WebGPU renderer. Удалённые bot, phone,
Android и WebRTC application paths были отключёнными product-specific ветками и
не входили в причинный runtime contour.

Legacy manifestation evidence, State occurrences, Conditions, relations,
projections и visual implementation остаются доступными для последующего
MF-000 D-5 audit. Cleanup не устанавливает новых visual laws.

## Create MetaFor

`create-metafor` остаётся активным workspace и CLI. Его templates, generator
tests и `rules/metafor.md` проверяются локально вместе с остальным runtime.
