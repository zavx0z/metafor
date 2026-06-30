# Веб

```bash
bun run dev
```

Открой `http://localhost:3000`.

Для доступа с Android или другого MacBook в той же сети:

```bash
bun --filter @app/web tls:selfsigned
bun --filter @app/web dev:tls
```

После production-запуска сервер печатает LAN URL вида `https://192.168.x.x/`.

Production/LAN entrypoint без interpreter:

```bash
bun run workspace.app.web:prod
```

Это запускает `app/web/run.ts --prod layout`: в tmux поднимается
`app/web/server.ts` с HTTPS на `443`, embedded HTTP redirect `80 -> 443`,
WebRTC signaling и embedded interpreter routes на `/hud/interpreter/*` без
SQLite upstream routes.
AppWeb больше не владеет отдельным Network HUD/display; диагностика server-dev
сети живет в interpreter tooling, а не в продуктовой AppWeb-оболочке.

Dev/LAN entrypoint под interpreter:

```bash
bun run workspace.app.web:dev
```

Это локальный/LAN-режим для разработки в одной сети, включая Android и другие устройства, которым нужен secure origin. Он запускает `app/web/run.ts --dev layout`: в tmux поднимается
`pkg/interpreter/interpreter.ts app/web/server.ts ...` с теми же production env
(`HOST=0.0.0.0`, `PORT=443`, TLS files), поэтому Android в локальной сети
открывает тот же secure origin `https://<mac-lan-ip>/`, но сам `app/web/server.ts`
виден как process в interpreter UI. `workspace.app.web` и `interpreter:web`
являются alias на этот dev/LAN режим.

Оба режима используют один tmux window и перед запуском закрывают конфликтующий
режим, чтобы из IntelliJ можно было кликнуть нужный script без ручной остановки.
Старый alias `workspace.app.web:product` оставлен и ведёт на `workspace.app.web:prod`.

Отдельный server/dev deployment на `dev.proizvodstvo1.ru` может быть поднят не LAN-скриптом напрямую, а user systemd unit `metafor-interpreter-web-dev.service`. Это не заменяет локальный/LAN-режим на `443`; это серверный контур за proxy/SSO. В таком контуре host interpreter обычно слушает `127.0.0.1:6500`, child `app/web/server.ts` слушает `127.0.0.1:3004`, а внешний домен проходит через серверный proxy/SSO. Для диагностики runtime сначала смотри локальные endpoints и service:

```bash
curl -sS http://127.0.0.1:6500/context
curl -sS http://127.0.0.1:6500/health
systemctl --user status metafor-interpreter-web-dev.service --no-pager
```

Shell `curl https://dev.proizvodstvo1.ru/...` не является надёжной проверкой runtime-состояния: он может вернуть SSO/nginx-ответ вместо состояния текущего interpreter host.

Server-dev контур с Matrix и Energy-shell запускается как один interpreter host
и три child processes:

- `app/web/server.ts` слушает AppWeb HTTP/browser API и приватный bridge
  `/matrix/ws` и `/energy/ws`;
- `matrix/server.ts` слушает `3005`, подключается к
  `ws://127.0.0.1:3004/matrix/ws`, получает `BoundaryMatrixRuntimeSnapshot` и
  Force-поток через AppWeb;
- `energy/server.ts` слушает `3006`, подключается к
  `ws://127.0.0.1:3004/energy/ws` и пока является оболочкой будущего
  distributed process executor;
- `Matrix` и `Energy` не импортируют `Boundary`/SQLite и не читают базу напрямую.

Локальная проверка:

```bash
bun run interpreter:web:matrix:energy
curl -sS http://127.0.0.1:6500/processes
curl -sS http://127.0.0.1:3004/health
curl -sS http://127.0.0.1:3005/health
curl -sS http://127.0.0.1:3006/health
```

В уже поднятом interpreter host Matrix запускается через существующий REST
контур управления окружением:

```bash
curl -sS -X POST http://10.66.0.10:6500/space/network/action \
  -H 'content-type: application/json' \
  -d '{"action":"start:matrix"}'
curl -sS -X POST http://10.66.0.10:6500/space/network/action \
  -H 'content-type: application/json' \
  -d '{"action":"restart:matrix"}'
curl -sS -X POST http://10.66.0.10:6500/space/network/action \
  -H 'content-type: application/json' \
  -d '{"action":"stop:matrix"}'
curl -sS -X POST http://10.66.0.10:6500/space/network/action \
  -H 'content-type: application/json' \
  -d '{"action":"start:energy"}'
```

Эти actions внутри используют `/processes`, поэтому Matrix и Energy получают
нормальные process display, inspector URL и lifecycle в общем interpreter
`Space`.

### Dev sourcemaps

В dev-контуре client bundle собирается с linked source maps, чтобы browser DevTools показывал исходные TypeScript-файлы `app/web`, `bulk/web` и связанных workspace-пакетов. Это включается автоматически вне production и при `NETWORK_TMUX_MODE=dev`.

Явное управление:

```bash
APP_WEB_CLIENT_SOURCEMAP=1 bun run workspace.app.web:dev
APP_WEB_CLIENT_SOURCEMAP=0 bun run workspace.app.web:prod
```

При включенных sourcemaps bundle не минифицируется. Если DevTools показывает старый compiled bundle, сначала проверь текущий dev-контур через локальный interpreter/API, затем перезапусти child process или host по реальному контуру запуска; не делай выводы по внешнему proxy-ответу `dev.proizvodstvo1.ru`.

