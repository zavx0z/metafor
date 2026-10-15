#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
source "$script_dir/inspector.sh"
source <(sed -n '/^stop_release_contour() {/,/^}/p' "$script_dir/metafor-dev.sh")
fixture=$(mktemp -d "${TMPDIR:-/tmp}/metafor-stop-release.XXXXXX")
trap 'rm -r "$fixture"' EXIT
cosmos=/fixture/metafor/cosmos
fixture_artifact="$fixture/store/candidates/digest/packages/%40cosmos%2Frelease/dist/versions/0.3.34/server.js"

fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
die() { printf 'error: %s\n' "$1" >&2; exit 1; }
iterm_state() { printf 'found\t/dev/ttys001\n'; }
ensure_process_ownership() { :; }
package_port() { printf '4444\n'; }
id() { [[ $* == -u ]] || fail 'unexpected id query'; printf '501\n'; }
parent_processes() {
  if [[ -f $fixture/signalled && $(cat "$fixture/ticks") -ge 252 && $scenario != persistent ]]; then return; fi
  printf '101\tttys001\tbun run dev\n'
}
process_descendants() {
  [[ $1 == 101 ]] || fail 'foreign parent inspected'
  printf '202\tttys001\tbun server.ts\n303\tttys001\tbun %s\n404\tttys001\tbun %s\n' "$fixture_artifact" "$fixture_artifact"
}
bun() {
  local reads
  reads=$(cat "$fixture/artifact-reads")
  printf '%s\n' "$((reads + 1))" > "$fixture/artifact-reads"
  if [[ $scenario == store-changed && $reads -gt 0 ]]; then printf '%s-next\n' "$fixture_artifact"; else printf '%s\n' "$fixture_artifact"; fi
}
lsof() {
  if [[ $1 == -a ]]; then
    [[ $* == '-a -p 303 -d cwd -Fn' ]] || fail 'foreign cwd queried'
    if [[ $scenario == wrong-store ]]; then printf 'n/foreign/store\n'; else printf 'n%s/store\n' "$fixture"; fi
    return
  fi
  [[ $* == '-nP -iTCP:4444 -sTCP:LISTEN -t' ]] || fail 'foreign listener queried'
  local reads
  reads=$(cat "$fixture/listener-reads")
  printf '%s\n' "$((reads + 1))" > "$fixture/listener-reads"
  if [[ -f $fixture/signalled && $(cat "$fixture/ticks") -ge 250 && $scenario != persistent ]]; then
    [[ $scenario != replacement ]] || printf '505\n'
    return
  fi
  if [[ $scenario == listener-changed && $reads -gt 0 ]]; then printf '505\n'; else printf '303\n'; fi
}
ps() {
  local pid=$2 ticks reads
  [[ $1 == -p ]] || fail 'unbounded ps query'
  ticks=$(cat "$fixture/ticks")
  case "$*" in
    '-p 303 -o command=') printf 'bun %s\n' "$fixture_artifact"; return ;;
    '-p 303 -o tty=') [[ $scenario != foreign-tty ]] || { printf 'ttys999\n'; return; }; printf 'ttys001\n'; return ;;
    '-p 303 -o uid=') printf '501\n'; return ;;
  esac
  [[ $* == *'lstart='* && $* == *'uid='* && $* == *'tty='* && $* == *'command='* ]] || fail 'process identity was weakened'
  if [[ -f $fixture/signalled && $scenario != persistent ]]; then
    case $pid in
      101) [[ $ticks -lt 252 ]] || return 1 ;;
      202) [[ $ticks -lt 251 ]] || return 1 ;;
      303|404) [[ $ticks -lt 250 ]] || return 1 ;;
    esac
  fi
  case $pid in
    101) printf 'Thu Oct 15 00:00:00 2026 501 ttys001 bun run dev\n' ;;
    202) printf 'Thu Oct 15 00:00:00 2026 501 ttys001 bun server.ts\n' ;;
    303)
      reads=$(cat "$fixture/core-reads")
      printf '%s\n' "$((reads + 1))" > "$fixture/core-reads"
      if [[ $scenario == identity-changed && $reads -gt 0 ]]; then printf 'Thu Oct 15 00:01:00 2026 501 ttys001 bun unrelated.js\n'
      else printf 'Thu Oct 15 00:00:00 2026 501 ttys001 bun %s\n' "$fixture_artifact"; fi ;;
    404) printf 'Thu Oct 15 00:00:00 2026 501 ttys001 bun %s\n' "$fixture_artifact" ;;
    *) fail 'foreign PID inspected' ;;
  esac
}
kill() {
  [[ $* == '-TERM 303' ]] || fail 'migration signalled launcher/domain or escalated'
  [[ ! -f $fixture/signalled ]] || fail 'migration repeated its signal'
  : > "$fixture/signalled"
  printf 'TERM 303\n' >> "$fixture/events"
}
sleep() {
  [[ $1 == 0.2 ]] || fail 'unexpected wait interval'
  printf '%s\n' "$(( $(cat "$fixture/ticks") + 1 ))" > "$fixture/ticks"
}
date() { [[ $* == '+%s' ]] || fail 'missing wall-clock bound'; printf '%s\n' "$(( 1000 + $(cat "$fixture/ticks") / 5 ))"; }
reset_case() {
  scenario=$1
  rm -f "$fixture/signalled"
  : > "$fixture/events"
  for file in ticks artifact-reads listener-reads core-reads; do printf '0\n' > "$fixture/$file"; done
}

reset_case graceful
output=$(stop_release_contour 303)
[[ $output == *'stopped Core 303'* && $(cat "$fixture/ticks") == 252 ]] || fail 'mode did not await Core then launcher/runner exit'
[[ $(cat "$fixture/events") == 'TERM 303' ]] || fail 'unexpected migration signal order'
printf 'ok - one exact Core TERM, 50-second owned cleanup, then observed launcher/runner exit\n'

for scenario in wrong-store foreign-tty store-changed listener-changed identity-changed; do
  reset_case "$scenario"
  if output=$(stop_release_contour 303 2>&1); then fail "$scenario was accepted"; fi
  [[ ! -s $fixture/events ]] || fail "$scenario sent a signal"
  printf 'ok - %s refuses before any signal\n' "$scenario"
done

reset_case graceful
if output=$(stop_release_contour 999 2>&1); then fail 'unexpected PID was accepted'; fi
[[ ! -s $fixture/events ]] || fail 'unexpected PID sent a signal'
printf 'ok - expected Core PID is required\n'

reset_case persistent
if output=$(stop_release_contour 303 2>&1; printf 'START\n' >> "$fixture/events"); then fail 'surviving Core allowed restart'; fi
[[ $output == *'within 90s; remaining owned PIDs:'*'303'* && $(cat "$fixture/ticks") == 450 ]] || fail 'deadline did not report owned survivors'
[[ $(cat "$fixture/events") == 'TERM 303' ]] || fail 'deadline escalated or restarted'
printf 'ok - 90-second failure names survivors, without escalation or restart\n'

reset_case replacement
if output=$(stop_release_contour 303 2>&1); then fail 'replacement listener was reported stopped'; fi
[[ $output == *'listener PIDs 505'* && $(cat "$fixture/events") == 'TERM 303' ]] || fail 'replacement listener was signalled or hidden'
printf 'ok - replacement listener remains untouched and prevents false stopped\n'
