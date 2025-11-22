# @metafor/inspect

[← Back to root](../../README.md) | **English** | [Русский](README.ru.md)

## Purpose

- Tooling for observing the MetaFor field: impulse stack, time control, logging.
- Works on the same `BroadcastChannel`/`EM` events as atoms, so the view is consistent with runtime behaviour.
- README captures the feature set; full API lives in Typedoc (`infra/inspect/docs/typedoc/index.html`).

## Modules

| Module                         | Description                                         |
| ------------------------------ | --------------------------------------------------- |
| `web/debugger` (`meta-inspect`)| Web component with time controls and stack viewer   |
| `web/logger`                   | Lightweight console/panel logger for impulses       |
| `server/logger`                | Bun/Node logger that streams impulses server-side   |

## Quick start (web)

```html
<script type="module" src="@metafor/inspect/web/debugger"></script>
<meta-inspect brk></meta-inspect>
```

- `brk` pauses the system right after mount (`EM.break()`).
- Removing the attribute or pressing ▶ resumes (`EM.resume()`).

### Programmatic API

```ts
import { startInspect } from "@metafor/inspect"

startInspect({
  target: document.body,
  breakpoint: true,
  slowmo: 250, // delay between EM.step() calls in ms
})
```

## Capabilities

- Pause/resume (`EM.break` / `EM.resume`).
- Step-through execution via `EM.step()`, including slow-mo slider.
- Live impulse stack with meta/atom/path/op/value/timestamp.
- Synced controls between the debugger UI and stack UI.
- Automatic draining of queued impulses when resuming.

### Photon properties in the UI

- **Intensity** — number of patches inside each impulse.
- **Colour** — `meta`/`atom`, showing which emitter produced the photon.
- **Polarisation** — JSON Patch `path`/`op`, indicating mutation direction.
- **Phase** — `timestamp` and EM stack position.

The debugger literally surfaces the same encoded information that a photon carries in the physical analogy.

### Roadmap

- Breakpoints by `meta`, `atom`, `path`, `op`.
- Visual integration with `@metafor/virtual`.
- Remote control of `Field` checkpoints from the debugger.

## Server logger

```ts
import { createServerLogger } from "@metafor/inspect/server"

const logger = createServerLogger({ port: 8777 })
logger.start()
```

- Serialises impulses to stdout or a custom transport.
- Runs under Bun/Node and listens to EM events via BroadcastChannel/WebSocket.

## Commands

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `bun run build`      | Build both web and server bundles               |
| `bun run web:build`  | Build only the web tooling                      |
| `bun run server:build` | Build only the server logger                 |
| `bun run typegen`    | Generate d.ts for web/server artefacts          |
| `bun run docs`       | Typedoc (`infra/inspect/docs/typedoc/index.html`) |
| `bun run clear`      | Remove `dist` and `node_modules`                |

## Docs & tests

- **Typedoc** documents `startInspect`, `createServerLogger`, component attributes, and events.
- **Examples** live in `infra/inspect/web/*.ts` and `infra/inspect/server/logger.ts`.
- **Tests** are currently manual; reuse Happy DOM setups from the main repo (`bun test --filter inspect`) when automating scenarios.

For the underlying physics of impulses and time control, see `../.cursor/rules/metafor.mdc`.

