import {afterAll, describe, expect, test} from "bun:test"
import {chmod, mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

type RunResult = Readonly<{exitCode: number; stdout: string; stderr: string}>

const skillRoot = resolve(import.meta.dir, "..")
const checkout = resolve(skillRoot, "../../../../../..")
const lifecycleWrapper = join(skillRoot, "scripts/nodes-dev.sh")
const browserWrapper = join(skillRoot, "scripts/nodes-browser.ts")
const registryPath = join(checkout, "pkg/ui/.agents/skills/ui-dev/scripts/playgrounds.json")
const temporaryRoots: string[] = []

afterAll(async () => {
  await Promise.all(temporaryRoots.map((path) => rm(path, {recursive: true, force: true})))
})

describe("centralized nodes-dev package boundary", () => {
  test("owns one lifecycle selector and rejects the removed playground flag", async () => {
    const fakeCheckout = await createFakeCheckout()
    const lifecycle = await run([lifecycleWrapper, "health", fakeCheckout])
    expect(lifecycle.exitCode).toBe(0)
    expect(lifecycle.stdout.trim().split("\n")).toEqual(["health", fakeCheckout, "nodes"])

    for (const argv of [
      [lifecycleWrapper, "health", fakeCheckout, "--playground", "layout"],
      [lifecycleWrapper, "health"],
    ]) {
      const rejected = await run(argv)
      expect(rejected.exitCode).toBe(1)
      expect(rejected.stderr).toContain("error:")
    }
  })

  test("uses routes as package profiles of the same browser target", async () => {
    const fakeCheckout = await createFakeCheckout()
    for (const route of [
      "/",
      "/core/live-node-tree",
      "/layout/fixed-adaptive",
      "/layout-worker/protocol",
      "/editor/live-node-tree",
      "/ui/socket/boolean/input",
    ]) {
      const action = route.startsWith("/editor/") || route.startsWith("/ui/") ? "canvas" : "dom"
      const browser = await run([
        process.execPath,
        browserWrapper,
        action,
        fakeCheckout,
        "--route",
        route,
      ])
      expect(browser.exitCode, `${action} ${route}`).toBe(0)
      expect(JSON.parse(browser.stdout) as string[]).toEqual([
        action,
        fakeCheckout,
        "nodes",
        "--route",
        route,
      ])
    }

    for (const argv of [
      [process.execPath, browserWrapper, "canvas", fakeCheckout, "--route", "/layout/fixed-adaptive"],
      [process.execPath, browserWrapper, "interact", fakeCheckout, "--route", "/core/live-node-tree"],
      [process.execPath, browserWrapper, "dom", fakeCheckout, "--route", "/unknown"],
      [process.execPath, browserWrapper, "dom", fakeCheckout, "--playground", "ui"],
    ]) {
      const rejected = await run(argv)
      expect(rejected.exitCode).toBe(1)
      expect(rejected.stderr).toContain("error:")
    }
  })

  test("registers the one exact process used by the public skill", async () => {
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
      httpMarker: "<title>Nodes playground</title>",
      ready: {kind: "dataset", name: "nodesPlayground", value: "ready"},
      canvas: {selector: "#nodes-playground-canvas", capability: "webgpu", touch: true},
      routes: {default: "/"},
      stateKey: "nodes",
      logName: "nodes.log",
    })
    expect(registry.selectors["node-layout"]).toBeUndefined()
    expect(registry.selectors["node-ui"]).toBeUndefined()
  })

  test("contains named centralized references and no unfinished placeholders", async () => {
    const paths = [
      "SKILL.md",
      "agents/openai.yaml",
      "references/editor-webgpu.md",
      "references/layout-svg.md",
      "references/ui-webgpu.md",
      "scripts/nodes-dev.sh",
      "scripts/nodes-browser.ts",
    ]
    const sources = await Promise.all(paths.map((path) => Bun.file(join(skillRoot, path)).text()))
    for (const source of sources) {
      expect(source).not.toContain("[TODO:")
      expect(source).not.toContain("<skill-name>")
      expect(source).not.toContain("--playground root|layout|ui")
    }
    const plan = await Bun.file(join(skillRoot, "references/editor-cache-invalidation.plan.json")).json() as {
      version?: number
      steps?: Array<{kind?: string; code?: string; dom?: boolean}>
    }
    expect(plan.version).toBe(1)
    expect(plan.steps?.[0]?.code).toBe("F8")
    expect(plan.steps?.at(-1)?.dom).toBeTrue()
  })

  test("keeps wrappers free of focus, window and kill-by-port mechanics", async () => {
    const source = [await Bun.file(lifecycleWrapper).text(), await Bun.file(browserWrapper).text()].join("\n")
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
  await writeFile(join(scripts, "ui-browser.ts"), "console.log(JSON.stringify(Bun.argv.slice(2)))\n")
  return root
}

async function run(argv: readonly string[]): Promise<RunResult> {
  const child = Bun.spawn(argv, {cwd: checkout, stdout: "pipe", stderr: "pipe"})
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return {exitCode, stdout, stderr}
}
