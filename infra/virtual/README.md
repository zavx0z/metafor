# @metafor/virtual

Visualization with virtual particles during the initialization of graphical system dependencies.

## Description

`@metafor/virtual` provides a tool for visualizing MetaFor atom structure as animated particles on canvas. Visualization runs in a Web Worker to ensure smooth animation without blocking the main thread.

## Installation

```bash
bun add @metafor/virtual
```

## Usage

### Basic Example

```javascript
import { load } from "@metafor/virtual"
import { Atom } from "@metafor/atom"

// Load visualization
const destroy = await load({
  src: "./dist/worker.js",
  mode: "tree",
  debug: true,
})

// Initialize atoms
Atom.fromSchema({ meta })

// Cleanup resources (optional)
// destroy()
```

### Parameters

The `load` function accepts an object with parameters:

- `src` (required) — path to the worker file for visualization
- `dst` (optional) — DOM element where the canvas will be added (default: `document.body`)
- `mode` (optional) — visualization mode: `"tree"`, `"line"`, or `"quantum"` (default: `"tree"`)
- `debug` (optional) — enable debug logs in console (default: `false`)

### Return Value

The `load` function returns `Promise<Function>`, which resolves to a `destroy` function for resource cleanup:

- Unsubscribes from `visibilitychange` and `resize` events
- Sends `destroy` message to worker
- Terminates the worker

## Integration with Atom

Visualization automatically tracks active atoms via `Atom.getAllAddresses()` and updates particle display when atom structure changes. Atom paths are sent to the worker with debouncing (100 ms) for performance optimization.

## Visualization Modes

- **tree** — tree structure with orbital particle arrangement
- **line** — linear particle arrangement
- **quantum** — quantum visualization mode

## Events

Visualization automatically handles:

- **visibilitychange** — pauses animation when the tab is hidden
- **resize** — updates canvas size when window size changes
