#!/usr/bin/env bun

import {join, resolve} from "node:path"

const [action, checkoutInput, ...args] = Bun.argv.slice(2)
if (action === undefined || checkoutInput === undefined) {
  console.error("error: usage: nodes-browser.ts <action> <checkout> [options]")
  process.exit(1)
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
  "nodes",
  ...args,
], {
  cwd: checkout,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

process.exit(await child.exited)
