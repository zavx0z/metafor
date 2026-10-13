/** Isolated test composition of the real Chat and Provider actions; no native registry or network is invented. */
import sending, {receive} from "../../send"
import turn from "@metafor/provider/turn"
import {createProviderRegistry} from "@metafor/provider/catalog"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {ChatSendInput, ChatResult} from "../../types"
import type {ProviderBinding as ChatProviderBinding} from "@metafor/types/metafor/providers"
import type {ProviderDriver as ChatDriver, ProviderEnergy as ChatEnergy} from "@metafor/provider/runtime-types"

type Input = ChatSendInput & {energy: ChatEnergy; driver: ChatDriver}
type Own = {registry: MassHandle; turns: MassHandle; providerRef: string}
const instances = new WeakMap<object, Own>()
const legacy: ChatProviderBinding = {id: "legacy-codex", service: "codex", host: "native", remotePeerId: "native", executorId: "codex"}
const memory = (initial: unknown): MassHandle => {
  let text = initial === null ? "" : JSON.stringify(initial)
  return {async readText() {return text}, async readJson() {return text ? JSON.parse(text) : null}, async readBytes() {return new TextEncoder().encode(text)}, async write(value) {text = JSON.stringify(value)}}
}
const result = (value: ChatResult): ChatResult => ({ackId: value.ackId, response: value.response, error: value.error, sessionId: value.sessionId})
export async function captureProvider(session: MassHandle) {
  const own = instances.get(session)
  if (!own) throw new Error("No owned Provider fixture")
  return {registry: await own.registry.readText(), turns: await own.turns.readText(), providerRef: own.providerRef}
}
export function restoreProvider(session: MassHandle, saved: Awaited<ReturnType<typeof captureProvider>>) {
  instances.set(session, {registry: memory(JSON.parse(saved.registry)), turns: memory(saved.turns ? JSON.parse(saved.turns) : null), providerRef: saved.providerRef})
}
export default async function cycle(input: Input): Promise<ChatResult> {
  let own = instances.get(input.mass.session)
  if (!own) {
    const binding = input.driver.binding ?? legacy
    const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected",
      capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: null, message: null}}])
    registry.settings.selectedId = binding.id
    own = {registry: memory(registry), turns: memory(null), providerRef: "atom:40"}
    instances.set(input.mass.session, own)
  }
  const first = await sending({...input, providerRef: own.providerRef})
  if (first.ack) return result(first)
  const response = await turn({request: first.providerRequest, binding: input.binding ?? null, mass: own, energy: input.energy, self: {atom: "40"}, driver: input.driver, signal: input.signal})
  return result(await receive({...input, providerRef: response.providerRef, providerAck: response.ack, providerAckId: response.ackId,
    providerResponse: response.response, providerError: response.error, providerSessionId: response.sessionId,
    providerOutcome: response.outcome, providerBindingDescriptor: response.bindingDescriptor}))
}
