# API Интерпретатора

Интерпретатор - одна среда совместной разработки человека, AI-агента, голоса и host-клиентов. Внутри среды есть `HUD` и `Space`, но внешний API не строится вокруг UI. Единица исполнения называется `process`.

## Базовая Модель

```text
Interpreter
  HUD
    terminal
    voice/status
    plan                 # `context.hud.todo`, storage `TODO.md`
    sqlite
  Space
    viewpoint
    displays[]              # визуальные поверхности
  processes[]               # исполняемые процессы
    content: module | browser | actor
    context: source/cursor/selection/frame/scopes/terminal
    breakpoints[]
```

`process` - текущий живой запуск кода. Сейчас это отдельный Bun process с `pid`, inspect target, жизненным циклом `start/stop/restart`, своим стеком, областями видимости, исходным кодом и точками останова. В будущей actor-модели это же имя остается корректным: actor/process будет исполняемой сущностью, а не UI-display.

`display` - только визуальная поверхность в `Space`. Через display можно сфокусировать или разложить рабочие поверхности, но разработческие действия идут через `POST /tools`.

`module` - единица исходного кода. Каталог модулей читается через tool `process.modules` в контексте process.

## REST

Base URL:

```text
http://127.0.0.1:6500
```

Список ниже включает `POST /tools` и низкоуровневые UI/transport routes.
Agent-facing команды выполняются через `POST /tools`; прямые REST/WS routes
используются только там, где нужен transport, stream, static asset или browser/UI
plumbing.

Основные routes:

```text
GET    /health
POST   /tools
GET    /tools

WS     /webrtc/signaling

GET    /browser-display/health
GET    /browser-display/state
GET    /browser-display/status
GET    /browser-display/snapshot
POST   /browser-display/navigate
POST   /browser-display/reload
POST   /browser-display/back
POST   /browser-display/forward
POST   /browser-display/devtools
POST   /browser-display/fullscreen
POST   /browser-display/viewport
POST   /browser-display/input
ANY    /browser-display/proxy/<path>

GET    /remote-desktop/health
GET    /remote-desktop/state
GET    /remote-desktop/status
GET    /remote-desktop/lifecycle
POST   /remote-desktop/lifecycle
GET    /remote-desktop/rtc/state
POST   /remote-desktop/rtc/restart
GET    /remote-desktop/snapshot
POST   /remote-desktop/input
GET    /remote-desktop/browser/windows
POST   /remote-desktop/browser/open

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
GET    /sqlite/fingerprint?path=<file.sqlite>
POST   /sqlite/open
POST   /sqlite/cell
```

WebApp не владеет embedded interpreter API и не публикует proxy-префиксы для
interpreter. Same-host cross-port `Origin` разрешен только для RTC signaling.
Это нужно для локальных/dev вариантов с разными портами, но sender и browser UI все равно
должны сходиться в один in-memory signaling owner. В текущем server-dev контуре
sender живет в отдельной service page
`http://127.0.0.1:32133/desktop/rtc/sender` и использует
`ws://10.66.0.10:6500/webrtc/signaling`. Не встраивай этот локальный URL в код
видимой продуктовой страницы `https://meta.proizvodstvo1.ru/`; она не должна
владеть remote desktop соединением.
`3004` остается Dark dev server/API target. Исключение не расширяет доступ
к terminal/voice WebSocket routes.

## Текущий Context

`context.get` через `POST /tools` возвращает один текущий контекст: то, что сейчас активно видно или выбрано в среде. Это главный tool для запроса вроде "смотри на значение".

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
      "selection": null,
      "selections": []
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

Позиции в `source.cursor`, `source.selection` и `source.selections[]`: `line` - 1-based, `column` - 0-based. `selection.end.column` / `selections[].end.column` end-exclusive. `source.selection` - первичное выделение для обратной совместимости; `source.selections` содержит все активные выделения, включая первичное.

`context.hud.todo` - состояние Plan HUD. `highlightedItems` содержит пункты `TODO.md`, которые человек подсветил в панели, чтобы агент понимал, о чем сейчас речь. Это состояние панели, а не данные файла.

`context.hud.sqlite` - компактное состояние SQLite HUD. В context попадают активная база, таблица и выбранные человеком строки. Это не дамп базы и не полный набор данных таблицы: `selectedRows` ограничен первыми 20 выбранными строками, а при превышении лимита выставляется `selectionTruncated:true`.

`origin:"ui"` означает, что context пришел от UI-host и включает реальные caret, selection и детализацию scopes. При этом agent-facing execution-поля `source.state`, `source.location`, `activeFrameIndex` и `currentFrame` всегда берутся из свежего runtime snapshot, если process paused. `origin:"runtime"` означает запасной вариант из текущей точки исполнения, когда UI-context еще недоступен.

## Host Lifecycle

`host.reload` в `POST /tools` просит все подключенные UI-клиенты перезагрузить страницу. Он не перезапускает host process и не должен использоваться как замена restart после изменения `pkg/interpreter/src/*` или `pkg/interpreter/web/*`.

