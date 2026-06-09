# Архитектура

Интерпретатор MetaFor держит общий live-контекст человека и ИИ: process runtime state, stack/scopes, source, console, eval и breakpoint state. Несколько запущенных процессов представлены как несколько равноправных `UIDisplay` внутри одного WebGPU `Space`.

Внутри используется WebKit/JSC protocol Bun. Это транспорт к runtime, а не отдельный пользовательский IDE workflow.

## Компоненты

```text
pkg/interpreter/
  interpreter.ts          CLI entrypoint
  index.ts                package exports
  README.md               пользовательская инструкция
  docs/                   подробная документация
  src/interpreter.ts      lifecycle, HTTP startup, CLI startup modules
  src/module.ts           per-module socket, snapshots, breakpoints, runtime launcher
  src/module-cli.ts       parser путей и параметров CLI
  src/breakpoints.ts      breakpoint registry, scriptId install, remove
  src/commands.ts         внутренние WS-команды по moduleId текущего process
  src/console.ts          Console/Runtime console events
  src/config.ts           env parsing и defaults
  src/protocol-client.ts WebSocket JSON-RPC client для Bun protocol
  src/server.ts           HTTP + WS + web UI server, processes REST API
  src/snapshot.ts         сборка snapshot на Debugger.paused
  src/source-map.ts       mapping editor/generated coordinates
  src/target.ts           Bun.spawn launcher внутри модуля
  web/                    встроенный UI интерпретатора
```

## CLI

```sh
bun run interpreter ./module.ts
bun run interpreter ./module.spec.ts -timeout=2147483647
bun run interpreter dark/server.spec.ts -timeout=2147483647 pkg/interpreter/src/syntax.test.ts
```

Парсер создаёт модуль на каждый путь. Параметры с `-` относятся к предыдущему пути. `*.spec.ts` и `*.test.ts` запускаются через `bun test`, остальные entrypoint-ы — через `bun`.

## module.ts

`src/module.ts` управляет жизненным циклом одного модуля:

- создаёт `ProtocolClient`;
- создаёт `SnapshotStore`;
- создаёт `BreakpointStore`, `ConsoleLogStore`, `TargetSupervisor`;
- запускает reconnect loop;
- выполняет initialization Bun protocol domains;
- планирует fallback protocol initialization.

`InterpreterRuntime` маршрутизирует protocol events:

```text
Debugger.scriptParsed -> SnapshotStore.handleScriptParsed
Debugger.scriptParsed -> BreakpointStore.handleScriptParsed
Debugger.paused       -> SnapshotStore.handlePaused
Debugger.resumed      -> SnapshotStore.handleResumed
Console.*             -> ConsoleLogStore
```

## server.ts

`src/server.ts` поднимает REST, WS и web UI.

Environment API:

```text
GET    /health
GET    /context
GET    /space
POST   /space/focus
POST   /space/frame
GET    /hud/todo
POST   /hud/todo/highlight
```

Processes API:

```text
GET    /processes
POST   /processes
GET    /processes/:id
POST   /processes/:id/action
GET    /processes/:id/context
GET    /processes/:id/source
GET    /processes/:id/breakpoints
POST   /processes/:id/breakpoint
DELETE /processes/:id/breakpoint
```

`GET /hud/todo` читает корневой `TODO.md` для HUD ToDoPane. Текст пунктов и markdown checkbox `- [ ]` / `- [x]` являются данными файла. Подсветка пунктов является состоянием HUD-панели, не пишется в `TODO.md`, но входит в `context.hud.todo.highlightedItems`, чтобы агент видел, о чем сейчас речь.

`hello` WebSocket-сообщение включает `modules`, поэтому UI сразу строит один `UIDisplay` на каждый модуль.

## Web UI / Space

UI интерпретатора создаёт один `UiRuntime`, один `Space` и один WebGPU canvas. Каждый модуль получает свой `UIDisplay` с source/frames/scopes/console/events. Runtime раскладывает дисплеи в ряд и маршрутизирует pointer events по `displayId`.

Все дисплеи и модули в UI-модели равноправны.

## Host Boundary / XR

`web/main.ts` является browser-host: он берёт DOM canvas, открывает WebSocket `/ws`, хранит локальные UI-настройки и создаёт `UiRuntime`.

Интерпретаторная часть не должна зависеть от browser-only display:

- модульные панели добавляются через `addSurfaceToDisplay(displayId, ...)`;
- каждый модуль создаёт отдельный `UIDisplay`;
- `surfaceDisplay: false`, встроенный screen/display host не используется для модулей;
- layout модулей считается от viewport metrics, а не от конкретного браузерного окна как продуктовой сущности;
- process state приходит через process-scoped REST и внутренний snapshot/WS transport, который пока keyed by `moduleId`; этот state может быть подан в другой host.

Для XR нужно заменить host-слой, который предоставляет `UiRuntime`, input routing и transport к `/ws`; сами pane/controller-ы интерпретатора должны остаться `UIDisplay`-контентом внутри одного `Space`.

## commands.ts

`src/commands.ts` исполняет команды:

```json
{"cmd":"eval","frame":0,"expr":"wimp.id"}
{"cmd":"frames"}
```

Status messages не пишутся в stdout. Они уходят в stderr и event log.

## Workspace launcher

Корневой `bun run interpreter` запускает `pkg/interpreter/interpreter.ts` через `bun --hot`. Default protocol endpoint — `ws://127.0.0.1:6499/`, файлы интерпретатора пишутся в `.metafor/interpreter/`.
