# Правила Пакета Interpreter

Этот файл задает локальные правила разработки для `pkg/interpreter`. Следуй им при каждом изменении внутри пакета.

Документация и правила пакета пишутся на русском. Технические имена endpoint, типов, команд и protocol methods оставляются как literal identifiers.

## Модель Продукта

`@metafor/interpreter` - live-интерпретатор MetaFor. Это не wrapper вокруг WebStorm, Chrome DevTools или отдельного debugger UI.

Смысл продукта: человек и AI находятся в одном живом runtime/source-контексте, видят execution point, source, stack, scopes, terminal/output, события, могут ставить точки останова, выполнять step/evaluate и менять код во время работы.

Protocol names вроде `Debugger.paused`, `Debugger.scriptParsed`, `Runtime.getProperties` и Bun inspect flags - внутренние детали adapter-слоя. В adapter-коде, низкоуровневых tests и raw event streams их можно использовать. В пользовательских labels, docs, logs для людей и UI-controls используй язык интерпретатора: process, Space, display, module, expression, execution point, breakpoint.

## Interpreter / HUD / Space / Process

Интерпретатор один. Внутри него есть глобальный `HUD` и один WebGPU `Space`.

`Space` содержит независимые `UIDisplay`. Display - визуальная поверхность. Он не является единицей исполнения.

`Process` - основной адрес действий агента. Сейчас это live-запуск Bun process с `pid`, inspect target, source context, stack/scopes, terminal и breakpoints. Позже тот же термин покрывает actor/process MetaFor.

В Space нет привилегированных display:

- нет default display;
- нет primary/main display;
- нет default session;
- нет глобального selected module;
- нет глобального active interpreter, который меняет другой display;
- нет panel toggle, который открывает/закрывает одну панель сразу на нескольких displays;
- нет focus stealing между displays;
- нет логики, которая считает левый display особенным;
- нет общих terminal, events, breakpoints, source, frame, scope или toolbar state между displays.

Если запущены два модуля, это два независимых processes, отображенных на двух независимых surfaces в одном 3D `Space`. Browser layout - только текущий host. Будущие XR/mobile/desktop hosts должны уметь встроить те же surfaces как независимые поверхности.

Состояние, относящееся к одному display, должно быть keyed by `displayId`/`moduleId` или принадлежать `ModuleDisplayController`:

- toolbar state;
- source state;
- stack/frame state;
- scopes state;
- terminal buffer и terminal input state;
- events/verbose visibility и scroll state;
- breakpoint markers и pending breakpoint lines;
- active command state;
- focus/caret restoration.

Не добавляй package-level mutable UI state, если это не действительно глобальный host state. Locale глобален. WebSocket connection к interpreter host глобален. Module/display UI state не глобален.

## Привязка К Process

Все agent-facing runtime-действия привязаны к process:

- REST paths используют основной маршрут `/processes/:id/...`;
- source loading выполняется в контексте process;
- breakpoints хранятся и применяются для runtime конкретного process;
- command replies обновляют только process/display, в котором выполнялась команда;
- protocol events с `moduleId` уходят только в owning process/display.

Runtime-действия адресуются через process. `module` - source/code unit. Каталог кода process доступен как `/processes/:id/modules`.

## Правило Инструментов

Если человек и агент совместно работают над кодом, открытым или запущенным в интерпретаторе, этот код обновляется **только через API интерпретатора**. Это строгое правило, а не рекомендация.

Перед правкой кода:

1. Считай interpreter API рабочим по умолчанию. Не вызывай `GET /health` как обычный preflight; используй его только для диагностики после ошибки API, отсутствующего process, рестарта/закрытия или неизвестного контекста.
2. Прочитай `GET /context` и определи `processId`, `source.identity.sourceUrl` / `source.identity.scriptUrl`.
3. Если изменяемый файл относится к текущему process/display, открыт в source интерпретатора или работа явно идёт в текущей interpreter/debugger-сессии, не используй локальный `apply_patch`, `sed`, shell-write, редактор или форматтер для записи файла.
4. Применяй изменение только через:
   - `POST /processes/:id/apply_patch` для raw `apply_patch`;
   - `POST /processes/:id/source` для сохранения полного текста source.
5. После правки проверь, что интерпретатор получил изменение: `source-patched`, replay/restart при необходимости, новый `/context` или `GET /processes/:id/source`.