- `app/web/client.ts` импортирует `bulk/web` как пакет и остаётся тонким браузерным видовым клиентом.
- `app/web/server.ts` статически импортирует `dark/server`, берёт `boundary` из `globalThis`, получает снимок уже наполненной базы через `boundary.bulkRuntime()` и отдаёт браузеру готовые строки мира. `BOUNDARY_PATH` передаётся при запуске и подхватывается самим `Boundary`.
- `app/web/server.ts` отдаёт приватные `/matrix/ws` и `/energy/ws`: отдельный
  `matrix/server.ts` получает `boundary.matrixRuntime()` и Force-сообщения, а
  `energy/server.ts` подключается как оболочка будущего process executor.
- `Dark` может работать совместно с `Boundary`: он открывает boundary-хранилище и материализует каноническую форму.
- `Matrix` и `Bulk` не открывают `Boundary`/SQLite и не синхронизируют базу. Это рантайм-слои.
- `Bulk` должен получать события проекции/рантайма в реальном времени и вести собственный рантайм проекции; `AppWeb` получает уже готовые события рендера / строки мира.
- `app/web` не открывает SQLite напрямую, не содержит SQLite HUD/панель базы и блокирует SQLite upstream routes в embedded interpreter proxy: персистентный снимок восстановления для визуализации готовит `Boundary`, а ручная инспекция базы остается инструментом interpreter.
- Подробный разбор передачи materialize/force/process: `app/web/INTERACTION_FLOW.md`

## TLS

Сервер поднимается по HTTPS, если заданы обе env-переменные `TLS_KEY_FILE` и `TLS_CERT_FILE`. Без них — обычный HTTP.
Если HTTPS запущен на `PORT=443`, сервер сам поднимает redirect `http://<host>/ -> https://<host>/`.

Дополнительно:
- `TLS_CA_FILE` — цепочка промежуточных CA (опционально)
- `TLS_PASSPHRASE` — пароль к приватному ключу (опционально)
- `PORT` — порт прослушивания (по умолчанию `3000`)
- `HOST` — адрес прослушивания (`127.0.0.1` по умолчанию, для сети используй `0.0.0.0`)

### WebRTC

`app/web` подключается к общему WebRTC signaling:

```
wss://signal.proizvodstvo1.ru/ws
```

Клиент входит в нужный `conversationId` как `participantId` и поднимает
`RTCDataChannel` к другим участникам через стандартный P2P/chat протокол.
WebRTC data channel шифруется самим протоколом, но для Android/микрофона
страница всё равно должна быть загружена с secure origin (`https://...`), иначе
браузер заблокирует `getUserMedia`.

Voice использует тот же signal origin и подключается к server-side WebRTC peer.
Клиент берёт `wss://signal.proizvodstvo1.ru/ws`, строит из него
`https://signal.proizvodstvo1.ru/voice/offer`, отправляет WebRTC offer и дальше
пишет `asr-control` + PCM16 в DataChannel `voice-asr`. Серверный peer работает
в `service/webrtc` на `ai-srv`.

Если в браузере остался старый signaling URL:

```js
localStorage.setItem("metafor.webrtc.signaling.url", "wss://signal.proizvodstvo1.ru/ws")
```

В консоли браузера:

```js
window.metaforWebRtc.peers()
window.metaforWebRtc.sendAll({ type: "ping" })
window.__metaVoiceRtcDebug()
```

### Выпуск сертификата Let's Encrypt (по домену)

Скрипт `scripts/tls-issue.sh` выпускает сертификат через `certbot` в режиме standalone (HTTP-01). Требуется установленный `certbot`, публичный домен с DNS на этот хост и свободный порт 80 на время челленджа.

```bash
# боевой выпуск
DOMAIN=metafor.example.com EMAIL=you@example.com bun --filter @app/web tls:issue

# тестовый CA (staging) — без rate-limit, но сертификат не доверенный
DOMAIN=metafor.example.com EMAIL=you@example.com bun --filter @app/web tls:issue:staging
```

Результат кладётся в `app/web/tls/` (добавлено в `.gitignore`):

```
app/web/tls/fullchain.pem
app/web/tls/privkey.pem
```

Продление — повторным запуском того же скрипта (`certbot` сам пропустит, если срок ещё есть, благодаря `--keep-until-expiring`). Для автоматики — `cron` или `systemd timer` раз в сутки.

### Самоподписанный сертификат (по IP или для разработки)

Let's Encrypt **не выпускает на голые IP**. Для доступа по IP или для локальной разработки — self-signed через `scripts/tls-selfsigned.sh` (требуется `openssl`).

```bash
# сертификат на IP
IP=1.2.3.4 bun --filter @app/web tls:selfsigned

# автоопределение localhost + hostname + LAN IP
bun --filter @app/web tls:selfsigned

# несколько IP и hostname
IP=1.2.3.4,192.168.1.10 HOST=metafor.local,localhost bun --filter @app/web tls:selfsigned

# только localhost
HOST=localhost bun --filter @app/web tls:selfsigned
```

Браузер покажет предупреждение "not trusted" — self-signed не подписан публичным CA. Варианты:

- нажать «Advanced → Proceed» (dev-сценарий)
- импортировать `app/web/tls/fullchain.pem` в системное доверенное хранилище на клиенте
- использовать [sslip.io](https://sslip.io) / [nip.io](https://nip.io) — публичный DNS, где `1-2-3-4.sslip.io` резолвится в `1.2.3.4`, и выпустить Let's Encrypt на этот hostname через `tls:issue`

### Запуск с TLS

После любого из вариантов:

```bash
TLS_KEY_FILE=app/web/tls/privkey.pem \
TLS_CERT_FILE=app/web/tls/fullchain.pem \
bun run dev
```

Из workspace-скрипта проще:

```bash
bun run workspace.app.web:dev   # под interpreter
bun run workspace.app.web:prod  # direct production
```
