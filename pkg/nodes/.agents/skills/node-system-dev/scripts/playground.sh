#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
PORT="${NODE_SYSTEM_DEV_PORT:-4016}"
HOST="127.0.0.1"
ORIGIN="http://${HOST}:${PORT}"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || ((PORT < 1 || PORT > 65535)); then
  echo "NODE_SYSTEM_DEV_PORT must be an integer from 1 to 65535" >&2
  exit 64
fi

if [[ ! -f "$CHECKOUT/pkg/nodes/ui/playground/server.ts" ]]; then
  echo "Cannot resolve MetaFor checkout from $SCRIPT_DIR" >&2
  exit 66
fi

CHECKOUT_KEY="$(printf '%s:%s' "$CHECKOUT" "$PORT" | cksum | awk '{print $1}')"
TEMP_ROOT="${TMPDIR:-/tmp}"
TEMP_ROOT="${TEMP_ROOT%/}"
STATE_DIR="$TEMP_ROOT/node-system-dev-${CHECKOUT_KEY}"
PID_FILE="$STATE_DIR/playground.pid"
LOG_FILE="$STATE_DIR/playground.log"

listener_pids() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

recorded_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(sed -n '1p' "$PID_FILE")"
    if [[ "$pid" =~ ^[0-9]+$ ]]; then
      printf '%s' "$pid"
    fi
  fi
}

process_cwd() {
  local pid="$1"
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
}

process_command() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null || true
}

is_listener() {
  local candidate="$1"
  local pid
  while IFS= read -r pid; do
    [[ "$pid" == "$candidate" ]] && return 0
  done < <(listener_pids)
  return 1
}

is_owned() {
  local pid
  pid="$(recorded_pid)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  is_listener "$pid" || return 1
  [[ "$(process_cwd "$pid")" == "$CHECKOUT" ]] || return 1
  [[ "$(process_command "$pid")" == *"pkg/nodes/ui/playground/server.ts"* ]]
}

probe_health() {
  curl -fsS --max-time 2 "$ORIGIN/" 2>/dev/null |
    grep -Fq '<title>Node Component Library</title>'
}

print_status() {
  local listeners owner health pid state
  listeners="$(listener_pids | paste -sd, -)"
  owner="none"
  pid=""
  state="stopped"
  if [[ -n "$listeners" ]]; then
    state="running"
  fi
  if is_owned; then
    owner="skill"
    pid="$(recorded_pid)"
  elif [[ -n "$listeners" ]]; then
    owner="external"
  fi
  health="failed"
  if probe_health; then
    health="ok"
  fi
  printf 'origin=%s status=%s health=%s owner=%s pid=%s listeners=%s log=%s\n' \
    "$ORIGIN" "$state" "$health" "$owner" "$pid" "${listeners:-none}" "$LOG_FILE"
}

serve_playground() {
  local listeners pid attempt exit_code
  listeners="$(listener_pids | paste -sd, -)"
  if is_owned; then
    echo "Owned listener already exists; preserve its long-lived PTY session" >&2
    print_status >&2
    return 2
  fi
  if [[ -n "$listeners" ]]; then
    echo "Preserving unowned listener on $ORIGIN (pid ${listeners})" >&2
    print_status >&2
    return 2
  fi

  mkdir -p "$STATE_DIR"
  rm -f "$PID_FILE"
  : >"$LOG_FILE"
  cd "$CHECKOUT"
  env \
    NODES_COMPONENT_PLAYGROUND_HOST="$HOST" \
    NODES_COMPONENT_PLAYGROUND_PORT="$PORT" \
    bun pkg/nodes/ui/playground/server.ts >"$LOG_FILE" 2>&1 &
  pid="$!"
  printf '%s\n' "$pid" >"$PID_FILE"

  cleanup_serve() {
    local serve_pid="$1"
    if kill -0 "$serve_pid" 2>/dev/null; then
      kill -TERM "$serve_pid" 2>/dev/null || true
      wait "$serve_pid" 2>/dev/null || true
    fi
    if [[ "$(recorded_pid)" == "$serve_pid" ]]; then
      rm -f "$PID_FILE"
    fi
  }
  trap "cleanup_serve '$pid'" EXIT
  trap 'exit 130' INT TERM

  for attempt in {1..50}; do
    if probe_health && is_owned; then
      print_status
      set +e
      wait "$pid"
      exit_code="$?"
      set -e
      return "$exit_code"
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Playground exited during startup; log: $LOG_FILE" >&2
      tail -40 "$LOG_FILE" >&2 || true
      rm -f "$PID_FILE"
      return 1
    fi
    sleep 0.2
  done

  echo "Playground did not become healthy; terminating exact owned pid $pid" >&2
  print_status >&2
  return 1
}

stop_playground() {
  local pid attempt
  if ! is_owned; then
    if [[ -n "$(listener_pids)" ]]; then
      echo "Preserving unowned listener on $ORIGIN" >&2
    fi
    print_status
    return 0
  fi

  pid="$(recorded_pid)"
  kill -TERM "$pid"
  for attempt in {1..25}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      print_status
      return 0
    fi
    sleep 0.2
  done

  if is_owned; then
    kill -KILL "$pid"
  fi
  rm -f "$PID_FILE"
  print_status
}

print_logs() {
  if [[ ! -f "$LOG_FILE" ]]; then
    echo "No playground log for $ORIGIN" >&2
    return 1
  fi
  tail -200 "$LOG_FILE"
}

case "${1:-}" in
  status)
    print_status
    ;;
  health)
    if probe_health; then
      print_status
    else
      print_status >&2
      exit 1
    fi
    ;;
  serve)
    serve_playground
    ;;
  logs)
    print_logs
    ;;
  stop)
    stop_playground
    ;;
  *)
    echo "Usage: $0 {status|health|serve|logs|stop}" >&2
    exit 64
    ;;
esac
