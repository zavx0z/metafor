#!/usr/bin/env bash

# Internal selector-aware dispatcher owned by $quantum-dev.

set -euo pipefail
export LC_ALL=C LANG=C

action=${1:-}
repo=${2:-}
selector=${3:-}
script_dir=$(cd "$(dirname "$0")" && pwd)
registry="$script_dir/storybooks.json"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

[[ -n $action && -n $repo && -n $selector ]] \
  || die "usage: $0 {status|ensure|start|restart|logs|stop|health} <checkout> <selector>"

case "$action" in
  status|ensure|start|restart|logs|stop|health) ;;
  *) die "unknown action: $action" ;;
esac

[[ -f $registry ]] || die "storybook registry is missing: $registry"

validate_repo() {
  [[ -d $repo ]] || die "checkout does not exist: $repo"
  local root
  root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) \
    || die "not a Git checkout: $repo"
  [[ $root == "$repo" ]] || die "pass the exact checkout root, got: $repo"
}

validate_repo

selector_json=$(jq -ce --arg selector "$selector" '.selectors[$selector]' "$registry" 2>/dev/null) \
  || die "unknown storybook selector: $selector"
supported=$(jq -r '.supported' <<<"$selector_json")
package_name=$(jq -r '.package' <<<"$selector_json")

print_unsupported() {
  local reason
  reason=$(jq -r '.reason' <<<"$selector_json")
  jq -n \
    --arg action "$action" \
    --arg checkout "$repo" \
    --arg selector "$selector" \
    --arg package "$package_name" \
    --arg reason "$reason" \
    '{action:$action, checkout:$checkout, selector:$selector, package:$package,
      supported:false, status:"unsupported", reason:$reason}'
}

if [[ $supported != true ]]; then
  print_unsupported
  exit 3
fi

cwd_rel=$(jq -r '.cwd' <<<"$selector_json")
package_cwd="$repo/$cwd_rel"
[[ -d $package_cwd ]] || die "registry cwd is missing: $package_cwd"

command_json=$(jq -c '.command' <<<"$selector_json")
command_argv=()
while IFS= read -r item; do
  command_argv+=("$item")
