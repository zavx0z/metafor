# API Интерпретатора

Интерпретатор держит общий runtime/source-контекст человека и ИИ и имеет несколько технических интерфейсов:

- JSON snapshot file
- REST API
- WebSocket `/ws`
- stdin/stdout NDJSON command stream

## Snapshot File

Dump пишется атомарно:

```text
write tmp file -> rename tmp to final path
```

Это позволяет читать JSON без race с частичной записью.

Default package path:

```text
.metafor/interpreter/state.json
```

## Snapshot Shape

```ts
type InterpreterDump = {
  timestamp: string
  reason: string
  hitBreakpoints: string[]
  frames: Array<{
    index: number
    function: string
    url: string
    line: number
    column: number
    scriptId?: string
    callFrameId?: string
    scopes: {
      local: ScopeSnapshot[]
      closure: ScopeSnapshot[]
    }
  }>
}
```

Ограничения snapshot:

- максимум top 5 frames
- scope properties раскрываются только для top frame
- раскрываются только `local` и `closure` scopes
- object previews не являются глубоким object graph

Для глубокого чтения использовать `eval` или `props`.

## REST API

Default:

```text
http://127.0.0.1:6500
```

Основные routes:

```text
GET    /health
GET    /sessions
POST   /sessions/run
POST   /sessions/:id/stop
POST   /sessions/:id/command
GET    /state
GET    /frames
GET    /scripts
GET    /events?since=<iso|seq>&limit=<n>
GET    /console?since=<iso|seq>&limit=<n>
GET    /workspace/files?q=<text>&limit=<n>
GET    /source?scriptId=<id>
GET    /target
POST   /target/run
POST   /target/stop
GET    /breakpoints
POST   /breakpoint
DELETE /breakpoint
POST   /eval
POST   /props
POST   /pause
POST   /resume
POST   /step
POST   /inspector
```

`GET /sessions`:

```json
{
  "sessions": [
    {
      "id": "default",
      "label": "process 1",
      "inspectorUrl": "ws://127.0.0.1:6499/",
      "connection": {"state": "connected", "error": null},
      "paused": false,
      "scriptCount": 12,
      "hasDump": false,
      "target": {"state": "running", "pid": 12345, "command": ["bun", "..."]}
    }
  ]
}
```

`POST /sessions/run` создаёт новый процесс со своим socket endpoint:

```json
{
  "label": "syntax",
  "command": ["bun", "test", "pkg/interpreter/src/syntax.test.ts"],
  "pauseOnStart": false
}
```

Команды в конкретный session:

```json
{"cmd":"resume","params":{}}
```

`POST /target/run`:

```json
{
  "command": ["bun", "test", "--timeout=2147483647", "./module.spec.ts"],
  "cwd": "/absolute/path/to/metafor",
  "pauseOnStart": false,
  "breakpoints": [
    {"url": "/absolute/path/to/metafor/module.ts", "line": 46}
  ]
}
```

Если `command` не содержит `--inspect*`, sidecar добавляет inspector flag сам:

- `pauseOnStart: true` -> `--inspect-brk=<BUN_INSPECTOR_URL>`
- `pauseOnStart: false` -> `--inspect-wait=<BUN_INSPECTOR_URL>`

Если `command` уже содержит `--inspect`, `--inspect-wait` или `--inspect-brk`, выбранный режим сохраняется, endpoint подставляется из `BUN_INSPECTOR_URL`.

`GET /workspace/files`:

```json
{
  "root": "/absolute/path/to/metafor",
  "files": [
    {"path": "app/example.ts"},
    {"path": "pkg/example/example.spec.ts"}
  ]
}
```

Этот endpoint используется стартовым экраном интерпретатора для выбора target-файла. Сервер возвращает JS/TS entrypoints из workspace и пропускает `node_modules`, build output и `.d.ts`.

Breakpoint shape:

```ts
type BreakpointSpec = {
  url?: string
  urlRegex?: string
  line: number
  column?: number
  condition?: string
}
```

