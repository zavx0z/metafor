#!/usr/bin/env bash

managed_parent_mode() {
  local command=$1
  if [[ $command =~ (^|[[:space:]])([^[:space:]]*/)?bun[[:space:]]+run[[:space:]]+dev:debug($|[[:space:]]) ]]; then
    printf 'debug\n'
    return
  fi
  if [[ $command =~ (^|[[:space:]])([^[:space:]]*/)?bun[[:space:]]+run[[:space:]]+(dev|start)($|[[:space:]]) ]]; then
    printf 'normal\n'
    return
  fi
  return 1
}

require_reusable_parent() {
  local requested_mode=$1 parents=$2 parent_count parent_line command actual_mode
  parent_count=$(awk 'NF { count += 1 } END { print count + 0 }' <<<"$parents")
  if [[ $parent_count != 1 ]]; then
    printf 'Cosmos reuse requires exactly one managed parent, found %s\n' "$parent_count"
    return 1
  fi

  parent_line=${parents%%$'\n'*}
  command=${parent_line#*$'\t'}
  command=${command#*$'\t'}
  if ! actual_mode=$(managed_parent_mode "$command"); then
    printf 'Cosmos managed parent has an unsupported command: %s\n' "$command"
    return 1
  fi
  [[ $actual_mode == "$requested_mode" ]] && return

  if [[ $requested_mode == debug ]]; then
    printf 'Cosmos already runs in normal mode; use restart-debug\n'
  else
    printf 'Cosmos already runs in debug mode; use restart\n'
  fi
  return 1
}