`host.restart` в `POST /tools` выполняет контролируемый restart interpreter host, когда host запущен в поддерживаемом контуре. Основной путь - tmux: server рассылает UI-клиентам `reload` с задержкой, затем делает `respawn-pane` текущего `TMUX_PANE`. Команда запуска берется из `INTERPRETER_RESTART_COMMAND`, `INTERPRETER_RESTART_SCRIPT` или текущего `/proc/self/cmdline` с нужными env. Если host не в tmux и команда не задана, tool возвращает `501` и объясняет, что нужен внешний supervisor.

UI-клиент после `reload` не должен сразу заменять страницу вслепую. Он ждет задержку, затем поллит `/health` с cache-busting и перезагружает страницу только когда новый host уже отвечает. Это защищает от белого экрана во время короткого падения socket-а.

## Browser Host Bridge

Browser-host bridge - локальный server-side адаптер для отдельного
`browser-display` API. Это не текущий основной WebApp-контур. Для разработки
`https://meta.proizvodstvo1.ru/` в server-dev используется
`remote-desktop:server`: server Chrome, WebRTC, DevTools bridge и source maps.
Bridge не запускает браузер, не добавляет Playwright и не делает фонового
polling. Интерпретатор только проксирует явные запросы к локальному
browser-host API.

Конфигурация:

```text
INTERPRETER_BROWSER_HOST_URL=http://127.0.0.1:<port>
# или
INTERPRETER_BROWSER_HOST_PORT=<port>
```

`INTERPRETER_BROWSER_HOST_URL` должен указывать на `localhost`, `127.0.0.0/8` или `::1`, использовать `http`/`https` и не содержать credentials/query/hash. Если URL не задан или небезопасен, browser-display routes возвращают `503` с понятной JSON-ошибкой, а host interpreter продолжает работать.

Routes:

```text
GET  /browser-display/health
GET  /browser-display/state
GET  /browser-display/status        # alias к state для UI/status controls
GET  /browser-display/snapshot
POST /browser-display/navigate       # {url}
POST /browser-display/reload         # {ignoreCache?: boolean, hard?: boolean}
POST /browser-display/back
POST /browser-display/forward
POST /browser-display/devtools       # {open?: boolean, toggle?: boolean}
POST /browser-display/fullscreen     # {enabled?: boolean}
POST /browser-display/viewport       # {width, height, deviceScaleFactor?}
POST /browser-display/input          # pointer/keyboard/wheel/focus event
ANY  /browser-display/proxy/<path>   # relative path under configured browser-host base URL
```

Явные routes мапятся на одноименные upstream paths: `/browser-display/state` -> `<browser-host>/state`, `/browser-display/status` -> `<browser-host>/state`, `/browser-display/snapshot` -> `<browser-host>/snapshot` и так далее. Если `INTERPRETER_BROWSER_HOST_URL` содержит path-prefix, например `http://127.0.0.1:3100/api`, он сохраняется: `/browser-display/state` пойдет в `/api/state`.

`GET /browser-display/snapshot` возвращает upstream body как stream/proxy response. Bridge сохраняет `content-type`, `content-length`, `etag`, `last-modified`, `cache-control` и дополнительно выставляет `x-browser-host-size`, если upstream прислал `content-length`. Snapshot не оборачивается в JSON и не кодируется base64.

`/browser-display/proxy/<path>` нужен как временный безопасный escape hatch,
пока browser-host API стабилизируется. Он принимает только relative path под
configured local browser-host, запрещает `//`, `.`/`..` segments и не позволяет
передать произвольный absolute URL.

## Remote Desktop Display

Remote desktop display - текущий server-owned визуальный канал для совместной
Web UI разработки первой живой MetaFor на `https://meta.proizvodstvo1.ru/`.
Основной realtime-путь в текущем Linux server-dev контуре:
один Wayland/Mutter virtual monitor без reboot/sudo, Chrome на этом monitor, а
interpreter remote desktop module на `127.0.0.1:32133` публикует full monitor
через Chrome `getDisplayMedia()` и WebRTC.
Интерпретатор держит signaling endpoint и показывает video как first-class
display `remote-desktop:server` в `Space`. Snapshot routes и MJPEG/canvas
adapters являются fallback/diagnostics, а не основным frame loop.
Chrome sender target должен быть отдельной служебной страницей
`http://127.0.0.1:32133/desktop/rtc/sender`, а не видимой вкладкой
`https://meta.proizvodstvo1.ru/`. Product reload/navigation не должны влиять на
WebRTC sender.

Это важно для текущего сервера без подключенного физического монитора: рабочий
контур должен иметь один virtual `MetaVendor` monitor и один host на `32133`.
Старый `32123` host нельзя оставлять параллельно, иначе Chrome может рендерить
на одном virtual monitor, а WebRTC capture брать другой. Рабочий live media
path - `transport: "chrome-webrtc"` и `capture.frameSource:
"chrome-get-display-media:monitor"`. Xwayland/current tab и PipeWire WebM/PCM
являются только diagnostic-only paths.
Текущий host-код живет в `pkg/interpreter/remote-desktop`.

Конфигурация bridge:

