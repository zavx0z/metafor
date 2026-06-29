# Правила Пакета Interpreter

Этот файл задает локальные правила разработки для `pkg/interpreter` и текущего
server-dev контура MetaFor. Следуй им при каждом изменении внутри interpreter
package, WebApp debugging workflow, remote desktop display, DevTools bridge,
HUD/TODO, breakpoints или совместного runtime/source контекста.

Документация и правила пакета пишутся на русском. Технические имена endpoint, типов, команд и protocol methods оставляются как literal identifiers.

Корневой `AGENTS.md` только указывает на этот файл и фиксирует краткую карту
репозитория. Этот файл является source of truth для interpreter/server-dev
workflow.

## Что Такое Интерпретатор

`@metafor/interpreter` - live-интерпретатор MetaFor. Это не wrapper вокруг WebStorm, Chrome DevTools или отдельного debugger UI.

Смысл продукта: человек и AI находятся в одной живой среде разработки MetaFor.
Сначала это был runtime/source-контекст серверного кода: execution point,
source, stack, scopes, terminal/output, события, breakpoints, step/evaluate и
изменение кода во время работы. Теперь WebApp тоже подключен в эту же среду:
server Chrome, remote desktop display, WebRTC, DevTools, console и source maps
являются частью interpreter workflow, а не внешним браузером рядом.

Через интерпретатор мы сейчас разрабатываем MetaFor. Видимый контур
`https://meta.proizvodstvo1.ru/` - первая живая реализация MetaFor, которую
нужно доводить через эту среду, а не как отдельный сайт вне interpreter.

Protocol names вроде `Debugger.paused`, `Debugger.scriptParsed`, `Runtime.getProperties` и Bun inspect flags - внутренние детали adapter-слоя. В adapter-коде, низкоуровневых tests и raw event streams их можно использовать. В пользовательских labels, docs, logs для людей и UI-controls используй язык интерпретатора: process, Space, display, module, expression, execution point, breakpoint.

Для агента интерпретатор - это главный рабочий API, а не страница, которую
нужно кликать вслепую:

- `host` - серверный процесс interpreter, который владеет REST/WS API;
- `UI client` - browser/XR/mobile host, который отображает state host-а;
- `Space` - общий WebGPU мир с независимыми display;
- `UIDisplay` - поверхность в Space;
- `Process` - основной адрес runtime/source действий;
- `Module` - source/code unit внутри process;
- `Remote desktop display` - отдельный display с серверным Chrome/WebApp,
  передаваемый через WebRTC;
- `WebApp target` - видимая вкладка `https://meta.proizvodstvo1.ru/`, где
  разрабатывается первая реализация MetaFor;
- `DevTools bridge` - agent API к Chrome DevTools Protocol для этой вкладки:
  console, source maps, breakpoints, reload и probe;
- `HUD` - host-level панели вроде TODO, SQLite и terminal.

Если нужно понять, что видит человек и где сейчас работать, сначала читай
`GET /context`, `GET /space`, затем process-specific endpoints.

## Текущий Server-Dev Контур

По умолчанию новый агент в этом репозитории должен считать, что он находится в
server-dev контуре:

- workspace: `/home/zavx0z/production/vendor/metafor`;
- branch: `energy`;
- interpreter host: `http://10.66.0.10:6500`;
- app-web dev server: `http://10.66.0.10:3004`;
- Bun inspector child `app/web/server.ts`: `ws://127.0.0.1:6499/`;
- visible WebApp target в серверном Chrome:
  `https://meta.proizvodstvo1.ru/`;
- server Chrome remote desktop host: `http://127.0.0.1:32133`;
- server Chrome CDP: `http://127.0.0.1:9349/json/list`.

Локальный workflow через `127.0.0.1:6500` поддерживается для запуска на другой
машине, но в текущем server-dev контуре используй `10.66.0.10:6500` для host
API и `10.66.0.10:3004` для app-web dev health/API. LAN/TLS режим на `443` -
отдельный локально-сетевой режим, не диагностика этого контура.

Удаленный браузер для визуальной WebApp-разработки должен открывать
`https://meta.proizvodstvo1.ru/`. Это не маркетинговая внешняя страница, а
текущий живой WebApp-контур первой MetaFor. Для shell/API/debug диагностики
используй server-dev адреса выше: внешний `meta` слой может вернуть SSO/redirect
вместо runtime state.

Базовая проверка текущего контура:

```sh
curl -sS http://10.66.0.10:6500/health
curl -sS http://10.66.0.10:6500/context
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:3004/health
curl -sS http://10.66.0.10:6500/remote-desktop/lifecycle
```

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

Base URL зависит от контура. В текущем server-dev используй:

```text
http://10.66.0.10:6500
```

В локальном запуске на той же машине используй:

```text
http://127.0.0.1:6500
```

Перед действием читай текущую ситуацию:

```sh
curl -sS http://10.66.0.10:6500/context
curl -sS http://10.66.0.10:6500/space
```

`GET /context` - главный endpoint для запроса "что сейчас видно/выделено". Он возвращает один текущий active context, а не полный dump всех runtime.

