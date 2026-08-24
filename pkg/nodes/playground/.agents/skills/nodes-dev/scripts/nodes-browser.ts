#!/usr/bin/env bun

import {join, resolve} from "node:path"
import {
  NODES_CATALOG_ROUTE,
  nodesPackageForPath,
} from "../../../../catalog/package-catalog.ts"
import {NODE_PLAYGROUND_ROUTES} from "../../../../packages/ui/ui-navigation.ts"

const [action, checkoutInput, ...args] = Bun.argv.slice(2)
if (action === undefined || checkoutInput === undefined) {
  console.error("error: usage: nodes-browser.ts <action> <checkout> [options]")
  process.exit(1)
}
if (args.includes("--playground")) {
  console.error("error: --playground was removed; choose a package with --route /core/...|/editor/...|/layout/...|/layout-worker/...|/ui/...")
  process.exit(1)
}

const routeIndex = args.indexOf("--route")
const route = routeIndex < 0 ? undefined : args[routeIndex + 1]
if (routeIndex >= 0 && (route === undefined || !route.startsWith("/"))) {
  console.error("error: --route requires one absolute Nodes playground pathname")
  process.exit(1)
}
const effectiveRoute = route ?? (action === "open" ? NODES_CATALOG_ROUTE : undefined)
const page = effectiveRoute === undefined || effectiveRoute === NODES_CATALOG_ROUTE
  ? null
  : nodesPackageForPath(effectiveRoute)
if (effectiveRoute !== undefined && effectiveRoute !== NODES_CATALOG_ROUTE && page === null) {
  console.error(`error: route is outside the centralized Nodes package catalog: ${effectiveRoute}`)
  process.exit(1)
}
if (effectiveRoute !== undefined && page !== null && !isExactPackageRoute(page.id, effectiveRoute, page.defaultRoute)) {
  console.error(`error: route is not registered by ${page.packageName}: ${effectiveRoute}`)
  process.exit(1)
}

const unsupportedWithoutCanvas = new Set(["canvas", "viewports", "touch", "profile", "interact"])
if (effectiveRoute !== undefined && page?.presentation !== "webgpu" && unsupportedWithoutCanvas.has(action)) {
  console.error(`error: browser action ${action} requires a WebGPU page; route ${effectiveRoute} uses ${page?.presentation ?? "dom"}`)
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

function isExactPackageRoute(id: string, route: string, defaultRoute: string): boolean {
  if (id !== "ui") return route === defaultRoute
  const prefix = "/ui/"
  return route.startsWith(prefix) && NODE_PLAYGROUND_ROUTES.includes(
    route.slice(prefix.length) as (typeof NODE_PLAYGROUND_ROUTES)[number],
  )
}
