# Web UI Remote Desktop Display Runbook

Этот документ фиксирует рабочий контур Web UI и целевую форму общего server
desktop/browser display для интерпретатора. Цель - чтобы человек с любого
устройства и агент видели один и тот же серверный visual stream разработки.
Display должен быть равноправным экраном в `Space`, а не HUD-панелью,
iframe-оберткой или скрытым Playwright-клиентом.

Текущий основной realtime-канал - Chrome WebRTC stream на сервере. Проверенный
2026-06-27 рабочий путь без reboot/sudo: один Wayland/Mutter virtual monitor,
Google Chrome и sender `webrtc:chrome:monitor` на `127.0.0.1:32133`, который
инжектит `navigator.mediaDevices.getDisplayMedia()` через CDP и захватывает весь
server monitor. Ожидаемый state - `transport: "chrome-webrtc"`,
`capture.frameSource: "chrome-get-display-media:monitor"`,
`capture.frameWidth: 1920`, `capture.frameHeight: 1080`,
`capture.frameRate: 60`, `audio.transport:
"pipewire-pcm-track-generator-stream"`, `audio.trackCount: 1`, peer `connected`, data
channel `open`. `webrtc:chrome:browser`, Electron/PipeWire/MJPEG и Xwayland
остаются fallback/diagnostics.

## Проверенный Контекст

Проверено 2026-06-27 в репозиториях:

- `/home/zavx0z/production/vendor/metafor`, ветка `energy`;
- `/home/zavx0z/production/vendor/ai-macos`, доступен и содержит workspaces
  `shared`, `chrome`, `screen`, `window`, `input`, `android`.

Текущее состояние MetaFor:

- server/dev wrapper `/home/zavx0z/metafor-interpreter-web-dev/run.sh`
  выставляет `INTERPRETER_HTTP_HOST=10.66.0.10` и направляет
  `INTERPRETER_REMOTE_DESKTOP_HOST_PORT` /
  `INTERPRETER_REMOTE_DESKTOP_RTC_HOST_PORT` на `32133`;
- host interpreter слушает `http://10.66.0.10:6500/`;
- child `app/web/server.ts` запускается с `HOST=10.66.0.10` и `PORT=3004`;
- embedded interpreter внутри app-web доступен под каноническим префиксом
  `/hud/interpreter/*`; короткий `/interp/*` является поддерживаемым alias для
  тех же upstream routes;
- Bun inspector для child process остается локальным:
  `ws://127.0.0.1:6499/`;
- `app/electron` имеет обычный shell-режим, opt-in browser-host режим и
  opt-in remote desktop WebRTC sender:
  `METAFOR_ELECTRON_HOST=1` или `METAFOR_ELECTRON_HOST_PORT`, отдельный
  user-data-dir/session partition, local-only HTTP API, snapshot через
  `webContents.capturePage()`, WebRTC screen/audio capture через
  `desktopCapturer` / `getDisplayMedia`, управляемый URL/viewport/restart/input
  и CDP через
  `METAFOR_ELECTRON_DEBUG_PORT`;
- текущий Linux server remote desktop поднимается без перезагрузки машины:
  `bun run webrtc:chrome:monitor` в `app/electron`;
- Linux server script для Electron host - `bun --filter @app/electron
  host:linux` или `dev:host:linux`; он передает sandbox/Ozone flags на уровне
  запуска процесса, потому что эти флаги должны попасть в Electron binary до
  загрузки app main;
- interpreter-side bridge для browser-host использует `/browser-display/*`, а
  server desktop bridge использует `/remote-desktop/*`; оба проксируют только
  локальный host, заданный через `INTERPRETER_BROWSER_HOST_*` или
  `INTERPRETER_REMOTE_DESKTOP_HOST_*`;
- `GET /space` должен показывать `remote-desktop:server` как отдельный display
  рядом с `module:*` и `network:tmux`.

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

## Remote Desktop / WebRTC Contract

Целевой Linux/Electron remote desktop host должен быть отдельным процессом с
явным state, а не зависимостью от macOS display пользователя:

- управляемый URL: по умолчанию `http://10.66.0.10:3004/` для dev server или
  `https://meta.proizvodstvo1.ru/` для проверки внешнего proxy/SSO;
