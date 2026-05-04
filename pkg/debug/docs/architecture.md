# Архитектура

`@metafor/bun-debug` — отдельный Bun-процесс, который подключается к Bun WebKit Inspector WebSocket.

Цель архитектуры: отделить долгоживущий inspector socket от основного чата.
Если socket зависнет или sidecar упадёт, основной агент не теряет состояние диалога.

## Компоненты

```text
pkg/debug/
  agent-attach.ts          CLI entrypoint
  index.ts                 package exports
  README.md                пользовательская инструкция
  docs/                    подробная документация
  src/agent.ts             lifecycle процесса, reconnect, inspector initialization
  src/commands.ts          stdin NDJSON command loop
  src/config.ts            env parsing и defaults
  src/errors.ts            нормализация ошибок
  src/fs.ts                атомарная запись JSON
  src/guards.ts            runtime parsing WebKit Inspector payloads
  src/inspector-client.ts  WebSocket JSON-RPC client
  src/logger.ts            event log writer
  src/snapshot.ts          сборка snapshot на Debugger.paused
  src/time.ts              Bun.sleep wrapper
  src/types.ts             inspector и dump types
```

## agent.ts

`src/agent.ts` управляет жизненным циклом:

- создаёт `InspectorClient`
- создаёт `SnapshotStore`
- запускает reconnect loop
- запускает stdin command loop
- выполняет inspector initialization
- планирует fallback `Inspector.initialized`
- обрабатывает `SIGINT` и `SIGTERM`

`AgentRuntime` не знает деталей snapshot format и NDJSON command parsing.
Он только маршрутизирует inspector events:

```text
Debugger.scriptParsed -> SnapshotStore.handleScriptParsed
Debugger.paused       -> SnapshotStore.handlePaused
Debugger.resumed      -> SnapshotStore.handleResumed
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

## dark wrapper

`dark/debug/agent-attach.ts` сохраняет старые defaults:

```text
BUN_INSPECTOR_URL=ws://127.0.0.1:6499/dark
AGENT_DUMP_PATH=dark/debug/.agent-state.json
AGENT_EVENT_LOG_PATH=dark/debug/.agent-events.log
```

Wrapper импортирует `runAgent` из `pkg/debug`.
Реализации в `dark/debug` нет.
