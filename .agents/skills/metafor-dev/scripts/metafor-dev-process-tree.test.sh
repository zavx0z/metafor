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

# Исполняется настоящая функция dispatcher; process seams не посылают signals ОС.
source <(sed -n '/^stop_contour() {/,/^}/p' "$script_dir/metafor-dev.sh")
stop_test_root=$(mktemp -d "${TMPDIR:-/tmp}/metafor-stop-tree.XXXXXX")
trap 'rm -rf "$stop_test_root"' EXIT
iterm_state() { printf 'found\t/dev/ttys001\n'; }
ensure_process_ownership() { :; }
parent_processes() { printf '101\tttys001\tbun run dev\n'; }
process_descendants() {
  [[ $1 == 101 ]] || fail "stop inspected an unrelated parent"
  : > "$stop_test_root/captured"
  printf '202\tttys001\tbun old-release.js\n'
}
ps() {
  [[ $1 == -p && $* == *'lstart='* && $* == *'uid='* && $* == *'tty='* && $* == *'command='* ]] || fail "stop lost its birth/UID/TTY/command identity check"
  case $2 in
    101)
      [[ ! -f $stop_test_root/terminated ]] || return 1
      local reads
      reads=$(cat "$stop_test_root/parent-reads")
      printf '%s\n' "$((reads + 1))" > "$stop_test_root/parent-reads"
      if [[ $stop_case == parent-reused && $reads -gt 0 ]]; then
        printf 'Tue Oct 13 00:01:00 2026 501 ttys001 bun unrelated.js\n'
      else
        printf 'Tue Oct 13 00:00:00 2026 501 ttys001 bun run dev\n'
      fi
      ;;
    202)
      if [[ -f $stop_test_root/terminated ]]; then
        case $stop_case in
          delayed) [[ $(cat "$stop_test_root/ticks") -lt 3 ]] || return 1 ;;
          reused) printf 'Tue Oct 13 00:01:00 2026 501 ttys001 bun unrelated.js\n'; return ;;
        esac
      fi
      printf 'Tue Oct 13 00:00:00 2026 501 ttys001 bun old-release.js\n'
      ;;
    *) fail "stop inspected an unrelated PID" ;;
  esac
}
kill() {
  [[ $1 == -TERM && $2 == 101 && $# == 2 ]] || fail "stop signalled a descendant, reused or foreign PID"
  [[ -f $stop_test_root/captured ]] || fail "stop sent TERM before capturing descendants"
  printf 'TERM 101\n' >> "$stop_test_root/events"
  : > "$stop_test_root/terminated"
}
sleep() {
  [[ $1 == 0.2 ]] || fail "stop changed its existing wait interval"
  local ticks
  ticks=$(cat "$stop_test_root/ticks")
  printf '%s\n' "$((ticks + 1))" > "$stop_test_root/ticks"
}
die() { printf 'error: %s\n' "$1" >&2; exit 1; }
reset_stop_case() {
  stop_case=$1
  rm -f "$stop_test_root/captured" "$stop_test_root/terminated"
  printf '0\n' > "$stop_test_root/ticks"
  printf '0\n' > "$stop_test_root/parent-reads"
  : > "$stop_test_root/events"
}

reset_stop_case delayed
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* && $(cat "$stop_test_root/ticks") == 3 ]] || fail "stop did not wait for the captured descendant after its parent exited"
[[ $(cat "$stop_test_root/events") == 'TERM 101' ]] || fail "stop sent extra signals"
printf 'ok - graceful stop waits for the exact captured descendants after reparenting\n'

reset_stop_case persistent
if output=$(stop_contour 2>&1; printf 'START NEW TREE\n' >> "$stop_test_root/events"); then
  fail "a surviving descendant allowed restart"
fi
[[ $output == *'remaining owned PIDs: 202'* && $(cat "$stop_test_root/ticks") == 50 ]] || fail "bounded stop did not identify its exact surviving descendant"
[[ $(cat "$stop_test_root/events") == 'TERM 101' ]] || fail "bounded stop started a new tree or signalled another PID"
printf 'ok - bounded descendant timeout names the PID and prevents the subsequent start\n'

reset_stop_case reused
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* && $(cat "$stop_test_root/ticks") == 0 ]] || fail "a reused descendant PID was mistaken for the stopped identity"
[[ $(cat "$stop_test_root/events") == 'TERM 101' ]] || fail "stop touched the reused descendant PID"
printf 'ok - reused descendant PID is preserved\n'

reset_stop_case parent-reused
if output=$(stop_contour 2>&1); then fail "a changed parent identity was signalled"; fi
[[ $output == *'parent identity changed before stop: 101'* && ! -s $stop_test_root/events ]] || fail "stop did not refuse before signalling a changed parent"
printf 'ok - changed parent identity refuses before TERM\n'