```text
# Current server: one Chrome Wayland monitor host for health/snapshot/input/RTC.
INTERPRETER_REMOTE_DESKTOP_HOST_URL=http://127.0.0.1:32133
INTERPRETER_REMOTE_DESKTOP_RTC_HOST_URL=http://127.0.0.1:32133
```

Routes:

```text
WS   /webrtc/signaling
GET  /remote-desktop/health
GET  /remote-desktop/state
GET  /remote-desktop/status
GET  /remote-desktop/lifecycle
POST /remote-desktop/lifecycle
GET  /remote-desktop/rtc/state
POST /remote-desktop/rtc/restart
GET  /remote-desktop/audio.pcm
GET  /remote-desktop/snapshot
POST /remote-desktop/input
GET  /remote-desktop/browser/windows
POST /remote-desktop/browser/open
```

`/remote-desktop/lifecycle` - основной user-story endpoint для server-dev
remote desktop. `GET` возвращает schema/userStories и текущий state. `POST`
принимает:

```json
{
  "action": "status | start | restart | recover | stop",
  "scope": "sender | display | all",
  "wait": true,
  "timeoutMs": 20000,
  "cleanProfile": false,
  "stopXvfb": false,
  "config": {}
}
```

Default `restart` использует `scope:"sender"`, чтобы не гасить `Meta-0`.
`recover` поднимает display layer и затем перезапускает sender. State разделяет
`hostReady`, `captureReady`, `audioReady`, `controlReady` и итоговый `ready`,
чтобы агент видел, какой слой контура сломан.

`/remote-desktop/health` мапится на host `/desktop/health` и включает
состояние WebRTC sender, включая `capture.preferredKind`, фактический
`source.kind`, `capture.frameSource`, `capture.frameWidth`,
`capture.frameHeight`, а также `audio.enabled`, `audio.transport` и
`audio.trackCount`. В текущем server-dev контуре `/remote-desktop/rtc/state`
проксируется на Chrome Wayland monitor sender
(`127.0.0.1:32133/desktop/rtc/state`), и `/remote-desktop/input`/snapshot идут
туда же. `/remote-desktop/audio.pcm` является stream proxy на
`127.0.0.1:32133/desktop/audio.pcm` для Chrome sender-а. Не
оставляй `INTERPRETER_REMOTE_DESKTOP_RTC_HOST_URL=32123`, если
активный live sender - interpreter Chrome monitor host на `32133`; иначе UI будет работать через
signaling, но diagnostic state покажет старый host. При WebRTC data channel UI
отправляет input sender-у, а sender проксирует команды в Mutter/EIS input
adapter того же virtual monitor.

В production server-dev контуре `/remote-desktop/rtc/state` также используется
как ICE diagnostic contract. Рабочий direct media path должен показывать
`ice.lastPublishedCandidate.address = "130.49.151.168"` и port внутри
`40000-40100`. `ice.lastCandidate` может содержать локальный адрес Chromium
вроде `10.163.*`, если UDP socket открыт на `0.0.0.0`; проверять надо именно
published candidate, который уходит browser viewer-у через signaling.

## Web DevTools

`devtools.*` tools - agent-facing слой над текущим server Chrome CDP. По умолчанию
они используют `http://127.0.0.1:9349` и видимый WebApp target
`https://meta.proizvodstvo1.ru/`. Локальный `http://10.66.0.10:3004/` остается
для server-side health/API диагностики. Это не замена визуальному docked
DevTools: tools нужны агенту для точных операций, пока пользователь и агент
смотрят один и тот же `remote-desktop:server` display.

```text
devtools.targets
devtools.state
devtools.console          # {limit?, level?, kind?, sinceId?}
devtools.console.clear
devtools.reload           # {targetUrl?, hard?, ignoreCache?, syncViewport?}
devtools.viewport.sync    # {targetUrl?, width?, height?, deviceScaleFactor?}
devtools.breakpoint       # {source|url, line, column?, targetUrl?}
devtools.probe            # {source|url, line, trigger?, autoResumeMs?, clear?}
devtools.resume           # {targetUrl?|targetId?}
devtools.disable          # {targetUrl?|targetId?|all?}
devtools.evaluate         # {expression, targetUrl?, awaitPromise?, returnByValue?}
```

## Browser Agent Chat

`browser_chat.*` tools - минимальный transport для Browser Agent message. Он
работает через `@metafor/browser-agent` runtime и тот же server Chrome
CDP/DevTools слой, но не является заменой `devtools.*`: tools чата вставляют
сообщение в уже открытый browser LLM chat и читают ответ из DOM.

Поддерживаемые provider: `qwen` (`chat.qwen.ai`) и `deepseek`
(`chat.deepseek.com`). Provider можно выбрать явно через
`provider?:"qwen"|"deepseek"`; если он не указан, runtime выводит provider из
`urlContains`/`targetUrl`/`targetTitle`, fallback - Qwen.

