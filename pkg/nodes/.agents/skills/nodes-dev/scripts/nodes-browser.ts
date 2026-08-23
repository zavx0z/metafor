#!/usr/bin/env bun

import {join, resolve} from "node:path"

const [action, checkoutInput, ...wrapperArgs] = Bun.argv.slice(2)
if (action === undefined || checkoutInput === undefined) {
  console.error("error: usage: nodes-browser.ts <action> <checkout> [--playground root|layout|ui] [options]")
  process.exit(1)
}

const selectors = Object.freeze({
  root: "nodes",
  layout: "node-layout",
  ui: "node-ui",
} as const)
type NodesPlayground = keyof typeof selectors

let playground: NodesPlayground = "root"
let args = wrapperArgs
if (wrapperArgs[0] === "--playground") {
  const value = wrapperArgs[1]
  if (value === undefined || !(value in selectors)) {
    console.error(`error: --playground must be one of root|layout|ui, got: ${value ?? "<missing>"}`)
    process.exit(1)
  }
  playground = value as NodesPlayground
  args = wrapperArgs.slice(2)
}
if (args.includes("--playground")) {
  console.error("error: --playground must appear once, immediately after checkout")
  process.exit(1)
}

if (playground === "layout") {
  const unsupported = new Set(["canvas", "viewports", "touch", "profile", "interact"])
  if (unsupported.has(action)) {
    console.error(`error: browser action ${action} is unsupported for layout: the playground is SVG-only`)
    process.exit(1)
  }
  const routeIndex = args.indexOf("--route")
  if (routeIndex >= 0 && args[routeIndex + 1] !== "/") {
    console.error("error: layout playground supports only route /")
    process.exit(1)
  }
}

const checkout = resolve(checkoutInput)
const browser = join(checkout, "pkg/ui/.agents/skills/ui-dev/scripts/ui-browser.ts")
if (!await Bun.file(browser).exists()) {
  console.error(`error: shared UI browser helper is missing: ${browser}`)
  process.exit(1)
}

const child = Bun.spawn([
  process.execPath,
  browser,
  action,
  checkout,
  selectors[playground],
  ...args,
], {
  cwd: checkout,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

process.exit(await child.exited)
