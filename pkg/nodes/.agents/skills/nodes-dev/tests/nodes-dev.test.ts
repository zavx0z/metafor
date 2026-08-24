import {afterAll, describe, expect, test} from "bun:test"
import {chmod, mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

type RunResult = Readonly<{
  exitCode: number
  stdout: string
  stderr: string
}>

const skillRoot = resolve(import.meta.dir, "..")
const checkout = resolve(skillRoot, "../../../../..")
const lifecycleWrapper = join(skillRoot, "scripts/nodes-dev.sh")
const browserWrapper = join(skillRoot, "scripts/nodes-browser.ts")
const registryPath = join(checkout, "pkg/ui/.agents/skills/ui-dev/scripts/playgrounds.json")
const temporaryRoots: string[] = []

afterAll(async () => {
  await Promise.all(temporaryRoots.map((path) => rm(path, {recursive: true, force: true})))
})

describe("nodes-dev package boundary", () => {
  test("routes all three playgrounds while preserving the root default", async () => {
    const fakeCheckout = await createFakeCheckout()

    const rootLifecycle = await run([lifecycleWrapper, "health", fakeCheckout])
    expect(rootLifecycle.exitCode).toBe(0)
    expect(rootLifecycle.stdout.trim().split("\n")).toEqual([
      "health",
      fakeCheckout,
      "nodes",
    ])
    for (const [playground, selector] of [["root", "nodes"], ["layout", "node-layout"], ["ui", "node-ui"]] as const) {
      const lifecycle = await run([lifecycleWrapper, "health", fakeCheckout, "--playground", playground])
      expect(lifecycle.exitCode).toBe(0)
      expect(lifecycle.stdout.trim().split("\n")).toEqual(["health", fakeCheckout, selector])
    }

    const rootBrowser = await run([
      process.execPath,
      browserWrapper,
      "dom",
      fakeCheckout,
      "--route",
      "/node-tree/runtime/live",
    ])
    expect(rootBrowser.exitCode).toBe(0)
    expect(JSON.parse(rootBrowser.stdout) as string[]).toEqual([
      "dom",
      fakeCheckout,
      "nodes",
      "--route",
      "/node-tree/runtime/live",
    ])

    for (const [playground, selector] of [["root", "nodes"], ["layout", "node-layout"], ["ui", "node-ui"]] as const) {
      const browser = await run([
        process.execPath,
        browserWrapper,
        "dom",
        fakeCheckout,
        "--playground",
        playground,
      ])
      expect(browser.exitCode).toBe(0)
      expect(JSON.parse(browser.stdout) as string[]).toEqual(["dom", fakeCheckout, selector])
    }

    for (const argv of [
      [lifecycleWrapper, "health", fakeCheckout, "--playground"],
      [lifecycleWrapper, "health", fakeCheckout, "--playground", "unknown"],
      [process.execPath, browserWrapper, "dom", fakeCheckout, "--route", "/", "--playground", "layout"],
      [process.execPath, browserWrapper, "canvas", fakeCheckout, "--playground", "layout", "--output", "/tmp/layout.png"],
      [process.execPath, browserWrapper, "dom", fakeCheckout, "--playground", "layout", "--route", "/other"],
    ]) {
      const rejected = await run(argv)
      expect(rejected.exitCode).toBe(1)
      expect(rejected.stderr).toContain("error:")
    }
  })

  test("registers the exact root, layout and UI package contours", async () => {
    const registry = await Bun.file(registryPath).json() as {
      version: number
      selectors: Record<string, unknown>
    }

    expect(registry.version).toBe(1)
    expect(registry.selectors.nodes).toEqual({
      supported: true,
      package: "@nodes/playground",
      cwd: "pkg/nodes/playground",
      command: ["bun", "server.ts"],
      host: "127.0.0.1",
      hostEnv: "NODES_PLAYGROUND_HOST",
      port: 4018,
      portEnv: "NODES_PLAYGROUND_PORT",
      origin: "http://127.0.0.1:4018",
      httpMarker: "<title>nodes</title>",
      ready: {kind: "dataset", name: "nodesPlayground", value: "ready"},
      canvas: {selector: "#nodes-playground-canvas", capability: "webgpu", touch: true},
      routes: {default: "/node-tree/runtime/live"},
      stateKey: "nodes",
      logName: "nodes.log",
    })
    expect(registry.selectors["node-layout"]).toEqual({
      supported: true,
      package: "@nodes/layout",
      cwd: "pkg/nodes/layout",
      command: ["bun", "playground/server.ts"],
      host: "127.0.0.1",
      hostEnv: "NODES_LAYOUT_PLAYGROUND_HOST",
      port: 4015,
      portEnv: "NODES_LAYOUT_PLAYGROUND_PORT",
      origin: "http://127.0.0.1:4015",
      httpMarker: "<title>@nodes/layout</title>",
      ready: {kind: "dataset", name: "nodesLayoutPlayground", value: "ready"},
      canvas: {selector: "#svg-view svg", capability: "none", touch: false},
      routes: {default: "/"},
      stateKey: "node-layout",
      logName: "node-layout.log",
    })
    expect(registry.selectors["node-ui"]).toMatchObject({
      package: "@nodes/ui",
      port: 4016,
      origin: "http://127.0.0.1:4016",
      canvas: {capability: "webgpu", touch: true},
    })
    expect(new Set([4015, 4016, 4018]).size).toBe(3)
  })

  test("contains no unfinished scaffold placeholders", async () => {
    const sources = await Promise.all([
      "SKILL.md",
      "agents/openai.yaml",
      "references/root-runtime.md",
      "references/layout-svg.md",
      "references/node-ui.md",
      "scripts/nodes-dev.sh",
      "scripts/nodes-browser.ts",
    ].map((path) => Bun.file(join(skillRoot, path)).text()))

    for (const source of sources) {
      expect(source).not.toContain("[TODO:")
      expect(source).not.toContain("<skill-name>")
      expect(source).not.toContain("Replace this placeholder")
    }

    const plan = await Bun.file(join(
      skillRoot,
      "references/root-cache-invalidation.plan.json",
    )).json() as {version?: number; steps?: Array<{kind?: string; code?: string; dom?: boolean}>}
    expect(plan.version).toBe(1)
    expect(plan.steps?.map(({kind}) => kind)).toEqual([
      "key-down",
      "key-up",
      "checkpoint",
    ])
    expect(plan.steps?.[0]?.code).toBe("F8")
    expect(plan.steps?.at(-1)?.dom).toBeTrue()
  })

  test("restarts the parent contour for every production dependency in its no-HMR graph", async () => {
    const workflow = await Bun.file(join(
      checkout,
      "pkg/ui/.agents/skills/ui-dev/references/playgrounds.md",
    )).text()

    expect(workflow).toContain("| root `pkg/nodes` runtime, projection contract or exports | `nodes` |")
    expect(workflow).toContain("| `pkg/nodes/layout` production, exports or manifest | `node-layout` and `nodes` |")
    expect(workflow).toContain("| `pkg/nodes/ui` production | `node-ui` and `nodes` |")
  })

  test("keeps wrappers free of focus, window and kill-by-port mechanics", async () => {
    const source = [
      await Bun.file(lifecycleWrapper).text(),
      await Bun.file(browserWrapper).text(),
    ].join("\n")

    for (const forbidden of [
      /Page\.bringToFront/,
      /Browser\.setWindowBounds/,
      /["']\/focus["']/,
      /["']\/activate["']/,
      /["']\/windows["']/,
      /\bosascript\b/,
      /\bscreencapture\b/,
      /\blsof\b/,
      /\bfuser\b/,
      /\bpkill\b/,
      /\bkill\b/,
      /-iTCP/,
      /\bLISTEN\b/,
    ]) expect(source).not.toMatch(forbidden)
  })
})

async function createFakeCheckout(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nodes-dev-test-"))
  temporaryRoots.push(root)
  const scripts = join(root, "pkg/ui/.agents/skills/ui-dev/scripts")
  await mkdir(scripts, {recursive: true})

  const lifecycle = join(scripts, "ui-dev.sh")
  await writeFile(lifecycle, "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\"\n")
  await chmod(lifecycle, 0o755)

  await writeFile(
    join(scripts, "ui-browser.ts"),
    "console.log(JSON.stringify(Bun.argv.slice(2)))\n",
  )
  return root
}

async function run(argv: readonly string[]): Promise<RunResult> {
  const child = Bun.spawn(argv, {
    cwd: checkout,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return {exitCode, stdout, stderr}
}