```text
browser_chat.send      # {provider?:qwen|deepseek, message|text, attachmentPaths?, targetId?, targetUrl?, targetTitle?, urlContains?, autoToolLoop?, newChat?, waitUntilReady?, sendTimeoutMs?}
browser_chat.read      # {provider?:qwen|deepseek, targetId?, targetUrl?, targetTitle?, urlContains?}
browser_chat.wait      # {provider?:qwen|deepseek, targetId?, targetUrl?, targetTitle?, urlContains?, previousAssistantText?, afterMessageCount?, intervalMs?, stableTicks?, timeoutMs?}
browser_chat.exchange  # {provider?:qwen|deepseek, message|text, targetId?, targetUrl?, targetTitle?, urlContains?, previousAssistantText?, afterMessageCount?, intervalMs?, stableTicks?, timeoutMs?}
browser_chat.configure # {provider:deepseek, targetId?, targetUrl?, targetTitle?, urlContains?, deepseekMode?:fast|expert|vision, mode?, providerMode?, deepThinking?, thinking?}
browser_chat.activate  # {provider?:qwen|deepseek, targetId?, targetUrl?, targetTitle?, urlContains?}
```

По умолчанию target выбирается по fallback provider `qwen`. `send` выбирает
provider adapter, ищет composer textarea/contenteditable, проверяет, что chat не
генерирует и не показывает выбор варианта ответа, вставляет текст, диспатчит
input/change events и нажимает send. Если provider показывает выбор из
нескольких ответов и один из вариантов содержит `<tool_calls>`, `send`
автоматически выбирает этот вариант перед отправкой следующего сообщения/tool
results, чтобы Browser Agent loop не останавливался на ручном выборе. Если
передан `newChat:true`, `send` сначала открывает новый chat выбранного provider,
затем отправляет сообщение. Если provider занят, `send` по умолчанию ждет
готовности до
`sendTimeoutMs` и не пишет в composer до готового состояния; при таймауте
возвращает `ok:false`, `busy:true`/`canSend:false`, `blockedReason` и `waitedMs`.
После клика `send` проверяет, что сообщение реально принято, и не возвращает
ложный `ok:true` только из-за DOM click/Enter.

`read` возвращает последние DOM-сообщения, `lastAssistantText` и transport-state
поля `generating`, `canSend`, `busy`, `preferenceActive`, `blockedReason`. `wait`
считает ответ завершенным, когда assistant text стабилен несколько polling ticks
и `generating:false`. Чтобы не принять старый ответ за новый, `send` возвращает
`previousAssistantText` и `previousMessageCount`, а `exchange` передает их в
`wait` как baseline. UI Browser Agent Chat использует тот же baseline для
streaming polling и запускает tool loop только после завершения генерации.
Если свежая отправка получает дневной usage/quota limit вместо ответа, `send`
возвращает `limitReached:true`, `canSend:false`, `busy:true` и
provider-specific `blockedReason`. `read` не держит blocked state по старому
limit-сообщению в истории: после сброса лимита активный composer снова должен
дать `canSend:true`.

`configure` - provider-specific настройка открытого browser chat без отправки
сообщения. Сейчас она поддержана для DeepSeek: `deepseekMode`/`mode`/`providerMode`
выбирает `fast`, `expert` или `vision`, а `deepThinking`/`thinking` задает точное
состояние Deep Thinking toggle (`true` включает, `false` выключает). `activate`
переключает реальную вкладку Chrome на target выбранного provider-а через host
callback; Browser Agent UI вызывает его только при ручном клике по target
switcher `Qwen`/`DeepSeek` в окне `Message`.

Codex message и Browser Agent message используют общий UI composer flow `Message` для
text/voice/image attachments, но transport разный: Codex message идет в
host PTY/Codex CLI, Browser Agent message идет в remote browser chat. Оба
направления используют один общий HUD composer с target-кнопками
`Codex`/`Qwen`/`DeepSeek`: выбранный target определяет transport, draft,
attachments и обработчик submit. Для Browser Agent sent user messages image
attachments отображаются в `Agent` history как medium previews. Для DeepSeek
`browser_chat.send` принимает `attachmentPaths?: string[]` и загружает эти
server-local image paths в provider UI через host Chrome DevTools
`DOM.setFileInputFiles`; при таком upload в DeepSeek transport не добавляется
текстовый блок с filesystem paths.

Browser Agent UI состоит из окна `Agent` и общего composer-окна `Message`.
`Agent` показывает историю active provider-а, transport status и
provider-specific controls; `Message` содержит единый ввод, target switcher
`Codex`/`Qwen`/`DeepSeek` и общие send/image/voice controls.

Browser Agent Chat UI имеет provider sessions: `Qwen` и `DeepSeek`. Каждая
session имеет отдельную историю, draft, attachments, transport state и tool loop
state; переключение target не очищает draft/history другой session. Все вызовы
`browser_chat.*` из UI передают `provider` и `urlContains` выбранной browser
session. Session state хранится в browser `localStorage`: active session, active
composer target, draft, attachments, сообщения, DeepSeek mode/deep-thinking,
transport flags и tool loop control/pending state переживают reload UI.
Ephemeral timers/read polling после reload создаются заново и live transport
state дополнительно гидратируется через `browser_chat.read`.
Голосовые wake-команды `Завхоз`/`Запхоз`/`Метафор` возвращают текущий voice
target в общий `Message` composer с target `Codex`. Команды `Квин`/`Qwen` и
`Дипсик`/`DeepSeek` открывают окно `Agent`, переключают active session и
composer target, но не активируют Chrome-вкладку и не переводят Space на
browser display. Реальная remote browser tab переключается через
`browser_chat.activate`, а `remote-desktop:server` display фокусируется только
ручным кликом по target switcher `Qwen`/`DeepSeek` в `Message`. Эти команды не
вставляются в draft как пользовательский текст.

