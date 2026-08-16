#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C LANG=C

action=${1:-status}
script_dir=$(cd "$(dirname "$0")" && pwd)
default_repo=$(cd "$script_dir/../../../.." && pwd)
repo=${2:-$default_repo}
hamiltonian="$repo/hamiltonian"
iterm_app=/Applications/iTerm.app
chrome_app=/Applications/Google\ Chrome.app
chrome_executable="$chrome_app/Contents/MacOS/Google Chrome"
chrome_port=${METAFOR_DEV_CDP_PORT:-9222}
chrome_profile=${METAFOR_DEV_CHROME_PROFILE:-$HOME/Library/Application Support/Google/Chrome-CDP}
chrome_log=${METAFOR_DEV_CHROME_LOG:-$HOME/Library/Logs/MetaFor/chrome-cdp.log}

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

validate_repo() {
  [[ -d $repo ]] || die "checkout does not exist: $repo"
  local root
  root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) \
    || die "not a Git checkout: $repo"
  [[ $root == "$repo" ]] || die "pass the exact checkout root, got: $repo"
  [[ -f $hamiltonian/package.json && -f $hamiltonian/server.ts ]] \
    || die "Hamiltonian package is missing: $hamiltonian"
  jq -e '.scripts.dev | type == "string" and length > 0' \
    "$hamiltonian/package.json" >/dev/null \
    || die "hamiltonian scripts.dev is missing"
}

package_port() {
  jq -r '.scripts.dev | try capture("--port=(?<port>[0-9]+)").port catch ""' \
    "$hamiltonian/package.json"
}

repo_key() {
  printf '%s' "$repo" | shasum -a 256 | cut -c1-16
}

session_marker() {
  printf 'metafor-dev:%s' "$(repo_key)"
}

iterm_query() {
  local operation=$1
  local command_text=${2:-}
  osascript - "$(session_marker)" "$operation" "$command_text" <<'APPLESCRIPT'
on run argv
  set markerValue to item 1 of argv
  set operationName to item 2 of argv
  set commandText to item 3 of argv
  set foundSession to missing value

  tell application "iTerm2"
    if operationName is "window-count" then return count of windows

    repeat with terminalWindow in windows
      repeat with terminalTab in tabs of terminalWindow
        repeat with terminalSession in sessions of terminalTab
          set currentMarker to ""
          try
            tell terminalSession to set currentMarker to variable named "user.metaforDev"
            if currentMarker is markerValue then
              set foundSession to terminalSession
              exit repeat
            end if
          end try
        end repeat
        if foundSession is not missing value then exit repeat
      end repeat
      if foundSession is not missing value then exit repeat
    end repeat

    if foundSession is missing value then
      if operationName is "adopt" then
        if (count of windows) is not 1 then return "ambiguous"
        set foundSession to current session of current tab of current window
        tell foundSession to set variable named "user.metaforDev" to markerValue
        tell foundSession to write text commandText
        return "adopted\t" & (tty of foundSession)
      else if operationName is "create" then
        activate
        set newWindow to create window with default profile command commandText
        set foundSession to current session of current tab of newWindow
        tell foundSession to set variable named "user.metaforDev" to markerValue
        return "created\t" & (tty of foundSession)
      end if
      return "missing"
    end if

    if operationName is "focus" then
      activate
      select foundSession
    else if operationName is "write" then
      activate
      select foundSession
      tell foundSession to write text commandText
    else if operationName is "logs" then
      return contents of foundSession
    end if

    return "found\t" & (tty of foundSession)
  end tell
end run
APPLESCRIPT
}

iterm_state() {
  if ! pgrep -x iTerm2 >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  iterm_query inspect
}

iterm_window_count() {
  if ! pgrep -x iTerm2 >/dev/null 2>&1; then
    printf '0'
    return
  fi
  iterm_query window-count
}

iterm_tty() {
  local state
  state=$(iterm_state)
  [[ $state == found$'\t'* ]] || return 1
  printf '%s\n' "${state#*$'\t'}"
}

repo_processes() {
  local pid cwd command tty_value expected_port
  expected_port=$(package_port)
  while IFS= read -r pid; do
    [[ -n $pid ]] || continue
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null \
      | sed -n 's/^n//p' | head -1 || true)
    [[ $cwd == "$hamiltonian" ]] || continue
    command=$(ps -p "$pid" -o command= 2>/dev/null || true)
    case "$command" in
      *"bun run dev"*|*"bun run start"*|*"bun run server.ts"*|*"bun --port=$expected_port server"*) ;;
      *) continue ;;
    esac
    tty_value=$(ps -p "$pid" -o tty= 2>/dev/null | tr -d ' ' || true)
    printf '%s\t%s\t%s\n' "$pid" "$tty_value" "$command"
  done < <(pgrep -x bun 2>/dev/null || true)
}

parent_processes() {
  repo_processes | awk -F '\t' '$3 ~ /bun run (dev|start)/ {print}'
}

