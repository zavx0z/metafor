# API Интерпретатора

Интерпретатор - одна среда совместной разработки человека, AI-агента, голоса и host-клиентов. Внутри среды есть `HUD` и `Space`, но внешний API не строится вокруг UI. Единица исполнения называется `process`.

## Базовая Модель

```text
Interpreter
  HUD
    terminal
    voice/status
    todo
    sqlite
  Space
    viewpoint
    displays[]              # визуальные поверхности
  processes[]               # исполняемые процессы
    content: module | browser | actor
    context: source/cursor/selection/frame/scopes/terminal
    breakpoints[]
```

`process` - текущий live-запуск кода. Сейчас это отдельный Bun process с `pid`, inspect target, lifecycle `start/stop/restart`, своим stack/scopes/source и своими breakpoints. В будущей actor-модели это же имя остается корректным: actor/process будет исполняемой сущностью, а не UI display.

`display` - только визуальная поверхность в `Space`. Через display можно сфокусировать или разложить рабочие поверхности, но разработческие действия идут через `/processes/:id/...`.

`module` - source/code unit. Module catalog живет внутри process context: `/processes/:id/modules`.

## REST

Base URL:

```text
http://127.0.0.1:6500
```

Основные routes:

```text
GET    /health
GET    /context

GET    /space
POST   /space/focus
POST   /space/frame

GET    /processes
POST   /processes
POST   /processes/resolve
POST   /processes/focus
GET    /processes/:id
DELETE /processes/:id
POST   /processes/:id/focus
GET    /processes/:id/context
GET    /processes/:id/modules?q=<text>&limit=<n>
GET    /processes/:id/source?scriptId=<id>&sourceUrl=<url>
POST   /processes/:id/source
POST   /processes/:id/apply_patch
GET    /processes/:id/breakpoints
POST   /processes/:id/breakpoint
DELETE /processes/:id/breakpoint
POST   /processes/:id/action

GET    /hud/terminal
POST   /hud/terminal/show
POST   /hud/terminal/dock
POST   /hud/terminal/toggle
WS     /hud/terminal/stream
GET    /hud/terminal/sessions

GET    /hud/todo
PUT    /hud/todo
POST   /hud/todo/items
PATCH  /hud/todo/items/:id
DELETE /hud/todo/items/:id
GET    /hud/todo/panel
POST   /hud/todo/highlight
POST   /hud/todo/show
POST   /hud/todo/dock
POST   /hud/todo/toggle

GET    /hud/sqlite
POST   /hud/sqlite/show
POST   /hud/sqlite/dock
POST   /hud/sqlite/toggle
GET    /sqlite?path=<file.sqlite>&table=<name>
POST   /sqlite/open
POST   /sqlite/cell

GET    /events?since=<iso|seq>&limit=<n>
GET    /console?since=<iso|seq>&limit=<n>
```

## Текущий Context

`GET /context` возвращает один текущий context: то, что сейчас активно видно или выбрано в среде. Это главный endpoint для запроса вроде "смотри на значение".

```json
{
  "ok": true,
  "kind": "process",
  "processId": "dark-server.spec.ts",
  "moduleId": "dark-server.spec.ts",
  "label": "dark/server.spec.ts",
  "context": {
    "processId": "dark-server.spec.ts",
    "moduleId": "dark-server.spec.ts",
    "displayId": "module:dark-server.spec.ts",
    "origin": "ui",
    "display": {"active": true, "visible": true, "order": 0},
    "source": {
      "state": "paused",
      "location": "r/dark/server.ts:41",
      "cursor": {"line": 41, "column": 0},
      "selection": null
    },
    "currentFrame": {"index": 0, "url": "r/dark/server.ts", "line": 41, "column": 5},
    "scopes": {"expanded": [], "detail": null},
    "terminal": {"focused": false, "pendingInput": "", "promptVisible": true},
    "hud": {
      "todo": {
        "path": "/repo/TODO.md",
        "highlightedIds": ["todo:abc123"],
        "highlightedItems": [
          {"kind": "task", "line": 12, "text": "Сделать Boundary adapter", "checked": false}
        ],
        "highlightedText": "- [ ] Сделать Boundary adapter"
      },
      "sqlite": {
        "activeId": "boundary-vsor4",
        "docked": false,
        "path": "/repo/dark/tmp/boundary.sqlite",
        "label": "dark/tmp/boundary.sqlite",
        "selectedTable": "actor",
        "ready": true,
        "loading": false,
        "selectedRowIds": ["rowid:13"],
        "selectedRowCount": 1,
        "selectedRows": [
          {
            "rowId": "rowid:13",
            "rowIndex": 12,
            "rowid": 13,
            "values": {"__rowid": 13, "uuid": "57afa333-fa6b-4875-8cca-42dbf476ed51"}
          }
        ],
        "selectionTruncated": false
      }
    }
  }
}
```

Позиции в `source.cursor` и `source.selection`: `line` - 1-based, `column` - 0-based. `selection.end.column` end-exclusive.

