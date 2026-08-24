#!/usr/bin/env bash
set -u
export LC_ALL=C LANG=C

main() {
  local script_dir repo mode inspect_address cosmos script exit_code
  script_dir=$(cd "$(dirname "$0")" && pwd)
  source "$script_dir/inspector.sh"
  repo=${1:?usage: terminal-runner.sh checkout}
  mode=${2:-normal}
  inspect_address=${3:-}
  cosmos="$repo/cosmos"

  configure_terminal_inspector_environment "$mode" "$inspect_address" || exit 1
  case "$mode" in
    normal) script=dev ;;
    debug) script=dev:debug ;;
    *) printf 'Unknown MetaFor development mode: %s\n' "$mode" >&2; exit 1 ;;
  esac

  cd "$cosmos" || exit 1
  printf '\033]0;%s\007' "MetaFor Dev - Cosmos"
  printf 'MetaFor Dev\ncheckout: %s\ncommand: bun run %s\n\n' "$repo" "$script"

  exit_code=0
  bun run "$script" || exit_code=$?

  printf '\nCosmos stopped with exit code %s\n' "$exit_code"
  printf 'This iTerm session stays open for metafor-dev restart and log inspection.\n'
  exec /bin/zsh -l
}

main "$@"
