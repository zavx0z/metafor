# API Интерпретатора

Интерпретатор держит общий runtime/source-контекст человека и ИИ и имеет module-scoped интерфейсы:

- JSON snapshot file;
- REST API;
- WebSocket `/ws`.

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
GET    /modules/:id/breakpoints
POST   /modules/:id/breakpoint
DELETE /modules/:id/breakpoint
GET    /events?since=<iso|seq>&limit=<n>
GET    /console?since=<iso|seq>&limit=<n>
GET    /workspace/files?q=<text>&limit=<n>
```

## Agent UI API

Этот API предназначен для AI-агента, который управляет видимым UI без кликов по интерфейсу.

Routes:

```text
GET    /agent/displays
POST   /agent/displays/focus
POST   /agent/displays/frame
GET    /agent/terminal
POST   /agent/terminal/show
POST   /agent/terminal/dock
POST   /agent/terminal/toggle
```

`GET /agent/displays` возвращает режим пространства, активный display и список module `UIDisplay`:

```json
{
  "ok": true,
  "command": "displays.list",
  "result": {
    "mode": "far",
    "activeDisplayId": null,
    "displays": [
      {
        "displayId": "module:dark-server.spec.ts",
        "moduleId": "dark-server.spec.ts",
        "label": "dark/server.spec.ts",
        "order": 0,
        "visible": true,
        "active": false,
        "screenCenter": {"x": 548.5, "y": 544},
        "screenRect": {"x": 160, "y": 324, "w": 777, "h": 440}
      }
    ]
  }
}
```

`POST /agent/displays/focus` фокусирует один display. Selector можно задавать по стороне, id, module id, label или порядку:

```sh
curl -sS -X POST http://127.0.0.1:6500/agent/displays/focus \
  -H 'content-type: application/json' \
  -d '{"selector":{"side":"left"}}'
```

Другие selector shapes:

```json
{"selector":{"side":"right"}}
{"selector":{"displayId":"module:dark-server.spec.ts"}}
{"selector":{"moduleId":"dark-server.spec.ts"}}
{"selector":{"label":"dark/server.spec.ts"}}
{"selector":{"order":0}}
```

Важно: focus display не меняет host terminal HUD. Агент не должен сворачивать, раскрывать или переключать terminal pane при запросах вида "открой левый дисплей". Терминал меняется только отдельными terminal endpoints или явным `dockHostTerminal:true`:

```sh
curl -sS -X POST http://127.0.0.1:6500/agent/displays/focus \
  -H 'content-type: application/json' \
  -d '{"selector":{"side":"left"},"dockHostTerminal":true}'
```

`POST /agent/displays/frame` возвращает обзор всех module displays:

```sh
curl -sS -X POST http://127.0.0.1:6500/agent/displays/frame -d '{}'
```

`GET /agent/terminal` возвращает состояние host terminal HUD:

```json
{
  "ok": true,
  "command": "terminal.get",
  "result": {
    "docked": false,
    "sessionId": "21534e34-5b71-409a-97e4-98557f18f02c",
    "status": "connected",
    "statusLabel": "restored zsh",
    "rect": {"x": 643, "y": 60, "w": 755, "h": 943},
    "dockPlacement": {"edge": "top", "offset": 858}
  }
}
```

Terminal HUD commands:

```sh
curl -sS -X POST http://127.0.0.1:6500/agent/terminal/show -d '{}'
curl -sS -X POST http://127.0.0.1:6500/agent/terminal/dock -d '{}'
curl -sS -X POST http://127.0.0.1:6500/agent/terminal/toggle -d '{}'
```

`GET /modules`:

```json
{
  "modules": [
    {
      "id": "pkg-interpreter-src-syntax.test.ts",
      "label": "pkg/interpreter/src/syntax.test.ts",
      "protocolUrl": "ws://127.0.0.1:6512/",
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

UI-кнопка “Перезапустить модуль” поверх этого API всегда использует интерактивный режим: удаляет старый `--inspect*` из сохранённой команды и отправляет `pauseOnStart: true`.

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

Breakpoint-ы всегда принадлежат конкретному модулю.

`GET /modules/:id/breakpoints` возвращает registrations модуля.

`POST /modules/:id/breakpoint` добавляет breakpoint:

```json
{"url": "/absolute/path/to/metafor/module.ts", "line": 46}
```

`DELETE /modules/:id/breakpoint` принимает id регистрации или конкретный Bun `breakpointId`:

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
- `module-protocol-event`
- `interpreter-event`
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
