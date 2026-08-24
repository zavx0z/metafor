#!/usr/bin/env bash

set -euo pipefail
export LC_ALL=C LANG=C

action=${1:-}
checkout=${2:-}

[[ -n $action && -n $checkout && $# == 2 ]] || {
  printf 'error: usage: %s {status|ensure|start|restart|logs|stop|health} <checkout>\n' "$0" >&2
  exit 1
}

script_dir=$(cd "$(dirname "$0")" && pwd)
exec "$script_dir/ui-dispatcher.sh" "$action" "$checkout" ui
