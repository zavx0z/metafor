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
  test("fixes both shared delegates to the parent nodes selector", async () => {
    const fakeCheckout = await createFakeCheckout()

    const lifecycle = await run([lifecycleWrapper, "health", fakeCheckout])
    expect(lifecycle.exitCode).toBe(0)
    expect(lifecycle.stdout.trim().split("\n")).toEqual([
      "health",
      fakeCheckout,
      "nodes",
    ])

    const browser = await run([
      process.execPath,
      browserWrapper,
      "dom",
      fakeCheckout,
      "--route",
      "/node-tree/runtime/live",
    ])
    expect(browser.exitCode).toBe(0)
    expect(JSON.parse(browser.stdout) as string[]).toEqual([
      "dom",
      fakeCheckout,
      "nodes",
      "--route",
      "/node-tree/runtime/live",
    ])
  })

  test("registers the exact parent package contour", async () => {
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
      port: 4015,
      portEnv: "NODES_PLAYGROUND_PORT",
      origin: "http://127.0.0.1:4015",
      httpMarker: "<title>nodes</title>",
      ready: {kind: "dataset", name: "nodesPlayground", value: "ready"},
      canvas: {selector: "#nodes-playground-canvas", capability: "webgpu", touch: true},
      routes: {default: "/node-tree/runtime/live"},
      stateKey: "nodes",
      logName: "nodes.log",
    })
  })

  test("contains no unfinished scaffold placeholders", async () => {
    const sources = await Promise.all([
      "SKILL.md",
      "agents/openai.yaml",
      "references/playground.md",
      "scripts/nodes-dev.sh",
      "scripts/nodes-browser.ts",
    ].map((path) => Bun.file(join(skillRoot, path)).text()))

    for (const source of sources) {
      expect(source).not.toContain("[TODO:")
      expect(source).not.toContain("<skill-name>")
      expect(source).not.toContain("Replace this placeholder")
    }
  })

  test("restarts the parent contour for every production dependency in its no-HMR graph", async () => {
    const workflow = await Bun.file(join(
      checkout,
      "pkg/ui/.agents/skills/ui-dev/references/playgrounds.md",
    )).text()

    expect(workflow).toContain("| root `pkg/nodes` runtime, projection contract or exports | `nodes` |")
    expect(workflow).toContain("| `pkg/nodes/layout` production, exports or manifest | `nodes` |")
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
