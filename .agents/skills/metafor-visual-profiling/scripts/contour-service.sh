#!/usr/bin/env bash
set -euo pipefail

action=${1:-status}
label=dev.metafor.cloud-contour
uid_value=$(id -u)
domain="gui/$uid_value"
target="$domain/$label"
plist="$HOME/Library/LaunchAgents/$label.plist"
command_dir="$HOME/.local/bin"
command_path="$command_dir/metafor-contour"
log_dir="$HOME/Library/Logs/MetaFor"
stdout_log="$log_dir/cloud-contour.out.log"
stderr_log="$log_dir/cloud-contour.err.log"
repo=${2:-${METAFOR_REPO:-}}
if [[ -z $repo && -f $plist ]]; then
  repo=$(plutil -extract WorkingDirectory raw -expect string "$plist" 2>/dev/null || true)
fi
repo=${repo:-$PWD}

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

validate_repo() {
  [[ -d $repo ]] || die "checkout does not exist: $repo"
  local root
  root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) || die "not a Git checkout: $repo"
  [[ $root == "$repo" ]] || die "pass the exact checkout root, got: $repo"
  jq -e '.scripts["runtime:universe"] == "bun runtime/universe.ts"' "$repo/package.json" >/dev/null \
    || die "runtime:universe script is missing or changed"
}

job_loaded() {
  launchctl print "$target" >/dev/null 2>&1
}

job_running() {
  launchctl print "$target" 2>/dev/null | grep -q 'state = running'
}

ports_busy() {
  lsof -nP -iTCP:4000-4005 -sTCP:LISTEN -t 2>/dev/null | grep -q .
}

wait_healthy() {
  local attempt port ready
  for attempt in {1..50}; do
    ready=true
    for port in 4000 4001 4003 4004 4005; do
      if ! curl -fsS --max-time 1 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
        ready=false
        break
      fi
    done
    if [[ $ready == true ]]; then
      printf 'running: %s\n' "$target"
      return 0
    fi
    sleep 0.2
  done
  die "contour did not become healthy; inspect $stderr_log"
}

install_job() {
  validate_repo
  command -v bun >/dev/null 2>&1 || die "bun is missing"
  command -v jq >/dev/null 2>&1 || die "jq is missing"
  mkdir -p "$HOME/Library/LaunchAgents" "$command_dir" "$log_dir"

  local bun_path path_value args_json env_json temp_plist
  bun_path=$(command -v bun)
  path_value="$(dirname "$bun_path"):/opt/local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  args_json=$(jq -cn --arg bun "$bun_path" '[$bun, "run", "runtime:universe"]')
  env_json=$(jq -cn --arg path "$path_value" '{PATH:$path}')
  temp_plist=$(mktemp "${TMPDIR:-/tmp}/$label.XXXXXX")
  trap 'rm -f "$temp_plist"' RETURN

  plutil -create xml1 "$temp_plist"
  plutil -insert Label -string "$label" "$temp_plist"
  plutil -insert ProgramArguments -json "$args_json" "$temp_plist"
  plutil -insert WorkingDirectory -string "$repo" "$temp_plist"
  plutil -insert EnvironmentVariables -json "$env_json" "$temp_plist"
  plutil -insert RunAtLoad -bool false "$temp_plist"
  plutil -insert KeepAlive -bool false "$temp_plist"
  plutil -insert ProcessType -string Interactive "$temp_plist"
  plutil -insert StandardOutPath -string "$stdout_log" "$temp_plist"
  plutil -insert StandardErrorPath -string "$stderr_log" "$temp_plist"
  plutil -lint "$temp_plist" >/dev/null

  if job_loaded; then
    launchctl bootout "$target"
    local unload_attempt
    for unload_attempt in {1..50}; do
      job_loaded || break
      sleep 0.1
    done
    job_loaded && die "launchd job did not unload: $target"
  fi
  install -m 0644 "$temp_plist" "$plist"
  ln -sfn "$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" "$command_path"
  launchctl bootstrap "$domain" "$plist"
  printf 'installed: %s\ncheckout: %s\ncommand: %s\n' "$target" "$repo" "$command_path"
}

start_job() {
  validate_repo
  job_loaded || die "service is not installed; run install first"
  if job_running; then
    printf 'already running: %s\n' "$target"
    return
  fi
  ports_busy && die "ports 4000-4005 are already owned by another process"
  launchctl kickstart "$target"
  wait_healthy
}

stop_job() {
  job_loaded || { printf 'not installed: %s\n' "$target"; return; }
  if job_running; then
    launchctl kill SIGTERM "$target"
    local attempt
    for attempt in {1..50}; do
      job_running || break
      sleep 0.1
    done
  fi
  printf 'stopped: %s\n' "$target"
}

restart_job() {
  validate_repo
  job_loaded || die "service is not installed; run install first"
  if job_running; then
    launchctl kickstart -k "$target"
  else
    ports_busy && die "ports 4000-4005 are already owned by another process"
    launchctl kickstart "$target"
  fi
  wait_healthy
}

status_job() {
  if ! job_loaded; then
    printf 'not installed: %s\n' "$target"
    return 1
  fi
  if job_running; then
    printf 'service: running\n'
  else
    printf 'service: stopped\n'
  fi
  launchctl print "$target" | grep -E 'state =|pid =|last exit code =' || true
  local port
  for port in 4000 4001 4003 4004 4005; do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
      printf '%s: healthy\n' "$port"
    else
      printf '%s: unavailable\n' "$port"
    fi
  done
}

case "$action" in
  install) install_job ;;
  start) start_job ;;
  stop) stop_job ;;
  restart) restart_job ;;
  status) status_job ;;
  logs)
    printf '%s\n' "--- $stdout_log"; tail -n 80 "$stdout_log" 2>/dev/null || true
    printf '%s\n' "--- $stderr_log"; tail -n 80 "$stderr_log" 2>/dev/null || true
    ;;
  uninstall)
    if job_loaded; then launchctl bootout "$target"; fi
    rm -f "$plist"
    if [[ -L $command_path && $(readlink "$command_path") == "$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" ]]; then
      rm -f "$command_path"
    fi
    printf 'uninstalled: %s\n' "$target"
    ;;
  *)
    die "usage: $0 {install|start|stop|restart|status|logs|uninstall} <checkout>"
    ;;
esac
