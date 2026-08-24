#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
source "$script_dir/managed-parent.sh"

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

expect_accept() {
  local name=$1 mode=$2 parents=$3
  require_reusable_parent "$mode" "$parents" >/dev/null \
    || fail "$name should accept the managed parent"
  printf 'ok - %s\n' "$name"
}

expect_reject() {
  local name=$1 mode=$2 parents=$3 expected=$4 output
  if output=$(require_reusable_parent "$mode" "$parents" 2>&1); then
    fail "$name should reject the managed parents"
  fi
  [[ $output == *"$expected"* ]] \
    || fail "$name returned an unexpected error: $output"
  printf 'ok - %s\n' "$name"
}

normal_parent=$'101\tttys001\t/opt/home/bin/bun run dev'
debug_parent=$'102\tttys001\t/opt/home/bin/bun run dev:debug'
start_parent=$'104\tttys001\t/opt/home/bin/bun run start'
unsupported_parent=$'105\tttys001\t/opt/home/bin/bun run start:debug'

expect_accept "one normal parent for normal start" normal "$normal_parent"
expect_accept "one debug parent for debug start" debug "$debug_parent"
expect_accept "one start parent for normal start" normal "$start_parent"
expect_reject \
  "normal parent for debug start" \
  debug \
  "$normal_parent" \
  "use restart-debug"
expect_reject \
  "debug parent for normal start" \
  normal \
  "$debug_parent" \
  "use restart"
expect_reject \
  "unsupported parent command" \
  normal \
  "$unsupported_parent" \
  "unsupported command"
expect_reject \
  "zero parents" \
  normal \
  "" \
  "exactly one managed parent, found 0"
expect_reject \
  "multiple normal parents" \
  normal \
  "$normal_parent"$'\n'$'103\tttys001\tbun run dev' \
  "exactly one managed parent, found 2"
expect_reject \
  "mixed normal and debug parents" \
  debug \
  "$normal_parent"$'\n'"$debug_parent" \
  "exactly one managed parent, found 2"