- отдельный `user-data-dir`, чтобы cookies/cache/SSO не смешивались с личным
  браузером и с другими тестовыми контурами;
- CDP/debug port на loopback;
- health endpoint с состоянием process/window/page/CDP;
- restart endpoint, который перезапускает host process и публикует новый state;
- WebRTC video stream всего серверного desktop через `/webrtc/signaling`;
- audio stream в том же RTCPeerConnection; текущий Linux server-dev sender
  берет active Google Chrome PipeWire output через `/desktop/audio.pcm`, заводит
  PCM frames в Chrome `MediaStreamTrackGenerator(AudioData)` и добавляет audio
  track в тот же PeerConnection;
- snapshot endpoint только как fallback/diagnostics;
- input proxy для pointer/keyboard/wheel с ack и последним input timestamp;
- команды reload/back/forward/devtools/fullscreen;
- source map/devtools workflow для app-web TypeScript;
- понятные ошибки запуска: нет `DISPLAY`, CDP не поднялся, app-web недоступен,
  страница не прошла readiness, input не доставляется.

Playwright допустим только как временный диагностический инструмент. Runtime
remote desktop display не должен требовать постоянный Playwright process.
Внутренняя Electron sender page допустима только как WebRTC endpoint: она не
является целевым display. Целевой visual source по умолчанию - `screen`, чтобы
человек и агент видели весь рабочий стол с открытым браузером.

Audio contract:

- `METAFOR_REMOTE_DESKTOP_AUDIO=0` выключает audio track;
- `METAFOR_REMOTE_DESKTOP_CHROME_AUDIO_SOURCE=display|pipewire|both`;
- в текущем Linux server-dev контуре `webrtc:chrome:monitor` использует
  `pipewire`: active Google Chrome `Stream/Output/Audio` node ->
  `/desktop/audio.pcm` -> `MediaStreamTrackGenerator(AudioData)` -> audio track в
  том же RTCPeerConnection. Если Chrome stream еще недоступен, sink monitor и
  `/desktop/audio.webm` остаются fallback/diagnostics, но на текущем сервере sink
  monitor может отдавать silence;
- state `/remote-desktop/rtc/state` должен показывать `audio.enabled`,
  `audio.transport` и `audio.trackCount`. Для основного server desktop
  ожидается `capture.frameSource: "chrome-get-display-media:monitor"`,
  `capture.frameWidth: 1920`, `capture.frameHeight: 1080` и
  `audio.transport: "pipewire-pcm-track-generator-stream"`. `pipewire-mjpeg` означает
  старый canvas fallback path и может давать больший CPU cost/lag.

Interpreter bridge - это не сам Electron host и не display. Он должен быть
тонким proxy к локальному host API и локальным WebRTC signaling server:

```text
INTERPRETER_BROWSER_HOST_URL=http://127.0.0.1:<port>
# или
INTERPRETER_BROWSER_HOST_PORT=<port>

# Current server-dev: one Chrome Wayland monitor host for health/snapshot/input/RTC.
INTERPRETER_REMOTE_DESKTOP_HOST_URL=http://127.0.0.1:32133
INTERPRETER_REMOTE_DESKTOP_RTC_HOST_URL=http://127.0.0.1:32133

# Generic override form for other hosts:
INTERPRETER_REMOTE_DESKTOP_HOST_PORT=<port>
INTERPRETER_REMOTE_DESKTOP_RTC_HOST_PORT=<port>

WS   /webrtc/signaling

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

GET  /remote-desktop/health
GET  /remote-desktop/state
GET  /remote-desktop/status
GET  /remote-desktop/rtc/state
POST /remote-desktop/rtc/restart
GET  /remote-desktop/snapshot
POST /remote-desktop/input
GET  /remote-desktop/browser/windows
POST /remote-desktop/browser/open
```

Маршрутный префикс `/remote-desktop` фиксирует модель server-owned display:
видимый поток живет в `Space`, а не в HUD и не во внешнем браузере пользователя.

Embedded app-web proxy:

- `/hud/interpreter/webrtc/signaling` и `/interp/webrtc/signaling` должны вести
  в тот же in-memory signaling room, что и upstream `/webrtc/signaling`;
