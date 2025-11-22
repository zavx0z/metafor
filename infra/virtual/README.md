# @metafor/virtual

[← Back to root](../../README.md) | **English** | [Русский](README.ru.md)

## Purpose

- Visualises the MetaFor field with virtual particles: actor tree, impulse flow, link density.
- Works side by side with `@metafor/inspect`, subscribing to the same `Photon` events emitted by EM.
- README summarises the concept; API details live in Typedoc (`infra/virtual/docs/typedoc/index.html`).

## Modules

| Module        | Description                                          |
| ------------- | ---------------------------------------------------- |
| `virtual.ts`  | Main API (`startVirtual`, scene controls)            |
| `worker.ts/js`| Worker that renders particles based on impulses      |
| `example.*`   | Minimal setup without bundlers                       |

## Quick start

```ts
import { startVirtual } from "@metafor/virtual"

const stop = await startVirtual({
  target: document.body,
  src: new URL("./dist/worker.js", import.meta.url),
  mode: "tree",
  showPaths: true,
})

// later
stop()
```

- `target` — DOM node for the canvas (defaults to `document.body`).
- `src` — URL to the worker bundle (required).
- `mode` — visualisation mode (`"tree"`, `"line"`, `"quantum"`).
- Extra options: `showPaths`, `follow`, `debug`, etc. (see Typedoc).

## What you see

- **Actor tree** — positional paths from `Field` become nodes; links are derived automatically.
- **Impulses** — each `Photon` changes particle colour/speed depending on `op` (`replace`, `add`, `remove`).
- **Load** — edge thickness encodes how many impulses went through the branch.

### Mapping to physics

- Brightness/size = intensity (`impulses.length`).
- Colour = `meta`/`atom`, i.e. the emitter’s wavelength.
- Orientation = JSON Patch `path`/`op`, mirroring polarisation.
- Trails = `timestamp`, visualising the phase.

The canvas simply exposes the same photon properties that drive MetaFor’s field mechanics.

## Worker protocol

- Messages from main thread: `{ type: "init" | "update" | "destroy", payload }`.
- Worker replies with `{ type: "ready" | "log" }`.
- `visibilitychange` / `resize` events pause/resume rendering to save resources.

## Commands

| Command             | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `bun run build`     | Build `virtual.ts` and `worker.js` (with map)|
| `bun run build:watch` | Dev build with watch                      |
| `bun run typegen`   | Generate `dist/virtual.d.ts`                 |
| `bun run docs`      | Typedoc (`infra/virtual/docs/typedoc/index.html`) |
| `bun run clear`     | Remove `dist` and `node_modules`             |

## Docs & tests

- **Typedoc** documents `startVirtual`, worker messages, and visual modes.
- **Examples** live in `infra/virtual/example.*`.
- **Tests** are currently manual; use Happy DOM + screenshots or video capture for regression.

The same field invariants described in `../.cursor/rules/metafor.mdc` apply here — virtual particles merely render the dynamics already present in EM/Field.

