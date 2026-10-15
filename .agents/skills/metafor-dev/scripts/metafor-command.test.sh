#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/metafor-command.XXXXXX")
trap 'rm -r "$fixture"' EXIT
mkdir -p "$fixture/repo/.agents/skills/metafor-dev/scripts" "$fixture/repo/cosmos" "$fixture/bin"
wrapper="$fixture/repo/.agents/skills/metafor-dev/scripts/metafor-command.sh"
cp "$script_dir/metafor-command.sh" "$wrapper"
cat > "${wrapper%/*}/metafor-dev.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$1" >> "$COMMAND_EVENTS"
case "$1" in
  status) printf 'origin: http://127.0.0.1:4444\n' ;;
  start) [[ ${METAFOR_DEV_RELEASE_SELECTION:-} == fixture-plan ]] || exit 9
    [[ ${COMMAND_FAULT:-} != start ]] || exit 8 ;;
  stop-release) [[ $# == 3 && $3 == 303 ]] || exit 9 ;;
esac
SH
cat > "$fixture/bin/bun" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$4" >> "$COMMAND_EVENTS"
case "$4" in
  prepare) [[ ${COMMAND_FAULT:-} != prepare ]] || { printf 'No previous successful release\n' >&2; exit 7; }
    printf 'fixture-plan\n' ;;
  apply)
    [[ ${COMMAND_FAULT:-} != rejected ]] || exit 6
    [[ ${COMMAND_MODE:-offline} != live ]] || exit 0
    exit 3 ;;
  verify) [[ "$5" == fixture-plan && "$6" == http://127.0.0.1:4444 ]] || exit 9 ;;
esac
SH
chmod +x "$wrapper" "${wrapper%/*}/metafor-dev.sh" "$fixture/bin/bun"
export PATH="$fixture/bin:$PATH" COMMAND_EVENTS="$fixture/events"

export COMMAND_FAULT=prepare
if "$wrapper" downgrade > "$fixture/output" 2>&1; then exit 1; fi
[[ $(cat "$COMMAND_EVENTS") == $'status\nprepare' ]]

: > "$COMMAND_EVENTS"
unset COMMAND_FAULT
"$wrapper" downgrade
[[ $(cat "$COMMAND_EVENTS") == $'status\nprepare\napply\nstart\nverify' ]]

: > "$COMMAND_EVENTS"
export COMMAND_MODE=live
"$wrapper" downgrade
[[ $(cat "$COMMAND_EVENTS") == $'status\nprepare\napply' ]]
unset COMMAND_MODE

: > "$COMMAND_EVENTS"
export COMMAND_FAULT=rejected
if "$wrapper" downgrade > "$fixture/output" 2>&1; then exit 1; fi
[[ $(cat "$COMMAND_EVENTS") == $'status\nprepare\napply' ]]

: > "$COMMAND_EVENTS"
export COMMAND_FAULT=start
if "$wrapper" downgrade > "$fixture/output" 2>&1; then exit 1; fi
[[ $(cat "$COMMAND_EVENTS") == $'status\nprepare\napply\nstart' ]]
printf 'ok - live selection uses its owner, offline selection only starts, no path implicitly stops a newer release\n'

: > "$COMMAND_EVENTS"
"$wrapper" stop-release 303
[[ $(cat "$COMMAND_EVENTS") == $'status\nstop-release' ]]
printf 'ok - explicit migration forwards only the expected Core PID to the dispatcher\n'
