#!/usr/bin/env bash
#
# Выпуск TLS-сертификата через Let's Encrypt (ACME HTTP-01, certbot standalone).
#
# Использование:
#   DOMAIN=example.com EMAIL=you@example.com ./scripts/tls-issue.sh
#   DOMAIN=example.com EMAIL=you@example.com STAGING=1 ./scripts/tls-issue.sh
#
# Требования:
#   - certbot установлен (apt install certbot / brew install certbot)
#   - порт 80 свободен и доступен извне (standalone HTTP-01)
#   - права на запись в OUT_DIR (по умолчанию dark/tls)
#
# Результат:
#   OUT_DIR/fullchain.pem
#   OUT_DIR/privkey.pem
#
# После выпуска запустить сервер:
#   TLS_KEY_FILE=dark/tls/privkey.pem \
#   TLS_CERT_FILE=dark/tls/fullchain.pem \
#   bun run dev

set -euo pipefail

: "${DOMAIN:?DOMAIN is required (например DOMAIN=metafor.example.com)}"
: "${EMAIL:?EMAIL is required (ACME account email)}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/dark/tls}"
WORK_DIR="${WORK_DIR:-$ROOT/dark/tmp/letsencrypt}"
CONFIG_DIR="$WORK_DIR/config"
LOGS_DIR="$WORK_DIR/logs"
WORK_SUBDIR="$WORK_DIR/work"

STAGING_FLAG=""
if [ "${STAGING:-0}" = "1" ]; then
	STAGING_FLAG="--staging"
	echo "→ staging mode (тестовый CA, сертификат не доверенный браузером)"
fi

mkdir -p "$OUT_DIR" "$CONFIG_DIR" "$LOGS_DIR" "$WORK_SUBDIR"

if ! command -v certbot >/dev/null 2>&1; then
	echo "certbot не найден. Установи: sudo apt install certbot   (или brew install certbot)" >&2
	exit 1
fi

echo "→ выпуск сертификата для $DOMAIN"
echo "  account email : $EMAIL"
echo "  config dir    : $CONFIG_DIR"
echo "  output dir    : $OUT_DIR"

# HTTP-01 standalone: certbot сам поднимает сервер на :80 на время челленджа.
# Если порт 80 занят — останови свой reverse-proxy или используй --webroot.
SUDO=""
if [ "$EUID" -ne 0 ] && [ ! -w /var/log ]; then
	# порт 80 требует root; если не root — оборачиваем в sudo
	SUDO="sudo"
fi

$SUDO certbot certonly \
	--standalone \
	--non-interactive \
	--agree-tos \
	--email "$EMAIL" \
	--domain "$DOMAIN" \
	--config-dir "$CONFIG_DIR" \
	--work-dir "$WORK_SUBDIR" \
	--logs-dir "$LOGS_DIR" \
	--preferred-challenges http \
	--keep-until-expiring \
	$STAGING_FLAG

LIVE_DIR="$CONFIG_DIR/live/$DOMAIN"
if [ ! -f "$LIVE_DIR/fullchain.pem" ] || [ ! -f "$LIVE_DIR/privkey.pem" ]; then
	echo "certbot не положил fullchain.pem/privkey.pem в $LIVE_DIR" >&2
	exit 1
fi

# Копируем наружу по устойчивым путям, которые читает server.ts.
# Важно: certbot под sudo создаёт файлы от root — приводим владельца обратно.
$SUDO cp "$LIVE_DIR/fullchain.pem" "$OUT_DIR/fullchain.pem"
$SUDO cp "$LIVE_DIR/privkey.pem"   "$OUT_DIR/privkey.pem"
if [ -n "$SUDO" ]; then
	$SUDO chown "$(id -u):$(id -g)" "$OUT_DIR/fullchain.pem" "$OUT_DIR/privkey.pem"
fi
chmod 600 "$OUT_DIR/privkey.pem"
chmod 644 "$OUT_DIR/fullchain.pem"

echo "✓ сертификат готов:"
echo "  cert : $OUT_DIR/fullchain.pem"
echo "  key  : $OUT_DIR/privkey.pem"
echo
echo "Запусти сервер с TLS:"
echo "  TLS_KEY_FILE=$OUT_DIR/privkey.pem \\"
echo "  TLS_CERT_FILE=$OUT_DIR/fullchain.pem \\"
echo "  bun run dev"
