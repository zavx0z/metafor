/** Provider owns every external model effect and durable receipt; Chat only coordinates its own child. @packageDocumentation */
import type {ProviderBinding, ProviderRegistry} from "@metafor/types/metafor/providers"
import type {ProviderTurnInput} from "./runtime-types"
import {parseProviderRegistry, resolveProviderBinding} from "./catalog"
import {authorizedProviderDriver} from "./driver"
import {nativeIdentity as identity, parseProviderBinding, parseProviderTurnRequest as request, parseProviderTurnResult, sameProviderBinding as sameBinding,
  type ProviderTurnRequest as Request, type ProviderTurnResult, type ProviderTurnOutcome} from "./protocol"

type Row = {request: Request; phase: "opening" | "configuring" | "prompting" | "completed" | "failed"; result: ProviderTurnResult | null}
type Ledger = {version: 1; providerRef: string; binding: ProviderBinding | null; sessionId: string | null; requests: Row[]}
const writers = new WeakSet<object>()
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
function ledger(value: unknown, providerRef: string): Ledger {
  if (value === null) return {version: 1, providerRef, binding: null, sessionId: null, requests: []}
  if (!exact(value, ["version", "providerRef", "binding", "sessionId", "requests"]) || value.version !== 1 || value.providerRef !== providerRef ||
      !(value.sessionId === null || identity(value.sessionId)) || !Array.isArray(value.requests) || value.requests.length > 1024) throw new Error("Invalid Provider turns Mass")
  if (value.binding !== null) parseProviderBinding(value.binding)
  const ids = new Set<string>()
  for (const row of value.requests) {
    if (!exact(row, ["request", "phase", "result"]) || !["opening", "configuring", "prompting", "completed", "failed"].includes(String(row.phase))) throw new Error("Invalid Provider retained turn")
    const input = request(row.request)
    if (ids.has(input.id)) throw new Error("Duplicate Provider retained turn")
    ids.add(input.id)
    if (row.phase === "completed" || row.phase === "failed") {
      const result = parseProviderTurnResult(row.result)
      if (result.ackId !== input.id || result.providerRef !== providerRef || (row.phase === "completed" ? result.outcome !== "completed" : result.outcome !== "not-sent") ||
          result.sessionId !== null && result.sessionId !== value.sessionId ||
          result.bindingDescriptor !== null && !sameBinding(parseProviderBinding(JSON.parse(result.bindingDescriptor)), value.binding as ProviderBinding | null)) throw new Error("Invalid Provider retained receipt")
    } else if (row.result !== null) throw new Error("Pending Provider turn cannot claim a receipt")
  }
  return structuredClone(value) as unknown as Ledger
}

