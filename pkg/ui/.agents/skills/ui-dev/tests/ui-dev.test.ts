import {afterAll, describe, expect, test} from "bun:test"
import {mkdtemp, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

type RunResult = Readonly<{exitCode: number; stdout: string; stderr: string}>
type Status = Readonly<{
  selector: string
  package: string
  supported: boolean
  status: string
  ownership?: string
  pid?: number | null
  processStart?: string | null
  cwd?: string
  command?: readonly string[]
  port?: number
  origin?: string
  log?: string
  managedHealthy?: boolean
  testOverride?: boolean
  reason?: string
}>

const skillRoot = resolve(import.meta.dir, "..")
const checkout = resolve(skillRoot, "../../../../..")
const dispatcher = join(skillRoot, "scripts/ui-dev.sh")
const browser = join(skillRoot, "scripts/ui-browser.ts")
const registryPath = join(skillRoot, "scripts/playgrounds.json")
const stateRoots: string[] = []

afterAll(async () => {
  await Promise.all(stateRoots.map((path) => rm(path, {recursive: true, force: true})))
})

describe("ui-dev registry", () => {
  test("publishes only maintained runnable selectors and typed Elements unsupported state", async () => {
    const registry = await Bun.file(registryPath).json() as {
      selectors: Record<string, {
        supported: boolean
        package: string
        reason?: string
        port?: number
        command?: string[]
        canvas?: {capability: string}
      }>
    }
    expect(Object.keys(registry.selectors).sort()).toEqual(["components", "elements", "node-ui", "ui-fixture"])
    expect(registry.selectors["node-ui"]).toMatchObject({supported: true, port: 4016, command: ["bun", "playground/server.ts"], canvas: {capability: "webgpu"}})
    expect(registry.selectors.components).toMatchObject({supported: true, port: 4017, command: ["bun", "playground/server.ts"], canvas: {capability: "webgpu"}})
    expect(registry.selectors["ui-fixture"]).toMatchObject({supported: true, port: 4192, command: ["bun", "fixture/server.ts"], canvas: {capability: "webgpu-diagnostic"}})
    expect(registry.selectors.elements).toEqual({
      supported: false,
      package: "@ui/elements",
      reason: "@ui/elements has no maintained runnable playground command or port",
    })
    expect(registry.selectors["node-layout"]).toBeUndefined()

    const result = await run("status", "elements", undefined, await stateRoot())
    expect(result.exitCode).toBe(3)
    expect(parseStatus(result).status).toBe("unsupported")
  })

  test("keeps automated browser source background-only", async () => {
    const source = await readFile(browser, "utf8")
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
    expect(source).toContain('canvas.toDataURL("image/png")')
    expect(source).toContain('("Performance.getMetrics")')
    expect(source).toContain('("Runtime.getHeapUsage")')
  })
})

describe("ui-dev lifecycle dispatcher", () => {
  test("runs exact Node UI lifecycle and preserves structured log ownership", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const start = spawnLong("start", "node-ui", port, root)
    try {
      const status = await waitOwned("node-ui", port, root)
      expect(status).toMatchObject({
        selector: "node-ui",
        package: "@nodes/ui",
        ownership: "skill",
        managedHealthy: true,
        port,
        testOverride: true,
        command: ["bun", "playground/server.ts"],
      })
      expect(status.cwd).toBe(join(checkout, "pkg/nodes/ui"))
      expect(status.processStart).toBeString()
      expect(status.log).toEndWith("/node-ui.log")
      const health = await run("health", "node-ui", port, root)
      expect(health.exitCode).toBe(0)
      expect(parseStatus(health).pid).toBe(status.pid)
      const logs = await run("logs", "node-ui", port, root)
      expect(logs.exitCode).toBe(0)
      expect(logs.stdout).toContain("Node component playground:")
      const stopped = await run("stop", "node-ui", port, root)
      expect(stopped.exitCode).toBe(0)
      expect(parseStatus(stopped)).toMatchObject({status: "stopped", ownership: "none", pid: null})
      await start.exited
    } finally {
      await run("stop", "node-ui", port, root)
      start.kill()
    }
  }, 30000)

  test("restarts Components with a new exact PID and keeps logs readable", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const start = spawnLong("start", "components", port, root)
    let restart: ReturnType<typeof Bun.spawn> | null = null
    try {
      const first = await waitOwned("components", port, root)
      restart = spawnLong("restart", "components", port, root)
      const second = await waitOwned("components", port, root, first.pid ?? undefined)
      expect(second).toMatchObject({
        selector: "components",
        package: "@ui/components",
        ownership: "skill",
        managedHealthy: true,
        command: ["bun", "playground/server.ts"],
      })
      expect(second.pid).not.toBe(first.pid)
      await start.exited
      const logs = await run("logs", "components", port, root)
      expect(logs.exitCode).toBe(0)
      expect(logs.stdout).toContain("[@ui/components playground]")
      const stopped = await run("stop", "components", port, root)
      expect(stopped.exitCode).toBe(0)
      await restart.exited
    } finally {
      await run("stop", "components", port, root)
      start.kill()
      restart?.kill()
    }
  }, 30000)

  test("refuses start and stop against a foreign listener", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const foreign = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: () => new Response("<!doctype html><title>Node Component Library</title>foreign"),
    })
    try {
      const status = await run("status", "node-ui", port, root)
      expect(status.exitCode).toBe(0)
      expect(parseStatus(status)).toMatchObject({status: "foreign", ownership: "foreign", managedHealthy: false})
      const refusedStart = await run("start", "node-ui", port, root)
      expect(refusedStart.exitCode).toBe(2)
      const refusedStop = await run("stop", "node-ui", port, root)
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

function spawnLong(action: "start" | "restart", selector: string, port: number, root: string) {
  return Bun.spawn([dispatcher, action, checkout, selector], {
    cwd: checkout,
    env: environment(port, root),
    stdout: "pipe",
    stderr: "pipe",
  })
}

async function run(action: string, selector: string, port: number | undefined, root: string): Promise<RunResult> {
  const process = Bun.spawn([dispatcher, action, checkout, selector], {
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
  const text = result.stdout.trim()
  if (!text.startsWith("{")) throw new Error(`missing structured status: ${text}\n${result.stderr}`)
  return JSON.parse(text) as Status
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