ensure_process_ownership() {
  local processes tty_value foreign
  processes=$(repo_processes)
  [[ -n $processes ]] || return 0
  tty_value=$(iterm_tty 2>/dev/null || true)
  if [[ -z $tty_value ]]; then
    printf '%s\n' "$processes" >&2
    die "Hamiltonian already runs outside the managed iTerm session"
  fi
  tty_value=${tty_value#/dev/}
  foreign=$(awk -F '\t' -v tty_value="$tty_value" '$2 != tty_value {print}' <<<"$processes")
  if [[ -n $foreign ]]; then
    printf '%s\n' "$foreign" >&2
    die "Hamiltonian process does not belong to managed iTerm TTY $tty_value"
  fi
}

chrome_processes() {
  ps -axo pid=,command= | awk \
    -v executable="$chrome_executable" \
    -v port="--remote-debugging-port=$chrome_port" \
    '{
      pid=$1
      $1=""
      sub(/^[[:space:]]+/, "")
      if (index($0, executable) == 1 && index($0, port)) print pid " " $0
    }'
}

expected_chrome_processes() {
  chrome_processes | awk -v profile="--user-data-dir=$chrome_profile" \
    'index($0, profile) {print}'
}

cdp_ready() {
  curl -fsS --max-time 2 "http://127.0.0.1:$chrome_port/json/version" >/dev/null 2>&1
}

ensure_chrome() {
  local initial_url=${1:-about:blank}
  local all expected attempt listeners
  all=$(chrome_processes)
  expected=$(expected_chrome_processes)

  if cdp_ready; then
    [[ -n $expected ]] || die "CDP port $chrome_port belongs to another Chrome profile"
    [[ $(wc -l <<<"$expected" | tr -d ' ') == 1 ]] \
      || die "multiple MetaFor CDP Chrome processes found"
    printf 'chrome: reused %s\n' "$(awk '{print $1}' <<<"$expected")"
    return
  fi

  [[ -z $all ]] || die "Chrome declares CDP port $chrome_port but endpoint is unavailable"
  listeners=$(lsof -nP -iTCP:"$chrome_port" -sTCP:LISTEN -t 2>/dev/null || true)
  [[ -z $listeners ]] || die "CDP port $chrome_port is occupied by process $listeners"
  [[ -x $chrome_executable ]] || die "Google Chrome is missing: $chrome_executable"
  mkdir -p "$chrome_profile" "$(dirname "$chrome_log")"
  /usr/bin/open -na "Google Chrome" --args \
    "--remote-debugging-port=$chrome_port" \
    "--user-data-dir=$chrome_profile" \
    --no-first-run \
    --no-default-browser-check \
    "$initial_url" >>"$chrome_log" 2>&1

  for attempt in $(seq 1 50); do
    if cdp_ready; then
      expected=$(expected_chrome_processes)
      [[ -n $expected ]] || die "CDP Chrome started with an unexpected profile"
      printf 'chrome: started %s\n' "$(awk '{print $1}' <<<"$expected")"
      return
    fi
    sleep 0.2
  done
  die "CDP Chrome did not become ready; inspect $chrome_log"
}

shell_command() {
  local quoted_script quoted_repo
  printf -v quoted_script '%q' "$script_dir/terminal-runner.sh"
  printf -v quoted_repo '%q' "$repo"
  printf '/bin/zsh -l -c %q' "exec $quoted_script $quoted_repo"
}

wait_hamiltonian() {
  local origin=$1 attempt
  for attempt in $(seq 1 100); do
    if curl -fsS --max-time 1 "$origin/" >/dev/null 2>&1; then
      printf 'hamiltonian: ready %s\n' "$origin"
      return
    fi
    sleep 0.2
  done
  die "Hamiltonian did not become ready at $origin"
}

ensure_target() {
  local origin=$1 targets target_id encoded
  targets=$(curl -fsS --max-time 2 "http://127.0.0.1:$chrome_port/json/list")
  target_id=$(jq -r --arg origin "$origin" \
    '[.[] | select(.type == "page" and (.url | startswith($origin)))][0].id // empty' \
    <<<"$targets")
  if [[ -z $target_id ]]; then
    encoded=$(jq -rn --arg url "$origin/" '$url | @uri')
    target_id=$(curl -fsS --max-time 5 -X PUT \
      "http://127.0.0.1:$chrome_port/json/new?$encoded" | jq -r '.id')
    printf 'target: created %s %s/\n' "$target_id" "$origin"
  else
    printf 'target: reused %s %s\n' "$target_id" "$origin"
  fi
  curl -fsS --max-time 2 \
    "http://127.0.0.1:$chrome_port/json/activate/$target_id" >/dev/null
}

