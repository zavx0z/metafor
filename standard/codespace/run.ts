import {CODESPACE_META, CODESPACE_START_METHOD, CODESPACE_STATUS_METHOD, isCodespaceResult, validCodespaceRequestId, type CodespaceRequest, type CodespaceResult} from "@metafor/types/metafor/codespace"
import type {OracleProcessEnvironment} from "@metafor/types/metafor/environment"

type Entry = CodespaceRequest & {state: "pending" | "completed"; result?: CodespaceResult}
export interface CodespaceLedger {version: 1; requests: Entry[]}
type JsonMass = {readText(): Promise<string>; write(value: unknown): Promise<void>}
export interface CodespaceRunInput {
  request: string | null
  mass: {receipt: JsonMass}
  environment?: OracleProcessEnvironment | undefined
  signal: AbortSignal
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

function parseRequest(input: string | null): CodespaceRequest {
  const value: unknown = JSON.parse(input ?? "null")
  if (!record(value) || Object.keys(value).sort().join(",") !== "id,operation" ||
      !validCodespaceRequestId(value.id) || (value.operation !== "status" && value.operation !== "start")) {
    throw new Error("Invalid existing Codespace request")
  }
  return {id: value.id, operation: value.operation}
}

function parseLedger(input: string): CodespaceLedger {
  if (!input) return {version: 1, requests: []}
  const value: unknown = JSON.parse(input)
  if (!record(value) || Object.keys(value).sort().join(",") !== "requests,version" || value.version !== 1 ||
      !Array.isArray(value.requests) || value.requests.length > 1024) throw new Error("Invalid Codespace receipt ledger")
  const entries: Entry[] = []
  const ids = new Set<string>()
  for (const entry of value.requests) {
    if (!record(entry) || !validCodespaceRequestId(entry.id) || ids.has(entry.id) ||
        (entry.operation !== "status" && entry.operation !== "start") ||
        (entry.state !== "pending" && entry.state !== "completed") ||
        Object.keys(entry).sort().join(",") !== (entry.state === "pending" ? "id,operation,state" : "id,operation,result,state") ||
        (entry.state === "completed" && (!isCodespaceResult(entry.result) || entry.result.operation !== entry.operation))) {
      throw new Error("Invalid Codespace receipt ledger")
    }
    ids.add(entry.id)
    entries.push(entry.state === "pending" ? {id: entry.id, operation: entry.operation, state: "pending"} :
      {id: entry.id, operation: entry.operation, state: "completed", result: entry.result as CodespaceResult})
  }
  return {version: 1, requests: entries}
}

/**
 * Executes one explicit host-assigned operation under the [Tool law](README.md).
 * Pending start is persisted before the native call and remains uncertain after
 * any interruption. Replaying that identity never resends a start. Completed
 * receipts survive restart; status can use a new identity to observe again.
 * [Tests](./run.spec.ts) inject the public Environment and Mass interfaces.
 */
export default async function runCodespace(input: CodespaceRunInput): Promise<{
  ack: true; ackId: string; response: string | null; error: string | null
}> {
  let ackId = ""
  try {
    input.signal.throwIfAborted()
    const request = parseRequest(input.request)
    ackId = request.id
    const ledger = parseLedger(await input.mass.receipt.readText())
    const previous = ledger.requests.find(entry => entry.id === request.id)
    if (previous && previous.operation !== request.operation) throw new Error("Codespace request identity already has another operation")
    if (previous?.state === "completed") return {ack: true, ackId, response: JSON.stringify(previous.result), error: null}
    if (previous?.state === "pending" && request.operation === "start") {
      throw new Error("Codespace start outcome is uncertain; observe status and request an explicit new action")
    }
    if (!input.environment) throw new Error("Codespace host capability is not assigned")
    const snapshot = await input.environment.read()
    const method = request.operation === "status" ? CODESPACE_STATUS_METHOD : CODESPACE_START_METHOD
    if (snapshot.actor.meta !== CODESPACE_META || !snapshot.operations.some(operation => operation.name === method)) {
      throw new Error("Codespace host capability is not assigned to this Tool")
    }
    if (!previous && ledger.requests.length >= 1024) throw new Error("Codespace receipt ledger is full")
    const entry: Entry = previous ?? {id: request.id, operation: request.operation, state: "pending"}
    if (!previous) ledger.requests.push(entry)
    if (request.operation === "start") await input.mass.receipt.write(ledger)
    input.signal.throwIfAborted()
    const result = request.operation === "status" ? await input.environment.call(CODESPACE_STATUS_METHOD, {}) :
      await input.environment.call(CODESPACE_START_METHOD, {requestId: request.id})
    if (!isCodespaceResult(result) || result.operation !== request.operation) throw new Error("Invalid Codespace host result")
    input.signal.throwIfAborted()
    entry.state = "completed"
    entry.result = result
    await input.mass.receipt.write(ledger)
    input.signal.throwIfAborted()
    return {ack: true, ackId, response: JSON.stringify(result), error: null}
  } catch (error) {
    return {ack: true, ackId, response: null, error: error instanceof Error ? error.message : "Codespace operation failed"}
  }
}
