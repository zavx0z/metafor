# Parent nodes playground

The only maintained selector of this skill is `nodes`:

| Property | Value |
| --- | --- |
| Package cwd | `pkg/nodes/playground` |
| Command | `bun server.ts` |
| Origin | `http://127.0.0.1:4015` |
| Default route | `/node-tree/runtime/live` |
| Ready marker | `document.documentElement.dataset.nodesPlayground === "ready"` |
| Canvas | `#nodes-playground-canvas` |

The wrappers delegate process ownership and background CDP operations to the
shared implementation in `pkg/ui/.agents/skills/ui-dev/scripts`. They always
pass selector `nodes`; callers cannot redirect lifecycle ownership to another
package.

After a source change, use this exact sequence:

1. Run focused tests and typechecks until the patch is stable.
2. Run `nodes-dev.sh restart <checkout>` in a retained PTY.
3. List the exact target with `nodes-browser.ts targets <checkout>`.
4. Reload that target with the exact route and `--target-id`.
5. Read DOM, then console, then capture the canvas.

`reload` is required even when the URL is unchanged. Browser reload without a
server restart does not prove fresh no-HMR source. A healthy reused process
proves ownership and HTTP readiness only.

The expected DOM evidence includes the exact route, runtime revision,
projection revision and projection diagnostics. The ready marker is published
only after the first live `NodeTree` projection has been passed to `NodeEditor`
and a frame has rendered.
