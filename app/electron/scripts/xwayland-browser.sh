#!/usr/bin/env bash
set -euo pipefail

display="${METAFOR_XWAYLAND_DISPLAY:-:98}"
auth="${METAFOR_XWAYLAND_AUTHORITY:-/tmp/metafor-xwayland.Xauthority}"
width="${METAFOR_XWAYLAND_WIDTH:-1920}"
height="${METAFOR_XWAYLAND_HEIGHT:-1080}"
url="${METAFOR_URL:-https://meta.proizvodstvo1.ru/}"
profile="${METAFOR_XWAYLAND_CHROME_PROFILE:-/tmp/metafor-chrome-xwayland-98}"
debug_port="${METAFOR_XWAYLAND_CHROME_DEBUG_PORT:-9348}"

if ! DISPLAY="$display" XAUTHORITY="$auth" xdpyinfo >/dev/null 2>&1; then
  echo "Xwayland display $display is not available; start bun run xwayland:display first" >&2
  exit 1
fi

export DISPLAY="$display"
export XAUTHORITY="$auth"

exec google-chrome \
  --user-data-dir="$profile" \
  --no-first-run --no-default-browser-check --disable-sync --disable-extensions \
  --disable-component-extensions-with-background-pages --disable-infobars \
  --disable-translate --disable-session-crashed-bubble --test-type \
  --ozone-platform=x11 \
  --window-size="${width},${height}" --window-position=0,0 \
  --force-device-scale-factor=1 \
  --lang=ru-RU --accept-lang=ru-RU,ru,en-US,en \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port="$debug_port" \
  --remote-allow-origins='*' \
  --unsafely-treat-insecure-origin-as-secure=http://10.66.0.10:3004 \
  "$url"
