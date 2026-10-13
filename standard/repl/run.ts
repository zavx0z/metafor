import {createHash} from "node:crypto"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {OracleProcessEnvironment} from "@metafor/types/metafor/environment"
import type {ReplSession, ReplJob} from "@metafor/types/cosmos/repl"

type Entry = {id: string; codeHash: string; state: "pending" | "completed" | "failed"; session: ReplSession | null; jobId: string | null; result: unknown; error: string | null}
type Ledger = {version: 1; session: ReplSession | null; requests: Entry[]}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const identity = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/.test(value)
const text = (value: string) => value.slice(-32768)

/**
Mass intent предшествует native effect. Retained pending только наблюдается по
jobId; потерянная квитанция не разрешает повторную evaluate. JavaScript failure
возвращается как tool result; transport/uncertain дают терминальный error.
Heap принадлежит внешнему процессу, а не Mass. См. [закон Tool](README.md).
*/
export default async function run(input: {request: string | null; mass: {receipt: MassHandle}; environment?: OracleProcessEnvironment | undefined; signal: AbortSignal}) {
  let ackId = "", ledger: Ledger | undefined, entry: Entry | undefined
  const save = async () => {
    input.signal.throwIfAborted()
    if (JSON.stringify(ledger).length > 4 * 1024 * 1024) throw new Error("REPL receipt ledger capacity exceeded")
    await input.mass.receipt.write(ledger)
    input.signal.throwIfAborted()
  }
  try {
    input.signal.throwIfAborted()
    if (typeof input.request !== "string" || input.request.length > 540000) throw new Error("Invalid REPL request")
    const request: unknown = JSON.parse(input.request)
    if (!object(request) || !identity(request.id) || typeof request.code !== "string" || Buffer.byteLength(request.code) > 524288 ||
        Object.keys(request).some(key => !["id", "code", "timeoutMs"].includes(key)) || request.timeoutMs !== undefined &&
        !(typeof request.timeoutMs === "number" && Number.isSafeInteger(request.timeoutMs) && request.timeoutMs > 0 && request.timeoutMs <= 2147483647)) throw new Error("Invalid REPL request")
    ackId = request.id
    const stored = await input.mass.receipt.readText()
    const parsed: unknown = stored ? JSON.parse(stored) : {version: 1, session: null, requests: []}
    if (!object(parsed) || parsed.version !== 1 || !Array.isArray(parsed.requests) || parsed.requests.length > 256 ||
        parsed.requests.some(row => !object(row) || !identity(row.id) || typeof row.codeHash !== "string" || !["pending", "completed", "failed"].includes(String(row.state)))) throw new Error("Invalid REPL receipt ledger")
    ledger = parsed as unknown as Ledger
    const codeHash = createHash("sha256").update(request.code).digest("hex")
    const previous = ledger.requests.find(row => row.id === ackId)
    if (previous && previous.codeHash !== codeHash) throw new Error("REPL request identity already binds different code")
    entry = previous
    if (entry?.state === "completed") return {ack: true as const, ackId, response: JSON.stringify(entry.result), error: null}
    if (entry?.state === "failed") return {ack: true as const, ackId, response: null, error: entry.error ?? "REPL request previously failed; never replay"}
    if (!input.environment) throw new Error("Native REPL capability is not assigned")
    const environment = input.environment
    const observation = await environment.read()
    if (observation.actor.meta !== "@metafor/repl" || !observation.operations.some(operation => operation.name === "cosmos.repl.evaluate")) throw new Error("Native REPL capability is not assigned to this Tool")
    if (entry && (!entry.jobId || !entry.session)) throw new Error("REPL admission outcome is uncertain; code will not be submitted again")
    if (!entry) {
      if (ledger.requests.length >= 256) throw new Error("REPL receipt ledger is full")
      // Новый явный запрос после неопределённого исхода начинает отдельный heap.
      if (ledger.requests.some(row => row.state !== "completed")) ledger.session = null
      entry = {id: ackId, codeHash, state: "pending", session: null, jobId: null, result: null, error: null}
      ledger.requests.push(entry)
      await save()
      if (ledger.session) {
        try {
          const existing = await environment.call("cosmos.repl.read", {sessionId: ledger.session.sessionId, incarnation: ledger.session.incarnation, cursor: 0})
          if (existing.session.state !== "ready") ledger.session = null
        } catch {input.signal.throwIfAborted(); ledger.session = null}
      }
      if (!ledger.session) ledger.session = await environment.call("cosmos.repl.open", {requestId: `session:${ackId}`})
      if (ledger.session.state !== "ready") throw new Error("Native REPL heap is unavailable; never replay")
      entry.session = ledger.session
      await save()
      const admitted = await environment.call("cosmos.repl.evaluate", {sessionId: entry.session.sessionId, incarnation: entry.session.incarnation, requestId: ackId, code: request.code,
        ...(typeof request.timeoutMs === "number" ? {timeoutMs: request.timeoutMs} : {})})
      if (admitted.sessionId !== entry.session.sessionId || admitted.incarnation !== entry.session.incarnation || admitted.job.codeHash !== codeHash) throw new Error("Native REPL admission receipt is not correlated")
      entry.jobId = admitted.job.id
      await save()
    }
    let cursor = 0, stdout = "", stderr = "", droppedThrough = 0, job: ReplJob | undefined
    while (true) {
      input.signal.throwIfAborted()
      const receipt = await environment.call("cosmos.repl.read", {sessionId: entry.session!.sessionId, incarnation: entry.session!.incarnation, cursor, jobId: entry.jobId!})
      if (receipt.session.sessionId !== entry.session!.sessionId || receipt.session.incarnation !== entry.session!.incarnation) throw new Error("Native REPL read receipt is not correlated")
      for (const log of receipt.logs) {if (log.stream === "stdout") stdout = text(stdout + log.text); else stderr = text(stderr + log.text)}
      cursor = receipt.cursor; droppedThrough = receipt.droppedThrough
      job = receipt.jobs.find(row => row.id === entry!.jobId)
      if (!job || job.codeHash !== codeHash) throw new Error("Native REPL job is unavailable; outcome is uncertain")
      if (job.state === "completed" || job.state === "failed") break
      if (job.state === "uncertain" || job.state === "cancelled" || receipt.session.state === "closed") throw new Error("Native REPL outcome is uncertain; code will not be submitted again")
      await Bun.sleep(25)
    }
    entry.state = "completed"
    entry.result = {operation: "bun.evaluate", jobId: entry.jobId, state: job.state, result: job.result === null ? null : text(job.result), error: job.error === null ? null : text(job.error), stdout, stderr, droppedThrough}
    entry.error = null
    await save()
    return {ack: true as const, ackId, response: JSON.stringify(entry.result), error: null}
  } catch (error) {
    const message = error instanceof Error ? error.message : "Native REPL request failed"
    if (entry && ledger && !input.signal.aborted && entry.state === "pending") {
      entry.state = "failed"; entry.error = message
      try {await save()} catch {}
    }
    return {ack: true as const, ackId, response: null, error: message}
  }
}
