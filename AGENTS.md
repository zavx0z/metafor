# Правила Agent Для Server-Dev MetaFor

Этот репозиторий часто разрабатывается прямо на серверном dev-инстансе. Новый
агент должен сначала считать, что он находится именно в этом контуре:

- workspace: `/home/zavx0z/production/vendor/metafor`;
- branch: `energy`;
- interpreter host: `http://10.66.0.10:6500`;
- app-web dev server: `http://10.66.0.10:3004`;
- Bun inspector child `app/web/server.ts`: `ws://127.0.0.1:6499/`;
- server Chrome remote desktop host: `http://127.0.0.1:32133`;
- server Chrome CDP: `http://127.0.0.1:9349/json/list`.

Удаленный браузер для визуальной WebApp-разработки должен открывать
`https://meta.proizvodstvo1.ru/`. Для shell/API/debug диагностики используй
server-dev адреса выше: внешний `meta` слой может вернуть SSO/redirect вместо
runtime state. LAN/TLS режим на `443` - отдельный локально-сетевой режим, не
текущий server-dev контур.

## Серверный Браузер

Рабочий браузер для визуальной разработки - серверный Google Chrome, который
стримится в interpreter Space через WebRTC. Он запускается скриптом:

```sh
pkg/interpreter/remote-desktop/chrome-webrtc-monitor.sh
```

Ожидаемый стартовый layout этого Chrome:

- одно обычное окно Chrome, выставленное в `0,0 1920x1080`, но не fullscreen;
- слева открыт `https://meta.proizvodstvo1.ru/` в mobile emulation;
- справа docked Chrome DevTools той же страницы;
- в DevTools выбран `Sources`;
- снизу открыт Console drawer.

WebRTC sender не должен жить в видимом `https://meta.proizvodstvo1.ru/` target:
reload/product navigation убивает JS-контекст страницы и рвет трансляцию.
Рабочий sender target - отдельная служебная страница
`http://127.0.0.1:32133/desktop/rtc/sender`; видимая вкладка продукта остается
только рабочим браузером и DevTools. Sender использует локальный signaling
`ws://10.66.0.10:6500/webrtc/signaling` и локальные host routes
`http://127.0.0.1:32133/desktop/input`/`audio.pcm`. Эти локальные URL не
встраиваются в код `meta.proizvodstvo1.ru`, поэтому mixed content в продуктовой
вкладке не появляется.

Не открывай отдельный Playwright/browser как замену этому окну. Playwright
допустим только как временный диагностический инструмент, не runtime dependency
и не основное visual/control решение. Не завязывай текущий server-dev workflow на
macOS-дисплей пользователя.

Проверка browser/RTC state:

```sh
curl -sS http://10.66.0.10:6500/remote-desktop/lifecycle
curl -sS http://127.0.0.1:32133/desktop/rtc/state
curl -sS http://127.0.0.1:9349/json/list
curl -sS http://10.66.0.10:6500/webrtc/rooms
```

Ожидаемый основной media path: Chrome WebRTC monitor capture,
`transport: "chrome-webrtc"`, `capture.frameSource:
"chrome-get-display-media:monitor"`, data channel open, audio в том же
RTCPeerConnection. Не возвращай MJPEG/snapshot/PipeWire frame fallback как
основной путь; они допустимы только как диагностика.

Lifecycle server desktop: сначала используй единый interpreter endpoint, а не
цепочку ручных tmux/curl команд:

```sh
curl -sS http://10.66.0.10:6500/remote-desktop/lifecycle
curl -sS -X POST http://10.66.0.10:6500/remote-desktop/lifecycle \
  -H 'content-type: application/json' \
  -d '{"action":"recover","wait":true}'
curl -sS -X POST http://10.66.0.10:6500/remote-desktop/lifecycle \
  -H 'content-type: application/json' \
  -d '{"action":"restart","scope":"sender","wait":true}'
```

Endpoint возвращает schema/userStories и знает параметры `action`, `scope`,
`wait`, `timeoutMs`, `cleanProfile`, `stopXvfb`, `config`. Не останавливай
virtual display, если нужно только перезапустить sender: default для
`restart` - `scope:"sender"`. Low-level команды нужны только если lifecycle API
недоступен. На текущем server-dev контуре `Meta-0` держит headless GNOME RDP
trigger: Xvfb `:101` + `xfreerdp` к `127.0.0.1:3390`; sender - tmux
`metafor-chrome-wayland-monitor-main` со скриптом
`pkg/interpreter/remote-desktop/chrome-webrtc-monitor.sh`. Если health не показывает
`target.connector: "Meta-0"` и `capture.frameSource:
"chrome-get-display-media:monitor"`, это не рабочий remote desktop.

Живой Chrome monitor host находится в `pkg/interpreter/remote-desktop`.
Не тащи в interpreter старые fallback-и: `32123`, Xwayland/current-tab,
MJPEG/snapshot как основной frame loop, Playwright-клиенты и shell-specific
UI код.

