# Архитектура

Интерпретатор MetaFor держит общий live-контекст человека и ИИ: module runtime state, stack/scopes, source, console, eval и draft-код. Несколько запущенных модулей представлены как несколько равноправных `UIDisplay` внутри одного WebGPU `Space`.

Внутри используется Bun WebKit Inspector Protocol. Это транспорт к runtime, а не отдельный пользовательский IDE/debugger workflow.

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
  src/commands.ts         stdin/REST/WS command execution
  src/console.ts          Console/Runtime console events
  src/config.ts           env parsing и defaults
  src/inspector-client.ts WebSocket JSON-RPC client для Bun protocol
  src/server.ts           HTTP + WS + web UI server, modules REST API
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

- создаёт `InspectorClient`;
- создаёт `SnapshotStore`;
- создаёт `BreakpointStore`, `ConsoleLogStore`, `TargetSupervisor`;
- запускает reconnect loop;
- выполняет initialization Bun protocol domains;
- планирует fallback `Inspector.initialized`.

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

Modules API:

```text
GET  /modules
POST /modules/run
POST /modules/:id/run
POST /modules/:id/stop
POST /modules/:id/command
GET  /modules/:id/source
```

`hello` WebSocket-сообщение включает `modules`, поэтому UI сразу строит один `UIDisplay` на каждый модуль.

## Web UI / Space

UI интерпретатора создаёт один `UiRuntime`, один `Space` и один WebGPU canvas. Каждый модуль получает свой `UIDisplay` с source/frames/scopes/console/events. Runtime раскладывает дисплеи в ряд и маршрутизирует pointer events по `displayId`.

Все дисплеи и модули в UI-модели равноправны.

## commands.ts

`src/commands.ts` исполняет команды:

```json
{"cmd":"eval","frame":0,"expr":"wimp.id"}
{"cmd":"frames"}
```

Status messages не пишутся в stdout. Они уходят в stderr и event log.

## Workspace launcher

Корневой `bun run interpreter` запускает `pkg/interpreter/interpreter.ts` через `bun --hot`. Default protocol endpoint — `ws://127.0.0.1:6499/`, файлы интерпретатора пишутся в `.metafor/interpreter/`.
