#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/metafor-terminal-runner.XXXXXX")
trap 'rm -r "$test_root"' EXIT

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

runner="$test_root/terminal-runner.sh"
mkdir -p "$test_root/bin" "$test_root/repository/cosmos"
sed 's|  exec /bin/zsh -l|  return "$exit_code"|' \
  "$script_dir/terminal-runner.sh" > "$runner"
cp "$script_dir/inspector.sh" "$test_root/inspector.sh"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "%s\n" "replacement must not execute" > "$RUNNER_UNDER_TEST"' \
  'exit 0' > "$test_root/bin/bun"
chmod +x "$runner" "$test_root/bin/bun"

if ! output=$(PATH="$test_root/bin:$PATH" RUNNER_UNDER_TEST="$runner" \
  "$runner" "$test_root/repository" normal 2>&1); then
  fail "preloaded runner failed after its source file was replaced: $output"
fi
[[ $output == *"command: bun run dev"* ]] \
  || fail "runner did not invoke the original normal command"
[[ $output == *"Cosmos stopped with exit code 0"* ]] \
  || fail "runner lost its preloaded completion footer"
[[ $(<"$runner") == "replacement must not execute" ]] \
  || fail "fake Bun did not replace the executing runner"
printf 'ok - terminal runner finishes its preloaded body after source replacement\n'
