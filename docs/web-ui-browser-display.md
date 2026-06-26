# Web UI Browser Display Runbook

Этот документ фиксирует рабочий контур Web UI и целевую форму общего
`browser-display` для интерпретатора. `browser-display` должен быть
равноправным display в `Space`, а не HUD-панелью, iframe-оберткой или скрытым
Playwright-клиентом.

## Проверенный Контекст

Проверено 2026-06-26 в репозиториях:

- `/home/zavx0z/production/vendor/metafor`, ветка `energy`;
- `/home/zavx0z/production/vendor/ai-macos`, доступен и содержит workspaces
  `shared`, `chrome`, `screen`, `window`, `input`, `android`.

Текущее состояние MetaFor:

- server/dev wrapper `/home/zavx0z/metafor-interpreter-web-dev/run.sh`
  выставляет `INTERPRETER_HTTP_HOST=10.66.0.10`;
- host interpreter слушает `http://10.66.0.10:6500/`;
- child `app/web/server.ts` запускается с `HOST=10.66.0.10` и `PORT=3004`;
- Bun inspector для child process остается локальным:
  `ws://127.0.0.1:6499/`;
- `app/electron` имеет обычный shell-режим и opt-in browser-host режим:
  `METAFOR_ELECTRON_HOST=1` или `METAFOR_ELECTRON_HOST_PORT`, отдельный
  user-data-dir/session partition, local-only HTTP API, snapshot через
  `webContents.capturePage()`, управляемый URL/viewport/restart/input и CDP
  через `METAFOR_ELECTRON_DEBUG_PORT`;
- interpreter-side bridge для будущего browser-host использует префикс
  `/browser-display/*` и проксирует только локальный browser-host, заданный через
  `INTERPRETER_BROWSER_HOST_URL` или `INTERPRETER_BROWSER_HOST_PORT`;
- текущий `GET /space` показывает module/network displays; отдельный
  `browser-display` еще не реализован.

## Dev-Контур

Не смешивай эти режимы:

| Режим | Адреса | Назначение |
| --- | --- | --- |
| Server/dev Web UI | `10.66.0.10:6500`, `10.66.0.10:3004` | Текущий контур для interpreter API/UI и app-web dev server |
| Внешний доступ | `https://meta.proizvodstvo1.ru/` | Proxy/SSO перед server/dev контуром; shell `curl` может видеть proxy/SSO, а не runtime |
| LAN/WebApp | `443` | Отдельный LAN/TLS режим из `bun run workspace.app.web:dev`; не использовать как диагностику server/dev |

Базовая проверка server/dev:

```sh
ss -ltnp | rg ':(6500|6499|3004)\b'
curl -sS http://10.66.0.10:6500/health
curl -sS http://10.66.0.10:6500/context
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:3004/health
systemctl --user status metafor-interpreter-web-dev.service --no-pager
```

Если `systemctl` показывает inactive, но `ss` показывает занятые `6500` и
`3004`, не запускай второго владельца портов. Сначала найди фактического
владельца:

```sh
ps -fp <pid-from-ss>
tmux list-panes -a -F '#S:#W.#I.#P #{pane_id} #{pane_current_command} #{pane_current_path}'
```

## Restart

Для restart host interpreter в tmux-контуре сначала используй контролируемый
endpoint:

```sh
curl -sS -X POST http://10.66.0.10:6500/restart
curl -sS http://10.66.0.10:6500/health
```

Если endpoint возвращает `501`, host не запущен в поддерживаемом tmux-контуре.
Тогда используй реальный supervisor текущего процесса:

```sh
systemctl --user restart metafor-interpreter-web-dev.service
systemctl --user status metafor-interpreter-web-dev.service --no-pager
```

Если процессом владеет tmux/foreground, не смешивай это с systemd. Проверь
владельца и перезапускай его pane/session. Для известной tmux-сессии:

```sh
tmux capture-pane -pt metafor-interpreter-web-dev:interpreter.0 -S -120
tmux respawn-pane -k -t metafor-interpreter-web-dev:interpreter.0 -c /home/zavx0z/production/vendor/metafor /home/zavx0z/metafor-interpreter-web-dev/run.sh
```

Для restart только child `app/web/server.ts` через interpreter API:

```sh
curl -sS -X POST http://10.66.0.10:6500/processes/app-web-server.ts/action \
  -H 'content-type: application/json' \
  -d '{"action":"restart"}'
curl -sS http://10.66.0.10:3004/health
```

`POST /reload` на interpreter только просит UI-клиентов перезагрузить страницу.
Он не перечитывает host-код и не заменяет restart после изменения
`pkg/interpreter/src/*` или `pkg/interpreter/web/*`.

## Browser-Host Contract

Целевой Linux/Electron browser-host должен быть отдельным процессом с явным
state, а не зависимостью от macOS display пользователя:

- управляемый URL: по умолчанию `http://10.66.0.10:3004/` для dev server или
  `https://meta.proizvodstvo1.ru/` для проверки внешнего proxy/SSO;
