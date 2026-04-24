#!/usr/bin/env bash
#
# Self-signed TLS-сертификат для dev/IP-доступа.
# Let's Encrypt не выпускает на голые IP — для IP используется этот скрипт.
#
# Использование:
#   IP=1.2.3.4 ./scripts/tls-selfsigned.sh
#   IP=1.2.3.4 HOST=metafor.local ./scripts/tls-selfsigned.sh
#   HOST=localhost ./scripts/tls-selfsigned.sh
#
# Переменные:
#   IP    — один или несколько IP через запятую (опционально, если задан HOST)
#   HOST  — один или несколько hostname через запятую (опционально, если задан IP)
#   DAYS  — срок жизни сертификата (по умолчанию 3650 = 10 лет)
#
# Результат: app/web/tls/fullchain.pem + app/web/tls/privkey.pem
# Браузер покажет предупреждение "not trusted" — это нормально для self-signed.
# Чтобы убрать предупреждение, импортируй app/web/tls/fullchain.pem как CA в системное хранилище.

set -euo pipefail

if [ -z "${IP:-}" ] && [ -z "${HOST:-}" ]; then
	echo "IP или HOST обязателен. Пример: IP=1.2.3.4 ./scripts/tls-selfsigned.sh" >&2
	exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/app/web/tls}"
DAYS="${DAYS:-3650}"
mkdir -p "$OUT_DIR"

# Собираем SAN
SAN=""
SUBJECT_CN=""
IFS=',' read -ra IP_LIST <<< "${IP:-}"
IFS=',' read -ra HOST_LIST <<< "${HOST:-}"

for h in "${HOST_LIST[@]}"; do
	[ -z "$h" ] && continue
	SAN="${SAN}DNS:${h},"
	[ -z "$SUBJECT_CN" ] && SUBJECT_CN="$h"
done
for ip in "${IP_LIST[@]}"; do
	[ -z "$ip" ] && continue
	SAN="${SAN}IP:${ip},"
	[ -z "$SUBJECT_CN" ] && SUBJECT_CN="$ip"
done
SAN="${SAN%,}"

CONF_FILE="$(mktemp)"
trap 'rm -f "$CONF_FILE"' EXIT

cat > "$CONF_FILE" <<EOF
[req]
distinguished_name = dn
prompt = no
x509_extensions = v3

[dn]
CN = $SUBJECT_CN

[v3]
subjectAltName = $SAN
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

echo "→ генерация self-signed сертификата"
echo "  CN   : $SUBJECT_CN"
echo "  SAN  : $SAN"
echo "  days : $DAYS"
echo "  out  : $OUT_DIR"

openssl req -x509 -newkey rsa:2048 -sha256 -days "$DAYS" -nodes \
	-keyout "$OUT_DIR/privkey.pem" \
	-out "$OUT_DIR/fullchain.pem" \
	-config "$CONF_FILE"

chmod 600 "$OUT_DIR/privkey.pem"
chmod 644 "$OUT_DIR/fullchain.pem"

echo "✓ сертификат готов:"
echo "  cert : $OUT_DIR/fullchain.pem"
echo "  key  : $OUT_DIR/privkey.pem"
echo
echo "Запуск сервера с TLS:"
echo "  TLS_KEY_FILE=$OUT_DIR/privkey.pem \\"
echo "  TLS_CERT_FILE=$OUT_DIR/fullchain.pem \\"
echo "  bun run dev"
