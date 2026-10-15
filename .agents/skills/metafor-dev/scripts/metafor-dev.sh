#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C LANG=C

action=${1:-status}
script_dir=$(cd "$(dirname "$0")" && pwd)
source "$script_dir/operator-mode.sh"
source "$script_dir/managed-parent.sh"
source "$script_dir/inspector.sh"
default_repo=${operator_checkout:-$(cd "$script_dir/../../../.." && pwd)}
repo=${2:-$default_repo}
cosmos="$repo/cosmos"
runtime_root=${METAFOR_OPERATOR_ROOT:-$cosmos}
iterm_app=/Applications/iTerm.app
chrome_app=/Applications/Google\ Chrome.app
chrome_executable="$chrome_app/Contents/MacOS/Google Chrome"
chrome_port=${METAFOR_DEV_CDP_PORT:-9222}
chrome_profile=${METAFOR_DEV_CHROME_PROFILE:-$HOME/Library/Application Support/Google/Chrome-CDP}
chrome_log=${METAFOR_DEV_CHROME_LOG:-$HOME/Library/Logs/MetaFor/chrome-cdp.log}

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

debug_port=$(resolve_inspector_port "${METAFOR_DEV_BUN_INSPECT_PORT:-}") \
  || die "invalid Bun Inspector port: ${METAFOR_DEV_BUN_INSPECT_PORT:-}"
debug_address=$(inspector_address_for_port "$debug_port")

validate_repo() {
  if [[ -n ${METAFOR_OPERATOR_ROOT:-} ]]; then
    [[ $repo == "$operator_checkout" ]] || die "operator belongs to another checkout"
    return
  fi
  [[ -d $repo ]] || die "checkout does not exist: $repo"
  local root
  root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) \
    || die "not a Git checkout: $repo"
  [[ $root == "$repo" ]] || die "pass the exact checkout root, got: $repo"
  [[ -f $cosmos/package.json && -f $cosmos/server.ts ]] \
    || die "Cosmos package is missing: $cosmos"
  jq -e '.scripts.dev | type == "string" and length > 0' \
    "$cosmos/package.json" >/dev/null \
    || die "cosmos scripts.dev is missing"
}

