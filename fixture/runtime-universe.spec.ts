import {SQL} from "bun"
import {describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import type {
  ProcessExecutionClaim,
  ProcessExecutionGrant,
  ProcessResultCommit,
  ProcessResultProposal,
} from "@metafor/types/force/execution"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import type {
  ReactionExecutionClaim,
  ReactionExecutionSignal,
  ReactionResultCommit,
  ReactionResultProposal,
} from "@metafor/types/force/reaction"
import {boundaryEntityId} from "../boundary/incremental.ts"

const ROOT = "test/runtime-universe"
const TARGET = "test/runtime-reaction-target"
const repositoryRoot = resolve(import.meta.dir, "..")
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)

type ProcessLine = {stream: "stdout" | "stderr"; text: string}
type ManagedProcess = {
  name: string
  process: ReturnType<typeof Bun.spawn>
  lines: ProcessLine[]
  waitForLine(
    predicate: (line: string) => boolean,
    fromIndex?: number,
    timeoutMs?: number,
  ): Promise<{lineIndex: number; line: string}>
  stop(): Promise<void>
}
type ForceEvent = {
  lineIndex: number
  source: string
  direction: "<-" | "->"
  message: ForceMessage
  line: string
}

const consumeLines = async (
  stream: ReadableStream<Uint8Array>,
  channel: ProcessLine["stream"],
  lines: ProcessLine[],
): Promise<void> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  while (true) {
    const {done, value} = await reader.read()
    if (value) pending += decoder.decode(value, {stream: !done})
    let newline = pending.indexOf("\n")
    while (newline !== -1) {
      const text = pending.slice(0, newline).replace(/\r$/, "")
      pending = pending.slice(newline + 1)
      if (text.length > 0) lines.push({stream: channel, text})
      newline = pending.indexOf("\n")
    }
    if (done) break
  }
  pending += decoder.decode()
  const text = pending.replace(/\r$/, "")
  if (text.length > 0) lines.push({stream: channel, text})
}

const spawnManaged = (name: string, entry: string, env: Record<string, string>): ManagedProcess => {
  const lines: ProcessLine[] = []
  const subprocess = Bun.spawn({
    cmd: ["bun", entry],
    cwd: repositoryRoot,
    env: {...inheritedEnv, ...env},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  void consumeLines(subprocess.stdout as ReadableStream<Uint8Array>, "stdout", lines)
  void consumeLines(subprocess.stderr as ReadableStream<Uint8Array>, "stderr", lines)

  return {
    name,
    process: subprocess,
    lines,
    async waitForLine(predicate, fromIndex = 0, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        for (let lineIndex = fromIndex; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex]!.text
          if (predicate(line)) return {lineIndex, line}
        }
        if (subprocess.exitCode !== null) {
          throw new Error(`${name} exited with ${subprocess.exitCode}:\n${lines.slice(-40).map((item) => item.text).join("\n")}`)
        }
        await Bun.sleep(20)
      }
      throw new Error(`Timed out waiting for ${name} output:\n${lines.slice(-40).map((item) => item.text).join("\n")}`)
    },
    async stop() {
      if (subprocess.exitCode !== null) return
      subprocess.kill("SIGTERM")
      await Promise.race([subprocess.exited, Bun.sleep(2_000)])
      if (subprocess.exitCode === null) subprocess.kill("SIGKILL")
    },
  }
}

const parseForceEvent = (line: string, lineIndex: number): ForceEvent | null => {
  const match = /^\[[^\]]+\]\s+#\d+\s+(\S+)\s+(<-|->)\s+(\{.*\})$/.exec(line)
  if (!match) return null
  try {
    const message = JSON.parse(match[3]!) as ForceMessage
    if (!Array.isArray(message.parts) || message.parts.length !== 1) return null
    return {lineIndex, source: match[1]!, direction: match[2]! as "<-" | "->", message, line}
  } catch {
    return null
  }
}