Обычная отправка Browser Agent message передает в active provider только текст
пользователя и attachment paths. Tool prompt не добавляется автоматически к
пользовательским сообщениям: он отправляется отдельной кнопкой окна `Agent`,
которая очищает только active session и создает новый chat выбранного provider
через `browser_chat.send` с `newChat:true`.

Browser Agent поверх transport добавляет текстовый tool protocol для active provider:
если ответ assistant содержит блок `<tool_calls>{"tool_uses":[...]}</tool_calls>`,
ограниченный loop выполняет эти calls через общий `POST /tools`, затем отправляет
обратно в provider блок `<tool_results>{"tool_results":[...]}</tool_results>`. Это
не native function calling API provider-а и не универсальный planner. Для прямого
`browser_chat.send` server-side pump включен по умолчанию; Browser Agent UI
передает `autoToolLoop:false`, чтобы не дублировать свой streaming loop.
`browser_chat.*` сами остаются только transport командами; browser LLM не должен
вызывать `browser_chat.*`, чтобы не рекурсировать чат в самого себя.

`devtools.console` включает capture событий `Runtime.consoleAPICalled`,
`Runtime.exceptionThrown`, `Log.entryAdded` и `Network.loadingFailed` и хранит
bounded buffer последних событий. Для визуальных ошибок в WebApp сначала
передай `level:"error", limit:50`; если capture был включен уже после появления
ошибки, очисти буфер через `devtools.console.clear`, сделай `devtools.reload`
или повтори действие, затем прочитай console снова.

Для `source` строки считаются 1-based, как в редакторе; `column` остается
0-based. Interpreter читает linked sourcemap из WebApp bundle и возвращает в
ответе both original/generated coordinates. `devtools.probe` ставит
breakpoint, опционально выполняет HTTP `trigger`, ждет `Debugger.paused`, затем
по умолчанию делает `resume` и снимает breakpoint. Если после restart breakpoint
не ловится, сначала сделай `devtools.reload`: Chrome target мог остаться
открытым со stale WebApp websocket.

В docked DevTools Device Mode после ручного Rotate и `Page.reload` Chrome может
рассинхронизировать toolbar Width/Height, JS viewport target page и compositor
surface, который видит DevTools preview. Симптомы: toolbar показывает `400x816`,
target после reload получает `816x400`, `Page.captureScreenshot` отдает scaled
surface вроде `612x300` при JS viewport `816x400`, canvas/torus считаются по
неожиданному viewport. `devtools.reload` по умолчанию после загрузки делает
viewport sync. Managed DevTools CDP session дополнительно повторяет sync после
`Page.frameResized`, `Page.frameNavigated` и `Page.loadEventFired`, чтобы ручной
Rotate/reload не оставлял target и preview в разных размерах. Если managed
session не была создана или видна серая область, вызови
`devtools.viewport.sync` вручную.

## Plan HUD

Agent-facing действия Plan выполняются через `POST /tools` с `todo.*`. Прямые
`/hud/todo*` routes являются UI/transport plumbing. Файл хранения остается
`TODO.md`; пользовательское название панели и workflow - Plan.

`todo.get` читает корневой `TODO.md` и возвращает Markdown плюс parsed items для Plan HUD:

```json
{"ok": true, "path": "/repo/TODO.md", "mtimeMs": 1710000000000, "size": 1024, "text": "# MetaFor Plan\n", "items": []}
```

Данные Plan хранятся в файле `TODO.md`: текст пунктов и markdown checkbox markers. Plan HUD парсит явный список markers и возвращает его как `marker`: `[ ]`, `[x]`/`[X]`, `[/]`, `[~]`, `[-]`, `[>]`, `[<]`, `[?]`, `[!]`, `[*]`, `[\"]`, `[l]`, `[b]`, `[i]`, `[I]`, `[S]`, `[p]`, `[c]`, `[f]`, `[k]`, `[w]`, `[u]`, `[d]`, а также progress marker `[0]`..`[100]`. Пауза progress-задачи пишется точкой перед числом: `[.0]`..`[.100]`. В этом repo `[0]` означает задачу в работе, `[.0]` - пауза, `[x]` или `[100]` - сделано. Progress также возвращается как `progress`, пауза - как `paused`. Подсветка строки хранится как состояние HUD-панели и попадает в `context.hud.todo.highlightedItems`.

Редактирование файла через `POST /tools`:

```text
todo.replace   # {text}
todo.create    # {text, kind?: "task"|"note"|"heading", checked?, marker?, depth?, afterId?}
todo.update    # {id, text?, checked?, marker?}
todo.delete    # {id}
```

