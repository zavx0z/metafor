#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C LANG=C

script_dir=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$script_dir/../../../.." && pwd)
dispatcher="$script_dir/metafor-dev.sh"
action=${1:-start}

if [[ $# -gt 1 ]]; then
  printf 'Usage: metafor [start|status|stop|restart|logs|focus]\n' >&2
  exit 2
fi
case "$action" in
  -h|--help|help)
    printf 'Usage: metafor [start|status|stop|restart|logs|focus]\n'
    exit 0
    ;;
  start|status|stop|restart|logs|focus) ;;
  *) printf 'Unknown metafor command: %s\n' "$action" >&2; exit 2 ;;
esac

# Чтение уже работающего checkout не присваивает iTerm ownership и не требует GUI.
if [[ $action == start ]]; then
  port=$(jq -r '.scripts.dev | try capture("--port=(?<port>[0-9]+)").port catch ""' "$repo/cosmos/package.json")
  if [[ $port =~ ^[0-9]+$ ]]; then
    origin="http://127.0.0.1:$port"
    parents=$(ps -axo pid=,command= | awk '$2 ~ /(^|\/)bun$/ && $3 == "run" && $4 == "dev" {print $1}')
    for parent in $parents; do
      cwd=$(lsof -a -p "$parent" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p') || cwd=
      if [[ $cwd == "$repo/cosmos" ]] && curl --fail --silent --max-time 2 "$origin/health" | jq -e '.ok == true and .state == "running"' >/dev/null; then
        printf 'MetaFor готов: %s/\n' "$origin"
        exit 0
      fi
    done
  fi
fi

# Один dispatcher проверяет ownership; wrapper не управляет приложениями.
status=$("$dispatcher" status "$repo")
origin=$(awk '/^origin: / {print $2; exit}' <<<"$status")
[[ $origin == http://127.0.0.1:* ]] || { printf 'MetaFor: origin is unavailable\n' >&2; exit 1; }

health_state() {
  curl --fail --silent --max-time 2 "$origin/health" | jq -r \
    'if .ok == true and .state == "running" then "running" else "not-ready (\(.state // "unknown"))" end'
}

case "$action" in
  status)
    printf '%s\n' "$status"
    state=$(health_state) || state=unavailable
    printf 'MetaFor: %s\n' "$state"
    ;;
  start|restart)
    output=$("$dispatcher" "$action" "$repo") || { code=$?; printf '%s\n' "$output" >&2; exit "$code"; }
    # Legacy ready dispatcher проверяет HTTP; окончательный URL требует Quantum health.
    awk '!/^cosmos: ready /' <<<"$output"
    for ((attempt = 0; attempt < 120; attempt++)); do
      state=$(health_state) || state=unavailable
      if [[ $state == running ]]; then
        printf 'MetaFor готов: %s/\n' "$origin"
        exit 0
      fi
      sleep 1
    done
    printf 'MetaFor: health is %s; inspect metafor logs\n' "$state" >&2
    exit 1
    ;;
  stop|logs|focus) exec "$dispatcher" "$action" "$repo" ;;
esac
