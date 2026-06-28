#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
display="${METAFOR_XWAYLAND_DISPLAY:-:98}"
auth="${METAFOR_XWAYLAND_AUTHORITY:-/tmp/metafor-xwayland.Xauthority}"
display_session="${METAFOR_XWAYLAND_TMUX_SESSION:-metafor-xwayland-display}"

is_display_ready() {
  DISPLAY="$display" XAUTHORITY="$auth" xdpyinfo >/dev/null 2>&1
}

wait_for_display() {
  local attempts="${1:-80}"
  for _ in $(seq 1 "$attempts"); do
    if is_display_ready; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

start_display() {
  if command -v tmux >/dev/null 2>&1; then
    if tmux has-session -t "$display_session" 2>/dev/null && ! wait_for_display 20; then
      tmux kill-session -t "$display_session" 2>/dev/null || true
    fi
    tmux has-session -t "$display_session" 2>/dev/null \
      || tmux new-session -d -s "$display_session" -n xwayland -c "$script_dir/.." "bash scripts/xwayland-display.sh"
  else
    nohup bash "$script_dir/xwayland-display.sh" >/tmp/metafor-xwayland-display.log 2>&1 &
  fi
  wait_for_display 80
}

if ! is_display_ready; then
  start_display || true
fi

if ! is_display_ready; then
  echo "Xwayland display $display is not available and auto-start failed" >&2
  exit 1
fi

export DISPLAY="$display"
export XAUTHORITY="$auth"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_SESSION_TYPE="${METAFOR_XWAYLAND_SESSION_TYPE:-x11}"
export METAFOR_REMOTE_DESKTOP_HOST_PORT="${METAFOR_REMOTE_DESKTOP_HOST_PORT:-32133}"
export METAFOR_REMOTE_DESKTOP_CHROME_RTC=1
export METAFOR_REMOTE_DESKTOP_MANAGED_BROWSER=1
export METAFOR_REMOTE_DESKTOP_CHROME_OZONE_PLATFORM=x11
export METAFOR_REMOTE_DESKTOP_CHROME_PIPEWIRE=0
export METAFOR_REMOTE_DESKTOP_CHROME_DEBUG_PORT="${METAFOR_REMOTE_DESKTOP_CHROME_DEBUG_PORT:-9349}"
export METAFOR_REMOTE_DESKTOP_BROWSER_PROFILE="${METAFOR_REMOTE_DESKTOP_BROWSER_PROFILE:-/tmp/metafor-chrome-rtc-xwayland-98-browser}"
export METAFOR_REMOTE_DESKTOP_WIDTH="${METAFOR_REMOTE_DESKTOP_WIDTH:-1920}"
export METAFOR_REMOTE_DESKTOP_HEIGHT="${METAFOR_REMOTE_DESKTOP_HEIGHT:-1080}"
export METAFOR_REMOTE_DESKTOP_RTC_FPS="${METAFOR_REMOTE_DESKTOP_RTC_FPS:-60}"
export METAFOR_REMOTE_DESKTOP_RTC_VIDEO_BITRATE="${METAFOR_REMOTE_DESKTOP_RTC_VIDEO_BITRATE:-30000000}"
export METAFOR_REMOTE_DESKTOP_AUDIO="${METAFOR_REMOTE_DESKTOP_AUDIO:-1}"
export METAFOR_REMOTE_DESKTOP_CHROME_CAPTURE_SURFACE="${METAFOR_REMOTE_DESKTOP_CHROME_CAPTURE_SURFACE:-browser}"
export METAFOR_REMOTE_DESKTOP_CHROME_AUTO_SELECT_SOURCE="${METAFOR_REMOTE_DESKTOP_CHROME_AUTO_SELECT_SOURCE:-MetaFor}"
export METAFOR_REMOTE_DESKTOP_SIGNAL_URL="${METAFOR_REMOTE_DESKTOP_SIGNAL_URL:-ws://10.66.0.10:6500/webrtc/signaling}"

exec node linux-pipewire-host.cjs