done < <(jq -r '.command[]' <<<"$selector_json")
[[ ${#command_argv[@]} -gt 0 ]] || die "registry command is empty: $selector"

host=$(jq -r '.host' <<<"$selector_json")
host_env=$(jq -r '.hostEnv // ""' <<<"$selector_json")
registry_port=$(jq -r '.port' <<<"$selector_json")
port_env=$(jq -r '.portEnv' <<<"$selector_json")
registry_origin=$(jq -r '.origin' <<<"$selector_json")
http_marker=$(jq -r '.httpMarker' <<<"$selector_json")
probe_path=$(jq -r '.probePath // "/"' <<<"$selector_json")
ready_json=$(jq -c '.ready' <<<"$selector_json")
canvas_json=$(jq -c '.canvas' <<<"$selector_json")
routes_json=$(jq -c '.routes' <<<"$selector_json")
state_key=$(jq -r '.stateKey' <<<"$selector_json")
log_name=$(jq -r '.logName' <<<"$selector_json")

port=$registry_port
test_override=false
if [[ -n ${QUANTUM_DEV_TEST_PORT:-} ]]; then
  [[ ${QUANTUM_DEV_TEST_MODE:-0} == 1 ]] \
    || die "QUANTUM_DEV_TEST_PORT requires QUANTUM_DEV_TEST_MODE=1"
  [[ ${QUANTUM_DEV_TEST_PORT} =~ ^[0-9]+$ ]] \
    && ((QUANTUM_DEV_TEST_PORT > 0 && QUANTUM_DEV_TEST_PORT < 65536)) \
    || die "QUANTUM_DEV_TEST_PORT must be an integer from 1 to 65535"
  port=$QUANTUM_DEV_TEST_PORT
  test_override=true
fi

origin="http://$host:$port"
if [[ $test_override == false && $origin != "$registry_origin" ]]; then
  die "registry origin does not match host/port: $registry_origin"
fi

temp_root=${TMPDIR:-/tmp}
temp_root=${temp_root%/}
state_root=${QUANTUM_DEV_STATE_ROOT:-$temp_root/quantum-dev}
repo_key=$(printf '%s:%s:%s' "$repo" "$state_key" "$port" | cksum | awk '{print $1}')
state_dir="$state_root/$state_key-$repo_key"
pid_file="$state_dir/pid"
start_file="$state_dir/start-time"
log_file="$state_dir/$log_name"
last_exit_file="$state_dir/last-exit.json"

read_last_exit() {
  if [[ -f $last_exit_file ]] && jq -ce '
    type == "object"
    and (.reason | type == "string")
    and (.pid == null or (.pid | type == "number"))
    and (.signal == null or (.signal | type == "string"))
    and (.exitCode == null or (.exitCode | type == "number"))
    and (.at | type == "string")
  ' "$last_exit_file" >/dev/null 2>&1; then
    jq -c . "$last_exit_file"
  else
    printf 'null\n'
  fi
}

write_last_exit() {
  local reason=$1 pid=${2:-} signal=${3:-} exit_code=${4:-} process_started=${5:-} temp_file
  mkdir -p "$state_dir"
  [[ -n $process_started ]] || process_started=$(recorded_start)
  temp_file="$state_dir/.last-exit.$$.json"
  jq -n \
    --arg reason "$reason" \
    --arg pid "$pid" \
    --arg signal "$signal" \
    --arg exitCode "$exit_code" \
    --arg processStart "$process_started" \
    --arg at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    '{reason:$reason,
      pid:($pid | if length == 0 then null else tonumber end),
      processStart:($processStart | if length == 0 then null else . end),
      signal:($signal | if length == 0 then null else . end),
      exitCode:($exitCode | if length == 0 then null else tonumber end),
      at:$at}' >"$temp_file"
  mv "$temp_file" "$last_exit_file"
}

has_requested_exit() {
  local pid=$1 process_started=$2
  [[ -f $last_exit_file ]] || return 1
  jq -e \
    --argjson pid "$pid" \
    --arg processStart "$process_started" \
    '.pid == $pid
      and .processStart == $processStart
      and (.reason == "manual-stop" or .reason == "restart")' \
    "$last_exit_file" >/dev/null 2>&1
}

listener_pids() {
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

recorded_pid() {
  if [[ -f $pid_file ]]; then
    local pid
    pid=$(sed -n '1p' "$pid_file")
    [[ $pid =~ ^[0-9]+$ ]] && printf '%s' "$pid"
  fi
}

process_cwd() {
  local pid=$1
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
}

process_command() {
  local pid=$1
  ps -p "$pid" -o command= 2>/dev/null || true
}

process_start() {
  local pid=$1
  ps -p "$pid" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true
}

recorded_start() {
  [[ -f $start_file ]] && sed -n '1p' "$start_file"
}

is_listener() {
  local candidate=$1 pid
  while IFS= read -r pid; do
    [[ $pid == "$candidate" ]] && return 0
  done < <(listener_pids)
  return 1
}

command_matches() {
  local pid=$1 command item
  command=$(process_command "$pid")
  [[ -n $command ]] || return 1
  for item in "${command_argv[@]}"; do
    [[ $command == *"$item"* ]] || return 1
  done
}

is_owned() {
  local pid
  pid=$(recorded_pid)
  [[ -n $pid ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  is_listener "$pid" || return 1
  [[ $(process_cwd "$pid") == "$package_cwd" ]] || return 1
  [[ -n $(recorded_start) && $(process_start "$pid") == "$(recorded_start)" ]] || return 1
  command_matches "$pid"
}

probe_http() {
  curl -fsS --max-time 2 "$origin$probe_path" 2>/dev/null | grep -Fq "$http_marker"
}

status_json() {
  local outcome=${1:-observed}
  local listeners_json listeners ownership status pid process_started http_healthy managed_healthy
  local last_exit last_exit_reason recovery_hint
  listeners=$(listener_pids | paste -sd, -)
  listeners_json=$(listener_pids | jq -Rsc 'split("\n") | map(select(length > 0) | tonumber)')
  ownership=none
  status=stopped
  pid=""
  process_started=""
  if is_owned; then
    ownership=skill
    status=running
    pid=$(recorded_pid)
    process_started=$(recorded_start)
  elif [[ -n $listeners ]]; then
    ownership=foreign
    status=foreign
  fi
  http_healthy=false
  probe_http && http_healthy=true
  managed_healthy=false
  [[ $ownership == skill && $http_healthy == true ]] && managed_healthy=true
  last_exit=$(read_last_exit)
  last_exit_reason=$(jq -r '.reason // ""' <<<"$last_exit")
  recovery_hint=""
  if [[ $status == stopped && $last_exit_reason == owner-session-lost ]]; then
    recovery_hint="Run quantum-dev.sh ensure in a long-lived PTY before the next lifecycle or browser operation."
  fi

  jq -n \
    --arg action "$action" \
    --arg checkout "$repo" \
    --arg selector "$selector" \
    --arg package "$package_name" \
    --arg cwd "$package_cwd" \
    --arg portEnv "$port_env" \
    --argjson registryPort "$registry_port" \
    --argjson port "$port" \
    --arg origin "$origin" \
    --arg probePath "$probe_path" \
    --arg ownership "$ownership" \
    --arg status "$status" \
    --arg pid "$pid" \
    --arg processStart "$process_started" \
    --arg log "$log_file" \
    --arg outcome "$outcome" \
    --arg recoveryHint "$recovery_hint" \
    --argjson command "$command_json" \
    --argjson ready "$ready_json" \
    --argjson canvas "$canvas_json" \
    --argjson routes "$routes_json" \
    --argjson listeners "$listeners_json" \
    --argjson httpHealthy "$http_healthy" \
    --argjson managedHealthy "$managed_healthy" \
    --argjson testOverride "$test_override" \
    --argjson lastExit "$last_exit" \
    '{action:$action, checkout:$checkout, selector:$selector, package:$package,
      supported:true, cwd:$cwd, command:$command, portEnv:$portEnv,
      registryPort:$registryPort, port:$port, origin:$origin, ready:$ready,
      probePath:$probePath, routes:$routes, canvas:$canvas,
      ownership:$ownership, status:$status,
      pid:($pid | if length == 0 then null else tonumber end), listeners:$listeners,
      processStart:($processStart | if length == 0 then null else . end),
      log:$log, httpHealthy:$httpHealthy, managedHealthy:$managedHealthy,
      testOverride:$testOverride, outcome:$outcome, lastExit:$lastExit,
      recoveryHint:($recoveryHint | if length == 0 then null else . end)}'
}

stop_owned() {
  local reason=${1:-manual-stop}
  local pid attempt
  pid=$(recorded_pid)
  [[ -n $pid ]] || return 0
  is_owned || die "recorded process is no longer exact owned target: $pid"
  write_last_exit "$reason" "$pid"
  kill -TERM "$pid"
  for attempt in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$pid" 2>/dev/null; then
    is_owned || die "process identity changed while stopping: $pid"
    kill -KILL "$pid"
  fi
  rm -f "$pid_file" "$start_file"
}

start_contour() {
  local outcome=${1:-started}
  local listeners pid child_start attempt exit_code
  listeners=$(listener_pids | paste -sd, -)
  if is_owned; then
    printf 'duplicate owned process refused\n' >&2
    status_json "refused-duplicate"
    return 2
  fi
  if [[ -n $listeners ]]; then
    printf 'foreign listener preserved on %s: %s\n' "$origin" "$listeners" >&2
    status_json "refused-foreign"
    return 2
  fi

  mkdir -p "$state_dir"
  rm -f "$pid_file" "$start_file"
  : >"$log_file"
  cd "$package_cwd"
  env_args=("$port_env=$port")
  [[ -n $host_env ]] && env_args+=("$host_env=$host")
  env "${env_args[@]}" "${command_argv[@]}" >"$log_file" 2>&1 &
  pid=$!
  printf '%s\n' "$pid" >"$pid_file"
  printf '%s\n' "$(process_start "$pid")" >"$start_file"
  child_start=$(recorded_start)

  cleanup_start() {
    local child_pid=$1 child_process_start=$2 reason=$3 exit_code=$4 signal=$5
    if kill -0 "$child_pid" 2>/dev/null; then
      kill -TERM "$child_pid" 2>/dev/null || true
      wait "$child_pid" 2>/dev/null || true
    fi
    if ! has_requested_exit "$child_pid" "$child_process_start"; then
      write_last_exit "$reason" "$child_pid" "$signal" "$exit_code" "$child_process_start"
    fi
    if [[ $(recorded_pid) == "$child_pid" ]]; then
      rm -f "$pid_file" "$start_file"
    fi
  }

  owner_signal() {
    local child_pid=$1 child_process_start=$2 signal=$3 exit_code=$4
    trap - EXIT HUP INT TERM
    cleanup_start "$child_pid" "$child_process_start" "owner-session-lost" "$exit_code" "$signal"
    exit "$exit_code"
  }

  trap "cleanup_start '$pid' '$child_start' 'owner-wrapper-exit' '1' ''" EXIT
  trap "owner_signal '$pid' '$child_start' 'HUP' '129'" HUP
  trap "owner_signal '$pid' '$child_start' 'INT' '130'" INT
  trap "owner_signal '$pid' '$child_start' 'TERM' '143'" TERM

  for attempt in $(seq 1 100); do
    if probe_http && is_owned; then
      status_json "$outcome"
      set +e
      wait "$pid"
      exit_code=$?
      set -e
      trap - EXIT HUP INT TERM
      cleanup_start "$pid" "$child_start" "child-exited" "$exit_code" ""
      return "$exit_code"
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      printf 'storybook exited during startup; log: %s\n' "$log_file" >&2
      tail -80 "$log_file" >&2 || true
      trap - EXIT HUP INT TERM
      cleanup_start "$pid" "$child_start" "startup-failed" "1" ""
      return 1
    fi
    sleep 0.2
  done

  printf 'storybook did not become healthy; exact child will be terminated: %s\n' "$pid" >&2
  trap - EXIT HUP INT TERM
  cleanup_start "$pid" "$child_start" "startup-unhealthy" "1" ""
  return 1
}

case "$action" in
  status)
    status_json
    ;;
  ensure)
    if is_owned; then
      if probe_http; then
        status_json "reused"
      else
        printf 'owned selector is unhealthy; explicit restart is required: %s\n' "$origin" >&2
        status_json "owned-unhealthy"
        exit 4
      fi
    elif [[ -n $(listener_pids) ]]; then
      printf 'foreign listener preserved on %s\n' "$origin" >&2
      status_json "refused-foreign"
      exit 2
    else
      start_contour "started"
    fi
    ;;
  health)
    status_json
    is_owned && probe_http || exit 1
    ;;
  start)
    start_contour "started"
    ;;
  restart)
    if [[ -n $(listener_pids) ]] && ! is_owned; then
      printf 'foreign listener preserved on %s\n' "$origin" >&2
      status_json
      exit 2
    fi
    is_owned && stop_owned "restart"
    start_contour "started"
    ;;
  logs)
    [[ -f $log_file ]] || die "no log for $selector: $log_file"
    printf '==> %s <==\n' "$log_file"
    tail -200 "$log_file"
    ;;
  stop)
    if is_owned; then
      stop_owned "manual-stop"
      status_json "stopped"
    elif [[ -n $(listener_pids) ]]; then
      printf 'foreign listener preserved on %s\n' "$origin" >&2
      status_json
      exit 2
    else
      rm -f "$pid_file" "$start_file"
      write_last_exit "manual-stop" ""
      status_json "stopped"
    fi
    ;;
esac