## Web DevTools Для Агента

Для отладки Web UI агент управляет текущим server Chrome через interpreter API
`/devtools/*`, а не через отдельный Playwright/browser. Эти endpoint'ы
используют CDP `127.0.0.1:9349`, выбирают видимый AppWeb target
`https://meta.proizvodstvo1.ru/` по умолчанию и умеют мапить строки исходников
через linked sourcemap. Локальный `http://10.66.0.10:3004/` остается только для
server-side health/API диагностики:

```sh
curl -sS http://10.66.0.10:6500/devtools/targets
curl -sS 'http://10.66.0.10:6500/devtools/console?level=error&limit=50'
curl -sS -X POST http://10.66.0.10:6500/devtools/reload -H 'content-type: application/json' -d '{"hard":true}'
curl -sS -X POST http://10.66.0.10:6500/devtools/breakpoints -H 'content-type: application/json' -d '{"source":"app/web/client.ts","line":603}'
curl -sS http://10.66.0.10:6500/devtools/state
curl -sS -X POST http://10.66.0.10:6500/devtools/resume -H 'content-type: application/json' -d '{}'
curl -sS -X POST http://10.66.0.10:6500/devtools/disable -H 'content-type: application/json' -d '{"all":true}'
```

Для быстрого smoke используй `/devtools/probe`: он ставит breakpoint, опционально
дергает `trigger`, ждет `Debugger.paused`, затем по умолчанию делает resume и
снимает breakpoint. Если breakpoint не ловится после restart host, сначала
перезагрузи AppWeb target через `/devtools/reload`, потому что страница могла
остаться со stale websocket.

Перед разбором визуальных ошибок и после действий, которые должны менять Web UI,
смотри `/devtools/console`: он собирает `console.*`, uncaught exceptions,
Chrome `Log.entryAdded` и `Network.loadingFailed`. Если capture только что
включен, старые строки DevTools могут не попасть в буфер; сделай
`/devtools/reload` или воспроизведи действие заново.

## Lifecycle Интерпретатора

Для разработки interpreter/app-web сначала проверяй реальный server-dev host:

```sh
curl -sS http://10.66.0.10:6500/health
curl -sS http://10.66.0.10:6500/context
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:3004/health
```

Если нужен reload UI-клиентов:

```sh
curl -sS -X POST http://10.66.0.10:6500/reload
```

Если менялся host interpreter bundle/code и нужен restart host:

```sh
curl -sS -X POST http://10.66.0.10:6500/restart
```

Если менялся child `app/web/server.ts`, перезапускай child через interpreter
process action, а не внешним случайным supervisor:

```sh
curl -sS -X POST http://10.66.0.10:6500/processes/app-web-server.ts/action \
  -H 'content-type: application/json' \
  -d '{"action":"restart"}'
```

Не добавляй постоянные polling/repaint watchdog loops вместо событийного
lifecycle. Если UI белый после restart, исправляй reload/restart ожидание и
проверяй `/health`.

## Правки Через Интерпретатор

Если работа идет над кодом, открытым или запущенным в текущем interpreter
process/display, правка должна идти через interpreter API:

- `POST /processes/:id/apply_patch`;
- `POST /processes/:id/source`.

Локальные `apply_patch`/formatter/shell-write допустимы для документации,
правил, вспомогательных scripts и кода вне текущего совместно отлаживаемого
process. Если есть сомнение, сначала прочитай:

```sh
curl -sS http://10.66.0.10:6500/context
```

## TODO HUD

В server-dev контуре `TODO.md` является live-данными HUD ToDoPane. Не меняй его
как обычный markdown-файл, если пользователь должен сразу увидеть результат в
интерпретаторе. Используй host API, чтобы файл изменился и всем UI-клиентам
ушло событие `hud-todo-changed`:

```sh
curl -sS http://10.66.0.10:6500/hud/todo
curl -sS -X PUT http://10.66.0.10:6500/hud/todo -H 'content-type: application/json' -d '{"text":"..."}'
curl -sS -X PATCH http://10.66.0.10:6500/hud/todo/items/<id> -H 'content-type: application/json' -d '{"checked":true}'
curl -sS -X POST http://10.66.0.10:6500/hud/todo/items -H 'content-type: application/json' -d '{"text":"...","checked":false}'
```

Если `TODO.md` был изменен локально через git/apply_patch/merge, сразу после
этого вызови:

```sh
curl -sS -X POST http://10.66.0.10:6500/hud/todo/reload
```

Только после успешного reload/PUT/PATCH сообщай пользователю, что TODO обновлен.

Подробные правила interpreter package: `pkg/interpreter/AGENTS.md`.
Подробный runbook server browser/remote desktop: `docs/web-ui-browser-display.md`.
