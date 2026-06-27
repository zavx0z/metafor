#!/usr/bin/env bash
set -euo pipefail

display="${METAFOR_XWAYLAND_DISPLAY:-:98}"
auth="${METAFOR_XWAYLAND_AUTHORITY:-/tmp/metafor-xwayland.Xauthority}"
width="${METAFOR_XWAYLAND_WIDTH:-1920}"
height="${METAFOR_XWAYLAND_HEIGHT:-1080}"
output="${METAFOR_XWAYLAND_OUTPUT:-XWAYLAND0}"
runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
wayland_display="${WAYLAND_DISPLAY:-wayland-0}"
display_number="${display#:}"
host="$(hostname)"

configure_display() {
  local ready=0
  for _ in $(seq 1 80); do
    if DISPLAY="$display" XAUTHORITY="$auth" xdpyinfo >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 0.1
  done

  if [ "$ready" -ne 1 ]; then
    echo "Xwayland display $display did not become ready" >&2
    return 1
  fi

  DISPLAY="$display" XAUTHORITY="$auth" xrandr --output "$output" --mode "${width}x${height}" >/dev/null 2>&1 || true
  DISPLAY="$display" XAUTHORITY="$auth" xrandr | sed -n '1,8p'
}

if DISPLAY="$display" XAUTHORITY="$auth" xdpyinfo >/dev/null 2>&1; then
  echo "Xwayland display $display is already running"
  configure_display
  exit 0
fi

mkdir -p "$(dirname "$auth")"
touch "$auth"
chmod 600 "$auth"

xauth -f "$auth" remove "${host}/unix:${display_number}" "$display" >/dev/null 2>&1 || true
cookie="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
xauth -f "$auth" add "${host}/unix:${display_number}" . "$cookie"
xauth -f "$auth" add "$display" . "$cookie" >/dev/null 2>&1 || true

export XDG_RUNTIME_DIR="$runtime_dir"
export WAYLAND_DISPLAY="$wayland_display"
export XAUTHORITY="$auth"

Xwayland "$display" -noreset -auth "$auth" -geometry "${width}x${height}" &
pid="$!"

trap 'kill "$pid" >/dev/null 2>&1 || true' INT TERM EXIT

configure_display
wait "$pid"
