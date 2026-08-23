# Optional Inspector setup

Read this reference only for first WebGPU Inspector installation, repair, or
environment migration. Cosmos development, browser functional checks, and
the visible iTerm lifecycle do not require Inspector.

## Required profiling components

- Node.js 18 or newer for the WebGPU Inspector MCP.
- `jq`, Git, curl, and the MetaFor Dev CDP Chrome on port 9222.
- WebGPU Inspector under
  `${CODEX_HOME:-$HOME/.codex}/tools/webgpu-inspector`.

On this Intel Mac install system packages through MacPorts, never Homebrew.
Project-local JavaScript or Python dependencies may remain isolated.

## Installation

Use the pinned installer:

```bash
scripts/setup-inspector.sh
```

The installer defaults to the owner fork at the tested immutable revision. Pass
another repository URL and full commit only for an owner-approved experiment.
It refuses dirty or mismatched checkouts, builds the extension, runs its tests,
and registers the MCP. Restart Codex after registration.

Run `scripts/doctor.sh <checkout>` after setup. Do not install the Inspector
Chrome extension into the persistent CDP profile; the MCP instruments only the
temporary diagnostic page.