`todo.reload` через `POST /tools` перечитывает файл и рассылает `hud-todo-changed` всем UI-клиентам. Это host-wide событие, а не команда случайному UI-host client.

Состояние панели через `POST /tools`:

```text
todo.panel
todo.highlight      # {id} или {ids:[...]}
todo.show|dock|toggle
```

## SQLite HUD

CLI-аргументы, заканчивающиеся на `.sqlite`, считаются входами SQLite HUD, а не запускаемыми модулями. HUD можно открыть до появления файла базы: UI ждет, пока рантайм создаст файл, и перечитывает данные.

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

`GET /sqlite?path=<file.sqlite>&table=<name>` возвращает tables, schema и rows для просмотра таблицы. `version` в данных строится по основному файлу и `-wal`; `-shm` возвращается в diagnostic `files`, но не участвует в версии, потому что чтение SQLite само может менять shared-memory файл. Сервер регистрирует watcher на database path и через `/ws` отправляет событие `sqlite-changed`, когда fingerprint main/WAL меняется. UI не поллит `/sqlite/fingerprint`: он перечитывает rows только по `sqlite-changed` или по явному действию пользователя. `POST /sqlite/open` с `{"path":"dark/tmp/boundary.sqlite"}` открывает базу в HUD.

`POST /sqlite/cell` редактирует одну ячейку по SQLite `rowid`:

```json
{"path":"/repo/dark/tmp/boundary.sqlite","table":"actor","rowid":13,"column":"position","value":1}
```

Views считаются read-only. В UI один клик выбирает строку целиком, `Shift` выбирает диапазон, `Cmd` на macOS и `Ctrl` на других системах добавляют или снимают отдельные строки. Редактирование ячейки открывается двойным кликом по editable cell.

## Space

`space.get` через `POST /tools` возвращает визуальное состояние среды:

В текущем interpreter host module displays и `remote-desktop:server` публикуются
как физические 1920x1080 displays при 96dpi (508x285.75 мм). Browser fullscreen
не меняет эти `metrics`; он меняет только viewport host-клиента. Network display
не создаётся при старте; его можно поднять только явным
`/hud/terminal/network/show`. Автораскладка задает отсутствующие позиции, но не
перетирает сохраненные per-display позиции пользователя.

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

Selectors для `space.focus`, `process.resolve` и `process.focus`:

```json
{"selector":{"processId":"dark-server.spec.ts"}}
{"selector":{"moduleId":"dark-server.spec.ts"}}
{"selector":{"side":"left"}}
{"selector":{"label":"dark/server.spec.ts"}}
{"selector":{"order":0}}
```

Фокус рабочей поверхности не меняет host terminal HUD. Панель терминала меняется только через явные `hud.terminal.*` tools в `POST /tools`, terminal transport routes или при явном `dockHostTerminal:true`.

## Processes

`process.list` возвращает список исполняемых процессов:

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

Agent-facing команды выполняются только через `POST /tools`. Тело запроса всегда
Codex-style:

```json
{
  "tool_uses": [
    {"recipient_name": "context.get", "parameters": {}}
  ]
}
```

`GET /tools` возвращает typed registry из `pkg/interpreter/src/tools.ts`.

`process.get` возвращает рабочие данные process: `content`, `runtime`, `ui` и `capabilities`.

`process.close` останавливает рантайм-процесс, удаляет его из списка процессов и синхронизирует UI так, чтобы display этого module исчез из Space.

API-редактирование исходного кода через `POST /tools` с `source.write` или `source.apply_patch` рассылает `source-patched`. UI process display из `parameters.processId` должен открыть первый измененный не-delete файл в редакторе исходного кода, раскрыть и выделить его в дереве файлов и поставить курсор на первую измененную строку (`lineChanges[0].newStart`, иначе строка 1). Этот origin display обновляется даже если прежний editor buffer был dirty или process уже `exited`/`failed`; другие display с локальным dirty state не перетираются автоматически. Если в origin display прямо сейчас идет сохранение, авто-переход пропускается.

`process.start` запускает новый process:

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
- `pauseOnStart: false` -> `--inspect=<module-url>`

## Действия Process

`process.action` в `POST /tools` выполняет действие в конкретном process:

```sh
curl -sS -X POST 'http://127.0.0.1:6500/tools' \
  -H 'content-type: application/json' \
  -d '{"tool_uses":[{"recipient_name":"process.action","parameters":{"processId":"dark-server.spec.ts","action":"step","params":{"kind":"over"}}}]}'
```

Поддерживаемые действия:

- `pause`
- `resume`
- `step` с `params.kind`: `over`, `into`, `out`
- `evaluate` / `eval` с `params.expr` и опциональным `params.frame`
- `source.open` с `params.sourceUrl`, `params.path`, `params.modulePath` или `params.specifier`; опционально `params.line`/`params.column` или `params.selection:{start,end}` / `{anchor,focus}`
- `source.openSelection`
- `restart`
- `stop`
- `close` / `delete` / `remove` - остановить process и убрать display module из Space
- `showExecutionPoint`

