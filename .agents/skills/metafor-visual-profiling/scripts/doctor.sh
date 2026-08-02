#!/usr/bin/env bash
set -u

repo=${1:-${METAFOR_REPO:-$PWD}}
codex_root=${CODEX_HOME:-$HOME/.codex}
inspector=${WEBGPU_INSPECTOR_DIR:-$codex_root/tools/webgpu-inspector}
failures=0

ok() { printf 'ok    %s\n' "$1"; }
warn() { printf 'warn  %s\n' "$1"; }
fail() { printf 'fail  %s\n' "$1"; failures=$((failures + 1)); }

if [[ $(uname -s) == Darwin ]]; then
  ok "platform Darwin"
else
  fail "this workflow requires macOS"
fi

for command_name in bun node jq git curl lsof launchctl plutil codex; do
  if command -v "$command_name" >/dev/null 2>&1; then
    ok "$command_name $(command -v "$command_name")"
  else
    fail "$command_name is missing"
  fi
done

if [[ -d $repo ]] && git -C "$repo" rev-parse --show-toplevel >/dev/null 2>&1; then
  root=$(git -C "$repo" rev-parse --show-toplevel)
  if [[ $root == "$repo" ]]; then
    ok "checkout $root"
  else
    fail "repo argument is not the checkout root: $repo"
  fi
  branch=$(git -C "$repo" branch --show-current 2>/dev/null || true)
  ok "branch ${branch:-detached}"
  if jq -e '.scripts["runtime:universe"] == "bun runtime/universe.ts"' "$repo/package.json" >/dev/null 2>&1; then
    ok "runtime:universe contract"
  else
    fail "runtime:universe script is missing or changed"
  fi
else
  fail "invalid MetaFor checkout: $repo"
fi

if [[ -f $inspector/claude-plugin/server/index.js && -f $inspector/extensions/chrome/webgpu_inspector.js ]]; then
  ok "WebGPU Inspector $inspector"
else
  fail "WebGPU Inspector checkout/build missing: $inspector"
fi

if codex mcp get webgpu-inspector >/dev/null 2>&1; then
  ok "Codex MCP webgpu-inspector"
else
  fail "Codex MCP webgpu-inspector is not configured"
fi

if curl -fsS --max-time 2 http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
  ok "CDP Chrome 127.0.0.1:9222"
else
  warn "CDP Chrome is not running on 9222"
fi

for service in 7878 7880 7882; do
  if curl -fsS --max-time 2 "http://127.0.0.1:$service/health" >/dev/null 2>&1; then
    ok "macOS control service $service"
  else
    warn "macOS control service $service is unavailable"
  fi
done

if targets=$(curl -fsS --max-time 2 http://127.0.0.1:7880/cdp/targets 2>/dev/null); then
  target_count=$(jq -r '.count // (.targets | length) // 0' <<<"$targets")
  ok "CDP target API ($target_count page target(s))"
else
  warn "@meta/chrome CDP target API is unavailable"
fi

if curl -fsS --max-time 2 http://127.0.0.1:4004/health >/dev/null 2>&1; then
  ok "MetaFor Bulk 4004"
else
  warn "MetaFor contour is not running"
fi

if launchctl print "gui/$(id -u)/dev.metafor.cloud-contour" >/dev/null 2>&1; then
  ok "launchd job dev.metafor.cloud-contour is installed"
else
  warn "launchd contour job is not installed"
fi

if (( failures > 0 )); then
  printf '\n%d required check(s) failed\n' "$failures"
  exit 1
fi
printf '\nenvironment checks passed\n'