- Electron sender и browser UI должны быть в одном in-memory signaling server.
  В текущем server-dev контуре owner - внешний interpreter на `6500`
  (`/webrtc/signaling`). `3004` - app-web dev server и embedded proxy, но не
  default signaling owner для внешней `https://dev.proizvodstvo1.ru/` вкладки;
- Если client events показывают `rtc room 1 peers`, `rtc video`, затем
  `rtc ice checking` -> `rtc ice disconnected`/`rtc failed`, signaling уже
  исправен. Дальше проверять media path: sender должен публиковать UDP host
  candidate `130.49.151.168:<40000-40100>`, а edge должен DNAT-ить этот порт в
  `10.66.0.10:<40000-40100>` через AmneziaWG. TURN в
  `METAFOR_REMOTE_DESKTOP_ICE_SERVERS` или `METAFOR_RTC_ICE_SERVERS` нужен
  только как fallback для других сетевых топологий;
- UI сначала читает `/remote-desktop/rtc/state`, берет фактический `signalUrl`
  sender-а, затем пробует кандидаты `/hud/interpreter`, `/interp` и direct
  `/webrtc/signaling`. Если signaling room открылся, но в нем нет
  `electron-desktop`, UI пробует следующий кандидат, чтобы не застрять на
  другом in-memory signaling server.

Ручной smoke для текущего Chrome Wayland monitor remote desktop host:

```sh
cd /home/zavx0z/production/vendor/metafor/app/electron

bun run webrtc:chrome:monitor

curl -sS http://10.66.0.10:6500/remote-desktop/rtc/state
curl -sS http://10.66.0.10:6500/remote-desktop/rtc/state \
  | jq '.remoteDesktop.ice.lastPublishedCandidate'
curl -sS http://127.0.0.1:32133/desktop/rtc/state
curl -sS http://127.0.0.1:32133/desktop/snapshot --output /tmp/rd.png
```

Проверка 2026-06-27: Electron 35.7.5 на текущем GNOME/Wayland/NVIDIA сервере
падает `SIGSEGV` в GPU/Viz даже без remote desktop RTC. Electron 42.5.0
работает в sender-only режиме через Wayland: hidden WebRTC page,
`METAFOR_ELECTRON_WEBGPU=0`, `ozone-platform=wayland`, отключенный Vulkan/VAAPI и
`METAFOR_REMOTE_DESKTOP_SYSTEM_PICKER=0`. Electron/X11/Ozone и Xwayland
оставлены как fallback/diagnostics; основной рабочий обход без reboot - Chrome
Wayland monitor sender на `32133`. Рабочий Linux sender state должен показывать
`capture.frameWidth=1920`, `capture.frameHeight=1080`,
`capture.frameSource: "chrome-get-display-media:monitor"` и
`audio.transport: "pipewire-pcm-track-generator-stream"`. Независимый WebRTC receiver
должен видеть `videoWidth=1920`, `videoHeight=1080`, `audioTracks=1` и растущие
`inbound-rtp` audio `bytesReceived`, `audioLevel` и `totalAudioEnergy`.
Audio-only
`getUserMedia({chromeMediaSource: "desktop"})` не использовать: на текущем
сервере он убивает Electron renderer bad IPC.

Если RTP audio bytes растут, но пользователь не слышит звук, сначала проверить
`wpctl status`: `/desktop/audio.pcm` должен читать active Google Chrome
`Stream/Output/Audio` node; capture от default sink monitor на текущем сервере
может выглядеть connected, но отдавать silence. Для проверки не-тишины
используй `client.remote-desktop.rtc-audio-receiver-stats`:
`muted:false`, растущие `bytesReceived`, ненулевые `audioLevel` и
`totalAudioEnergy`. Клиент интерпретатора держит основной spatial WebAudio
graph через `MediaElementAudioSourceNode` и `PannerNode`. Когда
`AudioContext` уже `running`, hidden media element остается unmuted, потому что
он является source node для graph; отдельного второго audible playback path нет.

Fallback-запуск через PipeWire bridge, если `:98` недоступен:

