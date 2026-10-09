# Optional external Inspector connection

Read this reference only to connect an already provisioned WebGPU Inspector.
Cosmos development, browser functional checks and the visible iTerm lifecycle
use direct CDP and do not require this profiler.

## External tool boundary

The Inspector is a separate tool outside the MetaFor repository. Its owner
supplies its built server, extension and dependencies. MetaFor does not clone,
build, install dependencies for, or update that external checkout.

The connection needs Node.js 18 or newer and Codex. The default external
checkout is `${CODEX_HOME:-$HOME/.codex}/tools/webgpu-inspector`.
System packages on this Intel Mac are managed through MacPorts.

## Registration

Register the existing built tool:

```bash
scripts/setup-inspector.sh [existing-inspector-checkout]
```

The helper verifies that the server and extension exist and registers the MCP.
It does not install software or change the external source. Restart Codex after
registration and run `scripts/doctor.sh <checkout>` to check the environment.

Do not install the Inspector Chrome extension into the persistent CDP profile;
GPU instrumentation belongs only to its temporary diagnostic page.
