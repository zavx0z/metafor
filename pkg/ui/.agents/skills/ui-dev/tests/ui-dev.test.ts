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
  processStart?: string | null
  cwd?: string
  command?: readonly string[]
  port?: number
  origin?: string
  log?: string
  managedHealthy?: boolean
  testOverride?: boolean
  reason?: string
  outcome?: string
  lastExit?: Readonly<{
    reason: string
    pid: number | null
    signal: string | null
    exitCode: number | null
    at: string
  }> | null
  recoveryHint?: string | null
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
  test("publishes every maintained runnable selector including Elements", async () => {
    const registry = await Bun.file(registryPath).json() as {
      selectors: Record<string, {
        supported: boolean
        package: string
        reason?: string
        port?: number
        command?: string[]
        canvas?: {capability: string}
        routes?: {default: string}
      }>
    }
    expect(Object.keys(registry.selectors).sort()).toEqual(["components", "elements", "node-ui", "ui-fixture"])
    expect(registry.selectors["node-ui"]).toMatchObject({
      supported: true,
      port: 4016,
      command: ["bun", "playground/server.ts"],
      canvas: {capability: "webgpu"},
      routes: {default: "/editor/scene"},
      httpMarker: "<title>@nodes/ui</title>",
    })
    expect(registry.selectors.components).toMatchObject({
      supported: true,
      port: 4017,
      command: ["bun", "playground/server.ts"],
      canvas: {capability: "webgpu"},
      routes: {default: "/button/basic"},
      httpMarker: "<title>@ui/components</title>",
    })
    expect(registry.selectors["ui-fixture"]).toMatchObject({supported: true, port: 4192, command: ["bun", "fixture/server.ts"], canvas: {capability: "webgpu-diagnostic"}, httpMarker: "<title>@ui/playground</title>"})
    expect(registry.selectors.elements).toMatchObject({
      supported: true,
      package: "@ui/elements",
      port: 7901,
      command: ["bun", "playground/server.ts"],
      canvas: {capability: "webgpu"},
      routes: {default: "/div"},
      httpMarker: "<title>@ui/elements</title>",
    })
    expect(registry.selectors["node-layout"]).toBeUndefined()

    const port = await freePort()
    const result = await run("status", "elements", port, await stateRoot())
    expect(result.exitCode).toBe(0)
    expect(parseStatus(result)).toMatchObject({
      selector: "elements",
      supported: true,
      status: "stopped",
      port,
      testOverride: true,
    })
  })

  test("builds pathname targets for every maintained playground", async () => {
    const registry = await Bun.file(registryPath).json() as {
      selectors: Record<string, {routes?: {default: string}}>
    }
    const nodeRoutes = registry.selectors["node-ui"]!.routes!
    const componentRoutes = registry.selectors.components!.routes!
    const elementRoutes = registry.selectors.elements!.routes!

    expect(playgroundTargetUrl("http://127.0.0.1:4016", nodeRoutes.default))
      .toBe("http://127.0.0.1:4016/editor/scene")
    expect(playgroundTargetUrl("http://127.0.0.1:4016", "/socket/types"))
      .toBe("http://127.0.0.1:4016/socket/types")
    expect(playgroundTargetUrl("http://127.0.0.1:4017", componentRoutes.default))
      .toBe("http://127.0.0.1:4017/button/basic")
    expect(playgroundTargetUrl("http://127.0.0.1:7901", "/layout/flex-css"))
      .toBe("http://127.0.0.1:7901/layout/flex-css")
    expect(() => playgroundTargetUrl("http://127.0.0.1:4016", "#/editor/scene")).toThrow()
    expect(() => playgroundTargetUrl("http://127.0.0.1:4016", "/editor/scene?mode=hash")).toThrow()
    expect(JSON.stringify(registry)).not.toContain('"mode"')
    expect(JSON.stringify(registry)).not.toContain("hash")
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
    expect(source).toContain("candidateTargets(config, port)")
    expect(source).toContain('>("Page.navigate", {url})')
    expect(source).toContain("ambiguous ${config.selector} targets")
    expect(source).toContain('cdp.send<{success?: boolean}>("Target.closeTarget", {targetId})')
    expect(source).toContain('canvas.toDataURL("image/png")')
    expect(source).toContain('const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())')
    expect(source).toContain("context.drawImage(bitmap, 0, 0, probe.width, probe.height)")
    expect(source).not.toContain("context.drawImage(canvas, 0, 0, probe.width, probe.height)")
    expect(source).toContain('context.getImageData(0, 0, probe.width, probe.height)')
    expect(source).toContain('retryAfterBlack: () => awaitCanvasRendererActivity(cdp, config)')
    expect(source).toContain("async function awaitCanvasRendererActivity")
    expect(source).toContain('window.dispatchEvent(new Event("resize"))')
    expect(source).toContain("if (frames < 2) requestAnimationFrame(step)")
    expect(source).toContain("else setTimeout(() => finish(false), 250)")
    expect(source).toContain("const timeout = setTimeout(() => finish(true), 2000)")
    expect(source).toMatch(/async function awaitCanvasRendererActivity[\s\S]*await setFocusEmulation\(cdp, true\)[\s\S]*finally \{[\s\S]*await setFocusEmulation\(cdp, false\)/)
    expect(source).toContain('("Performance.getMetrics")')
    expect(source).toContain('("Runtime.getHeapUsage")')
  })

  test("keeps interaction plans data-only, exact-target and evidence fail-closed", async () => {
    const source = await readFile(browser, "utf8")
    const interaction = await readFile(join(skillRoot, "scripts/interaction-plan.ts"), "utf8")
    expect(source).toContain('"profile", "interact"')
    expect(source).toContain('selectTarget(config, action === "open", options.targetId, cdpPort)')
    expect(source.indexOf("interactionPlan = await loadInteractionPlan"))
      .toBeLessThan(source.indexOf("const selected = await selectTarget"))
    expect(source).toContain("validateInteractionInvocation({")
    expect(source).toMatch(/async function runInteraction[\s\S]*createConsoleCollector\(cdp\)[\s\S]*executeInteractionPlan\(plan[\s\S]*captureCanvas\(cdp, config, step.canvas, false\)/)
    expect(source).toContain("const errors = consoleErrors(collector.entries)")
    expect(source).toContain("const backgroundInput = await runBackgroundInputMode({")
    expect(source).toContain("focusEmulation: backgroundInput.focusEmulation")
    expect(source).toContain("const outcome = interactionOutcome(failure)")
    expect(source).toContain("process.exitCode = interactionExitCode(result)")
    expect(source).not.toContain("class CanvasEvidenceRejected")
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

describe("ui-dev lifecycle dispatcher", () => {
  test("recovers an exact selector after its owning ensure session exits", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const firstOwner = spawnLong("ensure", "components", port, root)
    let secondOwner: ReturnType<typeof Bun.spawn> | null = null
    try {
      const first = await waitOwned("components", port, root)
      const reused = await run("ensure", "components", port, root)
      expect(reused.exitCode).toBe(0)
      expect(parseStatus(reused)).toMatchObject({
        outcome: "reused",
        ownership: "skill",
        managedHealthy: true,
        pid: first.pid,
      })

      firstOwner.kill("SIGTERM")
      expect(await firstOwner.exited).toBe(143)
      const stopped = await waitStopped("components", port, root)
      expect(stopped).toMatchObject({
        status: "stopped",
        ownership: "none",
        pid: null,
        lastExit: {
          reason: "owner-session-lost",
          pid: first.pid,
          signal: "TERM",
          exitCode: 143,
        },
      })
      expect(stopped.recoveryHint).toContain("ensure")

      secondOwner = spawnLong("ensure", "components", port, root)
      const recovered = await waitOwned("components", port, root, first.pid ?? undefined)
      expect(recovered.pid).not.toBe(first.pid)
      const recoveredReuse = await run("ensure", "components", port, root)
      expect(recoveredReuse.exitCode).toBe(0)
      expect(parseStatus(recoveredReuse)).toMatchObject({
        outcome: "reused",
        pid: recovered.pid,
      })

      const stoppedManually = await run("stop", "components", port, root)
      expect(stoppedManually.exitCode).toBe(0)
      expect(parseStatus(stoppedManually)).toMatchObject({
        status: "stopped",
        lastExit: {reason: "manual-stop", pid: recovered.pid},
        recoveryHint: null,
      })
      await secondOwner.exited
      const settledStop = await run("status", "components", port, root)
      expect(settledStop.exitCode).toBe(0)
      expect(parseStatus(settledStop)).toMatchObject({
        status: "stopped",
        lastExit: {reason: "manual-stop", pid: recovered.pid},
      })
    } finally {
      await run("stop", "components", port, root)
      firstOwner.kill()
      secondOwner?.kill()
    }
  }, 40000)

  test("refuses ensure for an exact owned but unhealthy selector", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const owner = spawnLong("start", "components", port, root)
    let ownedPid: number | null = null
    try {
      const owned = await waitOwned("components", port, root)
      ownedPid = owned.pid ?? null
      expect(ownedPid).not.toBeNull()
      process.kill(ownedPid!, "SIGSTOP")
      const refused = await run("ensure", "components", port, root)
      expect(refused.exitCode).toBe(4)
      expect(parseStatus(refused)).toMatchObject({
        outcome: "owned-unhealthy",
        ownership: "skill",
        pid: ownedPid,
        managedHealthy: false,
      })
      expect(process.kill(ownedPid!, 0)).toBe(true)
      process.kill(ownedPid!, "SIGCONT")
      const recovered = await waitOwned("components", port, root)
      expect(recovered.pid).toBe(ownedPid)
      const stopped = await run("stop", "components", port, root)
      expect(stopped.exitCode).toBe(0)
      await owner.exited
    } finally {
      if (ownedPid !== null) {
        try {
          process.kill(ownedPid, "SIGCONT")
        } catch {
          // The exact test-owned child already exited.
        }
      }
      await run("stop", "components", port, root)
      owner.kill()
    }
  }, 30000)

  test("runs exact Elements lifecycle and preserves one owned package listener", async () => {
    const port = await freePort()
    const root = await stateRoot()
    const start = spawnLong("start", "elements", port, root)
    try {
      const status = await waitOwned("elements", port, root)
      expect(status).toMatchObject({
        selector: "elements",
        package: "@ui/elements",
        ownership: "skill",
        managedHealthy: true,
        port,
        testOverride: true,
        command: ["bun", "playground/server.ts"],
      })
      expect(status.cwd).toBe(join(checkout, "pkg/ui/elements"))
      expect(status.processStart).toBeString()
      expect(status.log).toEndWith("/elements.log")
      const health = await run("health", "elements", port, root)
      expect(health.exitCode).toBe(0)
      expect(parseStatus(health).pid).toBe(status.pid)
      const logs = await run("logs", "elements", port, root)
      expect(logs.exitCode).toBe(0)
      expect(logs.stdout).toContain("[@ui/elements playground]")
      const stopped = await run("stop", "elements", port, root)
      expect(stopped.exitCode).toBe(0)
      expect(parseStatus(stopped)).toMatchObject({status: "stopped", ownership: "none", pid: null})
      await start.exited
    } finally {
      await run("stop", "elements", port, root)
      start.kill()
    }
  }, 30000)

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
      const refusedEnsure = await run("ensure", "node-ui", port, root)
      expect(refusedEnsure.exitCode).toBe(2)
      expect(parseStatus(refusedEnsure)).toMatchObject({outcome: "refused-foreign", ownership: "foreign"})
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

function spawnLong(action: "ensure" | "start" | "restart", selector: string, port: number, root: string) {
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

async function waitStopped(selector: string, port: number, root: string): Promise<Status> {
  let last: RunResult | null = null
  for (let attempt = 0; attempt < 100; attempt++) {
    last = await run("status", selector, port, root)
    const status = parseStatus(last)
    if (status.status === "stopped" && status.ownership === "none") return status
    await Bun.sleep(100)
  }
  throw new Error(`selector did not stop: ${JSON.stringify(last)}`)
}
