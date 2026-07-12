import {resolve} from "node:path"

type DomainName = "force" | "boundary" | "dark" | "matrix" | "energy"

type RuntimeChild = {
  domain: DomainName
  process: ReturnType<typeof Bun.spawn>
}

type ForceHealth = {
  ok: boolean
  domain: "force"
  clients: Array<{domain: string; id: string}>
}

const repositoryRoot = resolve(import.meta.dir, "..")
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)

const readPort = (name: string, fallback: number): number => {
  const raw = Bun.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }
  return value
}

const ports = {
  force: readPort("METAFOR_FORCE_PORT", 4000),
  boundary: readPort("METAFOR_BOUNDARY_PORT", 4001),
  dark: readPort("METAFOR_DARK_PORT", 4002),
  matrix: readPort("METAFOR_MATRIX_PORT", 4003),
  energy: readPort("METAFOR_ENERGY_PORT", 4005),
} as const

const forceHttp = `http://127.0.0.1:${ports.force}`
const forceAddress = `ws://127.0.0.1:${ports.force}/ws`
const root = Bun.env.METAFOR_ROOT?.trim() || "test/runtime-universe"
const autoActivate = Bun.env.METAFOR_AUTO_ACTIVATE?.trim() !== "0"
const children: RuntimeChild[] = []
let stopping = false

const spawnDomain = (
  domain: DomainName,
  entry: string,
  port: number,
  extraEnv: Record<string, string> = {},
): RuntimeChild => {
  const child: RuntimeChild = {
    domain,
    process: Bun.spawn({
      cmd: [process.execPath, entry],
      cwd: repositoryRoot,
      env: {
        ...inheritedEnv,
        PORT: String(port),
        FORCE_ADDRESS: forceAddress,
        FORCE_RECONNECT: "1",
        ...extraEnv,
      },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    }),
  }
  children.push(child)
  return child
}

const waitForHealth = async (domain: DomainName, port: number, timeoutMs = 15_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  const url = `http://127.0.0.1:${port}/health`
  while (Date.now() < deadline) {
    const child = children.find((candidate) => candidate.domain === domain)
    if (child?.process.exitCode !== null) {
      throw new Error(`${domain} exited before becoming healthy: ${child.process.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) {
        const health = await response.json() as {ok?: unknown; domain?: unknown}
        if (health.ok === true && health.domain === domain) return
      }
    } catch {
      // The domain is still starting.
    }
    await Bun.sleep(25)
  }
  throw new Error(`Timed out waiting for ${domain} health at ${url}`)
}

const waitForForceClients = async (timeoutMs = 15_000): Promise<void> => {
  const expected = new Set<DomainName>(["boundary", "dark", "matrix", "energy"])
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${forceHttp}/health`)
      if (response.ok) {
        const health = await response.json() as ForceHealth
        const connected = new Set(health.clients.map((client) => client.domain))
        if ([...expected].every((domain) => connected.has(domain))) return
      }
    } catch {
      // Force or one of its clients is still starting.
    }
    await Bun.sleep(25)
  }
  throw new Error(`Timed out waiting for core domains to register with Force at ${forceAddress}`)
}

const activateRoot = async (): Promise<void> => {
  const response = await fetch(`${forceHttp}/force`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      parts: [{part: "inflaton", op: "test", path: root}],
    }),
  })
  if (!response.ok) throw new Error(`Meta activation failed: ${response.status} ${await response.text()}`)
  const result = await response.json() as {ok?: unknown}
  if (result.ok !== true) throw new Error(`Meta activation was not accepted: ${JSON.stringify(result)}`)
}

const shutdown = async (): Promise<void> => {
  if (stopping) return
  stopping = true
  for (const child of children.toReversed()) {
    if (child.process.exitCode === null) child.process.kill("SIGTERM")
  }
  await Promise.race([
    Promise.all(children.map((child) => child.process.exited)),
    Bun.sleep(2_000),
  ])
  for (const child of children.toReversed()) {
    if (child.process.exitCode === null) child.process.kill("SIGKILL")
  }
}

const run = async (): Promise<void> => {
  const boundaryPath = Bun.env.BOUNDARY_PATH?.trim() || resolve(repositoryRoot, "boundary", "tmp", "runtime.sqlite")

  spawnDomain("force", "force/server.ts", ports.force)
  await waitForHealth("force", ports.force)

  spawnDomain("boundary", "boundary/server.ts", ports.boundary, {BOUNDARY_PATH: boundaryPath})
  spawnDomain("matrix", "matrix/server.ts", ports.matrix)
  spawnDomain("energy", "energy/server.ts", ports.energy)
  spawnDomain("dark", "dark/server.ts", ports.dark)

  await Promise.all([
    waitForHealth("boundary", ports.boundary),
    waitForHealth("matrix", ports.matrix),
    waitForHealth("energy", ports.energy),
    waitForHealth("dark", ports.dark),
  ])
  await waitForForceClients()

  if (autoActivate) {
    await activateRoot()
    console.log(`[metafor] activated root=${root}`)
  }
  console.log(`[metafor] running force=${forceHttp} boundary=${boundaryPath} backend=${Bun.env.METAFOR_WEAK_BACKEND?.trim() || "auto"}`)

  const signal = new Promise<{kind: "signal"; signal: string}>((resolveSignal) => {
    process.once("SIGINT", () => resolveSignal({kind: "signal", signal: "SIGINT"}))
    process.once("SIGTERM", () => resolveSignal({kind: "signal", signal: "SIGTERM"}))
  })
  const exit = Promise.race(children.map((child) =>
    child.process.exited.then((code) => ({kind: "exit" as const, domain: child.domain, code})),
  ))
  const outcome = await Promise.race([signal, exit])
  if (outcome.kind === "exit" && !stopping) {
    throw new Error(`${outcome.domain} exited unexpectedly with code ${outcome.code}`)
  }
}

try {
  await run()
} catch (error) {
  console.error(`[metafor] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await shutdown()
}