`evaluate` возвращает результат вычисления в runtime-only ответе. Если нужно
отдельно показать вычисление человеку в UI/terminal, это должен быть явный
UI-visible workflow, а не часть debugger response.

Agent-facing debugger actions (`pause`, `resume`, `step`, `evaluate`,
`breakpointsActive`/`setBreakpointsActive`, `muteBreakpoints`,
`unmuteBreakpoints`) возвращают runtime-only ответ. В нем нет editor cursor,
selection, открытого source-pane, display geometry или workspace tree. Для
`pause` и `step` HTTP-ответ завершается после события `Debugger.paused`; для
`resume` - после `Debugger.resumed`. Агент должен делать выводы только по
`state`, `currentFrame`, `frames[]` и `runtime`, которые относятся к фактической
точке выполнения process.

`process.action` с `action:"restart"` по умолчанию ждёт post-restart
debugger-ready состояние: новый target должен подключиться к inspector, а
target-level `pendingBreakpoints` должны быть потреблены runtime-слоем. Если это
не произошло до timeout, tool возвращает `ok:false`/504 с текущим `process`
snapshot и `ready.state:"timeout"`, а не ложный успешный результат. Агент не
должен достраивать restart через дополнительный `process.get` как часть
нормального flow: сам tool обязан вернуть итог, достаточный для следующего
решения.

Если у process есть breakpoints, обычный `process.action` с `action:"restart"`
по умолчанию работает как restart-and-stop-on-breakpoint: tool стартует process
через `inspect-brk`, дождётся установки breakpoints, выполнит resume и вернёт
ответ только после следующего `Debugger.paused` или timeout. Не делай это
цепочкой отдельных tools `restart` -> `resume` -> `process.get`. Явный
`params.runToBreakpoint:false` отключает этот режим.

Поле `event` появляется только когда соответствующее debugger-событие реально
дождались. Если process уже был в нужном состоянии, ответ содержит
`already:"paused"` или `already:"running"`, не подставляя фиктивный event.

Пример ответа `step into`:

```json
{
  "ok": true,
  "processId": "dark-server.ts",
  "action": "step",
  "kind": "into",
  "event": "Debugger.paused",
  "state": "paused",
  "currentFrame": {"function":"matter","url":"r/dark/dark.ts","line":75,"column":3}
}
```

`showExecutionPoint`, `source.open` и `source.openSelection` могут менять UI, но
debugger outcome всё равно не смешивается с editor/source-pane координатами.

Открыть source и выделить диапазон в редакторе:

```sh
curl -sS -X POST 'http://127.0.0.1:6500/tools' \
  -H 'content-type: application/json' \
  -d '{"tool_uses":[{"recipient_name":"source.open","parameters":{"processId":"dark-server.spec.ts","path":"/path/to/file.ts","selection":{"start":{"line":10,"column":2},"end":{"line":10,"column":14}}}}]}'
```

`selection.line` — 1-based, `selection.column` — 0-based.

## Каталог Кода

`process.modules` возвращает каталог кода в контексте process: entrypoint, launch root и импортированные локальные source files. Каталог строится по import graph, включая workspace package imports, а не рекурсивным обходом всех файлов.

```json
{
  "ok": true,
  "processId": "dark-server.spec.ts",
  "kind": "module",
  "moduleId": "dark-server.spec.ts",
  "root": "/repo",
  "workspacePath": "",
  "entrypoint": "/repo/dark/server.spec.ts",
  "modules": [{"path":"dark/server.spec.ts"}, {"path":"dark/server.ts"}, {"path":"boundary/force.ts"}]
}
```

Чтение и редактирование source:

```text
POST /tools        # JSON {tool_uses:[{recipient_name, parameters}]}
```

`POST /tools` - единый command API. Тело запроса содержит `tool_uses`, где
каждый элемент имеет `recipient_name`/`name` и `parameters`/`arguments`.
Для process-scoped tools передавай `parameters.processId`. Поддержанный набор tools:
`source.read`, `source.read_many`, `source.locate`, `source.open`,
`source.openSelection`, `source.write`, `source.apply_patch`, `process.*`, `breakpoint.*`, `hud.*`,
`todo.*`, `sqlite.*`, `git.*`, `devtools.*`, `browser.*`, `browser_chat.*`, `remote_desktop.*`, `host.*`.

`source.open` и `source.openSelection` внутри API вызывают UI-host команду
открытия исходника для указанного process. `source.read` остается чистым
чтением source payload, чтобы UI-клиент мог читать файл без рекурсивного
повторного открытия.

`source.write` и `source.apply_patch` применяют изменения через серверную
реализацию apply_patch, сдвигают точки останова process, рассылают
`source-patched` и повторно воспроизводят затронутые запуски, когда это нужно.

`git.status`, `git.commit` и `git.push` выполняют git в workspace repo через
тот же `POST /tools` слой. `git.commit` принимает `message` и явные `paths`
либо `all:true`. Успешные `git.commit` и `git.push` рассылают
`workspace-changed`; UI после этого перечитывает `process.modules`, обновляет
git-статистику в дереве файлов и перечитывает открытые clean source buffers,
чтобы gutter diff считался относительно нового `HEAD`.

