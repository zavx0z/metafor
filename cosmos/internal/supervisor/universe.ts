import {resolve} from "node:path"

type Health = Record<string, unknown>
type ManagedProcess = {
  domain: string
  process: ReturnType<typeof Bun.spawn>
}

const repositoryRoot = resolve(import.meta.dir, "../../..")
const once = process.argv.includes("--once")
const configuredPort = Number(
  Bun.env.METAFOR_UNIVERSE_PORT ??
  Bun.env.METAFOR_UNIVERSE_PORT_BASE ??
  4000,
)
const forbiddenReloadFlags = new Set(["--hot", "--watch"])
const requestedReloadFlags = [...process.execArgv, ...process.argv.slice(2)]
  .filter((argument) => forbiddenReloadFlags.has(argument))

if (requestedReloadFlags.length > 0) {
  throw new Error(
    `runtime:universe forbids source watching and HMR: ${requestedReloadFlags.join(", ")}`,
  )
}

if (!Number.isInteger(configuredPort) || configuredPort < 1024 || configuredPort > 65535) {
  throw new Error(
    `Invalid METAFOR_UNIVERSE_PORT: ${
      Bun.env.METAFOR_UNIVERSE_PORT ??
      Bun.env.METAFOR_UNIVERSE_PORT_BASE ??
      ""
    }`,
  )
}

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)
const forceHttp = `http://127.0.0.1:${configuredPort}`
const domainEnv = {
  ...inheritedEnv,
  BUN_ENV: "production",
  FORCE_ADDRESS: `ws://127.0.0.1:${configuredPort}/ws`,
  FORCE_RPC_ADDRESS: `${forceHttp}/`,
  NODE_ENV: "production",
}
const processes: ManagedProcess[] = []
let closing = false

const spawnDomain = (
  domain: string,
  entry: string,
  additionalEnv: Record<string, string> = {},
): ManagedProcess => {
  const managed: ManagedProcess = {
    domain,
    process: Bun.spawn({
      // Domain servers always start as ordinary one-shot source processes.
      // Only Dark owns Bun.serve; no domain process or browser page is watched
      // or hot-reloaded.
      cmd: ["bun", entry],
      cwd: repositoryRoot,
      env: {...domainEnv, ...additionalEnv},
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }),
  }
  processes.push(managed)
  return managed
}

const readHealth = async (address: string): Promise<Health | null> => {
  try {
    const response = await fetch(address, {signal: AbortSignal.timeout(750)})
    return await response.json() as Health
  } catch {
    return null
  }
}

const waitForHealth = async (
  managed: ManagedProcess,
  address: string,
  ready: (health: Health) => boolean,
  timeoutMs = 30_000,
): Promise<Health> => {
  const deadline = Date.now() + timeoutMs
  let last: Health | null = null
  while (Date.now() < deadline) {
    if (managed.process.exitCode !== null) {
      throw new Error(`${managed.domain} exited during Universe birth with code ${managed.process.exitCode}`)
    }
    last = await readHealth(address)
    if (last && ready(last)) return last
    await Bun.sleep(50)
  }
  throw new Error(`Timed out waiting for ${managed.domain}: ${JSON.stringify(last)}`)
}

const domainHealth = (
  health: Health,
  domain: string,
): Health | null => {
  const domains = health.domains
  if (typeof domains !== "object" || domains === null || Array.isArray(domains)) {
    return null
  }
  const status = (domains as Health)[domain]
  return typeof status === "object" && status !== null && !Array.isArray(status)
    ? status as Health
    : null
}

const stop = async (): Promise<void> => {
  if (closing) return
  closing = true
  for (const managed of processes.toReversed()) {
    if (managed.process.exitCode !== null) continue
    managed.process.kill("SIGTERM")
    await Promise.race([managed.process.exited, Bun.sleep(2_000)])
    if (managed.process.exitCode === null) managed.process.kill("SIGKILL")
  }
}

const birth = async (): Promise<{port: number; backend: unknown}> => {
  const dark = spawnDomain("dark", "quantum/dark/server.ts", {
    PORT: String(configuredPort),
  })
  await waitForHealth(dark, `${forceHttp}/health`, (health) =>
    (health.state === "starting" || health.state === "running") &&
    (health.dark as Health | undefined)?.rpc === "ready")

  const boundary = spawnDomain("boundary", "quantum/boundary/server.ts")
  await waitForHealth(boundary, `${forceHttp}/health`, (health) =>
    domainHealth(health, "boundary")?.rpc === "ready")

  const energy = spawnDomain("energy", "quantum/energy/server.ts")
  await waitForHealth(energy, `${forceHttp}/health`, (health) =>
    domainHealth(health, "energy")?.initialized === true)

  const bulk = spawnDomain("bulk", "quantum/bulk/server.ts")
  await waitForHealth(bulk, `${forceHttp}/health`, (health) =>
    domainHealth(health, "bulk")?.initialized === true)

  const matrix = spawnDomain("matrix", "quantum/matrix/server.ts")
  const matrixHealth = await waitForHealth(
    matrix,
    `${forceHttp}/health`,
    (health) => domainHealth(health, "matrix")?.initialized === true,
  )
  await waitForHealth(dark, `${forceHttp}/health`, (health) =>
    health.state === "running" &&
    ["boundary", "matrix", "energy", "bulk"].every((domain) =>
      domainHealth(health, domain)?.ok === true))

  return {
    port: configuredPort,
    backend: domainHealth(matrixHealth, "matrix")?.backend,
  }
}

const main = async (): Promise<void> => {
  try {
    const summary = await birth()
    console.log(`[metafor] Universe born ${JSON.stringify(summary)}`)
    if (once) return

    console.log("[metafor] Universe is running; press Ctrl+C to stop")
    await Promise.race([
      new Promise<void>((resolve) => process.once("SIGINT", resolve)),
      new Promise<void>((resolve) => process.once("SIGTERM", resolve)),
      ...processes.map((managed) => managed.process.exited.then((code) => {
        if (!closing) throw new Error(`${managed.domain} exited unexpectedly with code ${code}`)
      })),
    ])
  } finally {
    await stop()
  }
}

if (import.meta.main) await main()

export {birth, stop}