- отдельный `user-data-dir`, чтобы cookies/cache/SSO не смешивались с личным
  браузером и с другими тестовыми контурами;
- CDP/debug port на loopback;
- health endpoint с состоянием process/window/page/CDP;
- restart endpoint, который перезапускает host process и публикует новый state;
- snapshot/frame stream для агента и человека;
- input proxy для pointer/keyboard/wheel с ack и последним input timestamp;
- команды reload/back/forward/devtools/fullscreen;
- source map/devtools workflow для app-web TypeScript;
- понятные ошибки запуска: нет `DISPLAY`, CDP не поднялся, app-web недоступен,
  страница не прошла readiness, input не доставляется.

Playwright допустим только как временный диагностический инструмент. Runtime
`browser-display` не должен требовать постоянный Playwright process или hidden
browser.

Interpreter bridge - это не сам browser-host и не display. Он должен быть
тонким proxy к локальному host API:

```text
INTERPRETER_BROWSER_HOST_URL=http://127.0.0.1:<port>
# или
INTERPRETER_BROWSER_HOST_PORT=<port>

GET  /browser-display/health
GET  /browser-display/state
GET  /browser-display/status
GET  /browser-display/snapshot
POST /browser-display/navigate
POST /browser-display/reload
POST /browser-display/back
POST /browser-display/forward
POST /browser-display/devtools
POST /browser-display/fullscreen
POST /browser-display/viewport
POST /browser-display/input
ANY  /browser-display/proxy/<path>
```

Маршрутный префикс `/browser-display` фиксирует модель: это будущий
first-class display в `Space`, а не HUD и не внешний браузер пользователя.

Ручной smoke для Electron browser-host:

```sh
DISPLAY=:0 \
METAFOR_URL=http://10.66.0.10:3004/ \
METAFOR_ELECTRON_HOST=1 \
METAFOR_ELECTRON_HOST_PORT=32123 \
METAFOR_ELECTRON_DEBUG_PORT=9230 \
bun --filter @app/electron dev:host

curl -sS http://127.0.0.1:32123/health
curl -sS http://127.0.0.1:32123/state
curl -sS http://127.0.0.1:32123/snapshot --output /tmp/browser-host.png
curl -sS http://127.0.0.1:9230/json/version
curl -sS http://127.0.0.1:9230/json/list
```

CDP endpoints полезны для диагностики DevTools/source maps, но рабочий путь
для агента и interpreter UI идет через browser-host HTTP API и bridge
`/browser-display/*`.

## Display В Space

`browser-display` должен появляться в `GET /space` как отдельный display, на
том же уровне, что `module:*` и `network:tmux`.

Минимальная модель:

- `displayId`: стабильный id, например `browser:app-web`;
- `kind`: `browser`;
- `label`: человекочитаемый URL/role;
- `visible`, `active`, `hovered`, `metrics`, `screenRect` как у других displays;
- `content.kind`: `browser`;
- `state`: `starting`, `ready`, `navigating`, `stale`, `failed`, `stopped`;
- `browser`: pid, URL, CDP port, window id/size, last navigation, last frame,
  last input, last error.

UI не должен рисовать browser-display как HUD. HUD может иметь только кнопки
управления, если они не становятся владельцем browser state.

## Snapshot И Input Workflow

Ожидаемый рабочий цикл после появления browser-host API:

```sh
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:6500/browser-display/health
curl -sS http://10.66.0.10:6500/browser-display/state
curl -sS http://10.66.0.10:6500/browser-display/snapshot --output /tmp/app-web.png
curl -sS -X POST http://10.66.0.10:6500/browser-display/input \
  -H 'content-type: application/json' \
  -d '{"type":"click","x":640,"y":360,"button":"left"}'
```

Snapshot должен содержать frame metadata: `frameId`, `capturedAt`, URL,
viewport, device scale factor и признак stale frame. Input должен возвращать
ack с координатами после mapping из `Space` display coordinates в content
viewport. Если страница не готова принять input, host должен возвращать ошибку,
а не молча терять событие.

## DevTools И Source Maps

Для текущего dev-контура app-web source maps включаются автоматически вне
production и при `NETWORK_TMUX_MODE=dev`. Явное управление:

```sh
APP_WEB_CLIENT_SOURCEMAP=1 bun run workspace.app.web:dev
APP_WEB_CLIENT_SOURCEMAP=0 bun run workspace.app.web:prod
```

В server/dev контуре сначала проверяй живой host и child, а не внешний proxy:

```sh
curl -sS http://10.66.0.10:6500/health
curl -sS http://10.66.0.10:3004/health
curl -sS http://127.0.0.1:9230/json/list
```

Если DevTools показывает старый compiled bundle:

1. проверь, что browser target открыт на `http://10.66.0.10:3004/`, а не на
   LAN `443` или старый external URL;
2. сделай hard reload page через browser-host/CDP;
3. если child `app/web/server.ts` должен пересобрать bundle, перезапусти child
   process через `POST /processes/app-web-server.ts/action`;
4. если менялся interpreter host bundle, перезапусти host через `POST /restart`
   или реальный supervisor;
