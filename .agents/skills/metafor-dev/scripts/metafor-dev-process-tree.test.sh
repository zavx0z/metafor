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
  printf '202\tttys001\tbun launcher.js\n303\tttys001\tbun domain.js\n'
}
pgrep() {
  [[ $* == '-P 101' ]] || fail "stop requested a foreign child inventory"
  printf '202\n'
}
ps() {
  local ticks
  ticks=$(cat "$stop_test_root/ticks")
  if [[ $* == '-p 303 -o ppid=' ]]; then
    [[ $stop_case != late-orphan || $ticks -ge 125 ]] || fail "stop retried TERM before the captured parent exited"
    if [[ $stop_case == orphan-reused ]]; then : > "$stop_test_root/pid-replaced"; fi
    printf '1\n'
    return
  fi
  [[ $1 == -p && $* == *'lstart='* && $* == *'uid='* && $* == *'tty='* && $* == *'command='* ]] || fail "stop lost its birth/UID/TTY/command identity check"
  case $2 in
    101)
      if [[ $stop_case != late-orphan || $ticks -ge 125 ]]; then
        [[ ! -f $stop_test_root/parent-retired ]] || return 1
      fi
      if [[ -f $stop_test_root/primary ]]; then
        case $stop_case in
          runner-stuck|launcher-stuck) ;;
          late-orphan) [[ $ticks -lt 125 ]] || return 1 ;;
          graceful) [[ $ticks -lt 3 ]] || return 1 ;;
          *) return 1 ;;
        esac
      fi
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
      if [[ -f $stop_test_root/primary ]]; then
        if [[ $stop_case == late-orphan ]]; then
          [[ $ticks -lt 125 ]] || return 1
        elif [[ $stop_case == launcher-stuck ]]; then
          [[ ! -f $stop_test_root/launcher-retired ]] || return 1
        else
          [[ $stop_case == graceful && $ticks -lt 3 ]] || return 1
        fi
      fi
      printf 'Tue Oct 13 00:00:00 2026 501 ttys001 bun launcher.js\n'
      ;;
    303)
      if [[ -f $stop_test_root/primary ]]; then
        case $stop_case in
          graceful|runner-stuck) [[ $ticks -lt 3 ]] || return 1 ;;
          orphan|launcher-stuck) [[ ! -f $stop_test_root/domain-retired ]] || return 1 ;;
          late-orphan) [[ ! -f $stop_test_root/orphan-retired ]] || return 1 ;;
          orphan-reused)
            if [[ -f $stop_test_root/pid-replaced ]]; then printf 'Tue Oct 13 00:01:00 2026 501 ttys001 bun unrelated.js\n'; return; fi
            ;;
          reused) printf 'Tue Oct 13 00:01:00 2026 501 ttys001 bun unrelated.js\n'; return ;;
          fallback-reused)
            if [[ $ticks -ge 50 ]]; then
              if [[ -f $stop_test_root/fallback-observed ]]; then printf 'Tue Oct 13 00:01:00 2026 501 ttys001 bun unrelated.js\n'; return; fi
              : > "$stop_test_root/fallback-observed"
            fi
            ;;
        esac
      fi
      printf 'Tue Oct 13 00:00:00 2026 501 ttys001 bun domain.js\n'
      ;;
    *) fail "stop inspected an unrelated PID" ;;
  esac
}
kill() {
  [[ $1 == -TERM && $# == 2 ]] || fail "stop used a process group or escalation signal"
  [[ -f $stop_test_root/captured ]] || fail "stop sent TERM before capturing descendants"
  case $2 in
    202)
      if [[ -f $stop_test_root/primary ]]; then : > "$stop_test_root/launcher-retired"; fi
      : > "$stop_test_root/primary"
      ;;
    303)
      [[ $stop_case != reused && $stop_case != fallback-reused && ! -f $stop_test_root/pid-replaced ]] || fail "stop signalled a reused domain PID"
      : > "$stop_test_root/domain-retired"
      if [[ $stop_case == late-orphan && $(cat "$stop_test_root/ticks") -ge 125 ]]; then : > "$stop_test_root/orphan-retired"; fi
      ;;
    101) : > "$stop_test_root/parent-retired" ;;
    *) fail "stop signalled a foreign PID" ;;
  esac
  printf 'TERM %s\n' "$2" >> "$stop_test_root/events"
}
sleep() {
  [[ $1 == 0.2 ]] || fail "stop changed its existing wait interval"
  local ticks
  ticks=$(cat "$stop_test_root/ticks")
  printf '%s\n' "$((ticks + 1))" > "$stop_test_root/ticks"
}
date() {
  [[ $* == '+%s' ]] || fail "stop lost its wall-clock deadline"
  printf '%s\n' "$((1000 + $(cat "$stop_test_root/ticks") / 5))"
}
die() { printf 'error: %s\n' "$1" >&2; exit 1; }
reset_stop_case() {
  stop_case=$1
  rm -f "$stop_test_root/captured" "$stop_test_root/primary" "$stop_test_root/domain-retired" "$stop_test_root/parent-retired" "$stop_test_root/launcher-retired" "$stop_test_root/orphan-retired" "$stop_test_root/pid-replaced" "$stop_test_root/fallback-observed"
  printf '0\n' > "$stop_test_root/ticks"
  printf '0\n' > "$stop_test_root/parent-reads"
  : > "$stop_test_root/events"
}

