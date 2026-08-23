#!/usr/bin/env bash

set -euo pipefail
export LC_ALL=C LANG=C

action=${1:-}
checkout=${2:-}
playground=root

[[ -n $action && -n $checkout ]] || {
  printf 'error: usage: %s {status|ensure|start|restart|logs|stop|health} <checkout> [--playground root|layout|ui]\n' "$0" >&2
  exit 1
}

if (( $# > 2 )); then
  [[ $# == 4 && ${3:-} == --playground && -n ${4:-} ]] || {
    printf 'error: --playground must immediately follow checkout and be one of root|layout|ui\n' >&2
    exit 1
  }
  playground=$4
fi

case "$playground" in
  root) selector=nodes ;;
  layout) selector=node-layout ;;
  ui) selector=node-ui ;;
  *)
    printf 'error: unknown Nodes playground: %s (expected root|layout|ui)\n' "$playground" >&2
    exit 1
    ;;
esac

shared="$checkout/pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh"
[[ -x $shared ]] || {
  printf 'error: shared UI dispatcher is missing or not executable: %s\n' "$shared" >&2
  exit 1
}

exec "$shared" "$action" "$checkout" "$selector"
