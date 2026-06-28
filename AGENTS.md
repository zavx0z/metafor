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

Не начинай диагностику с внешнего `https://meta.proizvodstvo1.ru/`: это
наружный proxy/SSO слой. Для shell/API/debug используй server-dev адреса выше.
LAN/TLS режим на `443` - отдельный локально-сетевой режим, не текущий
server-dev контур.

## Серверный Браузер

Рабочий браузер для визуальной разработки - серверный Google Chrome, который
стримится в interpreter Space через WebRTC. Он запускается скриптом:

```sh
app/electron/scripts/chrome-webrtc-monitor.sh
```

Ожидаемый стартовый layout этого Chrome:

- одно окно Chrome, развернуто по размеру server display, но не fullscreen;
- слева открыт `http://10.66.0.10:3004/` в mobile emulation;
- справа docked Chrome DevTools той же страницы;
- в DevTools выбран `Sources`;
- снизу открыт Console drawer.

Не открывай отдельный Playwright/browser как замену этому окну. Playwright
допустим только как временный диагностический инструмент, не runtime dependency
и не основное visual/control решение. Не завязывай текущий server-dev workflow на
macOS-дисплей пользователя.

Проверка browser/RTC state:

```sh
curl -sS http://127.0.0.1:32133/desktop/rtc/state
curl -sS http://127.0.0.1:9349/json/list
curl -sS http://10.66.0.10:6500/webrtc/rooms
```

Ожидаемый основной media path: Chrome WebRTC monitor capture,
`transport: "chrome-webrtc"`, `capture.frameSource:
"chrome-get-display-media:monitor"`, data channel open, audio в том же
RTCPeerConnection. Не возвращай MJPEG/snapshot/PipeWire frame fallback как
основной путь; они допустимы только как диагностика.

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
