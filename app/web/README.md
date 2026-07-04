# AppWeb

`app/web` - браузерная оболочка визуализации Bulk. Она не управляет interpreter,
не содержит Codex/terminal/voice/android/source/TODO HUD и не запускает
interpreter processes.

## Запуск

AppWeb больше не является default server-dev target. Основной server-dev запуск
идёт через Dark:

```bash
bun run workspace.dark:dev
```

Старые root scripts `workspace.app.web:*` оставлены совместимыми aliases на Dark,
чтобы случайный старый запуск не возвращал AppWeb в роль серверного центра.
Package-local scripts `bun --filter @app/web ...` являются только явным
локальным запуском AppWeb-оболочки.

Явный локальный AppWeb dev:

```bash
bun --filter @app/web dev
```

## Runtime

`app/web/server.ts`:

- статически импортирует `dark/server` и использует готовый `globalThis.boundary`;
- отдаёт browser bundle и static assets;
- держит `/ws` для браузерного клиента;
- принимает `{ type: "materialize" | "relayout", src, layoutSettings }` и отдаёт
  `{ type: "snapshot", src, snapshot }` из `boundary.bulkRuntime()`;
- транслирует Force-события Boundary в браузер как `{ type: "force", parts }`;
- принимает HTTP `POST /force` с телом `{ parts: [...] }`;
- пока содержит приватные `/matrix/ws` и `/energy/ws` bridge endpoints.

AppWeb не открывает SQLite напрямую. Boundary storage открывается внутри Dark.

## HUD

HUD сейчас состоит только из:

- `Settings` - root src, layout/render settings и пересчёт сцены;
- fullscreen-кнопки.

Удалённые из AppWeb HUD слои не должны возвращаться в этот пакет:

- interpreter process/source inspector;
- Codex composer;
- terminal pane;
- voice controls/proxy/WebRTC;
- Android remote display/control;
- TODO panel;
- AppWeb-owned WebRTC signaling.

Interpreter tooling живёт в `pkg/interpreter`, а не в AppWeb.

## Settings

Настройки Bulk хранятся через `bulk/settings` в браузерном IndexedDB:

- `src`;
- `layoutSettings`;
- `renderSettings`.

Render settings применяются сразу к `bulkViewport`. Layout/src пересчитываются через
`materialize`/`relayout` запрос в `/ws`.

## TLS

Сервер поднимается по HTTPS, если заданы обе переменные:

- `TLS_KEY_FILE`;
- `TLS_CERT_FILE`.

Если HTTPS запущен на `PORT=443`, сервер сам поднимает redirect
`http://<host>/ -> https://<host>/`.

Дополнительно:

- `TLS_CA_FILE` - цепочка промежуточных CA;
- `TLS_PASSPHRASE` - пароль к приватному ключу;
- `PORT` - порт прослушивания, по умолчанию `3000`;
- `HOST` - адрес прослушивания, по умолчанию `127.0.0.1`.

Самоподписанный сертификат для LAN/dev:

```bash
bun --filter @app/web tls:selfsigned
```

Let's Encrypt выпуск по домену:

```bash
DOMAIN=metafor.example.com EMAIL=you@example.com bun --filter @app/web tls:issue
```
