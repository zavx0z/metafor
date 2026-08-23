#!/usr/bin/env bash

set -euo pipefail
export LC_ALL=C LANG=C

action=${1:-}
checkout=${2:-}

[[ -n $action && -n $checkout ]] || {
  printf 'error: usage: %s {status|ensure|start|restart|logs|stop|health} <checkout>\n' "$0" >&2
  exit 1
}

shared="$checkout/pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh"
[[ -x $shared ]] || {
  printf 'error: shared UI dispatcher is missing or not executable: %s\n' "$shared" >&2
  exit 1
}

exec "$shared" "$action" "$checkout" nodes
