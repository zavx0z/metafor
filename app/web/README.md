# Веб

```bash
bun run dev
```

Открой `http://localhost:3000`.

- `app/web/client.ts` импортирует `bulk/web` как пакет и остаётся тонким браузерным видовым клиентом.
- `app/web/server.ts` поднимает `dark/server`, открывает `Boundary` по `BOUNDARY_PATH`, получает снимок уже наполненной базы через `boundary.bulkRuntime()` и отдаёт браузеру готовые строки мира.
- `Dark` может работать совместно с `Boundary`: он открывает boundary-хранилище и материализует каноническую форму.
- `Energy` и `Bulk` не открывают `Boundary`/SQLite и не синхронизируют базу. Это рантайм-слои.
- `Bulk` должен получать события проекции/рантайма в реальном времени и вести собственный рантайм проекции; `AppWeb` получает уже готовые события рендера / строки мира.
- `app/web` не открывает SQLite напрямую: персистентный снимок восстановления для визуализации готовит `Boundary`.
- Подробный разбор передачи materialize/force/process: `app/web/INTERACTION_FLOW.md`

## TLS

Сервер поднимается по HTTPS, если заданы обе env-переменные `TLS_KEY_FILE` и `TLS_CERT_FILE`. Без них — обычный HTTP.

Дополнительно:
- `TLS_CA_FILE` — цепочка промежуточных CA (опционально)
- `TLS_PASSPHRASE` — пароль к приватному ключу (опционально)
- `PORT` — порт прослушивания (по умолчанию `3000`)

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
