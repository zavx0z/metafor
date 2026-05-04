# @metafor/bun-debug

Sidecar для совместной отладки Bun-процессов через WebKit Inspector Protocol.
Подключается вторым клиентом к тому же inspector WebSocket, что и человек в WebStorm/Chrome (`https://debug.bun.sh`), и отдаёт состояние через REST, WebSocket и встроенный web-UI.

```
       Bun process (--inspect-wait)
              │
              ws://…/dark
              │
   ┌──────────┼──────────┐
   │          │          │
Chrome   sidecar   WebStorm
DevTools     │
             ├─ http://…:6500/  → HTML/JS UI
             ├─ ws://…:6500/ws → real-time стрим в браузер
             ├─ REST /state /eval /step …
             └─ stdin/file NDJSON команды
```

## Workflow в двух терминалах

```sh
# 1. отлаживаемый процесс
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts

# 2. sidecar для dark/
bun run dark/debug/agent-attach.ts
```

`--inspect-wait` (не `-brk`!) — Bun ждёт первого клиента; sidecar отправит `Inspector.initialized` и target пойдёт.

Открой UI: `http://127.0.0.1:6500/` — увидишь call frames, source с подсветкой текущей строки, scopes, eval, console, и (по toggle) поток всех событий Bun-инспектора.

В Chrome для интерактивных breakpoint-ов: `https://debug.bun.sh/#127.0.0.1:6499/dark`. Bun обслуживает несколько клиентов одновременно — sidecar и Chrome видят одни и те же события.

## Точки входа

| Файл | Дефолты | Когда использовать |
|---|---|---|
| `pkg/debug/agent-attach.ts` | `ws://127.0.0.1:6499/bun`, snapshot в `.metafor/debug/` | Generic — задавай env под свой target |
| `dark/debug/agent-attach.ts` | `ws://127.0.0.1:6499/dark`, snapshot в `dark/debug/` | Dark workspace |

## REST API (по умолчанию `127.0.0.1:6500`)

```
GET  /                — список роутов
GET  /health          — статус коннекта, paused, scriptCount
GET  /state           — последний snapshot Debugger.paused (или null)
GET  /scripts         — карта scriptId → url
GET  /frames          — paused-флаг + callFrames + dump
GET  /events?since=<iso|seq>&limit=<n>  — хвост event-лога
GET  /console?since=<iso|seq>&limit=<n> — хвост console-лога
GET  /source?scriptId=<id>              — Debugger.getScriptSource (с кешем)
POST /eval     — body {frame?, expr}              → Debugger.evaluateOnCallFrame
POST /props    — body {objectId, ownProperties?}  → Runtime.getProperties
POST /step     — body {kind: "over"|"into"|"out"} → Debugger.stepOver/Into/Out
POST /pause    — Debugger.pause
POST /resume   — Debugger.resume
POST /inspector — body {url}                       → переключиться на другой Bun-инспектор без рестарта
```

Примеры:

```sh
curl -s http://127.0.0.1:6500/health
curl -s -X POST http://127.0.0.1:6500/eval \
  -H 'content-type: application/json' \
  -d '{"frame":0,"expr":"data.patches[0].path"}'
curl -s -X POST http://127.0.0.1:6500/inspector \
  -H 'content-type: application/json' \
  -d '{"url":"ws://127.0.0.1:6499/dark"}'
```

## WebSocket `/ws`

Server → Client:
- `{type:"hello", inspectorUrl, paused, dump, scripts, connection}` — первое сообщение при connect, текущее состояние целиком.
- `{type:"connection", state:"connecting"|"connected"|"disconnected", error, inspectorUrl}` — на каждое open/close inspector-сокета.
- `{type:"state", dump}` — на каждый `Debugger.paused`.
- `{type:"resumed"}` — на `Debugger.resumed`.
- `{type:"script", scriptId, url}` — на каждый `Debugger.scriptParsed`.
- `{type:"console", entries:[…]}` — каждый console.log из target.
- `{type:"inspector-event", method, params, ts}` — все сырые события от Bun-инспектора (для verbose-режима).
- `{type:"agent-event", event, detail, ts}` — own event-log агента (http/ws/agent.*).
- `{type:"result", requestId, ok, result|error}` — ответ на команду от UI.

Client → Server:
- `{type:"command", cmd, params, requestId}` — выполнить eval/props/step/pause/resume/frames.

