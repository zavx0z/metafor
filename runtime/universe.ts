import {SQL} from "bun"
import {existsSync, mkdirSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join, resolve} from "node:path"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {boundaryEntityId} from "../boundary/incremental.ts"

const ROOT = "test/runtime-universe"
const TARGET = "test/runtime-reaction-target"
const repositoryRoot = resolve(import.meta.dir, "..")
const once = process.argv.includes("--once")
const explicitDatabase = Bun.env.BOUNDARY_PATH?.trim()
const database = explicitDatabase || join(tmpdir(), `metafor-runtime-universe-${process.pid}.sqlite`)
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)

type ManagedProcess = {
  name: string
  process: ReturnType<typeof Bun.spawn>
  lines: string[]
  waitForLine(predicate: (line: string) => boolean, timeoutMs?: number): Promise<string>
}

type UniverseSummary = {
  database: string
  sourceActorId: number
  targetActorId: number
  input: unknown
  output: unknown
  observed: unknown
  sourceState: string
  targetState: string
}

const processes: ManagedProcess[] = []
let closing = false

const consumeLines = async (
  stream: ReadableStream<Uint8Array>,
  lines: string[],
  error: boolean,
): Promise<void> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  while (true) {
    const {done, value} = await reader.read()
    if (value) pending += decoder.decode(value, {stream: !done})
    let newline = pending.indexOf("\n")
    while (newline !== -1) {
      const line = pending.slice(0, newline).replace(/\r$/, "")
      pending = pending.slice(newline + 1)
      if (line.length > 0) {
        lines.push(line)
        if (error) console.error(line)
        else console.log(line)
      }
      newline = pending.indexOf("\n")
    }
    if (done) break
  }
  pending += decoder.decode()
  const line = pending.replace(/\r$/, "")
  if (line.length > 0) {
    lines.push(line)
    if (error) console.error(line)
    else console.log(line)
  }
}

