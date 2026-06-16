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
#   IP    — один или несколько IP через запятую (опционально; автоопределение LAN IP по умолчанию)
#   HOST  — один или несколько hostname через запятую (опционально; localhost + hostname по умолчанию)
#   DAYS  — срок жизни сертификата (по умолчанию 3650 = 10 лет)
#
# Результат: app/web/tls/fullchain.pem + app/web/tls/privkey.pem
# Браузер покажет предупреждение "not trusted" — это нормально для self-signed.
# Чтобы убрать предупреждение, импортируй app/web/tls/fullchain.pem как CA в системное хранилище.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/app/web/tls}"
DAYS="${DAYS:-3650}"
mkdir -p "$OUT_DIR"

detect_lan_ips() {
	{
		if command -v ipconfig >/dev/null 2>&1; then
			for iface in en0 en1 en2 bridge100; do
				ipconfig getifaddr "$iface" 2>/dev/null || true
			done
		fi
		if command -v ip >/dev/null 2>&1; then
			ip -4 addr show scope global 2>/dev/null | awk '{if ($1 == "inet") {split($2, a, "/"); print a[1]}}'
		elif command -v ifconfig >/dev/null 2>&1; then
			ifconfig 2>/dev/null | awk '{if ($1 == "inet" && $2 !~ /^127\\./) print $2}'
		fi
	} | awk 'NF && !seen[$0]++'
}

default_hosts() {
	{
		echo "localhost"
		hostname -s 2>/dev/null || true
		hostname 2>/dev/null || true
	} | awk 'NF && !seen[$0]++'
}

if [ -z "${IP:-}" ]; then
	IP="$(printf "127.0.0.1\n"; detect_lan_ips | grep -v '^127\.')"
	IP="$(printf "%s\n" "$IP" | awk 'NF && !seen[$0]++' | paste -sd, -)"
fi

if [ -z "${HOST:-}" ]; then
	HOST="$(default_hosts | paste -sd, -)"
fi

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
