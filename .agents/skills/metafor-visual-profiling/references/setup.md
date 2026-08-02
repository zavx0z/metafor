# Environment setup

Use this reference only for a first installation, repair, or move to another
Mac.

## Required components

- Bun for the MetaFor monorepo.
- Node.js 18 or newer for the WebGPU Inspector MCP.
- `jq`, Git, curl, lsof, launchctl, and plutil.
- The `@meta/macos` services on ports 7878, 7880, and 7882.
- One dedicated Chrome CDP profile on port 9222.
- WebGPU Inspector checked out under
  `${CODEX_HOME:-$HOME/.codex}/tools/webgpu-inspector`.

On the Intel development Mac, install system packages through MacPorts, never
Homebrew. Check `port version` and the active ports before installing anything.

## Inspector installation

Use the deterministic installer with the pinned owner fork:

```bash
scripts/setup-inspector.sh
```

The default source is
`https://github.com/zavx0z/webgpu_inspector.git` at commit
`356dd372d3867a568139bd253b332b340418487d`. To test another owner-approved
build, pass both its repository URL and full commit.

The installer refuses a dirty or mismatched existing checkout, installs root
build dependencies with an isolated npm cache, verifies the server dependencies
pinned in the Inspector commit, builds and tests the bundles, places captures
outside the Git checkout, and registers the MCP. Do not run `npm ci` inside
`claude-plugin/server`: upstream tracks that dependency tree, and rewriting it
would make the pinned checkout non-reproducibly dirty. Do not delete or
force-rewrite `~/.npm` when its ownership is broken.

## Codex MCP

The installer registers this local STDIO server shape:

```bash
codex mcp add webgpu-inspector \
  --env CLAUDE_PLUGIN_ROOT=<checkout>/claude-plugin \
  --env WEBGPU_BRIDGE_CAPTURES_DIR=<codex-root>/state/webgpu-inspector/captures \
  --env WEBGPU_BRIDGE_HOST=127.0.0.1 \
  --env WEBGPU_BRIDGE_PORT=9690 \
  -- /opt/local/bin/node <checkout>/claude-plugin/server/index.js
```

Restart Codex after adding or rebuilding the MCP. A page opened before
instrumentation must be reopened; do not install the Chrome extension into the
CDP profile.

Run `scripts/doctor.sh <metafor-checkout>` after setup. The Inspector repository
and revision must remain pinned; do not silently fall back to a moving branch.