`source.locate` находит строку в локальном source без ручного подсчета номеров.
Он принимает `sourceUrl`/`path`/`modulePath`/`url` и один locator: `text`,
`query` или line-local `regex`. Дополнительно можно ограничить область через
`after`/`before`, выбрать явное `occurrence`, задать `nearLine` для сортировки
совпадений и `contextLines` для размера возвращаемого фрагмента.

Если совпадение одно, ответ содержит `match.line`, `match.column` и numbered
`match.context.text`. Если совпадений несколько, команда возвращает `ok:false`,
`error:"ambiguous source locator"`, `matchCount` и `matches[]`; агент должен
уточнить locator или передать явное `occurrence`, а не выбирать строку наугад.

## Точки Останова

Точки останова принадлежат process, а не общему модулю исходного кода.

```text
breakpoint.list
breakpoint.set
breakpoint.remove
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

`line` - 1-based строка редактора. `column` - 0-based колонка. Для локальных
TS/JS source-файлов `breakpoint.set` перед регистрацией проверяет, что строка
может стать runtime breakpoint. Если запрошена пустая строка, комментарий,
type-only участок или многострочная сигнатура без исполняемого кода,
интерпретатор нормализует breakpoint на ближайшую следующую исполняемую строку
и возвращает `warning` + `requestedBreakpoint`; если такой строки рядом нет,
команда возвращает `ok:false` и breakpoint не регистрируется.

Для agent-facing постановки предпочтителен source locator вместо ручного
номера строки:

```json
{"processId":"dark-server.ts","sourceUrl":"r/dark/dark.ts","text":"await matter(part.value)"}
```

`breakpoint.set` использует тот же locator-контракт, что и `source.locate`, сам
выводит `line`/`column`, затем применяет обычную нормализацию runtime-точки.
Если одновременно переданы `line` и locator, и найденная строка отличается от
`line`, команда возвращает `ok:false` с `error:"line does not match source locator"`.
Если locator неоднозначен, breakpoint не регистрируется.

Интерпретатор переводит source-координаты через `sourceMapURL` из
`Debugger.scriptParsed`. Установленные runtime-точки в `breakpoint.installed[]`
показывают `requestedLocation`, `generatedLocation` и `actualLocation`, чтобы
агент видел фактическое место, куда попал breakpoint, а не только `ok:true`.

`POST` и `DELETE` рассылают UI событие `breakpoints-changed`; редактор обновляет рантайм-регистрации и localStorage specs из ответа process, поэтому внешний API не оставляет устаревший маркер в gutter.

## SQLite

CLI-аргументы, заканчивающиеся на `.sqlite`, считаются входами display, а не запускаемыми process. Display можно создать до появления файла; UI ждет и повторяет чтение, пока рантайм не создаст базу данных.

```sh
bun --hot run pkg/interpreter/interpreter.ts \
  dark/server.spec.ts -timeout=2147483647 \
  boundary/server.spec.ts \
  dark/tmp/boundary.sqlite
```

SQLite routes:

```text
GET  /sqlite?path=<file.sqlite>&table=<name>
GET  /sqlite/fingerprint?path=<file.sqlite>
POST /sqlite/open
POST /sqlite/cell
```

`POST /sqlite/cell` редактирует одну ячейку обычной таблицы по SQLite `rowid`. Views остаются read-only.

## HUD Terminal

Agent-facing управление host terminal HUD выполняется через `POST /tools`:

```text
hud.terminal.get
hud.terminal.show
hud.terminal.dock
hud.terminal.toggle
hud.browser_chat.get
hud.browser_chat.show
hud.browser_chat.dock
hud.browser_chat.toggle
```

`space.arrange` в `POST /tools` расставляет текущие display ровной сеткой и затем
делает frame. По умолчанию используется 3 колонки; параметры: `columns`,
`gapMm`, `centerZMm`, `padding`, `frame:false`. `padding:1` приближает камеру
максимально плотно к bounding box всех display.

Прямые routes ниже нужны для UI/stream/diagnostics. Навигация по рабочим
поверхностям и действия исполнения идут через `POST /tools`.

```text
GET  /hud/terminal
POST /hud/terminal/show
POST /hud/terminal/dock
POST /hud/terminal/toggle
WS   /hud/terminal/stream
GET  /hud/terminal/sessions
```

Используй terminal endpoints только для stream/diagnostic запросов к terminal HUD.

## WebSocket `/ws`

Внутренние WS-события пока остаются scoped по `moduleId`, потому что текущий Bun runtime manager устроен вокруг запущенных module targets:

```json
{"type":"command","moduleId":"syntax","cmd":"resume","params":{},"requestId":2}
```

SQLite HUD получает server-push событие, когда watcher на сервере видит изменение main database или WAL:

```json
{"type":"sqlite-changed","path":"/repo/dark/tmp/boundary.sqlite","label":"dark/tmp/boundary.sqlite","version":"main:...|wal:...","available":true}
```

Публичный agent-facing API должен использовать `POST /tools`; прямые REST routes остаются только для transport/stream/static plumbing.