reset_stop_case graceful
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* && $(cat "$stop_test_root/ticks") == 3 ]] || fail "stop did not let the launcher close its tree"
[[ $(cat "$stop_test_root/events") == 'TERM 202' ]] || fail "graceful stop signalled the wrapper or domains"
printf 'ok - graceful stop signals the launcher and waits for its owned tree\n'

reset_stop_case orphan
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* && $(cat "$stop_test_root/ticks") == 51 ]] || fail "stop did not retire its exact captured orphan"
[[ $(cat "$stop_test_root/events") == $'TERM 202\nTERM 303' ]] || fail "stop lost ordered captured-orphan cleanup"
printf 'ok - graceful timeout sends TERM to the exact reparented domain\n'

reset_stop_case persistent
if output=$(stop_contour 2>&1; printf 'START NEW TREE\n' >> "$stop_test_root/events"); then
  fail "a surviving descendant allowed restart"
fi
[[ $output == *'did not stop within 60s; remaining owned PIDs: 303'* && $(cat "$stop_test_root/ticks") == 300 ]] || fail "bounded stop did not identify its surviving descendant"
[[ $(cat "$stop_test_root/events") == $'TERM 202\nTERM 303\nTERM 303' ]] || fail "bounded stop escalated, spammed TERM or started a new tree"
printf 'ok - one 60-second deadline reports the survivor and prevents restart\n'

reset_stop_case reused
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* && $(cat "$stop_test_root/ticks") == 0 ]] || fail "a reused PID was mistaken for the captured domain"
[[ $(cat "$stop_test_root/events") == 'TERM 202' ]] || fail "stop touched the reused PID"
printf 'ok - reused descendant PID is preserved\n'

reset_stop_case fallback-reused
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* && $(cat "$stop_test_root/ticks") == 51 ]] || fail "fallback failed to recheck process identity"
[[ $(cat "$stop_test_root/events") == 'TERM 202' ]] || fail "fallback signalled a PID reused during the grace period"
printf 'ok - fallback revalidates identity immediately before TERM\n'

reset_stop_case runner-stuck
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* ]] || fail "stop left its outer runner alive"
[[ $(cat "$stop_test_root/events") == $'TERM 202\nTERM 101' ]] || fail "outer runner was not stopped last"
printf 'ok - outer runner is stopped only after graceful child cleanup\n'

