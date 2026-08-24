#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
source "$script_dir/inspector.sh"

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

expect_equal() {
  local name=$1 actual=$2 expected=$3
  [[ $actual == "$expected" ]] || fail "$name: expected '$expected', got '$actual'"
  printf 'ok - %s\n' "$name"
}

expect_mode_reject() {
  local name=$1 mode=$2 requested=$3 children=$4 listeners=$5 expected=$6 output
  if output=$(require_managed_release_mode \
    "$mode" "$requested" "$children" /repo/cosmos/release "$listeners" 2>&1); then
    fail "$name should reject release mode"
  fi
  [[ $output == *"$expected"* ]] || fail "$name returned an unexpected error: $output"
  printf 'ok - %s\n' "$name"
}

expect_equal "default Inspector port" "$(resolve_inspector_port "")" "6499"
expect_equal "overridden Inspector port" "$(resolve_inspector_port 6501)" "6501"
expect_equal "overridden Inspector address" "$(inspector_address_for_port 6501)" "127.0.0.1:6501"

COSMOS_RELEASE_INSPECT=127.0.0.1:7777
configure_terminal_inspector_environment normal
[[ ${COSMOS_RELEASE_INSPECT+x} != x ]] || fail "normal terminal environment should unset inherited Inspector"
printf 'ok - normal terminal environment unsets inherited Inspector\n'

configure_terminal_inspector_environment debug 127.0.0.1:6501
expect_equal "debug terminal environment exports selected address" \
  "$COSMOS_RELEASE_INSPECT" "127.0.0.1:6501"

normal_child=$'201\tttys001\t/opt/home/bin/bun --conditions=cosmos:server --conditions=internal:server /repo/cosmos/release/dist/versions/0.1.14/server.js'
debug_child=$'202\tttys001\t/opt/home/bin/bun --inspect=127.0.0.1:6501 --conditions=cosmos:server --conditions=internal:server /repo/cosmos/release/dist/versions/0.1.14/server.js'
foreign_child=$'203\tttys001\t/opt/home/bin/bun /repo/cosmos/startup/server/index.ts'
second_debug_child=$'204\tttys001\t/opt/home/bin/bun --inspect=127.0.0.1:6501 /repo/cosmos/release/dist/versions/0.1.15/server.js'
non_semver_child=$'205\tttys001\t/opt/home/bin/bun /repo/cosmos/release/dist/versions/current/server.js'
leading_zero_child=$'206\tttys001\t/opt/home/bin/bun /repo/cosmos/release/dist/versions/01.1.0/server.js'
prerelease_child=$'207\tttys001\t/opt/home/bin/bun /repo/cosmos/release/dist/versions/1.2.3-beta.1/server.js'

is_exact_release_command \
  "/opt/home/bin/bun /repo/cosmos/release/dist/versions/1.2.3/server.js" \
  /repo/cosmos/release || fail "project-version release artifact should be exact"
printf 'ok - exact release artifact requires a project version\n'
expect_equal "non-SemVer release directory is not exact" \
  "$(release_inspector_state "$non_semver_child" /repo/cosmos/release)" $'absent\t0'
expect_equal "stable version accepts the same numeric form as project isVersion" \
  "$(release_inspector_state "$leading_zero_child" /repo/cosmos/release)" $'normal\t206'
expect_equal "prerelease directory is not an exact stable version" \
  "$(release_inspector_state "$prerelease_child" /repo/cosmos/release)" $'absent\t0'

expect_equal "normal exact release has no Inspector" \
  "$(release_inspector_state "$foreign_child"$'\n'"$normal_child" /repo/cosmos/release)" \
  $'normal\t201'
expect_equal "status derives overridden address from exact release child" \
  "$(release_inspector_state "$foreign_child"$'\n'"$debug_child" /repo/cosmos/release)" \
  $'debug\t202\t127.0.0.1:6501'

expect_equal "normal end-to-end mode" \
  "$(require_managed_release_mode normal 127.0.0.1:6501 "$normal_child" /repo/cosmos/release '')" \
  $'normal\t201'
expect_mode_reject \
  "normal mode with Inspector child" normal 127.0.0.1:6501 "$debug_child" 202 \
  "without --inspect"
expect_equal "debug end-to-end mode" \
  "$(require_managed_release_mode debug 127.0.0.1:6501 "$debug_child" /repo/cosmos/release 202)" \
  $'debug\t202\t127.0.0.1:6501'
expect_mode_reject \
  "debug mode with different requested override" debug 127.0.0.1:6499 "$debug_child" 202 \
  "use restart-debug"
expect_mode_reject \
  "debug mode with multiple exact release descendants" debug 127.0.0.1:6501 \
  "$debug_child"$'\n'"$second_debug_child" $'202\n204' \
  "got multiple"
expect_mode_reject \
  "debug mode with foreign listener" debug 127.0.0.1:6501 "$debug_child" 901 \
  "got foreign 901"
expect_mode_reject \
  "debug mode with multiple listeners" debug 127.0.0.1:6501 "$debug_child" $'202\n901' \
  "got multiple 2"
expect_mode_reject \
  "debug mode without listener" debug 127.0.0.1:6501 "$debug_child" '' \
  "got missing"

expect_equal "managed Inspector listener" \
  "$(inspector_listener_ownership 202 202)" $'managed\t202'
expect_equal "foreign Inspector listener" \
  "$(inspector_listener_ownership 202 901)" $'foreign\t901'
expect_equal "multiple Inspector listeners" \
  "$(inspector_listener_ownership 202 $'202\n901')" $'multiple\t2'
expect_equal "missing Inspector listener" \
  "$(inspector_listener_ownership 202 '')" "missing"