Причина: только interpreter source API сдвигает breakpoints, рассылает `source-patched`, обновляет source cache/display и сохраняет связь runtime/source context. Правка в обход API оставляет UI и текущий runtime на старом source snapshot.

Документацию, правила, внешние meta-файлы и код, который не является текущим совместно отлаживаемым process, можно править обычными локальными инструментами только когда работа не идёт внутри активной interpreter/debugger-сессии. Если интерпретатор запущен и текущая работа идёт через него, сначала используй interpreter API; локальный fallback допустим только после явной проверки, что API не может адресовать файл, и после сообщения пользователю.

## REST API Интерпретатора

Base URL:

```text
http://127.0.0.1:6500
```

Перед действием читай текущую ситуацию:

```sh
curl -s http://127.0.0.1:6500/context
curl -s http://127.0.0.1:6500/space
```

`GET /context` - главный endpoint для запроса "что сейчас видно/выделено". Он возвращает один текущий active context, а не полный dump всех runtime.

`context.hud.todo` содержит текущее состояние HUD ToDoPane: подсвеченные человеком пункты `TODO.md`, чтобы агент понимал, о чем речь. Подсветка - состояние панели, не данные файла.

TODO HUD API:

- `GET /hud/todo` читает корневой `TODO.md` и parsed items.
- `PUT /hud/todo` заменяет файл целиком.
- `POST /hud/todo/items` добавляет пункт.
- `PATCH /hud/todo/items/:id` меняет текст пункта или markdown checkbox `checked`.
- `DELETE /hud/todo/items/:id` удаляет пункт.
- `POST /hud/todo/highlight` подсвечивает пункт в HUD для `context.hud.todo.highlightedItems`.

Process API:

- `GET /processes` возвращает live processes.
- `POST /processes` запускает новый process.
- `POST /processes/resolve` находит process по selector и текущему Space.
- `POST /processes/focus` фокусирует surface process в Space.
- `GET /processes/:id` возвращает рабочий payload process: content, runtime status, текущий UI context, tail терминала и capabilities.
- `GET /processes/:id/context` возвращает текущий source/frame/scope/terminal context одного process.
- `GET /processes/:id/modules` возвращает import graph каталога кода process от entrypoint и workspace package imports.
- `GET /processes/:id/source` читает source в контексте process.
- `POST /processes/:id/source` сохраняет source через серверный apply_patch flow.
- `POST /processes/:id/apply_patch` принимает raw `apply_patch` text/plain для process.
- `GET /processes/:id/breakpoints` возвращает точки останова process.
- `POST /processes/:id/breakpoint` ставит точку останова в process.
- `DELETE /processes/:id/breakpoint` удаляет точку останова из process.
- `POST /processes/:id/action` выполняет process action.

API-редактирование source:

- `POST /processes/:id/source` и `POST /processes/:id/apply_patch` после успешной правки должны приводить UI к отредактированному файлу в process display `:id`.
- На `source-patched` открывай первый измененный не-delete файл в source editor, раскрывай/выделяй его в file tree и ставь cursor на первую измененную строку (`lineChanges[0].newStart`, fallback строка 1).
- Не перетирай локальный dirty editor: если target source dirty или saving, авто-переход нужно пропустить.

Space API:

- `GET /space` возвращает `mode`, `activeDisplayId` и `displays[]`.
- `POST /space/focus` фокусирует рабочую поверхность.
- `POST /space/frame` возвращает обзор всех surfaces.

Поддерживаемые process actions:

- `pause`
- `resume`
- `step` с `params.kind`: `over`, `into`, `out`
- `evaluate` / `eval` с `params.expr` и опциональным `params.frame`
- `source.open` с `params.sourceUrl`, `params.path`, `params.modulePath` или `params.specifier`
- `source.openSelection`
- `restart`
- `stop`
- `showExecutionPoint`

`evaluate` пишет выражение и результат агента в terminal process, чтобы человек видел общее действие.

Для совместной работы с конкретным process используй `/context`, затем `/processes/:id/*`:

```sh
curl -sS http://127.0.0.1:6500/context

curl -sS -X POST 'http://127.0.0.1:6500/processes/dark-server.spec.ts/action' \
  -H 'content-type: application/json' \
  -d '{"action":"evaluate","params":{"expr":"globalThis.location","frame":0}}'
```

