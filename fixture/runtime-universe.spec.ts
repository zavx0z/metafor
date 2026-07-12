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
import {boundaryEntityId} from "../boundary/incremental.ts"

const ROOT = "test/runtime-universe"
const repositoryRoot = resolve(import.meta.dir, "..")
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)

type ProcessLine = {
  stream: "stdout" | "stderr"
  text: string
}

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

const spawnManaged = (
  name: string,
  entry: string,
  env: Record<string, string>,
): ManagedProcess => {
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
    async waitForLine(predicate, fromIndex = 0, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        for (let lineIndex = fromIndex; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex]!.text
          if (predicate(line)) return {lineIndex, line}
        }
        if (subprocess.exitCode !== null) {
          throw new Error(`${name} exited with ${subprocess.exitCode}:\n${lines.slice(-30).map((item) => item.text).join("\n")}`)
        }
        await Bun.sleep(20)
      }
      throw new Error(`Timed out waiting for ${name} output:\n${lines.slice(-30).map((item) => item.text).join("\n")}`)
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
    return {
      lineIndex,
      source: match[1]!,
      direction: match[2]! as "<-" | "->",
      message,
      line,
    }
  } catch {
    return null
  }
}

const waitForForceEvent = async (
  force: ManagedProcess,
  predicate: (event: ForceEvent) => boolean,
  fromIndex = 0,
  timeoutMs = 20_000,
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

describe("minimal MetaFor runtime universe", () => {
  test("commits Energy result through Boundary without Bulk or product shells", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "metafor-runtime-universe-"))
    const database = join(temporary, "boundary.sqlite")
    const processes: ManagedProcess[] = []

    try {
      const force = spawnManaged("force", "force/server.ts", {
        PORT: "0",
        METAFOR_LOG_IMPULSES: "full",
      })
      processes.push(force)
      const listening = await force.waitForLine((line) => line.includes("[force] listening on "))
      const port = /:(\d+)\/?$/.exec(listening.line)?.[1]
      if (!port) throw new Error(`Cannot parse Force port from: ${listening.line}`)
      const forceAddress = `ws://127.0.0.1:${port}/ws`
      const forceHttp = `http://127.0.0.1:${port}`
      const domainEnv = {
        FORCE_ADDRESS: forceAddress,
        FORCE_RECONNECT: "0",
        METAFOR_LOG_IMPULSES: "off",
        PORT: "0",
      }

      const boundary = spawnManaged("boundary", "boundary/server.ts", {
        ...domainEnv,
        BOUNDARY_PATH: database,
      })
      processes.push(boundary)
      await force.waitForLine((line) => line.includes("[force] connected: boundary boundary-local"))

      const matrix = spawnManaged("matrix", "matrix/server.ts", {
        ...domainEnv,
        METAFOR_WEAK_BACKEND: "cpu",
      })
      processes.push(matrix)
      await force.waitForLine((line) => line.includes("[force] connected: matrix matrix-local"))

      const energy = spawnManaged("energy", "energy/server.ts", {
        ...domainEnv,
        ENERGY_ID: "energy-universe",
        ENERGY_RUNTIME_KIND: "server",
      })
      processes.push(energy)
      await force.waitForLine((line) => line.includes("[force] connected: energy energy-local"))

      const dark = spawnManaged("dark", "dark/server.ts", domainEnv)
      processes.push(dark)
      await force.waitForLine((line) => line.includes("[force] connected: dark dark-local"))

      const activationStart = force.lines.length
      await postImpulse(forceHttp, {part: "inflaton", op: "test", path: ROOT})

      const darkMeta = await waitForForceEvent(
        force,
        (event) => event.source === "force:dark" && particle(event).part === "inflaton" &&
          particle(event).op === "add" && particle(event).path === `${ROOT}/meta`,
        activationStart,
      )
      const boundaryProcess = await waitForForceEvent(
        force,
        (event) => event.source === "force:boundary" && particle(event).part === "graviton" &&
          particle(event).path === `declaration/${ROOT}/processes/1`,
        darkMeta.lineIndex + 1,
      )
      const boundaryActor = await waitForForceEvent(
        force,
        (event) => event.source === "force:boundary" && particle(event).part === "graviton" &&
          particle(event).op === "add" && typeof particle(event).path === "string" &&
          String(particle(event).path).startsWith("actor/"),
        darkMeta.lineIndex + 1,
      )
      const bootstrap = await waitForForceEvent(
        force,
        (event) => event.source === "force:boundary" && particle(event).part === "graviton" &&
          particle(event).op === "replace" && particle(event).path === "runtime/matrix",
        Math.max(boundaryProcess.lineIndex, boundaryActor.lineIndex) + 1,
      )
      const idle = await waitForForceEvent(
        force,
        (event) => event.source === "force:matrix" && particle(event).part === "photon" &&
          particle(event).op === "replace" && particle(event).value === "idle",
        bootstrap.lineIndex + 1,
      )

      const actorId = Number(particle(idle).path)
      expect(Number.isSafeInteger(actorId) && actorId > 0).toBe(true)
      expect(particle(boundaryActor).path).toBe(`actor/${actorId}`)

      const inputFieldId = boundaryEntityId(`${ROOT}/fields/1`)
      const outputFieldId = boundaryEntityId(`${ROOT}/fields/2`)
      const processId = boundaryEntityId(`${ROOT}/processes/1`)
      const inputStart = force.lines.length
      await postImpulse(forceHttp, {
        part: "gluon",
        op: "replace",
        path: actorId,
        value: {fields: {[String(inputFieldId)]: 1}},
      })

      const input = await waitForForceEvent(
        force,
        (event) => event.source === "force:http" && particle(event).part === "gluon" &&
          particle(event).path === actorId,
        inputStart,
      )
      const ready = await waitForForceEvent(
        force,
        (event) => event.source === "force:matrix" && particle(event).part === "photon" &&
          particle(event).op === "test" && particle(event).path === actorId && particle(event).value === "ready",
        input.lineIndex + 1,
      )
      expect(typeof particle(ready).from).toBe("string")
      const processExecutionId = String(particle(ready).from)

      const claim = await waitForForceEvent(
        force,
        (event) => event.source === "force:energy" && particle(event).part === "z" &&
          particle(event).op === "test" && particle(event).path === actorId,
        ready.lineIndex + 1,
      )
      const claimValue = particle(claim).value as ProcessExecutionClaim
      expect(claimValue).toEqual({energy: "energy-universe", processExecutionId})

      const copy = await waitForForceEvent(
        force,
        (event) => event.source === "force:matrix" && particle(event).part === "z" &&
          particle(event).op === "copy" && particle(event).path === actorId,
        claim.lineIndex + 1,
      )
      const grant = particle(copy).value as ProcessExecutionGrant
      expect(particle(copy).from).toBe("energy-universe")
      expect(grant).toEqual({
        processExecutionId,
        fields: {
          [String(inputFieldId)]: 1,
          [String(outputFieldId)]: 0,
        },
      })

      const proposal = await waitForForceEvent(
        force,
        (event) => event.source === "force:energy" && particle(event).part === "w+" &&
          particle(event).op === "replace" && particle(event).path === actorId,
        copy.lineIndex + 1,
      )
      expect(particle(proposal).from).toBe("energy-universe")
      expect(particle(proposal).value as ProcessResultProposal).toEqual({
        processExecutionId,
        processId,
        fields: {[String(outputFieldId)]: 2},
      })

      const committedField = await waitForForceEvent(
        force,
        (event) => event.source === "force:boundary" && particle(event).part === "gluon" &&
          particle(event).op === "replace" && particle(event).path === actorId &&
          particle(event).from === processExecutionId,
        proposal.lineIndex + 1,
      )
      expect(particle(committedField).value).toEqual({fields: {[String(outputFieldId)]: 2}})

      const acknowledgement = await waitForForceEvent(
        force,
        (event) => event.source === "force:boundary" && particle(event).part === "w+" &&
          particle(event).op === "copy" && particle(event).path === actorId &&
          particle(event).from === processExecutionId,
        committedField.lineIndex + 1,
      )
      expect(particle(acknowledgement).value as ProcessResultCommit).toEqual({
        processExecutionId,
        processId,
        energy: "energy-universe",
      })

      const complete = await waitForForceEvent(
        force,
        (event) => event.source === "force:matrix" && particle(event).part === "photon" &&
          particle(event).op === "replace" && particle(event).path === actorId && particle(event).value === "complete",
        acknowledgement.lineIndex + 1,
      )

      const inspection = new SQL(`sqlite://${database}`)
      try {
        const row = (await inspection<Array<{valueJson: string}>>`
          SELECT value_json AS valueJson
            FROM boundary_actor_field
           WHERE actor = ${actorId} AND field = ${outputFieldId}
        `)[0]
        expect(row && JSON.parse(row.valueJson)).toBe(2)
      } finally {
        await inspection.close()
      }

      expect(force.lines.some((item) => item.text.includes("[force] connected: bulk "))).toBe(false)
      expect(force.lines.some((item) => item.text.includes("[force] connected: interpreter "))).toBe(false)

      expect(boundaryActor.lineIndex).toBeGreaterThan(darkMeta.lineIndex)
      expect(boundaryProcess.lineIndex).toBeGreaterThan(darkMeta.lineIndex)
      expect(bootstrap.lineIndex).toBeGreaterThan(Math.max(boundaryActor.lineIndex, boundaryProcess.lineIndex))
      const runtimeTrace = [
        bootstrap,
        idle,
        input,
        ready,
        claim,
        copy,
        proposal,
        committedField,
        acknowledgement,
        complete,
      ]
      for (let index = 1; index < runtimeTrace.length; index++) {
        expect(runtimeTrace[index]!.lineIndex).toBeGreaterThan(runtimeTrace[index - 1]!.lineIndex)
      }
      const trace = [darkMeta, boundaryActor, boundaryProcess, ...runtimeTrace]
        .sort((left, right) => left.lineIndex - right.lineIndex)
      console.log(`[runtime-universe]\n${trace.map(eventLabel).join("\n")}`)
    } finally {
      for (const managed of processes.toReversed()) await managed.stop()
      rmSync(temporary, {recursive: true, force: true})
    }
  }, 60_000)
})