const waitForForceEvent = async (
  force: ManagedProcess,
  predicate: (event: ForceEvent) => boolean,
  fromIndex = 0,
  timeoutMs = 30_000,
): Promise<ForceEvent> => {
  const result = await force.waitForLine((line) => {
    const lineIndex = force.lines.findIndex((item) => item.text === line)
    const event = parseForceEvent(line, lineIndex)
    return event !== null && predicate(event)
  }, fromIndex, timeoutMs)
  const event = parseForceEvent(result.line, result.lineIndex)
  if (!event) throw new Error(`Expected Force event, received: ${result.line}`)
  return event
}

const particle = (event: ForceEvent): Particle => event.message.parts[0]!
const actorWimp = (event: ForceEvent): string | undefined => {
  const value = particle(event).value as {actor?: {wimp?: unknown}} | undefined
  return typeof value?.actor?.wimp === "string" ? value.actor.wimp : undefined
}
const actorIdFromEvent = (event: ForceEvent): number => Number(String(particle(event).path).split("/").at(-1))

const postImpulse = async (baseUrl: string, part: Particle): Promise<void> => {
  const response = await fetch(`${baseUrl}/force`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({parts: [part]} satisfies ForceMessage),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ok: true, parts: 1})
}

const eventLabel = (event: ForceEvent): string => {
  const part = particle(event)
  const from = part.from === undefined ? "" : ` from=${String(part.from)}`
  const value = part.value === undefined ? "" : ` ${JSON.stringify(part.value)}`
  return `${event.source} ${part.part}/${part.op} ${String(part.path)}${from}${value}`
}

const waitForWorld = async (
  database: string,
  predicate: (sql: SQL) => Promise<boolean>,
): Promise<SQL> => {
  const sql = new SQL(`sqlite://${database}`)
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await predicate(sql)) return sql
    await Bun.sleep(20)
  }
  await sql.close()
  throw new Error("Timed out waiting for canonical Boundary state")
}

