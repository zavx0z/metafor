import {afterAll, describe, expect, test} from "bun:test"
import {mkdtemp, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {playgroundTargetUrl} from "../scripts/target-url.ts"

type RunResult = Readonly<{exitCode: number; stdout: string; stderr: string}>
type Status = Readonly<{
  selector: string
  package: string
  supported: boolean
  status: string
  ownership?: string
  pid?: number | null
  cwd?: string
  command?: readonly string[]
  port?: number
  log?: string
  managedHealthy?: boolean
  testOverride?: boolean
  outcome?: string
  lastExit?: Readonly<{reason: string; pid: number | null}> | null
}>

const skillRoot = resolve(import.meta.dir, "..")
const checkout = resolve(skillRoot, "../../../../../..")
const dispatcher = join(skillRoot, "scripts/ui-dispatcher.sh")
const wrapper = join(skillRoot, "scripts/ui-dev.sh")
const browser = join(skillRoot, "scripts/ui-browser.ts")
const registryPath = join(skillRoot, "scripts/playgrounds.json")
const stateRoots: string[] = []

afterAll(async () => {
  await Promise.all(stateRoots.map((path) => rm(path, {recursive: true, force: true})))
})

describe("central ui-dev registry", () => {
  test("publishes one UI selector plus the Nodes dispatcher seam", async () => {
    const registry = await Bun.file(registryPath).json() as {
      version: number
      selectors: Record<string, {
        supported: boolean
        package: string
        cwd: string
        port: number
        command: string[]
        httpMarker: string
        canvas: {capability: string}
        pages?: Array<{mountPath: string; canvas: {capability: string}}>
        routes: {default: string}
      }>
    }
    expect(registry.version).toBe(2)
    expect(Object.keys(registry.selectors).sort()).toEqual(["nodes", "ui"])
    expect(registry.selectors.ui).toMatchObject({
      supported: true,
      package: "@ui/playground",
      cwd: "pkg/ui/playground",
      port: 4017,
      command: ["bun", "hub/server.ts"],
      httpMarker: "<title>UI playground</title>",
      canvas: {capability: "none"},
      routes: {default: "/"},
    })
    expect(registry.selectors.ui?.pages?.map(({mountPath}) => mountPath)).toEqual([
      "/elements",
      "/components",
      "/playground",
      "/hud",
      "/",
    ])
    expect(registry.selectors.nodes).toMatchObject({
      package: "@nodes/playground",
      cwd: "pkg/nodes/playground",
      port: 4018,
      command: ["bun", "server.ts"],
    })
  })

  test("preserves canonical overview slashes and exact leaves", () => {
    expect(playgroundTargetUrl("http://127.0.0.1:4017", "/"))
      .toBe("http://127.0.0.1:4017/")
    expect(playgroundTargetUrl("http://127.0.0.1:4017", "/elements/"))
      .toBe("http://127.0.0.1:4017/elements/")
    expect(playgroundTargetUrl("http://127.0.0.1:4017", "/components/button/basic/contained"))
      .toBe("http://127.0.0.1:4017/components/button/basic/contained")
    expect(() => playgroundTargetUrl("http://127.0.0.1:4017", "components/button"))
      .toThrow("absolute pathname")
    expect(() => playgroundTargetUrl("http://127.0.0.1:4017", "/components//button"))
      .toThrow("normalized pathname")
    expect(() => playgroundTargetUrl("http://127.0.0.1:4017", "/components/button?mode=hash"))
      .toThrow("normalized pathname")
  })

  test("keeps browser control background-only, route-aware and data-only", async () => {
    const source = await readFile(browser, "utf8")
    const interaction = await readFile(join(skillRoot, "scripts/interaction-plan.ts"), "utf8")
    for (const forbidden of [
      "Page.bringToFront",
      '"/focus"',
      '"/activate"',
      '"/windows"',
      "screenshot",
      "ai-macos",
      "osascript",
    ]) expect(source).not.toContain(forbidden)
    expect(source).toContain('cdp.send("Target.createTarget", {url, background: true})')
    expect(source).toContain("canvasForRoute(descriptor.pages, route, descriptor.canvas)")
    expect(source).toContain("await validateRegistryRoute(config.targetUrl)")
    expect(source).toContain('document.querySelector("[data-playground-home]")')
    expect(source).toContain('canvas.toDataURL("image/png")')
    expect(source).toContain("nativeMetricsRestored")
    expect(source).toContain('config.canvas.capability === "none"')
    expect(source).toContain("this playground has no canvas")
    expect(source).toContain("runInteractionRenderBarrier({")
    expect(source).toContain("process.exitCode = interactionExitCode(result)")
    for (const forbidden of [
      "Runtime.evaluate",
      "Page.navigate",
      "Target.createTarget",
      "Page.bringToFront",
      "new Function",
      "eval(",
    ]) expect(interaction).not.toContain(forbidden)
    expect(interaction).toContain('host.send("Input.dispatchMouseEvent"')
    expect(interaction).toContain('host.send("Input.dispatchKeyEvent"')
    expect(interaction).toContain('host.send("Input.insertText"')
  })
})

describe("central ui-dev lifecycle", () => {
  test("wrapper selects the UI catalog and dispatcher owns one exact process", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const owner = spawnLong("start", "ui", port, root)
    try {
      const status = await waitOwned("ui", port, root)
      expect(status).toMatchObject({
        selector: "ui",
        package: "@ui/playground",
        ownership: "skill",
        managedHealthy: true,
        port,
        testOverride: true,
        command: ["bun", "hub/server.ts"],
      })
      expect(status.cwd).toBe(join(checkout, "pkg/ui/playground"))
      expect(status.log).toEndWith("/ui.log")
      const wrapped = await runWrapper("status", port, root)
      expect(wrapped.exitCode).toBe(0)
      expect(parseStatus(wrapped)).toMatchObject({selector: "ui", pid: status.pid})
      const health = await run("health", "ui", port, root)
      expect(health.exitCode).toBe(0)
      expect(parseStatus(health).pid).toBe(status.pid)
      const logs = await run("logs", "ui", port, root)
      expect(logs.exitCode).toBe(0)
      expect(logs.stdout).toContain("[UI playground catalog]")
      const stopped = await run("stop", "ui", port, root)
      expect(stopped.exitCode).toBe(0)
      expect(parseStatus(stopped)).toMatchObject({status: "stopped", ownership: "none", pid: null})
      await owner.exited
    } finally {
      await run("stop", "ui", port, root)
      owner.kill()
    }
  }, 30000)

  test("restart replaces only the exact UI PID", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const firstOwner = spawnLong("start", "ui", port, root)
    let secondOwner: ReturnType<typeof Bun.spawn> | null = null
    try {
      const first = await waitOwned("ui", port, root)
      secondOwner = spawnLong("restart", "ui", port, root)
      const second = await waitOwned("ui", port, root, first.pid ?? undefined)
      expect(second.pid).not.toBe(first.pid)
      expect(second).toMatchObject({selector: "ui", package: "@ui/playground"})
      await firstOwner.exited
      const stopped = await run("stop", "ui", port, root)
      expect(stopped.exitCode).toBe(0)
      await secondOwner.exited
    } finally {
      await run("stop", "ui", port, root)
      firstOwner.kill()
      secondOwner?.kill()
    }
  }, 30000)

  test("preserves a foreign listener", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const foreign = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: () => new Response("<!doctype html><title>foreign</title>foreign"),
    })
    try {
      expect(parseStatus(await run("status", "ui", port, root))).toMatchObject({
        status: "foreign",
        ownership: "foreign",
        managedHealthy: false,
      })
      const refusedStart = await run("start", "ui", port, root)
      expect(refusedStart.exitCode).toBe(2)
      const refusedEnsure = await run("ensure", "ui", port, root)
      expect(refusedEnsure.exitCode).toBe(2)
      expect(parseStatus(refusedEnsure)).toMatchObject({outcome: "refused-foreign", ownership: "foreign"})
      const refusedStop = await run("stop", "ui", port, root)
      expect(refusedStop.exitCode).toBe(2)
      expect(await fetch(`http://127.0.0.1:${port}/`).then((response) => response.text())).toContain("foreign")
    } finally {
      foreign.stop(true)
    }
  }, 20000)
})