`line` — 1-based строка исходного файла, как в редакторе.
`column` — 0-based колонка.
Sidecar переводит координаты через `sourceMapURL` из `Debugger.scriptParsed`.

`POST /breakpoint` добавляет breakpoint к уже подключённому target:

```json
{"url": "/absolute/path/to/metafor/module.ts", "line": 46}
```

`DELETE /breakpoint` принимает id регистрации или конкретный Bun `breakpointId`:

```json
{"id": "interpreter-bp-1"}
```

```json
{"breakpointId": "146:26:0"}
```

## WebSocket `/ws`

`/ws` отдаёт real-time события UI интерпретатора:

- `hello`
- `sessions`
- `session`
- `session-state`
- `session-resumed`
- `session-connection`
- `session-target`
- `connection`
- `state`
- `resumed`
- `script`
- `console`
- `inspector-event`
- `interpreter-event`
- `target`
- `result`

Client может отправлять:

```json
{"type":"command","cmd":"eval","params":{"frame":0,"expr":"wimp.src"},"requestId":1}
```

Для команды в конкретный session добавить `sessionId`:

```json
{"type":"command","sessionId":"syntax","cmd":"resume","params":{},"requestId":2}
```

`hello` включает `target` snapshot и `sessions`, поэтому UI не показывает стартовый экран, если target уже
запущен до открытия страницы, и сразу создаёт несколько `UIDisplay` для нескольких процессов.

## Scope Properties

Bun/JSC отдаёт scopes как `DebuggerScope`.
Для них `Runtime.getProperties({ ownProperties: true })` часто пустой.

Поэтому sidecar использует:

```text
Runtime.getDisplayableProperties
```

Fallback:

```text
Runtime.getProperties
```

## NDJSON Формат

Одна строка stdin — одна команда:

```json
{"cmd":"frames"}
```

Одна строка stdout — один ответ:

```json
{"seq":1,"ok":true,"cmd":"frames","result":{}}
```

Общий shape ответа:

```ts
{
  seq: number
  ok: boolean
  cmd?: string
  id?: unknown
  result?: unknown
  error?: string
}
```

Если команда содержит `id`, ответ повторяет его:

```json
{"id":"req-1","cmd":"frames"}
```

Ответ:

```json
{"seq":1,"ok":true,"id":"req-1","cmd":"frames","result":{}}
```

## Команда frames

```json
{"cmd":"frames"}
```

Возвращает:

- `paused`
- raw cached `frames`
- последний `dump`

## Команда eval

```json
{"cmd":"eval","frame":0,"expr":"wimp.children.length"}
```

Требования:

- target paused
- `frame` указывает на существующий cached call frame
- `callFrameId` ещё валиден

Использует:

```text
Debugger.evaluateOnCallFrame
```

Пример успешного ответа:

```json
{"seq":1,"ok":true,"cmd":"eval","result":{"result":{"type":"number","value":3,"description":"3"},"wasThrown":false}}
```

## Команда props

```json
{"cmd":"props","objectId":"{\"injectedScriptId\":1,\"id\":7}"}
```

Default:

```json
{"ownProperties":true}
```

Для inherited/synthetic properties:

```json
{"cmd":"props","objectId":"...","ownProperties":false}
```

## Команда pause

```json
{"cmd":"pause"}
```

Отправляет:

```text
Debugger.pause
```

## Команда step

```json
{"cmd":"step","kind":"over"}
{"cmd":"step","kind":"into"}
{"cmd":"step","kind":"out"}
```

Mapping:

```text
over -> Debugger.stepNext
into -> Debugger.stepInto
out  -> Debugger.stepOut
```

## Команда resume

```json
{"cmd":"resume"}
```

Отправляет:

```text
Debugger.resume
```

## Важное Про Валидность Id

`callFrameId` и `objectId` валидны только пока VM paused.
После `resume`, `stepOver`, `stepInto`, `stepOut` старые id могут стать stale.

Если нужно продолжить читать state после step, дождаться нового `Debugger.paused` и нового dump.
