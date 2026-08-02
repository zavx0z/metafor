import {resolve} from "node:path"

type Health = Record<string, unknown>
type ManagedProcess = {
  domain: string
  process: ReturnType<typeof Bun.spawn>
}

const repositoryRoot = resolve(import.meta.dir, "..")
const once = process.argv.includes("--once")
const configuredBasePort = Number(Bun.env.METAFOR_UNIVERSE_PORT_BASE ?? 4000)
const forbiddenReloadFlags = new Set(["--hot", "--watch"])
const requestedReloadFlags = [...process.execArgv, ...process.argv.slice(2)]
  .filter((argument) => forbiddenReloadFlags.has(argument))

if (requestedReloadFlags.length > 0) {
  throw new Error(
    `runtime:universe forbids source watching and HMR: ${requestedReloadFlags.join(", ")}`,
  )
}

if (!Number.isInteger(configuredBasePort) || configuredBasePort < 1024 || configuredBasePort > 65530) {
  throw new Error(`Invalid METAFOR_UNIVERSE_PORT_BASE: ${Bun.env.METAFOR_UNIVERSE_PORT_BASE ?? ""}`)
}

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)
const forceHttp = `http://127.0.0.1:${configuredBasePort}`
const domainEnv = {
  ...inheritedEnv,
  BUN_ENV: "production",
  FORCE_ADDRESS: `ws://127.0.0.1:${configuredBasePort}/ws`,
  FORCE_RPC_ADDRESS: `${forceHttp}/`,
  NODE_ENV: "production",
}
const processes: ManagedProcess[] = []
let closing = false

const port = (offset: number): number => configuredBasePort + offset

const spawnDomain = (
  domain: string,
  entry: string,
  domainPort: number,
  additionalEnv: Record<string, string> = {},
): ManagedProcess => {
  const managed: ManagedProcess = {
    domain,
    process: Bun.spawn({
      // Domain servers always start as ordinary one-shot source processes.
      // Their Bun.serve instances also set `development: false`, so neither
      // server modules nor the browser page are watched or hot-reloaded.
      cmd: ["bun", entry],
      cwd: repositoryRoot,
      env: {...domainEnv, ...additionalEnv, PORT: String(domainPort)},
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

const birth = async (): Promise<{ports: Record<string, number>; backend: unknown}> => {
  const dark = spawnDomain("dark", "dark/server.ts", port(0), {
    DARK_COMPAT_PORT: String(port(2)),
  })
  await waitForHealth(dark, `${forceHttp}/health`, (health) =>
    (health.state === "starting" || health.state === "running") &&
    (health.dark as Health | undefined)?.rpc === "ready")

  const boundary = spawnDomain("boundary", "boundary/server.ts", port(1))
  await waitForHealth(boundary, `http://127.0.0.1:${port(1)}/health`, (health) => health.rpc === "ready")

  await waitForHealth(dark, `http://127.0.0.1:${port(2)}/health`, (health) => health.rpc === "ready")

  const energy = spawnDomain("energy", "energy/server.ts", port(5))
  await waitForHealth(energy, `http://127.0.0.1:${port(5)}/health`, (health) => health.initialized === true)

  const bulk = spawnDomain("bulk", "bulk/server.ts", port(4))
  await waitForHealth(bulk, `http://127.0.0.1:${port(4)}/health`, (health) => health.initialized === true)

  const matrix = spawnDomain("matrix", "matrix/server.ts", port(3))
  const matrixHealth = await waitForHealth(
    matrix,
    `http://127.0.0.1:${port(3)}/health`,
    (health) => health.initialized === true,
  )
  await waitForHealth(dark, `${forceHttp}/health`, (health) => health.state === "running")

  return {
    ports: {
      dark: port(0),
      darkCompatibility: port(2),
      boundary: port(1),
      matrix: port(3),
      bulk: port(4),
      energy: port(5),
    },
    backend: matrixHealth.backend,
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