`context.hud.todo` - состояние HUD ToDoPane. `highlightedItems` содержит пункты `TODO.md`, которые человек подсветил в панели, чтобы агент понимал, о чем сейчас речь. Это состояние панели, а не данные файла.

`context.hud.sqlite` - компактное состояние SQLite HUD. В context попадают активная база, таблица и выбранные человеком строки. Это не dump базы и не полный payload таблицы: `selectedRows` ограничен первыми 20 выбранными строками, а при превышении лимита выставляется `selectionTruncated:true`.

`origin:"ui"` означает, что context пришел от UI-host и включает реальные caret, selection и scopes detail. `origin:"runtime"` означает fallback из текущей точки исполнения.

## TODO HUD

`GET /hud/todo` читает корневой `TODO.md` и возвращает Markdown плюс parsed items для HUD ToDoPane:

```json
{"ok": true, "path": "/repo/TODO.md", "mtimeMs": 1710000000000, "size": 1024, "text": "# MetaFor TODO\n", "items": []}
```

Данные TODO хранятся в файле: текст пунктов и markdown checkbox `- [ ]` / `- [x]`. Подсветка строки хранится как состояние HUD-панели и попадает в `context.hud.todo.highlightedItems`.

Редактирование файла:

```text
PUT    /hud/todo                # {text}
POST   /hud/todo/items          # {text, kind?: "task"|"note"|"heading", checked?, depth?, afterId?}
PATCH  /hud/todo/items/:id      # {text?, checked?}
DELETE /hud/todo/items/:id
```

Состояние панели:

```text
GET    /hud/todo/panel
POST   /hud/todo/highlight      # {id} или {ids:[...]}
POST   /hud/todo/show|dock|toggle
```

## SQLite HUD

CLI args, заканчивающиеся на `.sqlite`, считаются входами SQLite HUD, а не runnable modules. HUD можно открыть до появления файла базы: UI ждет, пока runtime создаст файл, и перечитывает payload.

```text
GET    /hud/sqlite
POST   /hud/sqlite/show
POST   /hud/sqlite/dock
POST   /hud/sqlite/toggle
GET    /sqlite?path=<file.sqlite>&table=<name>
POST   /sqlite/open
POST   /sqlite/cell
```

`GET /hud/sqlite` возвращает состояние панели, включая активную базу, `rect`, `dockPlacement`, список открытых баз и выбранные строки текущей таблицы.

`GET /sqlite?path=<file.sqlite>&table=<name>` возвращает tables, schema и rows для просмотра таблицы. `POST /sqlite/open` с `{"path":"dark/tmp/boundary.sqlite"}` открывает базу в HUD.

`POST /sqlite/cell` редактирует одну ячейку по SQLite `rowid`:

```json
{"path":"/repo/dark/tmp/boundary.sqlite","table":"actor","rowid":13,"column":"position","value":1}
```

Views считаются read-only. В UI один клик выбирает строку целиком, `Shift` выбирает диапазон, `Cmd` на macOS и `Ctrl` на других системах добавляют или снимают отдельные строки. Редактирование ячейки открывается двойным кликом по editable cell.

## Space

`GET /space` возвращает визуальное состояние среды:

```json
{
  "ok": true,
  "command": "space.get",
  "result": {
    "mode": "far",
    "activeDisplayId": "module:dark-server.spec.ts",
    "displays": [
      {
        "displayId": "module:dark-server.spec.ts",
        "kind": "module",
        "moduleId": "dark-server.spec.ts",
        "label": "dark/server.spec.ts",
        "order": 0,
        "visible": true,
        "active": true,
        "screenRect": {"x": 0, "y": 0, "w": 1920, "h": 1088}
      }
    ]
  }
}
```

Selectors для `/space/focus`, `/processes/resolve` и `/processes/focus`:

```json
{"selector":{"processId":"dark-server.spec.ts"}}
{"selector":{"moduleId":"dark-server.spec.ts"}}
{"selector":{"side":"left"}}
{"selector":{"label":"dark/server.spec.ts"}}
{"selector":{"order":0}}
```

Фокус рабочей поверхности не меняет host terminal HUD. Терминал меняется только через `/hud/terminal/*` или при явном `dockHostTerminal:true`.

## Processes

`GET /processes` возвращает список исполняемых процессов:

```json
{
  "processes": [
    {
      "id": "dark-server.spec.ts",
      "processId": "dark-server.spec.ts",
      "moduleId": "dark-server.spec.ts",
      "label": "dark/server.spec.ts",
      "space": {"displayId": "module:dark-server.spec.ts"},
      "content": {"kind": "module", "modulePath": "dark/server.spec.ts"},
      "runtime": {"paused": true, "scriptCount": 12}
    }
  ]
}
```

`GET /processes/:id` возвращает рабочий payload process: `content`, `runtime`, `ui` и `capabilities`.

`DELETE /processes/:id` останавливает runtime process, удаляет его из списка процессов и синхронизирует UI так, чтобы display этого module исчез из Space.