start_contour() {
  local port origin processes state command_text listeners window_count
  port=$(package_port)
  [[ $port =~ ^[0-9]+$ ]] || die "cannot derive Hamiltonian port from scripts.dev"
  origin="http://127.0.0.1:$port"
  processes=$(repo_processes)
  state=$(iterm_state)

  if [[ -n $processes ]]; then
    ensure_process_ownership
    ensure_chrome "$origin/"
    iterm_query focus >/dev/null
    wait_hamiltonian "$origin"
    ensure_target "$origin"
    printf 'iterm: reused %s\n' "$(iterm_tty)"
    return
  fi

  listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  [[ -z $listeners ]] || die "Hamiltonian port $port is occupied by process $listeners"
  ensure_chrome "$origin/"
  command_text=$(shell_command)
  if [[ $state == found$'\t'* ]]; then
    iterm_query write "$command_text" >/dev/null
    printf 'iterm: reused %s\n' "${state#*$'\t'}"
  else
    [[ -d $iterm_app ]] || die "iTerm is missing: $iterm_app"
    window_count=$(iterm_window_count)
    if [[ $window_count == 0 ]]; then
      /usr/bin/open -a iTerm
      for _ in $(seq 1 50); do
        [[ $(iterm_window_count) -gt 0 ]] && break
        sleep 0.1
      done
      state=$(iterm_query adopt "$command_text")
      [[ $state == adopted$'\t'* ]] || die "cannot adopt the new iTerm window: $state"
      printf 'iterm: adopted %s\n' "${state#*$'\t'}"
    else
      state=$(iterm_query create "$command_text")
      printf 'iterm: created %s\n' "${state#*$'\t'}"
    fi
  fi
  wait_hamiltonian "$origin"
  ensure_process_ownership
  ensure_target "$origin"
}

stop_contour() {
  local state parents parent_pid attempt
  state=$(iterm_state)
  [[ $state == found$'\t'* ]] || die "managed iTerm session is missing; refusing to stop external processes"
  ensure_process_ownership
  parents=$(parent_processes)
  if [[ -z $parents ]]; then
    printf 'hamiltonian: stopped\niterm: preserved %s\n' "${state#*$'\t'}"
    return
  fi
  [[ $(wc -l <<<"$parents" | tr -d ' ') == 1 ]] || die "multiple Hamiltonian parents found"
  parent_pid=$(awk -F '\t' '{print $1}' <<<"$parents")
  kill -TERM "$parent_pid"
  for attempt in $(seq 1 50); do
    kill -0 "$parent_pid" 2>/dev/null || break
    sleep 0.2
  done
  kill -0 "$parent_pid" 2>/dev/null && die "Hamiltonian did not stop: $parent_pid"
  printf 'hamiltonian: stopped %s\niterm: preserved %s\n' "$parent_pid" "${state#*$'\t'}"
}

print_status() {
  local port origin state processes chrome expected targets
  port=$(package_port)
  origin="http://127.0.0.1:${port:-unknown}"
  state=$(iterm_state)
  processes=$(repo_processes)
  chrome=$(chrome_processes)
  expected=$(expected_chrome_processes)
  printf 'checkout: %s\norigin: %s\n' "$repo" "$origin"
  if [[ $state == found$'\t'* ]]; then
    printf 'iterm: managed %s\n' "${state#*$'\t'}"
  else
    printf 'iterm: %s\n' "$state"
  fi
  if [[ -n $processes ]]; then
    printf 'hamiltonian:\n%s\n' "$processes"
  else
    printf 'hamiltonian: stopped\n'
  fi
  if cdp_ready; then
    if [[ -n $expected ]]; then
      printf 'chrome: ready %s\n' "$(awk '{print $1}' <<<"$expected")"
    else
      printf 'chrome: foreign process on CDP port %s\n' "$chrome_port"
    fi
    targets=$(curl -fsS --max-time 2 "http://127.0.0.1:$chrome_port/json/list")
    jq -r --arg origin "$origin" \
      '.[] | select(.type == "page" and (.url | startswith($origin))) | "target: \(.id) \(.url)"' \
      <<<"$targets"
  elif [[ -n $chrome ]]; then
    printf 'chrome: process exists but CDP is unavailable\n%s\n' "$chrome"
  else
    printf 'chrome: stopped\n'
  fi
}

validate_repo
for command_name in bun curl git jq lsof osascript pgrep ps shasum; do
  command -v "$command_name" >/dev/null 2>&1 || die "$command_name is missing"
done

case "$action" in
  start) start_contour ;;
  status) print_status ;;
  focus)
    state=$(iterm_query focus)
    [[ $state == found$'\t'* ]] || die "managed iTerm session is missing"
    printf 'iterm: focused %s\n' "${state#*$'\t'}"
    ;;
  logs)
    logs=$(iterm_query logs)
    [[ $logs != missing ]] || die "managed iTerm session is missing"
    printf '%s\n' "$logs"
    ;;
  restart)
    stop_contour
    start_contour
    ;;
  stop) stop_contour ;;
  *) die "usage: $0 {start|status|focus|logs|restart|stop} [checkout]" ;;
esac