`context.hud.todo` содержит текущее состояние HUD ToDoPane: подсвеченные человеком пункты `TODO.md`, чтобы агент понимал, о чем речь. Подсветка - состояние панели, не данные файла.

Host-level API:

- `POST /reload` рассылает подключенным UI-клиентам команду browser reload. Это не restart host process.
- `POST /restart` перезапускает текущий interpreter host только когда host знает, как себя поднять снова: сейчас основной путь - tmux `respawn-pane` текущего `TMUX_PANE` или явно заданный `INTERPRETER_RESTART_COMMAND` / `INTERPRETER_RESTART_SCRIPT`. Клиенты получают delayed reload и должны дождаться `/health`, чтобы не показывать белый экран во время restart.
- `POST /hud/todo/reload` перечитывает корневой `TODO.md` и рассылает `hud-todo-changed` всем UI-клиентам. Не dispatch-ить это через случайный UI-host client: TODO HUD является общим состоянием host.

Если nginx показывает `502 Bad Gateway`, сначала проверяй upstream:
`curl http://10.66.0.10:6500/health`,
`curl http://10.66.0.10:3004/health` и `ss -ltnp`. Не доверяй только
`tmux ls`: session `metafor-interpreter-host` может существовать, но внутри
может быть shell/старый Codex. Подробный recovery описан в
`pkg/interpreter/docs/troubleshooting.md`.

Web DevTools API для server Chrome/AppWeb:

- `GET /devtools/targets` читает Chrome CDP targets с default `127.0.0.1:9349`.
- `GET /devtools/state` показывает agent CDP sessions, breakpoints и paused state.
- `GET /devtools/console` включает capture и возвращает последние console/log/exception/network события; для ошибок используй `?level=error&limit=50`.
- `POST /devtools/console/clear` очищает agent buffer и Chrome console entries.
- `POST /devtools/reload` делает `Page.reload` текущего AppWeb target и по умолчанию синхронизирует DevTools Device Mode viewport/surface после reload.
- Managed DevTools CDP session также событийно повторяет viewport sync после `Page.frameNavigated` / `Page.loadEventFired`, чтобы ручной reload в DevTools не сбрасывал target page из portrait в landscape при неизменном toolbar.
- `POST /devtools/viewport/sync` вручную синхронизирует DevTools Device Mode toolbar, AppWeb target viewport и Chrome compositor surface, если после Rotate/reload видна серая область или target получил неправильный viewport.
- `POST /devtools/breakpoints` ставит breakpoint по `source` + 1-based `line`; source maps мапятся на generated bundle автоматически.
- `POST /devtools/probe` ставит breakpoint, дергает optional `trigger`, ждет `Debugger.paused`, затем по умолчанию делает resume и clear.
- `POST /devtools/resume` продолжает paused target.
- `POST /devtools/disable` снимает breakpoints, выключает Debugger и закрывает agent CDP session.

TODO HUD API:

- `GET /hud/todo` читает корневой `TODO.md` и parsed items.
- `PUT /hud/todo` заменяет файл целиком.
- `POST /hud/todo/items` добавляет пункт.
- `PATCH /hud/todo/items/:id` меняет текст пункта или markdown checkbox `checked`.
- `DELETE /hud/todo/items/:id` удаляет пункт.
- `POST /hud/todo/highlight` подсвечивает пункт в HUD для `context.hud.todo.highlightedItems`.

Когда пользователь должен сразу увидеть изменения в ToDoPane, меняй `TODO.md`
через этот API, а не прямым редактированием файла. `PUT`, `POST`, `PATCH` и
`DELETE` сами рассылают `hud-todo-changed` подключенным UI-клиентам. Если
`TODO.md` все же был изменен локально через git/apply_patch/merge, сразу вызови
`POST /hud/todo/reload` и только потом сообщай пользователю, что TODO обновлен.

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
- `source.open` с `params.sourceUrl`, `params.path`, `params.modulePath` или `params.specifier`; опционально `params.line`/`params.column` или `params.selection:{start,end}` / `{anchor,focus}`
- `source.openSelection`
- `restart`
- `stop`
- `showExecutionPoint`

`evaluate` пишет выражение и результат агента в terminal process, чтобы человек видел общее действие.

Для совместной работы с конкретным process используй `/context`, затем `/processes/:id/*`:

```sh
curl -sS http://10.66.0.10:6500/context

curl -sS -X POST 'http://10.66.0.10:6500/processes/dark-server.spec.ts/action' \
  -H 'content-type: application/json' \
  -d '{"action":"evaluate","params":{"expr":"globalThis.location","frame":0}}'
```

SQLite HUD API:

- CLI args ending with `.sqlite` считаются входами SQLite HUD, а не runnable modules.
- HUD можно открыть до появления файла базы; UI ждет и повторяет чтение, пока runtime не создаст `.sqlite`.
- `GET /sqlite?path=<file.sqlite>&table=<name>` возвращает tables, schema и rows.
- `GET /sqlite/fingerprint?path=<file.sqlite>` возвращает дешевую версию database по stat основного файла и `-wal`; `-shm` есть в diagnostic `files`, но не участвует в `version`, потому что чтение SQLite само может менять shared-memory файл. UI использует `version` для авто-refresh без полного reread на каждом тике.
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