reset_stop_case launcher-stuck
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* ]] || fail "stop left its stalled launcher tree alive"
[[ $(cat "$stop_test_root/events") == $'TERM 202\nTERM 303\nTERM 202\nTERM 101' ]] || fail "fallback did not stop captured leaves before their parents"
printf 'ok - fallback retries TERM from captured leaves to the outer runner\n'

reset_stop_case late-orphan
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* && $(cat "$stop_test_root/ticks") == 126 ]] || fail "stop did not wait for asynchronous parent exit after 20 seconds"
[[ $(cat "$stop_test_root/events") == $'TERM 202\nTERM 303\nTERM 202\nTERM 101\nTERM 303' ]] || fail "stop did not reassert TERM once after the domain became an orphan"
printf 'ok - late PPID-1 reparent gets one fresh TERM inside the same deadline\n'

reset_stop_case orphan-reused
output=$(stop_contour)
[[ $output == *'cosmos: stopped 101'* ]] || fail "stop retained a replaced orphan identity"
[[ $(cat "$stop_test_root/events") == $'TERM 202\nTERM 303' ]] || fail "orphan retry signalled the reused PID"
printf 'ok - orphan retry rechecks identity after reading PPID\n'

reset_stop_case parent-reused
if output=$(stop_contour 2>&1); then fail "a changed parent identity was signalled"; fi
[[ $output == *'parent identity changed before stop: 101'* && ! -s $stop_test_root/events ]] || fail "stop did not refuse the changed parent before TERM"
printf 'ok - changed parent identity refuses before TERM\n'

# Готовность проверяется без HTTP и запуска настоящего contour.
source <(sed -n '/^cosmos_ready() {/,/^}/p; /^wait_cosmos() {/,/^}/p' "$script_dir/metafor-dev.sh")
curl() {
  [[ $* == '-fsS --max-time 2 http://127.0.0.1:4444/health' ]] || fail "readiness probed HTML or another origin"
  local reads
  reads=$(cat "$stop_test_root/health-reads")
  reads=$((reads + 1))
  printf '%s\n' "$reads" > "$stop_test_root/health-reads"
  case $health_case in
    delayed) [[ $reads -gt 100 ]] || return 7 ;;
    http-error) return 22 ;;
    html) printf '<html>available</html>\n'; return ;;
    malformed) printf '{\n'; return ;;
    starting) printf '{"ok":true,"state":"starting"}\n'; return ;;
    unhealthy) printf '{"ok":false,"state":"running"}\n'; return ;;
  esac
  printf '{"ok":true,"state":"running"}\n'
}
sleep() { [[ $1 == 0.2 ]] || fail "readiness changed its probe interval"; }
reset_health_case() {
  health_case=$1
  printf '0\n' > "$stop_test_root/health-reads"
}
reset_health_case delayed
output=$(wait_cosmos http://127.0.0.1:4444)
[[ $output == *'cosmos: ready http://127.0.0.1:4444'* && $(cat "$stop_test_root/health-reads") == 101 ]] || fail "readiness retained the old 100-probe premature timeout"
printf 'ok - startup waits beyond 100 fast refused connections for runtime health\n'

reset_health_case ready
output=$(wait_cosmos http://127.0.0.1:4444 0)
[[ $output == *'cosmos: ready http://127.0.0.1:4444'* && $(cat "$stop_test_root/health-reads") == 1 ]] || fail "readiness failed to accept its final healthy response"
printf 'ok - final health probe wins over an expired startup deadline\n'

for health_case in http-error html malformed starting unhealthy; do
  reset_health_case "$health_case"
  if output=$(wait_cosmos http://127.0.0.1:4444 0 2>&1); then fail "readiness accepted $health_case"; fi
  [[ $output == *'/health did not confirm running within 0s'* && $(cat "$stop_test_root/health-reads") == 1 ]] || fail "readiness did not report its bounded health failure"
  printf 'ok - startup rejects %s without a false ready result\n' "$health_case"
done
