# Архитектура

Интерпретатор MetaFor — отдельный Bun-sidecar, который подключается к Bun WebKit Inspector WebSocket.
Он держит общий live-контекст человека и ИИ: target state, stack/scopes, source, console, eval и draft-код.
Несколько target-процессов представлены как несколько interpreter sessions.

Цель архитектуры: отделить долгоживущие interpreter sockets и UI интерпретатора от основного чата.
Если socket зависнет или sidecar упадёт, основной агент не теряет состояние диалога.

## Компоненты

```text
pkg/interpreter/
  interpreter.ts          CLI entrypoint
  index.ts                 package exports
  README.md                пользовательская инструкция интерпретатора
  docs/                    подробная документация
  src/interpreter.ts       process lifecycle, HTTP startup, CLI startup sessions
  src/session.ts           per-process session: socket, snapshots, breakpoints, target
  src/breakpoints.ts       REST breakpoint registry, scriptId install, remove
  src/commands.ts          stdin NDJSON command loop
  src/console.ts           захват Console/Runtime console events
  src/config.ts            env parsing и defaults
  src/errors.ts            нормализация ошибок
  src/fs.ts                атомарная запись JSON
  src/guards.ts            runtime parsing WebKit Inspector payloads
  src/inspector-client.ts  WebSocket JSON-RPC client
  src/logger.ts            event log writer
  src/server.ts            HTTP + WS + web UI server, sessions REST API
  src/snapshot.ts          сборка snapshot на Debugger.paused
  src/source-map.ts        mapping editor/generated coordinates
  src/target.ts            запуск/остановка target процесса через REST
  src/time.ts              Bun.sleep wrapper
  src/types.ts             inspector и dump types
  web/                     встроенный UI интерпретатора
```

## CLI Entrypoint

`interpreter.ts` можно запускать без target:

```sh
bun run interpreter
```

Или сразу с target:

```sh
bun run interpreter -- ./module.ts
bun run interpreter -- --inspect-wait ./module.ts -- --flag value
bun run interpreter -- bun test --timeout=2147483647 ./module.spec.ts
```

Если первый аргумент не `bun`, entrypoint трактует аргументы как `bun <args>`.
Если `--inspect*` уже есть, режим сохраняется. Если inspector-флага нет, target стартует через `--inspect-brk`, чтобы UI сразу открыл paused live-контекст.

Несколько процессов запускаются блоками `--session <label> -- <command...>`:

```sh
bun run interpreter -- \
  --session dark-server -- bun test --timeout=2147483647 dark/server.spec.ts \
  --session syntax -- bun test pkg/interpreter/src/syntax.test.ts
```

## session.ts

`src/session.ts` управляет жизненным циклом одного процесса:

- создаёт `InspectorClient`
- создаёт `SnapshotStore`
- создаёт `BreakpointStore`, `ConsoleLogStore`, `TargetSupervisor`
- запускает reconnect loop
- выполняет initialization Bun protocol domains
- планирует fallback `Inspector.initialized`

`InterpreterRuntime` не знает деталей snapshot format и NDJSON command parsing.
Он только маршрутизирует protocol events:

```text
Debugger.scriptParsed -> SnapshotStore.handleScriptParsed
Debugger.scriptParsed -> BreakpointStore.handleScriptParsed
Debugger.paused       -> SnapshotStore.handlePaused
Debugger.resumed      -> SnapshotStore.handleResumed
Console.*             -> ConsoleLogStore
```

## inspector-client.ts

`src/inspector-client.ts` — тонкий WebSocket JSON-RPC client:

- открывает WebSocket
- отправляет request `{ id, method, params }`
- ждёт response по `id`
- держит pending request map
- применяет request timeout
- парсит incoming events
- отдаёт events подписчикам

Он не знает о Bun breakpoint-ах, snapshots, stdin commands или файлах.

## snapshot.ts

`src/snapshot.ts` отвечает за `Debugger.paused`:

- сохраняет top 5 call frames
- строит JSON dump
- переводит generated frame location обратно в editor coordinates через source map
- разворачивает `local` и `closure` scopes top frame
- пишет dump атомарно через `tmp + rename`

Для scope properties сначала используется:

```text
Runtime.getDisplayableProperties
```

Fallback:

```text
Runtime.getProperties
```

Это нужно для Bun/JSC `DebuggerScope`: локалы часто не являются own properties.

## breakpoints.ts

`src/breakpoints.ts` отвечает только за breakpoint-ы, пришедшие через REST:

- хранит `BreakpointSpec` из `/target/run` или `POST /breakpoint`
- матчится на `Debugger.scriptParsed` по `url` или `urlRegex`
- переводит editor coordinates в generated coordinates через `sourceMapURL`
- ставит `Debugger.setBreakpoint` по конкретному `scriptId`
- хранит реальные Bun `breakpointId`
- снимает точки через `Debugger.removeBreakpoint`

Почему не early `Debugger.setBreakpointByUrl`:

```text
locations: [] + breakpointResolved в Bun 1.3.13 не гарантируют Debugger.paused
```

## source-map.ts

`src/source-map.ts` — маленькая обёртка над `source-map-js`.

Она нужна в двух местах:

- перед `Debugger.setBreakpoint`: editor line -> generated line
- при snapshot: generated callFrame location -> editor line

Если source map отсутствует или не парсится, используется noop mapping.

## server.ts И target.ts

`src/server.ts` поднимает REST, WS и web UI.

`src/target.ts` запускает один target-процесс за раз внутри конкретного session через `Bun.spawn`,
буферизует stdout/stderr и отдаёт состояние через legacy `GET /target` для default session или через
`GET /sessions`.

Sessions API:

```text
GET  /sessions
POST /sessions/run
POST /sessions/:id/stop
POST /sessions/:id/command
```

`GET /workspace/files` отдаёт список JS/TS entrypoints для стартового экрана. `hello` WebSocket-сообщение
включает target snapshot и sessions snapshot, чтобы UI сразу переходил в live layout интерпретатора, если
target уже запущен.

## Web UI / Space

UI интерпретатора создаёт один `UiRuntime`, один `Space` и один WebGPU canvas. Default session использует
основной `UIDisplay` с полноценными панелями source/frames/scopes/console. Дополнительные sessions получают
свои `UIDisplay` внутри того же `Space`; runtime раскладывает дисплеи в ряд и маршрутизирует pointer events
по `displayId`.

## commands.ts

`src/commands.ts` читает stdin как NDJSON:

```text
{"cmd":"eval","frame":0,"expr":"wimp.id"}
{"cmd":"frames"}
```

И пишет stdout как NDJSON:

```text
{"seq":1,"ok":true,"cmd":"eval","result":...}
```

Status messages не пишутся в stdout.
Они уходят в stderr и event log.

## Workspace launcher

Корневой `bun run interpreter` запускает `pkg/interpreter/interpreter.ts` через `bun --hot`.
Default interpreter socket endpoint — `ws://127.0.0.1:6499/`, файлы интерпретатора пишутся в `.metafor/interpreter/`.
