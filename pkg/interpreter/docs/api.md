# API Интерпретатора

Интерпретатор держит общий runtime/source-контекст человека и ИИ и имеет несколько интерфейсов:

- JSON snapshot file;
- REST API;
- WebSocket `/ws`;
- stdin/stdout NDJSON command stream.

## Snapshot

Default path:

```text
.metafor/interpreter/state.json
```

Shape:

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

## REST

Default:

```text
http://127.0.0.1:6500
```

Основные routes:

```text
GET    /health
GET    /modules
POST   /modules/run
POST   /modules/:id/run
POST   /modules/:id/stop
POST   /modules/:id/command
GET    /modules/:id/source
GET    /state
GET    /frames
GET    /scripts
GET    /events?since=<iso|seq>&limit=<n>
GET    /console?since=<iso|seq>&limit=<n>
GET    /workspace/files?q=<text>&limit=<n>
GET    /source?scriptId=<id>
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

`GET /modules`:

```json
{
  "modules": [
    {
      "id": "pkg-interpreter-src-syntax.test.ts",
      "label": "pkg/interpreter/src/syntax.test.ts",
      "inspectorUrl": "ws://127.0.0.1:6512/",
      "connection": {"state": "connected", "error": null},
      "paused": true,
      "scriptCount": 204,
      "hasDump": true,
      "target": {"state": "running", "pid": 12345, "command": ["bun", "test", "..."]}
    }
  ]
}
```

`POST /modules/run` создаёт новый модуль со своим protocol endpoint:

```json
{
  "id": "syntax",
  "label": "pkg/interpreter/src/syntax.test.ts",
  "command": ["bun", "test", "pkg/interpreter/src/syntax.test.ts"],
  "pauseOnStart": true
}
```

Команда в конкретный модуль:

```sh
curl -sS -X POST http://127.0.0.1:6500/modules/syntax/command \
  -H 'content-type: application/json' \
  -d '{"cmd":"resume","params":{}}'
```

Если `command` не содержит `--inspect*`, интерпретатор добавляет protocol flag сам:

- `pauseOnStart: true` -> `--inspect-brk=<module-url>`
- `pauseOnStart: false` -> `--inspect-wait=<module-url>`

Если `command` уже содержит `--inspect`, `--inspect-wait` или `--inspect-brk`, выбранный режим сохраняется, endpoint подставляется из URL модуля.

## Breakpoints

Breakpoint shape:

```ts
type BreakpointSpec = {
  url?: string
  sourceUrl?: string
  urlRegex?: string
  line: number
  column?: number
  condition?: string
}
```

`line` — 1-based строка исходного файла, как в редакторе. `column` — 0-based колонка. Интерпретатор переводит координаты через `sourceMapURL` из `Debugger.scriptParsed`.

`POST /breakpoint` добавляет breakpoint к подключённому модулю:

```json
{"url": "/absolute/path/to/metafor/module.ts", "line": 46}
```

`DELETE /breakpoint` принимает id регистрации или конкретный Bun `breakpointId`:

```json
{"id": "interpreter-bp-1"}
```

## WebSocket `/ws`

`/ws` отдаёт real-time события UI:

- `hello`
- `modules`
- `module`
- `module-state`
- `module-resumed`
- `module-connection`
- `module-target`
- `connection`
- `state`
- `resumed`
- `script`
- `console`
- `inspector-event`
- `module-inspector-event`
- `interpreter-event`
- `target`
- `result`

Команда в модуль:

```json
{"type":"command","moduleId":"syntax","cmd":"resume","params":{},"requestId":2}
```

`hello` включает `modules`, поэтому UI сразу создаёт несколько `UIDisplay` для нескольких модулей.

## Scope Properties

Bun/JSC отдаёт scopes как `DebuggerScope`. Для них `Runtime.getProperties({ ownProperties: true })` часто пустой.

Интерпретатор использует:

```text
Runtime.getDisplayableProperties
```

Fallback:

```text
Runtime.getProperties
```

## NDJSON

Одна строка stdin — одна команда:

```json
{"cmd":"frames"}
```

Одна строка stdout — один ответ:

```json
{"seq":1,"ok":true,"cmd":"frames","result":{}}
```
