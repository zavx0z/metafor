#!/usr/bin/env bash
set -euo pipefail

if (( $# > 1 )); then
  printf 'error: usage: %s [existing-inspector-checkout]\n' "$0" >&2
  exit 1
fi

codex_root=${CODEX_HOME:-$HOME/.codex}
checkout=${1:-$codex_root/tools/webgpu-inspector}
captures_dir=${WEBGPU_BRIDGE_CAPTURES_DIR:-$codex_root/state/webgpu-inspector/captures}

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
for command_name in node codex; do
  command -v "$command_name" >/dev/null 2>&1 || die "$command_name is missing"
done
[[ -f $checkout/claude-plugin/server/index.js \
  && -f $checkout/extensions/chrome/webgpu_inspector.js ]] \
  || die "built external Inspector is missing: $checkout; provision it outside MetaFor"

mkdir -p "$captures_dir"
if codex mcp get webgpu-inspector >/dev/null 2>&1; then
  codex mcp remove webgpu-inspector
fi
codex mcp add webgpu-inspector \
  --env "CLAUDE_PLUGIN_ROOT=$checkout/claude-plugin" \
  --env "WEBGPU_BRIDGE_CAPTURES_DIR=$captures_dir" \
  --env WEBGPU_BRIDGE_HOST=127.0.0.1 \
  --env WEBGPU_BRIDGE_PORT=9690 \
  -- "$(command -v node)" "$checkout/claude-plugin/server/index.js"

printf 'registered external WebGPU Inspector\ncheckout: %s\ncaptures: %s\nrestart Codex before using the MCP\n' \
  "$checkout" "$captures_dir"