package_port() {
  if [[ -n ${operator_port:-} ]]; then printf '%s\n' "$operator_port"; return; fi
  jq -r '.scripts.dev | try capture("--port=(?<port>[0-9]+)").port catch ""' \
    "$cosmos/package.json"
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
  set matchedWindowId to missing value
  set matchedTabPosition to missing value
  set matchedSessionPosition to missing value
  set matchedSessionId to missing value
  set matchedTty to missing value

  tell application "iTerm2"
    if operationName is "window-count" then return count of windows

    repeat with terminalWindow in windows
      set tabPosition to 0
      repeat with terminalTab in tabs of terminalWindow
        set tabPosition to tabPosition + 1
        set sessionPosition to 0
        repeat with terminalSession in sessions of terminalTab
          set sessionPosition to sessionPosition + 1
          set currentMarker to ""
          try
            tell terminalSession to set currentMarker to variable named "user.metaforDev"
            if currentMarker is markerValue then
              set matchedWindowId to id of terminalWindow
              set matchedTabPosition to tabPosition
              set matchedSessionPosition to sessionPosition
              set matchedSessionId to unique id of terminalSession
              set matchedTty to tty of terminalSession
              exit repeat
            end if
          end try
        end repeat
        if matchedSessionId is not missing value then exit repeat
      end repeat
      if matchedSessionId is not missing value then exit repeat
    end repeat

    if matchedSessionId is not missing value then
      set matchedWindow to window id matchedWindowId
      set matchedTab to tab matchedTabPosition of matchedWindow
      set matchedSession to session matchedSessionPosition of matchedTab
      if unique id of matchedSession is not matchedSessionId then return "changed"

      if operationName is "focus" then
        activate
        tell matchedWindow to select
        tell matchedTab to select
        tell matchedSession to select
      else if operationName is "write" then
        activate
        tell matchedWindow to select
        tell matchedTab to select
        tell matchedSession to select
        tell matchedSession to write text (ASCII character 3) newline NO
        delay 0.1
        tell matchedSession to write text commandText
      else if operationName is "logs" then
        return contents of matchedSession
      end if
      return "found\t" & matchedTty
    else if operationName is "adopt" then
      if (count of windows) is not 1 then return "ambiguous"
      set adoptedWindow to current window
      set adoptedTab to current tab of adoptedWindow
      set adoptedSession to current session of adoptedTab
      tell adoptedWindow to select
      tell adoptedTab to select
      tell adoptedSession to select
      tell adoptedSession to set variable named "user.metaforDev" to markerValue
      tell adoptedSession to write text (ASCII character 3) newline NO
      delay 0.1
      tell adoptedSession to write text commandText
      return "adopted\t" & (tty of adoptedSession)
    else if operationName is "create" then
      activate
      set newWindow to create window with default profile command commandText
      set newTab to current tab of newWindow
      set newSession to current session of newTab
      tell newSession to set variable named "user.metaforDev" to markerValue
      return "created\t" & (tty of newSession)
    end if

    return "missing"
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
    [[ $cwd == "$cosmos" || $cwd == "$runtime_root" ]] || continue
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

process_descendants() {
  local parent_pid=$1 child command tty_value
  while IFS= read -r child; do
    [[ -n $child ]] || continue
    command=$(ps -p "$child" -o command= 2>/dev/null || true)
    tty_value=$(ps -p "$child" -o tty= 2>/dev/null | tr -d ' ' || true)
    printf '%s\t%s\t%s\n' "$child" "$tty_value" "$command"
    process_descendants "$child"
  done < <(pgrep -P "$parent_pid" 2>/dev/null || true)
}

cosmos_children() {
  local parent_pid
  while IFS=$'\t' read -r parent_pid _; do
    [[ -n $parent_pid ]] || continue
    process_descendants "$parent_pid"
  done < <(parent_processes)
}

ensure_process_ownership() {
  local processes tty_value foreign
  processes=$(repo_processes)
  [[ -n $processes ]] || return 0
  tty_value=$(iterm_tty 2>/dev/null || true)
  if [[ -z $tty_value ]]; then
    printf '%s\n' "$processes" >&2
    die "Cosmos already runs outside the managed iTerm session"
  fi
  tty_value=${tty_value#/dev/}
  foreign=$(awk -F '\t' -v tty_value="$tty_value" '$2 != tty_value {print}' <<<"$processes")
  if [[ -n $foreign ]]; then
    printf '%s\n' "$foreign" >&2
    die "Cosmos process does not belong to managed iTerm TTY $tty_value"
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
  local mode=${1:-normal} quoted_script quoted_repo quoted_mode quoted_debug_address quoted_selection
  printf -v quoted_script '%q' "$script_dir/terminal-runner.sh"
  printf -v quoted_repo '%q' "$repo"
  printf -v quoted_mode '%q' "$mode"
  printf -v quoted_debug_address '%q' "$debug_address"
  printf -v quoted_selection '%q' "${METAFOR_DEV_RELEASE_SELECTION:-}"
  local operator_binding=
  if [[ -n ${METAFOR_OPERATOR_ROOT:-} ]]; then
    printf -v operator_binding '/usr/bin/env METAFOR_OPERATOR_ROOT=%q METAFOR_OPERATOR_INSTANCE=%q METAFOR_OPERATOR_INSTANCE_SHA256=%q METAFOR_OPERATOR_BUN=%q ' \
      "$METAFOR_OPERATOR_ROOT" "$METAFOR_OPERATOR_INSTANCE" "$METAFOR_OPERATOR_INSTANCE_SHA256" "$operator_bun"
  fi
  printf '/bin/zsh -l -c %q' \
    "exec $operator_binding$quoted_script $quoted_repo $quoted_mode $quoted_debug_address $quoted_selection"
}

cosmos_ready() {
  local origin=$1 health
  health=$(curl -fsS --max-time 2 "$origin/health" 2>/dev/null) || return 1
  jq -e '.ok == true and .state == "running"' <<<"$health" >/dev/null 2>&1
}

wait_cosmos() {
  local origin=$1 ready_timeout_seconds=${2:-120} deadline
  # Startup допускает до 120 секунд подготовки installed graph и Quantum.
  # HTTP HTML и число быстрых connection-refused не определяют готовность.
  deadline=$((SECONDS + ready_timeout_seconds))
  while (( SECONDS < deadline )); do
    if cosmos_ready "$origin"; then
      printf 'cosmos: ready %s\n' "$origin"
      return
    fi
    sleep 0.2
  done
  # Последний ответ важнее истёкшего ожидания: runtime мог стать ready на границе.
  if cosmos_ready "$origin"; then
    printf 'cosmos: ready %s\n' "$origin"
    return
  fi
  die "Cosmos /health did not confirm running within ${ready_timeout_seconds}s at $origin"
}

managed_release_mode_evidence() {
  local mode=$1 children state kind release_pid actual_address inspector_port listeners= installed_artifacts http_listeners
  children=$(cosmos_children)
  installed_artifacts=$(bun --cwd "${runtime_root:-$cosmos}" "$script_dir/installed-release.ts" "$cosmos") || return 1
  http_listeners=$(lsof -nP -iTCP:"$(package_port)" -sTCP:LISTEN -t 2>/dev/null || true)
  state=$(release_inspector_state "$children" "$cosmos/release" "$installed_artifacts" "$http_listeners")
  IFS=$'\t' read -r kind release_pid actual_address <<<"$state"
  if [[ $kind == debug ]]; then
    inspector_port=$(inspector_port_from_address "$actual_address") || return 1
    listeners=$(lsof -nP -iTCP:"$inspector_port" -sTCP:LISTEN -t 2>/dev/null || true)
  fi
  require_managed_release_mode \
    "$mode" "$debug_address" "$children" "$cosmos/release" "$listeners" "$installed_artifacts" "$http_listeners"
}

wait_managed_release_mode() {
  local mode=$1 attempt evidence error= verified_mode release_pid actual_address
  for attempt in $(seq 1 50); do
    if evidence=$(managed_release_mode_evidence "$mode" 2>&1); then
      IFS=$'\t' read -r verified_mode release_pid actual_address <<<"$evidence"
      if [[ $verified_mode == debug ]]; then
        printf 'release: debug %s ws://%s\n' "$release_pid" "$actual_address"
      else
        printf 'release: normal %s\n' "$release_pid"
      fi
      return
    fi
    error=$evidence
    sleep 0.1
  done
  die "release process mode did not become ready: $error"
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
  bun "$script_dir/chrome-target.ts" prepare "$chrome_port" "$target_id" "$origin"
}

start_contour() {
  local mode=${1:-normal} browser=${2:-external} port origin processes state command_text listeners window_count
  local parents reuse_error
  port=$(package_port)
  [[ $port =~ ^[0-9]+$ ]] || die "cannot derive Cosmos port from scripts.dev"
  origin="http://127.0.0.1:$port"
  processes=$(repo_processes)
  state=$(iterm_state)

  if [[ -n $processes ]]; then
    [[ -z ${METAFOR_DEV_RELEASE_SELECTION:-} ]] || die "live release management is unavailable; an explicit metafor stop is required before cold activation"
    ensure_process_ownership
    parents=$(parent_processes)
    reuse_error=$(require_reusable_parent "$mode" "$parents") \
      || die "$reuse_error"
    if [[ $browser == managed ]]; then ensure_chrome "$origin/"; fi
    iterm_query focus >/dev/null
    wait_cosmos "$origin"
    wait_managed_release_mode "$mode"
    if [[ $browser == managed ]]; then ensure_target "$origin"; fi
    printf 'iterm: reused %s\n' "$(iterm_tty)"
    return
  fi

  listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  [[ -z $listeners ]] || die "Cosmos port $port is occupied by process $listeners"
  if [[ $mode == debug ]]; then
    listeners=$(lsof -nP -iTCP:"$debug_port" -sTCP:LISTEN -t 2>/dev/null || true)
    [[ -z $listeners ]] || die "Bun Inspector port $debug_port is occupied by process $listeners"
  fi
  if [[ $browser == managed ]]; then ensure_chrome "$origin/"; fi
  command_text=$(shell_command "$mode")
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
  wait_cosmos "$origin"
  ensure_process_ownership
  wait_managed_release_mode "$mode"
  if [[ $browser == managed ]]; then
    ensure_target "$origin"
  else
    printf 'browser: external, preserved; attach separately with user permission\n'
  fi
}

stop_contour() {
  local state parents parent_pid child_pid identity current index remaining signalled=0
  local stop_timeout_seconds=90 stop_grace_seconds=60 stop_wait_interval=0.2
  local deadline grace_deadline now observed_ppid parent_gone fallback_sent=0
  local -a owned_pids owned_identities orphan_retried
  state=$(iterm_state)
  [[ $state == found$'\t'* ]] || die "managed iTerm session is missing; refusing to stop external processes"
  ensure_process_ownership
  parents=$(parent_processes)
  if [[ -z $parents ]]; then
    printf 'cosmos: stopped\niterm: preserved %s\n' "${state#*$'\t'}"
    return
  fi
  [[ $(wc -l <<<"$parents" | tr -d ' ') == 1 ]] || die "multiple Cosmos parents found"
  parent_pid=$(awk -F '\t' '{print $1}' <<<"$parents")
  identity=$(ps -p "$parent_pid" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
  [[ -n $identity ]] || die "Cosmos parent disappeared before stop: $parent_pid"
  owned_pids=("$parent_pid")
  owned_identities=("$identity")
  orphan_retried=(0)
  # PPID после TERM может стать 1. Birth/UID/TTY/command сохраняют точное
  # наблюдавшееся дерево и не принимают переиспользованный PID за его потомка.
  while IFS=$'\t' read -r child_pid _; do
    [[ $child_pid =~ ^[1-9][0-9]*$ ]] || continue
    identity=$(ps -p "$child_pid" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
    [[ -n $identity ]] || continue
    owned_pids+=("$child_pid")
    owned_identities+=("$identity")
    orphan_retried+=(0)
  done < <(process_descendants "$parent_pid")
  current=$(ps -p "$parent_pid" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
  [[ $current == "${owned_identities[0]}" ]] || die "Cosmos parent identity changed before stop: $parent_pid"
  now=$(date +%s)
  deadline=$((now + stop_timeout_seconds))
  grace_deadline=$((now + stop_grace_seconds))
  # Сначала launcher, а не внешний bun run: startup должен успеть закрыть
  # Release и Quantum, пока runner ещё ждёт его завершения.
  while IFS= read -r child_pid; do
    [[ $child_pid =~ ^[1-9][0-9]*$ ]] || continue
    for ((index=1; index<${#owned_pids[@]}; index++)); do
      [[ ${owned_pids[$index]} == "$child_pid" ]] || continue
      current=$(ps -p "$child_pid" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
      [[ -n $current && $current == "${owned_identities[$index]}" ]] || continue
      kill -TERM "$child_pid" 2>/dev/null || true
      signalled=1
    done
  done < <(pgrep -P "$parent_pid" 2>/dev/null || true)
  if [[ $signalled == 0 ]]; then
    current=$(ps -p "$parent_pid" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
    if [[ -n $current && $current == "${owned_identities[0]}" ]]; then
      kill -TERM "$parent_pid" 2>/dev/null || true
    fi
  fi
  while true; do
    remaining=
    parent_gone=0
    for ((index=0; index<${#owned_pids[@]}; index++)); do
      current=$(ps -p "${owned_pids[$index]}" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
      if [[ -n $current && $current == "${owned_identities[$index]}" ]]; then
        remaining="${remaining}${remaining:+ }${owned_pids[$index]}"
        if [[ $fallback_sent == 1 && $parent_gone == 1 && ${orphan_retried[$index]} == 0 ]]; then
          observed_ppid=$(ps -p "${owned_pids[$index]}" -o ppid= 2>/dev/null | tr -d ' ' || true)
          if [[ $observed_ppid == 1 ]]; then
            # TERM до завершения parent мог застать ещё живой transport.
            # Повтор разрешён один раз после фактического reparent в PPID 1.
            current=$(ps -p "${owned_pids[$index]}" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
            if [[ -n $current && $current == "${owned_identities[$index]}" ]]; then
              kill -TERM "${owned_pids[$index]}" 2>/dev/null || true
              orphan_retried[$index]=1
            fi
          fi
        fi
      elif [[ $index == 0 ]]; then
        parent_gone=1
      fi
    done
    [[ -n $remaining ]] || break
    now=$(date +%s)
    [[ $now -lt $deadline ]] || die "Cosmos process tree did not stop within ${stop_timeout_seconds}s; remaining owned PIDs: $remaining"
    if [[ $fallback_sent == 0 && $now -ge $grace_deadline ]]; then
      # Grace исчерпан: только снятые identities, от листьев к родителям.
      for ((index=${#owned_pids[@]}-1; index>=0; index--)); do
        current=$(ps -p "${owned_pids[$index]}" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
        [[ -n $current && $current == "${owned_identities[$index]}" ]] || continue
        kill -TERM "${owned_pids[$index]}" 2>/dev/null || true
      done
      fallback_sent=1
    fi
    sleep "$stop_wait_interval"
  done
  printf 'cosmos: stopped %s\niterm: preserved %s\n' "$parent_pid" "${state#*$'\t'}"
}

stop_release_contour() {
  local expected_pid=$1 state parents parent_pid children installed_artifacts listeners evidence kind release_pid ignored
  local command artifact selected_artifact= store_root cwd tty_value identity current pid remaining deadline index
  local -a owned_pids owned_identities
  [[ $expected_pid =~ ^[1-9][0-9]*$ ]] || die "stop-release requires the expected Core PID"
  state=$(iterm_state)
  [[ $state == found$'\t'* ]] || die "managed iTerm session is missing; refusing to stop external processes"
  ensure_process_ownership
  parents=$(parent_processes)
  [[ $(awk 'NF {count++} END {print count+0}' <<<"$parents") == 1 ]] || die "stop-release requires one managed parent"
  parent_pid=$(awk -F '\t' '{print $1}' <<<"$parents")
  children=$(process_descendants "$parent_pid")
  installed_artifacts=$(bun --cwd "${runtime_root:-$cosmos}" "$script_dir/installed-release.ts" "$cosmos") || die "installed release identity is unavailable"
  [[ -n $installed_artifacts ]] || die "stop-release requires an installed release"
  listeners=$(lsof -nP -iTCP:"$(package_port)" -sTCP:LISTEN -t 2>/dev/null || true)
  evidence=$(release_inspector_state "$children" "$cosmos/release" "$installed_artifacts" "$listeners")
  IFS=$'\t' read -r kind release_pid ignored <<<"$evidence"
  [[ ( $kind == normal || $kind == debug ) && $release_pid == "$expected_pid" ]] || die "stop-release Core identity differs from the expected listener"
  command=$(ps -p "$release_pid" -o command= 2>/dev/null || true)
  while IFS= read -r artifact; do
    [[ -n $artifact && " $command " == *" $artifact "* ]] || continue
    [[ -z $selected_artifact ]] || die "stop-release artifact is ambiguous"
    selected_artifact=$artifact
  done <<<"$installed_artifacts"
  [[ -n $selected_artifact ]] || die "Core does not execute the selected installed artifact"
  store_root=${selected_artifact%/candidates/*}
  [[ $store_root != "$selected_artifact" ]] || die "installed artifact has no candidate store"
  cwd=$(lsof -a -p "$release_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)
  [[ $cwd == "$store_root" ]] || die "Core cwd differs from its selected installed store"
  tty_value=${state#*$'\t'}
  [[ $(ps -p "$release_pid" -o tty= 2>/dev/null | tr -d ' ') == "${tty_value#/dev/}" ]] || die "Core TTY differs from the managed session"
  [[ $(ps -p "$release_pid" -o uid= 2>/dev/null | tr -d ' ') == "$(id -u)" ]] || die "Core process owner differs"
  identity=$(ps -p "$release_pid" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
  [[ -n $identity ]] || die "Core disappeared before stop-release"
  owned_pids=()
  owned_identities=()
  while IFS=$'\t' read -r pid ignored; do
    [[ $pid =~ ^[1-9][0-9]*$ ]] || continue
    current=$(ps -p "$pid" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
    [[ -n $current ]] || continue
    owned_pids+=("$pid")
    owned_identities+=("$current")
  done <<<"$parents"$'\n'"$children"
  # Перед единственным signal заново связываются store, listener и birth identity.
  [[ $(bun --cwd "${runtime_root:-$cosmos}" "$script_dir/installed-release.ts" "$cosmos") == "$installed_artifacts" ]] || die "installed selection changed before stop-release"
  listeners=$(lsof -nP -iTCP:"$(package_port)" -sTCP:LISTEN -t 2>/dev/null || true)
  evidence=$(release_inspector_state "$(process_descendants "$parent_pid")" "$cosmos/release" "$installed_artifacts" "$listeners")
  IFS=$'\t' read -r kind pid ignored <<<"$evidence"
  [[ ( $kind == normal || $kind == debug ) && $pid == "$release_pid" ]] || die "Core listener changed before stop-release"
  current=$(ps -p "$release_pid" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
  [[ $current == "$identity" ]] || die "Core process identity changed before stop-release"
  kill -TERM "$release_pid" || die "Core did not accept its explicit stop signal"
  deadline=$(( $(date +%s) + 90 ))
  while true; do
    remaining=
    for ((index=0; index<${#owned_pids[@]}; index++)); do
      current=$(ps -p "${owned_pids[$index]}" -o lstart= -o uid= -o tty= -o command= 2>/dev/null || true)
      [[ -n $current && $current == "${owned_identities[$index]}" ]] || continue
      remaining="${remaining}${remaining:+ }${owned_pids[$index]}"
    done
    [[ -n $remaining ]] || break
    [[ $(date +%s) -lt $deadline ]] || die "stop-release did not finish within 90s; remaining owned PIDs: $remaining"
    sleep 0.2
  done
  listeners=$(lsof -nP -iTCP:"$(package_port)" -sTCP:LISTEN -t 2>/dev/null || true)
  parents=$(parent_processes)
  [[ -z $listeners && -z $parents ]] || die "stop-release observed replacement owner PIDs $(awk -F '\t' '{print $1}' <<<"$parents") or listener PIDs $listeners"
  printf 'cosmos: stopped Core %s after explicit release signal\niterm: preserved %s\n' "$release_pid" "$tty_value"
}

clear_site_data() {
  local port origin processes expected targets target_ids target_count target_id
  port=$(package_port)
  [[ $port =~ ^[0-9]+$ ]] || die "cannot derive Cosmos port from scripts.dev"
  origin="http://127.0.0.1:$port"
  processes=$(repo_processes)
  [[ -n $processes ]] || die "managed Cosmos is not running"
  ensure_process_ownership
  cdp_ready || die "managed CDP Chrome is unavailable on port $chrome_port"
  expected=$(expected_chrome_processes)
  [[ -n $expected ]] || die "CDP port $chrome_port belongs to another Chrome profile"
  [[ $(wc -l <<<"$expected" | tr -d ' ') == 1 ]] \
    || die "multiple MetaFor CDP Chrome processes found"
  wait_cosmos "$origin"
  targets=$(curl -fsS --max-time 2 "http://127.0.0.1:$chrome_port/json/list")
  target_ids=$(jq -r --arg origin "$origin" \
    '.[] | select(.type == "page" and (.url | startswith($origin))) | .id' \
    <<<"$targets")
  target_count=$(grep -c . <<<"$target_ids" || true)
  [[ $target_count == 1 ]] \
    || die "expected exactly one Cosmos target for $origin, found $target_count"
  target_id=$target_ids
  bun "$script_dir/chrome-target.ts" clear-site-data \
    "$chrome_port" "$target_id" "$origin"
}

# Явное завершение ранее наблюдавшегося потомка после выхода его parent.
# Birth, команда, UID и managed TTY защищают от переиспользования PID.
retire_owned_orphan() {
  local pid=$1 artifact=$2 birth=$3 tty_value command current
  [[ $pid =~ ^[1-9][0-9]*$ ]] || die "invalid orphan PID"
  [[ $artifact == "$repo/.local/"*"/candidates/"*"/packages/%40cosmos%2Frelease/dist/versions/"*"/server.js" ]] || die "orphan artifact is outside this checkout"
  tty_value=$(iterm_tty) || die "managed iTerm session is missing"
  [[ $(ps -p "$pid" -o ppid= | tr -d ' ') == 1 ]] || die "process is not an orphan"
  [[ $(ps -p "$pid" -o uid= | tr -d ' ') == "$(id -u)" ]] || die "process owner differs"
  [[ $(ps -p "$pid" -o tty= | tr -d ' ') == "${tty_value#/dev/}" ]] || die "process TTY differs"
  current=$(ps -p "$pid" -o lstart= | sed 's/^ *//; s/ *$//')
  [[ $current == "$birth" ]] || die "process birth differs"
  command=$(ps -p "$pid" -o command=)
  [[ $command == *"/bun $artifact" ]] || die "process command differs"
  kill -TERM "$pid"
  for _ in $(seq 1 50); do
    current=$(ps -p "$pid" -o lstart= 2>/dev/null | sed 's/^ *//; s/ *$//' || true)
    [[ $current == "$birth" ]] || { printf 'cosmos: retired owned orphan %s\n' "$pid"; return; }
    sleep 0.2
  done
  die "owned orphan still closing: $pid"
}

package_sizes() {
  local port origin processes expected
  port=$(package_port)
  [[ $port =~ ^[0-9]+$ ]] || die "cannot derive Cosmos port from scripts.dev"
  origin="http://127.0.0.1:$port"
  processes=$(repo_processes)
  [[ -n $processes ]] || die "managed Cosmos is not running"
  ensure_process_ownership
  cdp_ready || die "managed CDP Chrome is unavailable on port $chrome_port"
  expected=$(expected_chrome_processes)
  [[ -n $expected ]] || die "CDP port $chrome_port belongs to another Chrome profile"
  [[ $(wc -l <<<"$expected" | tr -d ' ') == 1 ]] \
    || die "multiple MetaFor CDP Chrome processes found"
  wait_cosmos "$origin"
  bun "$script_dir/package-sizes.ts" "$chrome_port" "$origin"
}

print_status() {
  local port origin state processes children chrome expected targets
  local inspector_state inspector_kind release_pid inspector_address inspector_port
  local listeners ownership ownership_kind listener_pid installed_artifacts http_listeners
  port=$(package_port)
  origin="http://127.0.0.1:${port:-unknown}"
  state=$(iterm_state)
  processes=$(repo_processes)
  children=$(cosmos_children)
  chrome=$(chrome_processes)
  expected=$(expected_chrome_processes)
  printf 'checkout: %s\norigin: %s\n' "$repo" "$origin"
  if [[ $state == found$'\t'* ]]; then
    printf 'iterm: managed %s\n' "${state#*$'\t'}"
  else
    printf 'iterm: %s\n' "$state"
  fi
  if [[ -n $processes ]]; then
    printf 'cosmos:\n%s\n' "$processes"
    [[ -z $children ]] || printf 'cosmos children:\n%s\n' "$children"
  else
    printf 'cosmos: stopped\n'
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
  installed_artifacts=$(bun --cwd "${runtime_root:-$cosmos}" "$script_dir/installed-release.ts" "$cosmos") || installed_artifacts=
  http_listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  inspector_state=$(release_inspector_state "$children" "$cosmos/release" "$installed_artifacts" "$http_listeners")
  IFS=$'\t' read -r inspector_kind release_pid inspector_address <<<"$inspector_state"
  if [[ $inspector_kind == normal || $inspector_kind == debug ]]; then
    printf 'release: %s %s\n' "$inspector_kind" "$release_pid"
  fi
  case "$inspector_kind" in
    debug)
      inspector_port=$(inspector_port_from_address "$inspector_address")
      listeners=$(lsof -nP -iTCP:"$inspector_port" -sTCP:LISTEN -t 2>/dev/null || true)
      ownership=$(inspector_listener_ownership "$release_pid" "$listeners")
      IFS=$'\t' read -r ownership_kind listener_pid <<<"$ownership"
      case "$ownership_kind" in
        managed) printf 'bun inspector: ready %s ws://%s\n' "$release_pid" "$inspector_address" ;;
        missing)
          printf 'bun inspector: unavailable ws://%s release child %s is not listening\n' \
            "$inspector_address" "$release_pid"
          ;;
        foreign)
          printf 'bun inspector: foreign listener %s on ws://%s; release child %s\n' \
            "$listener_pid" "$inspector_address" "$release_pid"
          ;;
        multiple)
          printf 'bun inspector: multiple listeners on ws://%s; release child %s\n' \
            "$inspector_address" "$release_pid"
          ;;
      esac
      ;;
    normal|absent) printf 'bun inspector: stopped\n' ;;
    multiple) printf 'bun inspector: ambiguous exact release descendants %s\n' "$release_pid" ;;
    invalid) printf 'bun inspector: invalid address on exact release child %s\n' "$release_pid" ;;
  esac
}

validate_repo
for command_name in bun curl git jq lsof osascript pgrep ps shasum; do
  command -v "$command_name" >/dev/null 2>&1 || die "$command_name is missing"
done

case "$action" in
  start) start_contour normal ;;
  start-server) start_contour normal external ;;
  start-browser) start_contour normal managed ;;
  start-debug) start_contour debug ;;
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
    start_contour normal
    ;;
  restart-server)
    stop_contour
    start_contour normal external
    ;;
  restart-browser)
    stop_contour
    start_contour normal managed
    ;;
  restart-debug)
    stop_contour
    start_contour debug
    ;;
  clear-site-data) clear_site_data ;;
  sizes) package_sizes ;;
  stop) stop_contour ;;
  stop-release) stop_release_contour "${3:?expected Core PID required}" ;;
  retire-owned-orphan) retire_owned_orphan "${3:?PID required}" "${4:?artifact required}" "${5:?birth required}" ;;
  *) die "usage: $0 {start|start-server|start-browser|start-debug|status|focus|logs|restart|restart-server|restart-browser|restart-debug|clear-site-data|sizes|stop|stop-release} [checkout] [expected Core PID]" ;;
esac
