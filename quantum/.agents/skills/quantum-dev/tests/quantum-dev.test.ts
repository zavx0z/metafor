import {afterAll, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

type RunResult = Readonly<{exitCode: number; stdout: string; stderr: string}>
type Status = Readonly<{
  selector: string
  package: string
  status: string
  ownership: string
  pid: number | null
  cwd: string
  port: number
  origin: string
  probePath: string
  managedHealthy: boolean
  testOverride: boolean
  outcome: string
}>

const skillRoot = resolve(import.meta.dir, "..")
const checkout = resolve(skillRoot, "../../../..")
const wrapper = join(skillRoot, "scripts/quantum-dev.sh")
const dispatcher = join(skillRoot, "scripts/quantum-dispatcher.sh")
const registryPath = join(skillRoot, "scripts/storybooks.json")
const temporaryRoots: string[] = []

afterAll(async () => {
  await Promise.all(temporaryRoots.map((path) => rm(path, {recursive: true, force: true})))
})

describe("quantum-dev Storybook lifecycle", () => {
  test("registers one exact Quantum Storybook selector", async () => {
    const registry = await Bun.file(registryPath).json() as {
      version: number
      selectors: Record<string, unknown>
    }
    expect(registry.version).toBe(1)
    expect(registry.selectors.quantum).toMatchObject({
      supported: true,
      package: "Quantum Storybook",
      cwd: "quantum/storybook",
      command: ["bun", "server.ts"],
      host: "127.0.0.1",
      port: 4019,
      origin: "http://127.0.0.1:4019",
      probePath: "/graph/",
      canvas: {selector: "#quantum-storybook-canvas", capability: "webgpu-diagnostic"},
      routes: {default: "/graph/"},
    })
    expect(Object.keys(registry.selectors)).toEqual(["quantum"])
  })

  test("starts, reports health and logs, then stops only its exact child", async () => {
    const port = await freePort()
    const stateRoot = await temporaryRoot("quantum-dev-state-")
    const owner = spawnLong("start", port, stateRoot)
    try {
      const running = await waitOwned(port, stateRoot)
      expect(running).toMatchObject({
        selector: "quantum",
        package: "Quantum Storybook",
        ownership: "skill",
        managedHealthy: true,
        port,
        origin: `http://127.0.0.1:${port}`,
        probePath: "/graph/",
        testOverride: true,
      })
      expect(running.cwd).toBe(join(checkout, "quantum/storybook"))

      const health = await runWrapper("health", port, stateRoot)
      expect(health.exitCode).toBe(0)
      expect(parseStatus(health).pid).toBe(running.pid)

      const logs = await runWrapper("logs", port, stateRoot)
      expect(logs.exitCode).toBe(0)
      expect(logs.stdout).toContain("[Лаборатория Quantum]")

      const stopped = await runWrapper("stop", port, stateRoot)
      expect(stopped.exitCode).toBe(0)
      expect(parseStatus(stopped)).toMatchObject({status: "stopped", ownership: "none", pid: null})
      await owner.exited
    } finally {
      await runWrapper("stop", port, stateRoot)
      owner.kill()
    }
  }, 30_000)

  test("restart replaces only the recorded Quantum child", async () => {
    const port = await freePort()
    const stateRoot = await temporaryRoot("quantum-dev-restart-")
    const firstOwner = spawnLong("start", port, stateRoot)
    let secondOwner: ReturnType<typeof Bun.spawn> | null = null
    try {
      const first = await waitOwned(port, stateRoot)
      secondOwner = spawnLong("restart", port, stateRoot)
      const second = await waitOwned(port, stateRoot, first.pid ?? undefined)
      expect(second.pid).not.toBe(first.pid)
      await firstOwner.exited
      expect((await runWrapper("stop", port, stateRoot)).exitCode).toBe(0)
      await secondOwner.exited
    } finally {
      await runWrapper("stop", port, stateRoot)
      firstOwner.kill()
      secondOwner?.kill()
    }
  }, 30_000)

  test("preserves a foreign listener", async () => {
    const port = await freePort()
    const stateRoot = await temporaryRoot("quantum-dev-foreign-")
    const foreign = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: () => new Response("<!doctype html><title>foreign</title>foreign"),
    })
    try {
      expect(parseStatus(await runWrapper("status", port, stateRoot))).toMatchObject({
        status: "foreign",
        ownership: "foreign",
        managedHealthy: false,
      })
      expect((await runWrapper("start", port, stateRoot)).exitCode).toBe(2)
      expect((await runWrapper("ensure", port, stateRoot)).exitCode).toBe(2)
      expect((await runWrapper("stop", port, stateRoot)).exitCode).toBe(2)
      expect(await fetch(`http://127.0.0.1:${port}/`).then((response) => response.text()))
        .toContain("foreign")
    } finally {
      foreign.stop(true)
    }
  }, 20_000)

  test("rejects incomplete wrapper commands", async () => {
    for (const argv of [[wrapper, "status"], [wrapper, "status", checkout, "extra"]]) {
      const result = await runCommand(argv, undefined, await temporaryRoot("quantum-dev-args-"))
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("error:")
    }
  })
})

function spawnLong(action: "ensure" | "start" | "restart", port: number, stateRoot: string) {
  return Bun.spawn([dispatcher, action, checkout, "quantum"], {
    cwd: checkout,
    env: environment(port, stateRoot),
    stdout: "pipe",
    stderr: "pipe",
  })
}

async function runWrapper(
  action: string,
  port: number | undefined,
  stateRoot: string,
): Promise<RunResult> {
  return runCommand([wrapper, action, checkout], port, stateRoot)
}

async function runCommand(
  command: readonly string[],
  port: number | undefined,
  stateRoot: string,
): Promise<RunResult> {
  const child = Bun.spawn([...command], {
    cwd: checkout,
    env: environment(port, stateRoot),
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

async function waitOwned(
  port: number,
  stateRoot: string,
  previousPid?: number,
): Promise<Status> {
  let last: RunResult | null = null
  for (let attempt = 0; attempt < 100; attempt++) {
    last = await runWrapper("status", port, stateRoot)
    const status = parseStatus(last)
    if (status.ownership === "skill" && status.managedHealthy && status.pid !== previousPid) return status
    await Bun.sleep(100)
  }
  throw new Error(`Quantum Storybook не стал owned: ${JSON.stringify(last)}`)
}

function parseStatus(result: RunResult): Status {
  const value = result.stdout.trim()
  if (!value.startsWith("{")) throw new Error(`Нет structured status: ${value}\n${result.stderr}`)
  return JSON.parse(value) as Status
}

function environment(port: number | undefined, stateRoot: string): Record<string, string | undefined> {
  return {
    ...Bun.env,
    QUANTUM_DEV_STATE_ROOT: stateRoot,
    QUANTUM_DEV_TEST_MODE: port === undefined ? undefined : "1",
    QUANTUM_DEV_TEST_PORT: port === undefined ? undefined : String(port),
  }
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

async function freePort(): Promise<number> {
  const server = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => new Response("probe")})
  const port = server.port
  server.stop(true)
  if (port === undefined) throw new Error("Bun не выделил test port")
  return port
}