```sh
cd /home/zavx0z/production/vendor/metafor/app/electron
XDG_RUNTIME_DIR=/run/user/1000 \
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
DISPLAY=:0 \
XAUTHORITY=/run/user/1000/.mutter-Xwaylandauth.N4DER3 \
XDG_SESSION_TYPE=x11 \
METAFOR_URL=http://10.66.0.10:3004/ \
bun run webrtc:pipewire:screen
```

Этот PipeWire bridge является fallback/diagnostic контуром. В текущем рабочем
server-dev режиме не держи его параллельно с `webrtc:chrome:monitor` на
`127.0.0.1:32133`.
Production media path повторяет voice gateway: UDP `40000-40100` идет через
public edge `130.49.151.168`/`proizvodstvo1.ru` и DNAT в `10.66.0.10` по
AmneziaWG. Electron/Chromium должен ограничивать WebRTC sockets тем же range
через `METAFOR_REMOTE_DESKTOP_UDP_PORT_RANGE=40000-40100`, а опубликованные
host candidates должны быть переписаны на
`METAFOR_REMOTE_DESKTOP_PUBLIC_ICE_HOST=130.49.151.168`. Если Chromium создает
socket на `0.0.0.0`, raw diagnostics могут показывать локальный адрес вроде
`10.163.*`; проверять надо `ice.lastPublishedCandidate`, а не только
`ice.lastCandidate`.
Обязательная проверка - `GET http://127.0.0.1:32133/desktop/rtc/state`;
payload должен показывать `webRtc: true`, `transport: "chrome-webrtc"` и peer
`interpreter-desktop-*` после подключения UI.

CDP endpoints полезны для диагностики DevTools/source maps, но рабочий visual
и audio path для агента и interpreter UI идет через WebRTC signaling и
`remote-desktop:server` display. HTTP routes `/remote-desktop/*` нужны для
health, restart, fallback snapshot и input adapter diagnostics.
`/remote-desktop/rtc/state`, `/remote-desktop/rtc/restart`,
`/remote-desktop/input` и `/remote-desktop/snapshot` в текущем server-dev
контуре должны идти в Chrome Wayland monitor host `127.0.0.1:32133`. В app-web embedded режиме viewer может
использовать `/hud/interpreter/webrtc/signaling` как proxy, но sender и viewer
все равно должны сходиться в один signaling owner. Отдельный app-web HUD
endpoint `/hud/webrtc/signaling` не используется и не должен подниматься.

## Display В Space

`remote-desktop:server` должен появляться в `GET /space` как отдельный display, на
том же уровне, что `module:*` и `network:tmux`.

Минимальная модель:

- `displayId`: `remote-desktop:server`;
- `kind`: `remote-desktop`;
- `label`: `Server Desktop`;
- `visible`, `active`, `hovered`, `metrics`, `screenRect` как у других displays;
- `content.kind`: `browser`;
- `state`: `starting`, `ready`, `navigating`, `stale`, `failed`, `stopped`;
- `browser`: pid, URL, CDP port, window id/size, last navigation, last frame,
  last input, last error.

UI не должен рисовать remote desktop display как HUD. HUD может иметь только кнопки
управления, если они не становятся владельцем browser state.

## Snapshot И Input Workflow

Ожидаемый рабочий цикл после появления browser-host API:

```sh
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:6500/remote-desktop/health
curl -sS http://10.66.0.10:6500/remote-desktop/rtc/state
curl -sS http://10.66.0.10:6500/remote-desktop/snapshot --output /tmp/app-web.png
curl -sS -X POST http://10.66.0.10:6500/remote-desktop/input \
  -H 'content-type: application/json' \
  -d '{"type":"click","x":640,"y":360,"button":"left"}'
```

WebRTC video track является основным frame stream. Snapshot должен содержать
frame metadata: `frameId`, `capturedAt`, URL, viewport, device scale factor и
признак stale frame, когда используется fallback. Input должен возвращать ack с
координатами после mapping из `Space` display coordinates в content viewport.
Если страница не готова принять input, host должен возвращать ошибку, а не
молча терять событие.

## Стартовый Web UI Debug Layout

