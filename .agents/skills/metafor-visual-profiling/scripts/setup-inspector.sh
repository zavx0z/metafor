#!/usr/bin/env bash
set -euo pipefail

default_repository_url=https://github.com/zavx0z/webgpu_inspector.git
default_revision=891473bb5a236be87f4421cd1f7e83f13471fc7f

if (( $# != 0 && $# != 2 && $# != 3 )); then
  printf 'error: usage: %s [repository-url full-40-character-commit [checkout]]\n' "$0" >&2
  exit 1
fi

repository_url=${1:-$default_repository_url}
revision=${2:-$default_revision}
codex_root=${CODEX_HOME:-$HOME/.codex}
checkout=${3:-$codex_root/tools/webgpu-inspector}
captures_dir=${WEBGPU_BRIDGE_CAPTURES_DIR:-$codex_root/state/webgpu-inspector/captures}
npm_cache=${NPM_CONFIG_CACHE:-$codex_root/cache/webgpu-inspector-npm}

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

canonical_github_remote() {
  local url=$1
  url=${url#git@github.com:}
  url=${url#ssh://git@github.com/}
  url=${url#https://github.com/}
  url=${url#http://github.com/}
  url=${url%.git}
  printf '%s\n' "$url"
}

[[ $revision =~ ^[0-9a-fA-F]{40}$ ]] || die "revision must be a full 40-character Git commit"

for command_name in git node npm codex; do
  command -v "$command_name" >/dev/null 2>&1 || die "$command_name is missing"
done

mkdir -p "$(dirname "$checkout")" "$captures_dir" "$npm_cache"

if [[ -e $checkout ]]; then
  git -C "$checkout" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || die "existing checkout path is not a Git repository: $checkout"
  [[ -z $(git -C "$checkout" status --porcelain) ]] \
    || die "existing Inspector checkout is dirty: $checkout"
  current_origin=$(git -C "$checkout" remote get-url origin)
  [[ $(canonical_github_remote "$current_origin") == $(canonical_github_remote "$repository_url") ]] \
    || die "origin mismatch: expected $repository_url, got $current_origin"
else
  git clone --filter=blob:none "$repository_url" "$checkout"
fi

git -C "$checkout" fetch --no-tags origin "$revision"
git -C "$checkout" checkout --detach "$revision"
resolved_revision=$(git -C "$checkout" rev-parse HEAD)
[[ $resolved_revision == "$revision" ]] || die "failed to resolve pinned revision"

env npm_config_cache="$npm_cache" npm install --no-package-lock --ignore-scripts --prefix "$checkout"
for server_dependency in @modelcontextprotocol/sdk puppeteer-core ws; do
  [[ -d $checkout/claude-plugin/server/node_modules/$server_dependency ]] \
    || die "pinned server dependency is missing: $server_dependency"
done
npm run build --prefix "$checkout"
npm test --prefix "$checkout/claude-plugin/server"
[[ -z $(git -C "$checkout" status --porcelain) ]] \
  || die "build or tests changed the pinned Inspector checkout"

if codex mcp get webgpu-inspector >/dev/null 2>&1; then
  codex mcp remove webgpu-inspector
fi
codex mcp add webgpu-inspector \
  --env "CLAUDE_PLUGIN_ROOT=$checkout/claude-plugin" \
  --env "WEBGPU_BRIDGE_CAPTURES_DIR=$captures_dir" \
  --env WEBGPU_BRIDGE_HOST=127.0.0.1 \
  --env WEBGPU_BRIDGE_PORT=9690 \
  -- "$(command -v node)" "$checkout/claude-plugin/server/index.js"

printf 'installed WebGPU Inspector %s\ncheckout: %s\ncaptures: %s\nrestart Codex before using the MCP\n' \
  "$resolved_revision" "$checkout" "$captures_dir"