SQLite HUD API:

- CLI args ending with `.sqlite` считаются входами SQLite HUD, а не runnable modules.
- HUD можно открыть до появления файла базы; UI ждет и повторяет чтение, пока runtime не создаст `.sqlite`.
- `GET /sqlite?path=<file.sqlite>&table=<name>` возвращает tables, schema и rows.
- `POST /sqlite/open` с `{"path":"dark/tmp/boundary.sqlite"}` открывает database в SQLite HUD.
- `GET /hud/sqlite` возвращает состояние SQLite HUD; `/hud/sqlite/dock|show|toggle` управляют сворачиванием.
- `POST /sqlite/cell` с `{"path","table","rowid","column","value"}` редактирует одну ячейку по SQLite `rowid`. Views read-only.
- UI-выделение в SQLite таблице построчное: один клик выбирает всю строку, `Shift` выбирает диапазон, `Cmd/Ctrl` добавляет или снимает отдельные строки, двойной клик по editable cell открывает редактор.
- `context.hud.sqlite` содержит активную базу, выбранную таблицу и компактный snapshot выбранных строк (`selectedRowIds`, `selectedRowCount`, `selectedRows`, `selectionTruncated`). Не клади в context весь SQLite payload или все rows таблицы.

Display selectors:

```json
{"selector":{"side":"left"}}
{"selector":{"side":"right"}}
{"selector":{"displayId":"module:dark-server.spec.ts"}}
{"selector":{"moduleId":"dark-server.spec.ts"}}
{"selector":{"label":"dark/server.spec.ts"}}
{"selector":{"order":0}}
```

Focus в Space не меняет host terminal HUD. Не dock/hide/show/toggle terminal при запросах вида "открой левый display". Терминал меняется только через terminal endpoints или при явном `dockHostTerminal:true`.

Terminal HUD API:

- `GET /hud/terminal` возвращает `docked`, `sessionId`, `status`, `statusLabel`, `rect` и `dockPlacement`.
- `POST /hud/terminal/show` раскрывает host terminal HUD.
- `POST /hud/terminal/dock` докает/прячет host terminal HUD.
- `POST /hud/terminal/toggle` переключает состояние.
- `WS /hud/terminal/stream` - host PTY stream для browser host.
- `GET /hud/terminal/sessions` возвращает diagnostics host PTY sessions.

Используй terminal endpoints только для terminal requests. Если пользователь просит визуальный переход, вызывай только `/space/*`; если просит действие исполнения, вызывай `/processes/*`.

## UI Architecture

`web/main.ts` - browser host/controller layer. Он создает `UiRuntime`, maps processes/modules to `UIDisplay` и wires process-scoped snapshots to panes.

Pane classes under `web/*-pane.ts` должны оставаться reusable и display-local. Pane не должен читать или менять state другого module display.

Generic panes under `ui/panes` не должны знать interpreter-specific concepts. Например, `TerminalPane` может знать terminal buffers, ANSI, keyboard input, focus и caret behavior, но не должен знать module state, breakpoints, Bun, protocol commands или interpreter snapshots. Interpreter-specific terminal behavior живет в `pkg/interpreter/web/main.ts` или package-local helper.

Browser page - только host одного WebGPU canvas. Не добавляй hidden/default runtime surfaces для interpreter content. Interpreter panels должны быть attached к module `UIDisplay`.

## Terminal Input

Module terminal является одновременно module output и expression input.

Expression input интерпретатора должен жить в terminal, а не в отдельной Eval panel. Пользовательский язык - "expression"; internal command names могут оставаться `eval`, когда это напрямую мапится на protocol behavior.

Terminal input доступен только owning module, когда module:

- connected;
- paused;
- has current dump/frame context;
- has not exited or failed;
- is not already running another command.

Terminal focus/caret behavior display-local. Click/focus одного module terminal не должен focus/enable input другого terminal. После reload восстанавливай focus только ранее focused module terminal, а не первый/левый display.

Focused input caret blinking разрешен. Не добавляй render loops или timer repaint work вне focused input caret behavior.

## Rendering Rules

MetaFor UI engine request-render based. Не добавляй continuous render loops, periodic repaint timers или repeated diagnostic repaints. Repaint только от state changes, input events, WebSocket/module events, resize/layout changes или focused input caret blink.

