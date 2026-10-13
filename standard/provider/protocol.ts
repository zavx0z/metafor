/** Pure closed protocol between a Chat and its owned Provider; no native resources or registry lookup. @packageDocumentation */
import {parseProviderExecutionSettings} from "@metafor/types/metafor/provider-validation"
import type {ProviderBinding, ProviderDiscoveryRequest} from "@metafor/types/metafor/providers"

export type ProviderTurnOutcome = "completed" | "not-sent" | "uncertain"
export type ProviderTurnRequest = {operation?: "settings"; selection?: {model?: string; reasoning?: string}; id: string; prompt: string; sessionId: string | null; providerRef: string; expectedBinding: ProviderBinding | null}
export type ProviderTurnResult = {ack: true; ackId: string; response: string | null; error: string | null; sessionId: string | null;
  outcome: ProviderTurnOutcome; providerRef: string; bindingDescriptor: string | null}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
export const nativeIdentity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
export const providerAtomRef = (value: unknown): value is string => typeof value === "string" && /^atom:[1-9][0-9]*$/.test(value)
export const sameProviderBinding = (a: ProviderBinding | null, b: ProviderBinding | null): boolean => a === null || b === null ? a === b :
  (["id", "service", "host", "remotePeerId", "executorId", "assignmentId"] as const).every(key => a[key] === b[key])

export function parseProviderBinding(value: unknown): ProviderBinding {
  const id = (input: unknown) => typeof input === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(input)
  if (!exact(value, ["id", "service", "host", "remotePeerId", "executorId", ...(object(value) && Object.hasOwn(value, "assignmentId") ? ["assignmentId"] : [])]) ||
      ![value.id, value.service, value.host, value.remotePeerId, value.executorId].every(id) || value.assignmentId !== undefined && !id(value.assignmentId)) throw new Error("Invalid Provider binding")
  return structuredClone(value) as unknown as ProviderBinding
}

/** Закрытый ordinary discovery intent; caller не передаёт capabilities, checks или provenance. */
export function parseProviderDiscoveryRequest(value: unknown): ProviderDiscoveryRequest {
  if (!exact(value, ["id", ...(object(value) && Object.hasOwn(value, "register") ? ["register"] : []), ...(object(value) && Object.hasOwn(value, "configure") ? ["configure"] : []), ...(object(value) && Object.hasOwn(value, "check") ? ["check"] : [])]) ||
      typeof value.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.id)) throw new Error("Invalid Provider discovery request")
  if (["register", "configure", "check"].filter(key => Object.hasOwn(value, key)).length > 1 || value.check !== undefined && (typeof value.check !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.check))) throw new Error("Invalid Provider discovery operation")
  return {id: value.id, ...(Object.hasOwn(value, "register") ? {register: parseProviderBinding(value.register)} : {}),
    ...(Object.hasOwn(value, "configure") ? {configure: parseProviderExecutionSettings(value.configure)} : {}), ...(typeof value.check === "string" ? {check: value.check} : {})}
}
export function parseProviderTurnRequest(value: unknown): ProviderTurnRequest {
  if (!exact(value, ["id", "prompt", "sessionId", "providerRef", "expectedBinding", ...(object(value) && value.operation !== undefined ? ["operation", "selection"] : [])]) || !nativeIdentity(value.id) ||
      typeof value.prompt !== "string" || value.operation !== "settings" && !value.prompt.trim() || value.prompt.length > 2 * 1024 * 1024 ||
      !(value.sessionId === null || nativeIdentity(value.sessionId)) || !providerAtomRef(value.providerRef)) throw new Error("Invalid Provider turn request")
  if (value.operation !== undefined && (value.operation !== "settings" || !object(value.selection) || Object.keys(value.selection).some(key => key !== "model" && key !== "reasoning") || Object.values(value.selection).some(item => !nativeIdentity(item)))) throw new Error("Invalid Provider settings intent")
  if (value.expectedBinding !== null) parseProviderBinding(value.expectedBinding)
  return structuredClone(value) as unknown as ProviderTurnRequest
}
export function parseProviderTurnResult(value: unknown): ProviderTurnResult {
  if (!exact(value, ["ack", "ackId", "response", "error", "sessionId", "outcome", "providerRef", "bindingDescriptor"]) ||
      value.ack !== true || !nativeIdentity(value.ackId) || !providerAtomRef(value.providerRef) || !(value.sessionId === null || nativeIdentity(value.sessionId)) ||
      !(value.bindingDescriptor === null || typeof value.bindingDescriptor === "string")) throw new Error("Invalid Provider turn receipt")
  if (value.bindingDescriptor !== null) parseProviderBinding(JSON.parse(value.bindingDescriptor as string))
  if (value.outcome === "completed") {
    if (typeof value.response !== "string" || !value.response.trim() || value.error !== null || value.sessionId === null || value.bindingDescriptor === null) throw new Error("Invalid completed Provider receipt")
  } else if (value.outcome === "not-sent" || value.outcome === "uncertain") {
    if (value.response !== null || typeof value.error !== "string" || !value.error.trim()) throw new Error("Invalid refused Provider receipt")
  } else throw new Error("Unknown Provider receipt outcome")
  return structuredClone(value) as unknown as ProviderTurnResult
}