## Web UI

`http://127.0.0.1:6500/`:

- **Welcome-экран** до подключения: статус, команда запуска target'а с подставленным URL, поле смены URL без рестарта sidecar'а, REST cheatsheet.
- **Call Frames** слева — клик переключает активный фрейм для `eval`.
- **Source** сверху — исходник текущего фрейма (`Debugger.getScriptSource`) с подсветкой текущей строки и автоскроллом.
- **Scopes (top frame)** — local + closure с типизированными значениями.
- **Evaluate** — `Cmd/Ctrl+Enter` для запуска.
- **Console** — снизу, real-time через WS.
- **Pause / Resume / Step Over/Into/Out** — кнопки в шапке.
- **Verbose toggle** — правая колонка: стрим всех событий Bun-инспектора и агента, фильтр (`Debugger.*`, `!Heap.*`), autoscroll, лимит 1000 строк, persist в localStorage.

## NDJSON команды

Кроме REST/WS, sidecar читает команды из stdin и из `AGENT_COMMAND_PATH`-файла построчно как NDJSON:

```json
{"cmd":"frames"}
{"cmd":"eval","frame":0,"expr":"wimp.children.length"}
{"cmd":"props","objectId":"{\"injectedScriptId\":1,\"id\":7}"}
{"cmd":"step","kind":"over"}
{"cmd":"pause"}
{"cmd":"resume"}
```

Ответы пишутся в stdout и `AGENT_RESPONSE_PATH`.

## Переменные окружения

| Имя | Default | Описание |
|---|---|---|
| `BUN_INSPECTOR_URL` | `ws://127.0.0.1:6499/bun` (или `/dark` через dark wrapper) | endpoint Bun-инспектора |
| `AGENT_DUMP_PATH` | `.metafor/debug/agent-state.json` | snapshot Debugger.paused |
| `AGENT_EVENT_LOG_PATH` | рядом с dumpPath | NDJSON event log |
| `AGENT_CONSOLE_LOG_PATH` | рядом с dumpPath | NDJSON console log |
| `AGENT_COMMAND_PATH` | рядом с dumpPath | NDJSON команды (file-based) |
| `AGENT_RESPONSE_PATH` | рядом с dumpPath | NDJSON ответы |
| `AGENT_REQUEST_TIMEOUT_MS` | `10000` | timeout Inspector-запроса |
| `AGENT_RECONNECT_DELAY_MS` | `1000` | base reconnect-задержка (exponential до 15s) |
| `AGENT_INITIALIZE_FALLBACK_MS` | `1500` | через сколько отправить `Inspector.initialized` (отпускает `--inspect-wait`) |
| `AGENT_HTTP_ENABLED` | `1` | включает HTTP+WS+UI |
| `AGENT_HTTP_HOST` | `127.0.0.1` | хост HTTP API |
| `AGENT_HTTP_PORT` | `6500` | порт HTTP API |

## Особенности Bun-инспектора (1.3.13)

Эмпирически выяснено и заложено в sidecar:
- `Runtime.runIfWaitingForDebugger` **не реализован** в Bun (`-32601`). Освобождать `--inspect-wait` нужно через `Inspector.initialized`.
- При подключении вторым клиентом (когда первый уже стоит на breakpoint-е), Bun иногда не дублирует scriptParsed/Debugger.paused — события начинают приходить второму клиенту только после следующего pause/resume цикла. Решение: запускать sidecar **первым**, до Chrome.
- `Debugger.setBreakpointByUrl` / `Debugger.setBreakpoint` ставят bp и резолвят (`Debugger.breakpointResolved`), но при попадании `Debugger.paused` доходит **флэйко**. Поэтому sidecar не ставит bp программно — это делает человек в IDE/Chrome.
- `Debugger.pause` (force-pause-now) работает надёжно — `POST /pause` им и пользуется.

## Проверка

```sh
bun run --filter @metafor/bun-debug typecheck
```

## Документация

- [Архитектура](docs/architecture.md)
- [Bun Inspector Protocol — заметки](docs/bun-inspector.md)
- [Snapshot и NDJSON API](docs/api.md)
- [Workflow WebStorm/Chrome](docs/workflow.md)
- [Acceptance сценарий](docs/acceptance.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Источники](docs/references.md)