После browser reload или hot reload серый canvas на моментальном screenshot может означать, что WebGPU еще не presented. Подожди перед выводом, что UI blank. Не добавляй permanent repaint logic ради раннего screenshot.

При screenshot tests жди стабилизации UI перед capture. Для Chrome automation используй local Chrome service и exact browser window/tab.

## CLI И Запуск

Root package script - supported entrypoint:

```sh
bun run interpreter
```

Запуск modules через interpreter поддерживает relative и absolute paths:

```sh
bun run interpreter ./module.ts
bun run interpreter ./module.spec.ts -timeout=2147483647
bun run interpreter dark/server.spec.ts -timeout=2147483647 pkg/interpreter/src/syntax.test.ts
```

CLI parsing rules:

- module paths передаются без `--module`;
- parameters начинаются с `-`;
- parameters между двумя module paths принадлежат предыдущему module;
- `-param=value` валиден;
- params перед первым module path невалидны;
- module id/label берется из launched module path, если явно не supplied через REST.

Default startup modules используют pause-on-start, чтобы пользователь успел поставить breakpoints до продолжения execution.

## Naming

В user-visible names используй interpreter terminology:

- interpreter;
- display;
- module;
- runtime;
- expression;
- execution point;
- breakpoint;
- event stream;
- terminal/output.

Избегай user-facing names:

- debugger;
- inspector;
- session default;
- default display;
- main display;
- attach to WebStorm.

Internal protocol references могут использовать точные protocol names, когда это необходимо.

## State And Persistence

Interpreter state пишется под `.metafor/interpreter/`. Per-display/module state должен жить под scoped ids/paths.

LocalStorage keys в UI должны быть scoped by module id/display id, если они влияют на один display. Shared LocalStorage keys допустимы только для truly global preferences вроде locale.

Никогда не используй `default` как module/session/display identifier.

## Breakpoints

Breakpoints process-scoped и должны matched against source identity owning process.

Editor gutter clicks в одном display могут set/remove breakpoints только для owning process. Badge counts и marker rendering должны использовать ту же process-scoped matching logic.

Используй logical source matching helpers из `web/breakpoint-matching.ts` и source map helpers из `src/source-map.ts`; не возвращай ad hoc global breakpoint matching.

Существующие breakpoints принадлежат пользователю. Перед переходом к requested location смотри текущие breakpoints display и планируй вокруг них. Если existing breakpoint остановит execution раньше requested location, пропусти его через resume/step flow или temporary agent-owned breakpoint. Не удаляй, не disable, не move и не overwrite existing breakpoints без явной просьбы. Только agent-created temporary breakpoints можно убрать после завершения перехода.

## Events

Verbose/event panels per display. Toggle events на одном display не должен show/hide cards на другом display.

Interpreter-level events без `moduleId` можно append ко всем displays только если они действительно host-level. Module protocol и target events должны route by `moduleId`.

Event copy/clear controls работают только в display, где пользователь нажал control.

## Tests And Verification

Запускай focused tests для touched files, затем package checks при изменении shared behavior:

```sh
bun run --filter @metafor/interpreter typecheck
bun run --filter @ui/panes typecheck
bun test pkg/interpreter/src/*.test.ts pkg/interpreter/web/*.test.ts ui/panes/**/*.test.ts
git diff --check
```

Для UI changes проверяй:

- один module display работает один;
- два module displays остаются независимыми;
- click controls на одном display не влияет на другой display;
- terminal focus/input/caret per display;
- breakpoints, поставленные в одном display, не появляются в другом display, если они не принадлежат source этого display;
- module completion disables только бессмысленные controls для этого module;
- reload/hot reload restores displays без default/hidden displays.

## Documentation

Держи эти файлы aligned при изменении behavior:

- `README.md` - primary usage;
- `docs/architecture.md` - структура и invariants;
- `docs/api.md` - REST/WS contracts;
- `docs/workflow.md` - launch и live workflow;
- `docs/troubleshooting.md` - known failure modes;
- `docs/acceptance.md` - manual acceptance flow.

Удаляй obsolete debugger/inspector/WebStorm wording, когда оно становится user-facing documentation. Internal protocol references могут оставаться, когда они точно описывают Bun protocol.