5. в DevTools проверь, что исходники открываются как TypeScript files из
   `app/web`, `bulk/web` и workspace-пакетов.

## Диагностика

### Пустой Экран

Проверь контур и порты:

```sh
ss -ltnp | rg ':(6500|6499|3004|9230)\b'
curl -sS http://10.66.0.10:6500/health
curl -sS http://10.66.0.10:3004/health
curl -sS http://127.0.0.1:9230/json/list
```

Проверь, что browser target не ушел во внешний SSO/proxy flow и не открыт на
LAN `443`:

```sh
curl -sS http://127.0.0.1:9230/json/list | rg '10\.66\.0\.10:3004|meta\.proizvodstvo1\.ru'
```

Если interpreter UI стал белым после restart host, используй поддерживаемый
lifecycle:

```sh
curl -sS -X POST http://10.66.0.10:6500/restart
curl -sS http://10.66.0.10:6500/health
```

Не добавляй постоянные repaint/polling loops в UI ради этого симптома: причина
должна быть в lifecycle restart и ожидании `/health`.

### Stale Frame

Признаки: snapshot не меняется, browser-display показывает старый bundle,
input ack свежий, но кадр старый.

Проверки:

```sh
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:6500/browser-display/state
curl -sS http://127.0.0.1:9230/json/list
curl -sS http://10.66.0.10:3004/health
```

Действия по порядку:

1. reload page через browser-host/CDP;
2. hard reload с `ignoreCache`;
3. restart child `app-web-server.ts`;
4. restart host interpreter, если менялся interpreter bundle;
5. проверить, что snapshot metadata обновляет `frameId` и `capturedAt`.

### Неверный DISPLAY

Проверки для Linux/Electron host:

```sh
env | rg '^(DISPLAY|WAYLAND_DISPLAY|XDG_SESSION_TYPE|XAUTHORITY|XDG_RUNTIME_DIR)='
ls -l /tmp/.X11-unix
xdpyinfo -display "$DISPLAY" >/dev/null
pgrep -af 'electron|chrome|metafor'
```

Если host запускается из user systemd и должен попасть в текущую графическую
сессию:

```sh
systemctl --user import-environment DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR
systemctl --user restart metafor-browser-display.service
```

Для текущего server/dev Web UI не делай macOS browser обязательным backend.
Linux/Electron host должен работать в своем графическом контуре на сервере или
в выделенной Linux session.

### Потеря Ввода

Проверки:

- `browser-display` active/focused в `GET /space`;
- browser-host health показывает готовую page и свежий `lastFrame`;
- input proxy возвращает ack, а не timeout;
- координаты input попадают внутрь `screenRect` display;
- Electron window не minimized и не потерял focus;
- page не находится в modal/fullscreen/pointer-lock состоянии;
- DevTools console не содержит runtime errors после input.

Команды:

```sh
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:6500/browser-display/health
curl -sS http://127.0.0.1:9230/json/list
```

Если input теряется после навигации или reload, сначала дождись readiness page
через browser-host/CDP, затем повтори input. Не отправляй keyboard/mouse
напрямую в OS как основной путь: OS-level input допустим только как аварийная
диагностика, потому что он теряет связь с display coordinates и agent snapshot.

## Audit ai-macos

`/home/zavx0z/production/vendor/ai-macos` доступен. Проверенная структура:

```text
shared/src/
chrome/src/
screen/src/
window/src/
input/src/
android/src/
```

Переносимо в MetaFor browser-host:

- `shared/src/cdp.ts`: `CdpHttp`, `CdpSession`, `withSession`,
  `/json/version`, `/json/list`, CDP WebSocket request/response;
- `chrome/src/cdp-mode.ts`: CDP navigation, reload, eval, console collection,
  viewport override/window bounds, readiness hooks. Нужно отделить от выбора
  target через macOS window/tab state;
- `chrome/src/wait-ready.ts`: CDP readiness chain: `document.readyState`,
  fonts, network idle, images, reflow stability, animations, final double rAF;
- `shared/src/http.ts`: small JSON/error/PNG response helpers;
- `android/src/cdp.ts`: только re-export shared CDP layer.

Оставить darwin-specific:

- `shared/src/osa.ts`: `osascript`;
- `chrome/src/chrome.ts`: AppleScript/JXA для Google Chrome windows/tabs,
  `tabUrl`, `newWindow`, `activateTab`, fallback navigation/reload/eval;
- `screen/src/capture.ts` и `screen/src/index.ts`: `/usr/sbin/screencapture`,
  `sips`, Screen Recording permissions, rect/window desktop capture;
- `window/src/windows.ts`: System Events, Accessibility, Finder desktop bounds;
- `input/src/keyboard.ts`: System Events keystroke/key code;
- `input/src/mouse.ts`: CoreGraphics через Python, `cliclick`, System Events.

Практический вывод: сначала переносить только CDP/shared слой и readiness
логику. Для Linux/Electron browser-host не портировать широко `window`,
`screen` и `input`; захват кадра и input должны идти через Electron/CDP и
host API, а не через macOS Automation/CoreGraphics.