async function stateRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ui-dev-test-"))
  stateRoots.push(root)
  return root
}

async function freePort(): Promise<number> {
  const server = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => new Response("probe")})
  const port = server.port
  server.stop(true)
  if (port === undefined) throw new Error("Bun did not allocate a test port")
  return port
}

function environment(port: number | undefined, root: string): Record<string, string | undefined> {
  return {
    ...Bun.env,
    UI_DEV_STATE_ROOT: root,
    UI_DEV_TEST_MODE: port === undefined ? undefined : "1",
    UI_DEV_TEST_PORT: port === undefined ? undefined : String(port),
  }
}

function spawnLong(action: "ensure" | "start" | "restart", selector: string, port: number, root: string) {
  return Bun.spawn([dispatcher, action, checkout, selector], {
    cwd: checkout,
    env: environment(port, root),
    stdout: "pipe",
    stderr: "pipe",
  })
}

async function run(action: string, selector: string, port: number | undefined, root: string): Promise<RunResult> {
  return runCommand([dispatcher, action, checkout, selector], port, root)
}

async function runWrapper(action: string, port: number | undefined, root: string): Promise<RunResult> {
  return runCommand([wrapper, action, checkout], port, root)
}

async function runCommand(command: readonly string[], port: number | undefined, root: string): Promise<RunResult> {
  const process = Bun.spawn(command, {
    cwd: checkout,
    env: environment(port, root),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  return {exitCode, stdout, stderr}
}

function parseStatus(result: RunResult): Status {
  const value = result.stdout.trim()
  if (!value.startsWith("{")) throw new Error(`missing structured status: ${value}\n${result.stderr}`)
  return JSON.parse(value) as Status
}

async function waitOwned(selector: string, port: number, root: string, previousPid?: number): Promise<Status> {
  let last: RunResult | null = null
  for (let attempt = 0; attempt < 100; attempt++) {
    last = await run("status", selector, port, root)
    const status = parseStatus(last)
    if (status.ownership === "skill" && status.managedHealthy && status.pid !== previousPid) return status
    await Bun.sleep(100)
  }
  throw new Error(`selector did not become owned: ${JSON.stringify(last)}`)
}