API-редактирование source через `POST /processes/:id/source` или `POST /processes/:id/apply_patch` рассылает `source-patched`. UI process display с этим `:id` должен открыть первый измененный не-delete файл в source editor, раскрыть и выделить его в file tree и поставить cursor на первую измененную строку (`lineChanges[0].newStart`, иначе строка 1). Если в редакторе есть несохраненные изменения или идет сохранение, авто-переход пропускается, чтобы не перетереть локальный dirty state.

`POST /processes` запускает новый process:

```json
{
  "processId": "syntax",
  "label": "pkg/interpreter/src/syntax.test.ts",
  "command": ["bun", "test", "pkg/interpreter/src/syntax.test.ts"],
  "pauseOnStart": true
}
```

Если в `command` нет `--inspect*`, интерпретатор добавляет protocol flag:

- `pauseOnStart: true` -> `--inspect-brk=<module-url>`
- `pauseOnStart: false` -> `--inspect-wait=<module-url>`

## Действия Process

`POST /processes/:id/action` выполняет действие в конкретном process:

```sh
curl -sS -X POST 'http://127.0.0.1:6500/processes/dark-server.spec.ts/action' \
  -H 'content-type: application/json' \
  -d '{"action":"step","params":{"kind":"over"}}'
```

Поддерживаемые действия:

- `pause`
- `resume`
- `step` с `params.kind`: `over`, `into`, `out`
- `evaluate` / `eval` с `params.expr` и опциональным `params.frame`
- `source.open` с `params.sourceUrl`, `params.path`, `params.modulePath` или `params.specifier`
- `source.openSelection`
- `restart`
- `stop`
- `close` / `delete` / `remove` - остановить process и убрать display module из Space
- `showExecutionPoint`

`evaluate` пишет выражение AI и результат в терминал process, чтобы человек видел общее действие.

## Каталог Кода

`GET /processes/:id/modules` возвращает каталог кода в контексте process: entrypoint, launch root и импортированные локальные source files. Каталог строится по import graph, включая workspace package imports, а не рекурсивным обходом всех файлов.

```json
{
  "ok": true,
  "processId": "dark-server.spec.ts",
  "kind": "module",
  "moduleId": "dark-server.spec.ts",
  "root": "/repo",
  "workspacePath": "",
  "entrypoint": "/repo/dark/server.spec.ts",
  "modules": [{"path":"dark/server.spec.ts"}, {"path":"dark/server.ts"}, {"path":"protocol.ts"}]
}
```

Чтение и редактирование source:

```text
GET  /processes/:id/source?scriptId=<id>&sourceUrl=<url>
POST /processes/:id/source       # JSON {sourceUrl, text}
POST /processes/:id/apply_patch  # raw apply_patch text/plain
```

`POST /processes/:id/source` и `POST /processes/:id/apply_patch` применяют изменения через серверную реализацию apply_patch, сдвигают точки останова process, рассылают `source-patched` и replay затронутых запусков, когда это нужно.

## Точки Останова

Точки останова принадлежат process, а не общему source module.

```text
GET    /processes/:id/breakpoints
POST   /processes/:id/breakpoint
DELETE /processes/:id/breakpoint
```

Форма breakpoint:

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

`line` - 1-based строка редактора. `column` - 0-based колонка. Интерпретатор переводит source-координаты через `sourceMapURL` из `Debugger.scriptParsed`.

`POST` и `DELETE` рассылают UI событие `breakpoints-changed`; редактор обновляет runtime registrations и localStorage specs из ответа process, поэтому внешний API не оставляет stale-маркер в gutter.

## SQLite

CLI-аргументы, заканчивающиеся на `.sqlite`, считаются входами display, а не запускаемыми process. Display можно создать до появления файла; UI ждет и повторяет чтение, пока runtime не создаст database.

```sh
bun --hot run pkg/interpreter/interpreter.ts \
  dark/server.spec.ts -timeout=2147483647 \
  boundary/server.spec.ts \
  dark/tmp/boundary.sqlite
```

SQLite routes:

```text
GET  /sqlite?path=<file.sqlite>&table=<name>
POST /sqlite/open
POST /sqlite/cell
```

`POST /sqlite/cell` редактирует одну ячейку обычной таблицы по SQLite `rowid`. Views остаются read-only.

## HUD Terminal

```text
GET  /hud/terminal
POST /hud/terminal/show
POST /hud/terminal/dock
POST /hud/terminal/toggle
WS   /hud/terminal/stream
GET  /hud/terminal/sessions
```

Используй terminal endpoints только для запросов к terminal HUD. Навигация по рабочим поверхностям идет через `/space/*`, действия исполнения - через `/processes/*`.

## WebSocket `/ws`

Внутренние WS events пока остаются `moduleId`-scoped, потому что текущий Bun runtime manager устроен вокруг запущенных module targets:

```json
{"type":"command","moduleId":"syntax","cmd":"resume","params":{},"requestId":2}
```

Публичный agent-facing API должен использовать REST routes `/context`, `/space` и `/processes/:id/...`.