Общий server desktop/browser для WebApp уже является рабочим first-class display
в `Space`, а не HUD. Через него человек и агент видят один и тот же WebApp,
управляют серверным Chrome и отлаживают `https://meta.proizvodstvo1.ru/` через
DevTools bridge. Realtime-канал - WebRTC video/audio stream из server Chrome
capture API на сервере; snapshot routes допустимы как fallback/diagnostics.
Visual source по умолчанию - весь server `screen`, не browser tab/window.
Если пользователь просит "сделай скриншот", "посмотри, что я вижу" или
аналогичную визуальную проверку текущего WebApp/DevTools, это означает запросить
удаленный screenshot из видимого server Chrome remote desktop/DevTools окна,
которое видит человек. Не подменяй такой запрос `GET /viewport/screenshot`
интерпретатора, AppWeb target-only `Page.captureScreenshot` или локальным
снимком отдельного canvas: эти варианты допустимы только как diagnostics и
должны быть явно так названы. Если remote desktop snapshot endpoint недоступен,
используй ближайший эквивалент видимого браузера, например CDP screenshot
DevTools frontend target, сохраняй файл в `pkg/interpreter/tmp/codex-attachments`
и явно указывай метод capture.
Interpreter воспроизводит audio через WebAudio spatial panner, привязанный к
позиции display в Space. Не делай Playwright permanent runtime dependency и не
завязывай архитектуру на macOS display пользователя. macOS/ai-macos и Linux
OS-level input/audio должны быть adapter-слоями поверх общего
signaling/input/media контракта.

Текущий server-dev контур без физического монитора использует один Wayland/Mutter
virtual monitor и Chrome sender `webrtc:chrome:monitor` на
`127.0.0.1:32133`. Ожидаемый быстрый media state - `transport:
"chrome-webrtc"`, `capture.frameSource:
"chrome-get-display-media:monitor"`, 1920x1080, target 60 fps,
`audio.transport: "pipewire-pcm-track-generator-stream"`, audio track в том же
PeerConnection, data channel open. Старый `32123` host не должен быть запущен
параллельно: он создает второй `MetaVendor` monitor и может дать черные кадры.
WebRTC sender не должен жить в видимой продуктовой странице
`https://meta.proizvodstvo1.ru/`. В текущем server-dev контуре sender target -
отдельная service page `http://127.0.0.1:32133/desktop/rtc/sender`, signaling -
`ws://10.66.0.10:6500/webrtc/signaling`, input/audio - локальные routes
`127.0.0.1:32133`. Не встраивай эти локальные URL в код видимой страницы
продукта: она не должна владеть remote desktop соединением.
`webrtc:chrome:browser`, Xwayland и PipeWire WebM/PCM/MJPEG оставляй только как
исторические diagnostics, не возвращай их как основной
realtime path.

Cold restart для нового агента: сначала используй единый lifecycle API
interpreter, а не ручную цепочку tmux/curl:

```sh
curl -sS http://10.66.0.10:6500/remote-desktop/lifecycle
curl -sS -X POST http://10.66.0.10:6500/remote-desktop/lifecycle \
  -H 'content-type: application/json' \
  -d '{"action":"recover","wait":true}'
curl -sS -X POST http://10.66.0.10:6500/remote-desktop/lifecycle \
  -H 'content-type: application/json' \
  -d '{"action":"restart","scope":"sender","wait":true}'
```

`GET /remote-desktop/lifecycle` возвращает schema/userStories и полный state.
`POST /remote-desktop/lifecycle` принимает `action`, `scope`, `wait`,
`timeoutMs`, `cleanProfile`, `stopXvfb`, `config`. Не гаси virtual display, если
нужно только перезапустить sender: default для `restart` - `scope:"sender"`.
На текущем server-dev `Meta-0` создается и удерживается headless GNOME RDP
trigger: Xvfb `:101` + `xfreerdp` к `127.0.0.1:3390`; sender - tmux
`metafor-chrome-wayland-monitor-main` с
`pkg/interpreter/remote-desktop/chrome-webrtc-monitor.sh`. Успешный health обязан
показать `stream.target.connector: "Meta-0"`, `capture.frameSource:
"chrome-get-display-media:monitor"`, audio `pipewire-pcm-track-generator-stream`
и RTC `control-open`.

Remote desktop host-код живет в `pkg/interpreter/remote-desktop`. В
interpreter-модуле должен оставаться только реально используемый server-dev
путь: Chrome WebRTC monitor sender, host API `/desktop/health|rtc|input|audio`
и dev-layout. Не переноси старые fallback-и и мертвый код: `32123`,
Xwayland/current-tab, MJPEG/snapshot как основной frame loop, Playwright-клиенты
и shell-specific UI поведение.

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