В server-dev контуре общий рабочий экран должен стартовать из
`app/electron/scripts/chrome-webrtc-monitor.sh`, а не руками через macOS
браузер. Скрипт включает `METAFOR_REMOTE_DESKTOP_CHROME_DEV_LAYOUT=1` и
поднимает один maximized Chrome window на виртуальном monitor `1920x1080`:

- слева открыта мобильная AppWeb page `http://10.66.0.10:3004/`;
- справа docked Chrome DevTools той же page;
- в DevTools выбран `Sources`;
- Console drawer открыт снизу;
- CDP доступен локально на `http://127.0.0.1:9349/json/list`;
- WebRTC/display host state доступен на
  `http://127.0.0.1:32133/desktop/rtc/state`.

Не меняй этот layout на два разных браузера или detached DevTools без явной
задачи: пользователь и агент должны видеть один и тот же рабочий контур через
interpreter display. Если layout сбился, сначала перезапусти Chrome monitor
host, затем проверь CDP targets:

```sh
curl -sS http://127.0.0.1:32133/desktop/rtc/state
curl -sS http://127.0.0.1:9349/json/list
```

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
curl -sS http://127.0.0.1:9349/json/list
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
ss -ltnp | rg ':(6500|6499|3004|32133|9349)\b'
curl -sS http://10.66.0.10:6500/health
curl -sS http://10.66.0.10:3004/health
curl -sS http://127.0.0.1:32133/desktop/rtc/state
curl -sS http://127.0.0.1:9349/json/list
```

Проверь, что browser target не ушел во внешний SSO/proxy flow и не открыт на
LAN `443`:

```sh
curl -sS http://127.0.0.1:9349/json/list | rg '10\.66\.0\.10:3004|meta\.proizvodstvo1\.ru'
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

Признаки: WebRTC frame не меняется или fallback snapshot показывает старый
bundle, input ack свежий, но кадр старый.

Проверки:

```sh
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:6500/remote-desktop/rtc/state
curl -sS http://127.0.0.1:9349/json/list
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
systemctl --user restart metafor-remote-desktop.service
```

Для текущего server/dev Web UI не делай macOS browser обязательным backend.
Linux/Electron host должен работать в своем графическом контуре на сервере или
в выделенной Linux session.

### Electron Sandbox/Ozone

Проверено 2026-06-26 на текущем server GUI:

- dev Electron binary после ручной распаковки требует либо root-owned
  `chrome-sandbox` с mode `4755`, либо запуск с `--no-sandbox`;
- Xwayland `DISPLAY=:0` с Electron 35 падает `SIGSEGV` в GPU/VAAPI/NVIDIA зоне
  даже без remote desktop RTC;
- основной server sender идет через Wayland `WAYLAND_DISPLAY=wayland-0` +
  Electron `ozone-platform=wayland`, чтобы full-screen WebRTC capture совпадал
  с Mutter/EIS input region и не отдавал черный кадр;
- X11/Ozone оставлен только как диагностический override:
  `METAFOR_ELECTRON_OZONE_PLATFORM=x11`;
- если запрошен `screen`, programmatic `desktopCapturer` обязан вернуть
  `screen:*`; fallback на `window:*` запрещен, потому что это маскирует
  нерабочий desktop stream;
- `METAFOR_REMOTE_DESKTOP_SYSTEM_PICKER=1` разрешен только как диагностический
  opt-in, когда нужно вручную проверить поведение PipeWire portal;
- `xvfb` на сервере не установлен, а `sudo -n apt-get install xvfb` требует
  интерактивную авторизацию.

Практический вывод: realtime video path - Electron WebRTC sender. Snapshot
polling оставлять только как diagnostics/fallback и не считать успешным live
display.

### Потеря Ввода

Проверки:

- `remote-desktop:server` active/focused в `GET /space`;
- browser-host health показывает готовую page и свежий `lastFrame`;
- input proxy возвращает ack, а не timeout;
- координаты input попадают внутрь `screenRect` display;
- Electron window не minimized и не потерял focus;
- page не находится в modal/fullscreen/pointer-lock состоянии;
- DevTools console не содержит runtime errors после input.

Команды:

```sh
curl -sS http://10.66.0.10:6500/space
curl -sS http://10.66.0.10:6500/remote-desktop/health
curl -sS http://127.0.0.1:9349/json/list
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
