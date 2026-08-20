#!/usr/bin/env bash
set -u
export LC_ALL=C LANG=C

script_dir=$(cd "$(dirname "$0")" && pwd)
repo=${1:-$(cd "$script_dir/../../../.." && pwd)}
codex_root=${CODEX_HOME:-$HOME/.codex}
inspector=${WEBGPU_INSPECTOR_DIR:-$codex_root/tools/webgpu-inspector}
failures=0

ok() { printf 'ok    %s\n' "$1"; }
warn() { printf 'warn  %s\n' "$1"; }
fail() { printf 'fail  %s\n' "$1"; failures=$((failures + 1)); }

resolve_iterm_app() {
  local candidate configured=${METAFOR_DEV_ITERM_APP:-}
  if [[ -n $configured ]]; then
    [[ -d $configured ]] || return 1
    printf '%s\n' "$configured"
    return
  fi
  for candidate in \
    /Applications/iTerm.app \
    /Applications/iTerm2.app \
    /Applications/MacPorts/iTerm2.app \
    "$HOME/Applications/iTerm.app" \
    "$HOME/Applications/iTerm2.app"; do
    if [[ -d $candidate ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  while IFS= read -r candidate; do
    if [[ -d $candidate ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done < <(/usr/bin/mdfind "kMDItemCFBundleIdentifier == 'com.googlecode.iterm2'" 2>/dev/null)
  return 1
}

[[ $(uname -s) == Darwin ]] && ok "platform Darwin" || fail "this workflow requires macOS"

for command_name in bun curl git jq lsof open osascript pgrep ps shasum; do
  if command -v "$command_name" >/dev/null 2>&1; then
    ok "$command_name $(command -v "$command_name")"
  else
    fail "$command_name is missing"
  fi
done

if [[ -d $repo ]] && git -C "$repo" rev-parse --show-toplevel >/dev/null 2>&1; then
  root=$(git -C "$repo" rev-parse --show-toplevel)
  [[ $root == "$repo" ]] && ok "checkout $root" || fail "pass the exact checkout root: $repo"
  branch=$(git -C "$repo" branch --show-current 2>/dev/null || true)
  ok "branch ${branch:-detached}"
  if jq -e '.scripts.dev | type == "string" and length > 0' \
    "$repo/hamiltonian/package.json" >/dev/null 2>&1; then
    ok "hamiltonian scripts.dev"
  else
    fail "hamiltonian scripts.dev is missing"
  fi
else
  fail "invalid MetaFor checkout: $repo"
fi

if iterm_app=$(resolve_iterm_app); then
  ok "iTerm $iterm_app"
else
  fail "iTerm is missing"
fi
[[ -x /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome ]] \
  && ok "Google Chrome" || fail "Google Chrome is missing"

if [[ -x $script_dir/metafor-dev.sh \
  && -x $script_dir/terminal-runner.sh \
  && -f $script_dir/chrome-target.ts ]]; then
  ok "metafor-dev lifecycle scripts"
else
  fail "metafor-dev lifecycle scripts are not executable"
fi

if [[ -f $inspector/claude-plugin/server/index.js && -f $inspector/extensions/chrome/webgpu_inspector.js ]]; then
  ok "WebGPU Inspector $inspector"
else
  warn "WebGPU Inspector is not installed; functional development remains available"
fi

if (( failures > 0 )); then
  printf '\n%d required check(s) failed\n' "$failures"
  exit 1
fi
printf '\nmetafor-dev base environment is ready\n'