/**
Only an explicit request opens a driver. Binding comes from own registry Mass;
native configuration only authorizes its transport. Opening/prompting are
durable before effects. A restored opening proves no prompt started; prompting
is uncertain and blocks every automatic resend. A retained native identity can
never be transferred to a different Provider Atom or catalog assignment.
*/
export default async function turn(input: ProviderTurnInput): Promise<ProviderTurnResult> {
  input.signal.throwIfAborted()
  const raw: unknown = JSON.parse(input.request ?? "null"), task = request(raw)
  if (!/^[1-9][0-9]*$/.test(input.self.atom)) throw new Error("Invalid Provider actor")
  const providerRef = `atom:${input.self.atom}`
  let resolved: ProviderBinding | null = null
  const receipt = (outcome: ProviderTurnOutcome, response: string | null, error: string | null, sessionId: string | null): ProviderTurnResult =>
    ({ack: true, ackId: task.id, response, error, sessionId, outcome, providerRef, bindingDescriptor: resolved === null ? null : JSON.stringify(resolved)})
  const handle = input.mass.turns
  if (writers.has(handle) || input.energy.connection !== undefined) throw new Error("Provider already owns an active turn")
  writers.add(handle)
  try {
    const state = ledger(JSON.parse(await handle.readText() || "null"), providerRef)
    resolved = state.binding
    const previous = state.requests.find(row => row.request.id === task.id)
    if (previous && (previous.request.operation !== task.operation || JSON.stringify(previous.request.selection) !== JSON.stringify(task.selection) || previous.request.prompt !== task.prompt || previous.request.sessionId !== task.sessionId || previous.request.providerRef !== task.providerRef || !sameBinding(previous.request.expectedBinding, task.expectedBinding)))
      return receipt("not-sent", null, "Provider request identity already belongs to different content", state.sessionId)
    if (previous?.result) return structuredClone(previous.result)
    if (state.requests.some(row => (row.phase === "prompting" || row.phase === "configuring"))) return receipt("uncertain", null, "Provider prompt outcome is uncertain; automatic resend is forbidden", state.sessionId)
    const save = async () => {
      input.signal.throwIfAborted()
      if (Buffer.byteLength(JSON.stringify(state)) > 8 * 1024 * 1024) throw new Error("Provider turn ledger exceeds its limit")
      await handle.write(state)
      input.signal.throwIfAborted()
    }
    for (const row of state.requests) if (row.phase === "opening") {
      row.phase = "failed"
      row.result = {...receipt("not-sent", null, "Provider stopped before prompt started", state.sessionId), ackId: row.request.id}
    }
    if (previous?.result) {await save(); return structuredClone(previous.result)}
    if (state.requests.length >= 1024) return receipt("not-sent", null, "Provider turn ledger is full", state.sessionId)
    const row: Row = {request: task, phase: "opening", result: null}
    state.requests.push(row)
    const refuse = async (message: string) => {
      row.phase = "failed"
      const selected = resolved
      resolved = state.binding
      row.result = receipt("not-sent", null, message, state.sessionId)
      resolved = selected
      await save()
      return structuredClone(row.result)
    }
    if (task.providerRef !== null && task.providerRef !== providerRef) return await refuse("Provider Atom does not match the retained Chat")
    let registry: ProviderRegistry
    try {
      registry = parseProviderRegistry(JSON.parse(await input.mass.registry.readText() || "null"))
      const selected = input.binding ?? registry.settings.selectedId
      if (!selected) throw new Error("Provider has no selected canonical assignment")
      const next = resolveProviderBinding(registry, selected)
      resolved = next
    } catch (error) {return await refuse(error instanceof Error ? error.message : "Provider catalog is unavailable")}
    if (state.binding !== null && !sameBinding(state.binding, resolved)) return await refuse("Retained Provider binding cannot change")
    if (task.expectedBinding !== null && !sameBinding(task.expectedBinding, resolved)) return await refuse("Provider assignment does not match the retained Chat")
    if (task.sessionId !== state.sessionId) return await refuse("Native session is not owned by this Provider")
    state.binding = resolved
    await save()
    let promptStarted = false
    try {
      const driver = input.driver ?? await authorizedProviderDriver(resolved)
      if (driver.binding && !sameBinding(driver.binding, resolved)) throw new Error("Driver does not match canonical Provider binding")
      const newSession = state.sessionId === null
      const connection = await driver.open({sessionId: state.sessionId, signal: input.signal})
      input.energy.connection = connection
      input.signal.throwIfAborted()
      if (!identity(connection.sessionId) || state.sessionId !== null && connection.sessionId !== state.sessionId) throw new Error("Provider changed its retained native identity")
      state.sessionId = connection.sessionId
      await save()
      if (newSession && resolved.service === "ollama" && task.operation !== "settings" && connection.settings) {
        const defaults = registry.settings.configuration?.general
        if (defaults?.connectionId && registry.settings.connectionBindings?.[defaults.connectionId] === resolved.id && (defaults.model || defaults.thoughtLevel)) {
          row.phase = "configuring"
          await save()
          promptStarted = true
          await connection.settings({...(defaults.model ? {model: defaults.model} : {}), ...(defaults.thoughtLevel ? {reasoning: defaults.thoughtLevel} : {})}, input.signal)
          promptStarted = false
        }
      }
      if (task.operation === "settings" && !connection.settings) throw new Error("Provider has no settings capability")
      row.phase = task.operation === "settings" ? Object.keys(task.selection ?? {}).length ? "configuring" : "opening" : "prompting"
      await save()
      promptStarted = task.operation !== "settings" || Object.keys(task.selection ?? {}).length > 0
      const response = task.operation === "settings"
        ? connection.settings ? JSON.stringify(await connection.settings(task.selection ?? {}, input.signal)) : (() => {throw new Error("Provider has no settings capability")})()
        : await connection.prompt(task.prompt, input.signal)
      input.signal.throwIfAborted()
      if (typeof response !== "string" || !response.trim()) throw new Error("Provider returned no final text")
      row.phase = "completed"
      row.result = receipt("completed", response, null, state.sessionId)
      await save()
      return structuredClone(row.result)
    } catch (error) {
      input.signal.throwIfAborted()
      if (error instanceof Error && Object.getOwnPropertyDescriptor(error, "providerEffect")?.value === "not-started") promptStarted = false
      const result = receipt(promptStarted ? "uncertain" : "not-sent", null, error instanceof Error ? error.message : "Provider turn failed", state.sessionId)
      if (!promptStarted) {row.phase = "failed"; row.result = result; await save()}
      return result
    } finally {
      const connection = input.energy.connection
      await connection?.close()
      if (input.energy.connection === connection) delete input.energy.connection
    }
  } finally {writers.delete(handle)}
}