const spawnDomain = (name: string, entry: string, env: Record<string, string>): ManagedProcess => {
  const lines: string[] = []
  const subprocess = Bun.spawn({
    cmd: ["bun", entry],
    cwd: repositoryRoot,
    env: {...inheritedEnv, ...env},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  void consumeLines(subprocess.stdout as ReadableStream<Uint8Array>, lines, false)
  void consumeLines(subprocess.stderr as ReadableStream<Uint8Array>, lines, true)

  const managed: ManagedProcess = {
    name,
    process: subprocess,
    lines,
    async waitForLine(predicate, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const line = lines.find(predicate)
        if (line !== undefined) return line
        if (subprocess.exitCode !== null) {
          throw new Error(`${name} exited with ${subprocess.exitCode}:\n${lines.slice(-40).join("\n")}`)
        }
        await Bun.sleep(20)
      }
      throw new Error(`Timed out waiting for ${name}:\n${lines.slice(-40).join("\n")}`)
    },
  }
  processes.push(managed)
  return managed
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
  if (!explicitDatabase) {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${database}${suffix}`, {force: true})
  }
}

const postImpulse = async (baseUrl: string, part: Particle): Promise<void> => {
  const response = await fetch(`${baseUrl}/force`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({parts: [part]} satisfies ForceMessage),
  })
  if (!response.ok) throw new Error(`Force rejected ${part.part}/${part.op}: ${await response.text()}`)
}

const waitFor = async <T>(
  label: string,
  read: () => Promise<T | null>,
  timeoutMs = 30_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== null) return value
    await Bun.sleep(20)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

const fieldValue = async (sql: SQL, actor: number, field: number): Promise<unknown> => {
  const row = (await sql<Array<{valueJson: string}>>`
    SELECT value_json AS valueJson
      FROM boundary_actor_field
     WHERE actor = ${actor} AND field = ${field}
  `)[0]
  return row ? JSON.parse(row.valueJson) as unknown : undefined
}

const actorState = async (sql: SQL, actor: number): Promise<string | undefined> => {
  const row = (await sql<Array<{name: string}>>`
    SELECT state.name AS name
      FROM actor_state JOIN state ON state.id = actor_state.metaState
     WHERE actor_state.actor = ${actor}
  `)[0]
  return row?.name
}

const launch = async (): Promise<UniverseSummary> => {
  mkdirSync(dirname(database), {recursive: true})
  if (explicitDatabase && Bun.env.METAFOR_RUNTIME_RESET === "1") {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${database}${suffix}`, {force: true})
  }

  console.log(`[metafor] starting universe database=${database}`)
  const force = spawnDomain("force", "force/server.ts", {
    PORT: "0",
    METAFOR_LOG_IMPULSES: Bun.env.METAFOR_LOG_IMPULSES ?? "full",
  })
  const listening = await force.waitForLine((line) => line.includes("[force] listening on "))
  const port = /:(\d+)\/?$/.exec(listening)?.[1]
  if (!port) throw new Error(`Cannot parse Force port from: ${listening}`)
  const forceAddress = `ws://127.0.0.1:${port}/ws`
  const forceHttp = `http://127.0.0.1:${port}`
  const domainEnv = {
    FORCE_ADDRESS: forceAddress,
    FORCE_RECONNECT: "0",
    METAFOR_LOG_IMPULSES: "off",
    PORT: "0",
  }

  const boundary = spawnDomain("boundary", "boundary/server.ts", {...domainEnv, BOUNDARY_PATH: database})
  await force.waitForLine((line) => line.includes("[force] connected: boundary boundary-local"))
  spawnDomain("matrix", "matrix/server.ts", {
    ...domainEnv,
    METAFOR_WEAK_BACKEND: Bun.env.METAFOR_WEAK_BACKEND ?? "auto",
  })
  await force.waitForLine((line) => line.includes("[force] connected: matrix matrix-local"))
  spawnDomain("energy", "energy/server.ts", {
    ...domainEnv,
    ENERGY_ID: Bun.env.ENERGY_ID ?? "energy-universe",
    ENERGY_RUNTIME_KIND: Bun.env.ENERGY_RUNTIME_KIND ?? "server",
  })
  await force.waitForLine((line) => line.includes("[force] connected: energy energy-local"))
  spawnDomain("dark", "dark/server.ts", domainEnv)
  await force.waitForLine((line) => line.includes("[force] connected: dark dark-local"))

  await postImpulse(forceHttp, {part: "inflaton", op: "test", path: ROOT})
  await boundary.waitForLine((line) => line.includes("[boundary] matrix runtime actors="), 30_000)

  if (!existsSync(database)) throw new Error(`Boundary database was not created: ${database}`)
  const sql = new SQL(`sqlite://${database}`)
  try {
    const actors = await waitFor("runtime Actors", async () => {
      const rows = await sql<Array<{id: number; wimp: string}>>`
        SELECT id, wimp FROM actor WHERE wimp IN (${ROOT}, ${TARGET}) ORDER BY id
      `
      const source = rows.find((row) => row.wimp === ROOT)
      const target = rows.find((row) => row.wimp === TARGET)
      return source && target
        ? {sourceActorId: Number(source.id), targetActorId: Number(target.id)}
        : null
    })

    const inputFieldId = boundaryEntityId(`${ROOT}/fields/1`)
    const outputFieldId = boundaryEntityId(`${ROOT}/fields/2`)
    const targetFieldId = boundaryEntityId(`${TARGET}/fields/1`)
    await postImpulse(forceHttp, {
      part: "gluon",
      op: "replace",
      path: actors.sourceActorId,
      value: {fields: {[String(inputFieldId)]: 1}},
    })

    const summary = await waitFor("complete Process and Reaction world", async () => {
      const input = await fieldValue(sql, actors.sourceActorId, inputFieldId)
      const output = await fieldValue(sql, actors.sourceActorId, outputFieldId)
      const observed = await fieldValue(sql, actors.targetActorId, targetFieldId)
      const sourceState = await actorState(sql, actors.sourceActorId)
      const targetState = await actorState(sql, actors.targetActorId)
      if (input !== 1 || output !== 2 || observed !== 2 || sourceState !== "complete" || targetState !== "reacted") {
        return null
      }
      return {
        database,
        ...actors,
        input,
        output,
        observed,
        sourceState,
        targetState,
      }
    })

    console.log(`[metafor] universe ready ${JSON.stringify(summary)}`)
    return summary
  } finally {
    await sql.close()
  }
}

const main = async (): Promise<void> => {
  try {
    await launch()
    if (once) return

    console.log("[metafor] universe is running; press Ctrl+C to stop")
    await Promise.race([
      new Promise<void>((resolve) => process.once("SIGINT", resolve)),
      new Promise<void>((resolve) => process.once("SIGTERM", resolve)),
      ...processes.map((managed) => managed.process.exited.then((code) => {
        if (!closing) throw new Error(`${managed.name} exited unexpectedly with ${code}`)
      })),
    ])
  } finally {
    await stop()
  }
}

if (import.meta.main) await main()

export {launch, stop}
export type {UniverseSummary}