describe("minimal MetaFor runtime universe", () => {
  test("runs external input, Process and Reaction through canonical Boundary commits", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "metafor-runtime-universe-"))
    const database = join(temporary, "boundary.sqlite")
    const processes: ManagedProcess[] = []

    try {
      const force = spawnManaged("force", "force/server.ts", {PORT: "0", METAFOR_LOG_IMPULSES: "full"})
      processes.push(force)
      const listening = await force.waitForLine((line) => line.includes("[force] listening on "))
      const port = /:(\d+)\/?$/.exec(listening.line)?.[1]
      if (!port) throw new Error(`Cannot parse Force port from: ${listening.line}`)
      const forceAddress = `ws://127.0.0.1:${port}/ws`
      const forceHttp = `http://127.0.0.1:${port}`
      const domainEnv = {FORCE_ADDRESS: forceAddress, FORCE_RECONNECT: "0", METAFOR_LOG_IMPULSES: "off", PORT: "0"}

      const boundary = spawnManaged("boundary", "boundary/server.ts", {...domainEnv, BOUNDARY_PATH: database})
      processes.push(boundary)
      await force.waitForLine((line) => line.includes("[force] connected: boundary boundary-local"))
      const matrix = spawnManaged("matrix", "matrix/server.ts", {...domainEnv, METAFOR_WEAK_BACKEND: "cpu"})
      processes.push(matrix)
      await force.waitForLine((line) => line.includes("[force] connected: matrix matrix-local"))
      const energy = spawnManaged("energy", "energy/server.ts", {...domainEnv, ENERGY_ID: "energy-universe", ENERGY_RUNTIME_KIND: "server"})
      processes.push(energy)
      await force.waitForLine((line) => line.includes("[force] connected: energy energy-local"))
      const dark = spawnManaged("dark", "dark/server.ts", domainEnv)
      processes.push(dark)
      await force.waitForLine((line) => line.includes("[force] connected: dark dark-local"))

      const activationStart = force.lines.length
      await postImpulse(forceHttp, {part: "inflaton", op: "test", path: ROOT})

      const darkMeta = await waitForForceEvent(force, (event) =>
        event.source === "force:dark" && particle(event).part === "inflaton" &&
        particle(event).op === "add" && particle(event).path === `${ROOT}/meta`, activationStart)
      const boundaryProcess = await waitForForceEvent(force, (event) =>
        event.source === "force:boundary" && particle(event).part === "graviton" &&
        particle(event).path === `declaration/${ROOT}/processes/1`, darkMeta.lineIndex + 1)
      const boundaryReaction = await waitForForceEvent(force, (event) =>
        event.source === "force:boundary" && particle(event).part === "graviton" &&
        particle(event).path === `declaration/${TARGET}/reactions/1`, darkMeta.lineIndex + 1)
      const sourceActorEvent = await waitForForceEvent(force, (event) =>
        event.source === "force:boundary" && particle(event).part === "graviton" &&
        particle(event).op === "add" && actorWimp(event) === ROOT, darkMeta.lineIndex + 1)
      const targetActorEvent = await waitForForceEvent(force, (event) =>
        event.source === "force:boundary" && particle(event).part === "graviton" &&
        particle(event).op === "add" && actorWimp(event) === TARGET, darkMeta.lineIndex + 1)
      const sourceActorId = actorIdFromEvent(sourceActorEvent)
      const targetActorId = actorIdFromEvent(targetActorEvent)

      const bootstrap = await waitForForceEvent(force, (event) =>
        event.source === "force:boundary" && particle(event).part === "graviton" &&
        particle(event).op === "replace" && particle(event).path === "runtime/matrix",
        Math.max(boundaryProcess.lineIndex, boundaryReaction.lineIndex, sourceActorEvent.lineIndex, targetActorEvent.lineIndex) + 1)
      const sourceIdle = await waitForForceEvent(force, (event) =>
        event.source === "force:matrix" && particle(event).part === "photon" &&
        particle(event).op === "replace" && particle(event).path === sourceActorId && particle(event).value === "idle",
        bootstrap.lineIndex + 1)
      const targetIdle = await waitForForceEvent(force, (event) =>
        event.source === "force:matrix" && particle(event).part === "photon" &&
        particle(event).op === "replace" && particle(event).path === targetActorId && particle(event).value === "idle",
        bootstrap.lineIndex + 1)

      const inputFieldId = boundaryEntityId(`${ROOT}/fields/1`)
      const outputFieldId = boundaryEntityId(`${ROOT}/fields/2`)
      const processId = boundaryEntityId(`${ROOT}/processes/1`)
      const targetFieldId = boundaryEntityId(`${TARGET}/fields/1`)
      const reactionId = boundaryEntityId(`${TARGET}/reactions/1`)

      const inputStart = force.lines.length
      await postImpulse(forceHttp, {
        part: "gluon",
        op: "replace",
        path: sourceActorId,
        value: {fields: {[String(inputFieldId)]: 1}},
      })
      const inputRequest = await waitForForceEvent(force, (event) =>
        event.source === "force:http" && particle(event).part === "gluon" &&
        particle(event).path === sourceActorId && particle(event).from === undefined, inputStart)
      const inputCommit = await waitForForceEvent(force, (event) =>
        event.source === "force:boundary" && particle(event).part === "gluon" &&
        particle(event).path === sourceActorId && String(particle(event).from).startsWith("boundary:"),
        inputRequest.lineIndex + 1)
      const ready = await waitForForceEvent(force, (event) =>
        event.source === "force:matrix" && particle(event).part === "photon" &&
        particle(event).op === "test" && particle(event).path === sourceActorId && particle(event).value === "ready",
        inputCommit.lineIndex + 1)
      const processExecutionId = String(particle(ready).from)
      expect(processExecutionId.length).toBeGreaterThan(0)

      const processClaim = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as Partial<ProcessExecutionClaim> | undefined
        return event.source === "force:energy" && particle(event).part === "z" &&
          value?.processExecutionId === processExecutionId
      }, ready.lineIndex + 1)
      expect(particle(processClaim).value).toEqual({energy: "energy-universe", processExecutionId})
      const processGrant = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as Partial<ProcessExecutionGrant> | undefined
        return event.source === "force:matrix" && particle(event).part === "z" &&
          particle(event).op === "copy" && value?.processExecutionId === processExecutionId
      }, processClaim.lineIndex + 1)
      expect(particle(processGrant).value).toEqual({
        processExecutionId,
        fields: {[String(inputFieldId)]: 1, [String(outputFieldId)]: 0},
      })

      const processProposal = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as Partial<ProcessResultProposal> | undefined
        return event.source === "force:energy" && particle(event).part === "w+" &&
          value?.processExecutionId === processExecutionId
      }, processGrant.lineIndex + 1)
      expect(particle(processProposal).value).toEqual({
        processExecutionId,
        processId,
        fields: {[String(outputFieldId)]: 2},
      })
      const sourceCommit = await waitForForceEvent(force, (event) =>
        event.source === "force:boundary" && particle(event).part === "gluon" &&
        particle(event).path === sourceActorId && particle(event).from === processExecutionId,
        processProposal.lineIndex + 1)
      const processAck = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as Partial<ProcessResultCommit> | undefined
        return event.source === "force:boundary" && particle(event).part === "w+" &&
          value?.processExecutionId === processExecutionId
      }, sourceCommit.lineIndex + 1)
      const complete = await waitForForceEvent(force, (event) =>
        event.source === "force:matrix" && particle(event).part === "photon" &&
        particle(event).path === sourceActorId && particle(event).value === "complete",
        processAck.lineIndex + 1)

      const reactionSignalEvent = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as ReactionExecutionSignal | undefined
        const sourceValue = value?.source.part.value
        return event.source === "force:boundary" && particle(event).part === "photon" &&
          value?.kind === "reaction" && value.reactionId === reactionId &&
          sourceValue !== undefined &&
          JSON.stringify(sourceValue).includes(`\"${String(outputFieldId)}\":2`)
      }, sourceCommit.lineIndex + 1)
      const reactionSignal = particle(reactionSignalEvent).value as ReactionExecutionSignal
      expect(reactionSignal.target).toEqual({actorId: targetActorId, wimp: TARGET, state: "idle"})
      expect(reactionSignal.source.actorId).toBe(sourceActorId)

      const reactionClaim = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as Partial<ReactionExecutionClaim> | undefined
        return event.source === "force:energy" && particle(event).part === "z" &&
          value?.kind === "reaction-claim" && value.reactionExecutionId === reactionSignal.reactionExecutionId
      }, reactionSignalEvent.lineIndex + 1)
      const reactionGrant = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as Partial<ReactionExecutionSignal> | undefined
        return event.source === "force:boundary" && particle(event).part === "z" &&
          particle(event).op === "copy" && value?.reactionExecutionId === reactionSignal.reactionExecutionId
      }, reactionClaim.lineIndex + 1)
      const reactionProposal = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as Partial<ReactionResultProposal> | undefined
        return event.source === "force:energy" && particle(event).part === "w+" &&
          value?.reactionExecutionId === reactionSignal.reactionExecutionId
      }, reactionGrant.lineIndex + 1)
      expect(particle(reactionProposal).value).toEqual({
        reactionExecutionId: reactionSignal.reactionExecutionId,
        reactionId,
        matched: true,
        fields: {[String(targetFieldId)]: 2},
      })
      const targetCommit = await waitForForceEvent(force, (event) =>
        event.source === "force:boundary" && particle(event).part === "gluon" &&
        particle(event).path === targetActorId &&
        particle(event).from === `reaction:${reactionSignal.reactionExecutionId}`,
        reactionProposal.lineIndex + 1)
      const reactionAck = await waitForForceEvent(force, (event) => {
        const value = particle(event).value as Partial<ReactionResultCommit> | undefined
        return event.source === "force:boundary" && particle(event).part === "w+" &&
          value?.reactionExecutionId === reactionSignal.reactionExecutionId
      }, targetCommit.lineIndex + 1)
      expect(particle(reactionAck).value).toEqual({
        reactionExecutionId: reactionSignal.reactionExecutionId,
        reactionId,
        energy: "energy-universe",
        status: "committed",
      })
      const targetReacted = await waitForForceEvent(force, (event) =>
        event.source === "force:matrix" && particle(event).part === "photon" &&
        particle(event).op === "replace" && particle(event).path === targetActorId && particle(event).value === "reacted",
        targetCommit.lineIndex + 1)

      const inspection = await waitForWorld(database, async (sql) => {
        const row = (await sql<Array<{name: string}>>`
          SELECT state.name AS name
            FROM actor_state JOIN state ON state.id = actor_state.metaState
           WHERE actor_state.actor = ${targetActorId}
        `)[0]
        return row?.name === "reacted"
      })
      try {
        const values = await inspection<Array<{actor: number; field: number; valueJson: string}>>`
          SELECT actor, field, value_json AS valueJson
            FROM boundary_actor_field
           WHERE (actor = ${sourceActorId} AND field IN (${inputFieldId}, ${outputFieldId}))
              OR (actor = ${targetActorId} AND field = ${targetFieldId})
        `
        const materialized = values.map((row) => [Number(row.actor), Number(row.field), JSON.parse(row.valueJson)])
        expect(materialized).toContainEqual([sourceActorId, inputFieldId, 1])
        expect(materialized).toContainEqual([sourceActorId, outputFieldId, 2])
        expect(materialized).toContainEqual([targetActorId, targetFieldId, 2])

        const states = await inspection<Array<{actor: number; name: string}>>`
          SELECT actor_state.actor AS actor, state.name AS name
            FROM actor_state JOIN state ON state.id = actor_state.metaState
           WHERE actor_state.actor IN (${sourceActorId}, ${targetActorId})
           ORDER BY actor_state.actor
        `
        expect(states.map((row) => [Number(row.actor), row.name])).toEqual([
          [sourceActorId, "complete"],
          [targetActorId, "reacted"],
        ])
      } finally {
        await inspection.close()
      }

      expect(force.lines.some((item) => item.text.includes("[force] connected: bulk "))).toBe(false)
      expect(force.lines.some((item) => item.text.includes("[force] connected: interpreter "))).toBe(false)

      const ordered = [
        bootstrap,
        inputRequest,
        inputCommit,
        ready,
        processClaim,
        processGrant,
        processProposal,
        sourceCommit,
        processAck,
        reactionSignalEvent,
        reactionClaim,
        reactionGrant,
        reactionProposal,
        targetCommit,
        reactionAck,
      ]
      for (let index = 1; index < ordered.length; index++) {
        expect(ordered[index]!.lineIndex).toBeGreaterThan(ordered[index - 1]!.lineIndex)
      }
      expect(sourceIdle.lineIndex).toBeGreaterThan(bootstrap.lineIndex)
      expect(targetIdle.lineIndex).toBeGreaterThan(bootstrap.lineIndex)
      expect(complete.lineIndex).toBeGreaterThan(processAck.lineIndex)
      expect(targetReacted.lineIndex).toBeGreaterThan(targetCommit.lineIndex)
      const trace = [
        darkMeta,
        boundaryProcess,
        boundaryReaction,
        sourceActorEvent,
        targetActorEvent,
        sourceIdle,
        targetIdle,
        ...ordered,
        complete,
        targetReacted,
      ].sort((left, right) => left.lineIndex - right.lineIndex)
      console.log(`[runtime-universe]\n${trace.map(eventLabel).join("\n")}`)
    } finally {
      for (const managed of processes.toReversed()) await managed.stop()
      rmSync(temporary, {recursive: true, force: true})
    }
  }, 90_000)
})
