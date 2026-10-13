import {providerConnectionOptions} from "./provider-options"
import {providerConnections} from "./provider-connections"
import {parseProviderExecutionSettings} from "@metafor/types/metafor/provider-validation"
import {providerSettings} from "./provider-settings"
/**
Release-owned local browser adapter for readAgents, readGraph, own Chat Mass,
explicit slot connection, initial Provider selection and assigned profile intent.
All domain access uses public Oracle calls; there is
no second operation registry, private Store access or autonomous task decision.
@packageDocumentation
*/
import {READ_AGENTS_METHOD, STANDARD_AGENT_META, observeAgentConfiguration, type ReadAgentsReceipt} from "@metafor/types/metafor/agent-observation"
import {READ_GRAPH_METHOD, validateGraph, type Graph, type RuntimeAtom, type RuntimeNode} from "@metafor/types/metafor/graph"
import {isLoopbackAddress, OracleRpcPeer, OracleRpcRemoteError} from "shared/transport/oracle"
import {createLocalOracleChannelPair} from "../../../quantum/dark/oracle/local"
import {DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD,
  type DarkForceHistoryReadReceipt, type EnergyMassResultReadReceipt, type MetaFieldValueApplyReceipt} from "shared/protocol/metafor/observation"
import {AGENT_UI_PATH, AGENT_UI_SCHEMA, AGENT_UI_TASK_SCHEMA, AGENT_UI_PROVIDER_PATH, AGENT_UI_PROVIDER_SCHEMA, AGENT_UI_CONNECT_PATH, AGENT_UI_CONNECT_SCHEMA, AGENT_UI_PROFILE_PATH, AGENT_UI_CONNECTIONS_PATH, isAgentUiVerseId, type AgentUiSlot, type AgentUiFailure, type AgentUiItem, type AgentUiSnapshot, type AgentUiTaskRequest, type AgentUiTaskReceipt} from "../shared/agents"
import {readAgentProvider, readProviderRegistry} from "./agent-provider"
import {providerRegistryOwners, type AgentUiProviderRegistry, type AgentUiProviderRegistryError} from "../shared/agents"
import {createAgentBrowserBridge} from "./agents-browser"
import {AGENT_BROWSER_PATH} from "../shared/agents-browser"
import {PROFILE_READ_METHOD, PROFILE_INTENT_METHOD, isProfileIntentRefusal, type ProfileCatalogReceipt} from "@metafor/types/metafor/profile-intent"

type Peer = Pick<OracleRpcPeer, "call">
type Host = {requestIP(request: Request): {address: string} | null}
const MAX_REQUEST = 512 * 1024
const MAX_AGENTS = 64
const MAX_SESSION = 4 * 1024 * 1024
const MAX_SNAPSHOT = 16 * 1024 * 1024
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

class AgentUiError extends Error {
  constructor(readonly status: number, readonly code: AgentUiFailure["error"]["code"], message: string) {super(message)}
}

const denied = () => new AgentUiError(403, "forbidden", "Agent UI is restricted to its local same-origin world")
const invalid = () => new AgentUiError(400, "invalid_request", "Agent UI requires one bounded declared request")
const unavailable = () => new AgentUiError(503, "world_unavailable", "The current agent world is unavailable")

export function authorizeAgentRequest(request: Request, host: Host) {
  const url = new URL(request.url)
  const origin = request.headers.get("origin")
  const site = request.headers.get("sec-fetch-site")
  if (!isLoopbackAddress(host.requestIP(request)?.address) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      request.headers.has("forwarded") || request.headers.has("x-forwarded-host") ||
      site !== null && site !== "same-origin" && site !== "none" || origin !== null && origin !== url.origin ||
      ["POST", "DELETE"].includes(request.method) && origin !== url.origin) throw denied()
}

function taskRequest(value: unknown): AgentUiTaskRequest {
  if (!exact(value, ["agentRef", "task"]) || typeof value.agentRef !== "string" || !/^atom:[A-Za-z0-9._:-]{1,128}$/.test(value.agentRef) || !object(value.task)) throw invalid()
  const task = value.task
  if (!exact(task, task.mode === "scenario" ? ["id", "text", "mode", "scenario"] : task.mode === "codespace" ? ["id", "text", "mode", "operation"] : task.mode === "development" && "maxSteps" in task ? ["id", "text", "mode", "maxSteps"] : ["id", "text", "mode"]) ||
      typeof task.id !== "string" || !task.id || task.id.length > 180 || task.id.trim() !== task.id || /[\u0000-\u001f\u007f]/u.test(task.id) ||
      typeof task.text !== "string" || !task.text.trim() || task.text.length > 64 * 1024 ||
      task.mode !== "conversation" && task.mode !== "scenario" && task.mode !== "codespace" && task.mode !== "development" ||
      task.mode === "development" && "maxSteps" in task && (!Number.isSafeInteger(task.maxSteps) || (task.maxSteps as number) < 1 || (task.maxSteps as number) > 64) ||
      task.mode === "scenario" && task.scenario !== "agent-system.integrity" ||
      task.mode === "codespace" && task.operation !== "status" && task.operation !== "start") throw invalid()
  return value as unknown as AgentUiTaskRequest
}

export async function readAgentBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json" || !request.body) throw invalid()
  const reader = request.body.getReader()
  const timeout = setTimeout(() => {void reader.cancel().catch(() => {})}, 5000)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.byteLength
      if (size > MAX_REQUEST) throw invalid()
      chunks.push(item.value)
    }
    try {return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks)))} catch {throw invalid()}
  } catch (error) {await reader.cancel().catch(() => {}); throw error}
  finally {clearTimeout(timeout); reader.releaseLock()}
}

function atoms(graph: Graph) {
  const pending: RuntimeNode[] = [...graph.runtime.roots]
  const result = new Map<string, RuntimeAtom>()
  for (let index = 0; index < pending.length; index++) {
    const node = pending[index]!
    if (node.kind === "atom") result.set(node.ref, node)
    pending.push(...(node.children ?? []))
  }
  return result
}

function slots(graph: Graph): AgentUiSlot[] {
  const result: AgentUiSlot[] = []
  const visit = (node: RuntimeNode, owner: RuntimeAtom | null) => {
    if (node.kind === "atom" && node.meta === "@metafor/agent-slot" && typeof node.values.enabled === "boolean"
      && graph.template[node.meta]?.fields.some(field => field.key === "enabled" && field.type === "boolean")) result.push({ref: node.ref, meta: "@metafor/agent-slot",
      owner: owner ? {ref: owner.ref, meta: owner.meta} : null, enabled: node.values.enabled, state: node.state, configuration: observeAgentConfiguration(node.values.configuration)})
    for (const child of node.children ?? []) visit(child, node.kind === "atom" ? node : owner)
  }
  for (const node of graph.runtime.roots) visit(node, null)
  if (result.length > MAX_AGENTS) throw unavailable()
  return result
}

const busy = (atom: RuntimeAtom): boolean => atom.values.task !== undefined && atom.values.task !== null ||
  !["idle", "completed", "failed"].includes(String(atom.values.status ?? "")) || !["idle", "done", "failed"].includes(atom.state ?? "")

function chatBindingLocked(read: EnergyMassResultReadReceipt | null): boolean {
  if (!read || read.content.format !== "json") return true
  if (!read.content.present || read.content.value === null) return false
  const value = read.content.value
  return !object(value) || value.sessionId !== null || !Array.isArray(value.requests) || value.requests.length !== 0 || !Array.isArray(value.messages) || value.messages.length !== 0
}

/**
Only a user POST admits an intention. A slot connection changes only its declared
enabled Field; profile lifecycle stays with the assigned Energy Oracle. Reads
share one in-flight observation and do not start a provider. The revision is
accepted history position, not a cache key for
ordinary Graph/Mass reads: consumers keep observing while a task is active.
There is no public Photon subscription in this slice; polling is labelled.
[Checks](../spec/agents-connection-profile.spec.ts) cover explicit connection,
duplicate admission, exact owning profile targets and absence of automatic work.
*/
export function createAgentUiBridge(options: {peer: Peer, admitted?: () => boolean, verseId?: string | null | undefined}) {
  const verseId = options.verseId ?? null
  if (!isAgentUiVerseId(verseId)) throw new Error("Invalid assigned COSMOS_VERSE_ID address")
  let closed = false
  let snapshot: Promise<AgentUiSnapshot> | undefined
  const tasks = new Set<string>()
  const stopped = Promise.withResolvers<never>()
  void stopped.promise.catch(() => {})
  const ready = () => {if (closed || options.admitted?.() === false) throw unavailable()}
  const bounded = async <T>(work: Promise<T>): Promise<T> => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {return await Promise.race([work, stopped.promise, new Promise<never>((_resolve, reject) => {timeout = setTimeout(() => reject(unavailable()), 10_000)})])}
    finally {clearTimeout(timeout)}
  }
  const frontier = async () => (await options.peer.call<DarkForceHistoryReadReceipt>("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})).frontier
  const profiles = async () => {
    ready()
    const receipt = await options.peer.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})
    if (receipt.schema !== "metafor/profile-targets/v1" || receipt.version !== 1 || !Array.isArray(receipt.targets) || receipt.targets.length > 64) throw unavailable()
    ready()
    return receipt
  }
  const world = async () => {
    ready()
    const [observation, graph] = await Promise.all([
      options.peer.call<ReadAgentsReceipt>("dark", READ_AGENTS_METHOD, {}),
      options.peer.call<Graph>("dark", READ_GRAPH_METHOD, {}),
    ])
    ready()
    if (observation.root !== graph.root || observation.agents.length > MAX_AGENTS) throw unavailable()
    return {observation, graph, byRef: atoms(graph)}
  }
  const read = () => snapshot ??= (async (): Promise<AgentUiSnapshot> => {
    const {observation, graph, byRef} = await world()
    if (!validateGraph(graph).ok) throw unavailable()
    const owners = providerRegistryOwners(graph)
    if (owners.length > MAX_AGENTS) throw unavailable()
    const registryReads = new Map<string, ReturnType<typeof readProviderRegistry>>()
    const readRegistry = (ref: RuntimeAtom["ref"]) => {let read = registryReads.get(ref); if (!read) {read = readProviderRegistry(options.peer, graph, ref); registryReads.set(ref, read)}; return read}
    const providerRegistries: AgentUiProviderRegistry[] = [], providerRegistryErrors: AgentUiProviderRegistryError[] = []
    let registryBytes = 0
    for (const owner of owners) {
      try {const read = await readRegistry(owner.ref); providerRegistries.push(read); registryBytes += Buffer.byteLength(JSON.stringify(read)); if (registryBytes > MAX_SNAPSHOT) throw unavailable()}
      catch (error) {if (error instanceof AgentUiError) throw error; providerRegistryErrors.push({ref: owner.ref, message: "Owner Provider registry is unavailable"})}
      ready()
    }
    const agents: AgentUiItem[] = []
    let sessionBytes = 0
    for (const observed of observation.agents) {
      const atom = byRef.get(observed.ref)
      if (!atom || atom.meta !== observed.meta) throw unavailable()
      let chatSession: EnergyMassResultReadReceipt | null = null
      let chatError: string | null = null
      if (observed.chat?.session) {
        const chat = observed.chat
        try {
          chatSession = await options.peer.call<EnergyMassResultReadReceipt>("energy", ENERGY_MASS_RESULT_READ_METHOD,
            {contractVersion: 1, atom: {root: graph.root, ref: chat.ref, meta: chat.meta}, key: "session", maxBytes: MAX_SESSION})
          if (chatSession.atom.root !== graph.root || chatSession.atom.ref !== chat.ref || chatSession.atom.meta !== chat.meta || chatSession.key !== "session" || chatSession.content.format !== "json") throw unavailable()
        } catch {chatSession = null; chatError = "The Agent's own Chat session cannot be read"}
      }
      if (chatSession) {
        if (!Number.isSafeInteger(chatSession.bytes) || chatSession.bytes < 0 || chatSession.bytes > MAX_SESSION) throw unavailable()
        sessionBytes += chatSession.bytes
        if (sessionBytes > MAX_SNAPSHOT) throw unavailable()
      }
      ready()
      let providers: AgentUiItem["providers"] = null
      let providerError: string | null = null
      try {providers = await readAgentProvider(options.peer, graph, observed.ref, undefined, readRegistry)}
      catch {providerError = "The Agent's canonical Provider registry cannot be read"}
      agents.push({...structuredClone(observed), error: typeof atom.values.error === "string" ? atom.values.error : null,
        activeTaskId: typeof atom.values.activeTaskId === "string" ? atom.values.activeTaskId : null,
        busy: busy(atom), chatSession, chatError, providers, providerError,
        providerBinding: {id: typeof atom.values.providerBinding === "string" ? atom.values.providerBinding : null, locked: chatBindingLocked(chatSession)}})
    }
    const revision = await frontier()
    let profileCatalog: ProfileCatalogReceipt | null = null
    let profileError: string | null = null
    try {profileCatalog = await profiles()} catch {profileError = "Assigned profile capabilities are unavailable"}
    ready()
    const result: AgentUiSnapshot = {schema: AGENT_UI_SCHEMA, version: 1, root: graph.root, graph, verseId,
      observedWorld: {root: graph.root, cutId: revision.cutId}, revision,
      observation: {mechanism: "public-oracle-poll", photonSubscription: false}, agents, providerRegistries, providerRegistryErrors, connectableSlots: slots(graph), profiles: profileCatalog, profileError}
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_SNAPSHOT) throw unavailable()
    return result
  })().finally(() => {snapshot = undefined})

  const submit = async (request: AgentUiTaskRequest): Promise<AgentUiTaskReceipt> => {
    ready()
    if (tasks.size >= 8 || tasks.has(request.agentRef)) throw new AgentUiError(409, "busy", "The Agent is already admitting a task or the admission limit is reached")
    tasks.add(request.agentRef)
    try {
      const {observation, graph, byRef} = await world()
      const observed = observation.agents.find(agent => agent.ref === request.agentRef && agent.meta === STANDARD_AGENT_META)
      const atom = byRef.get(request.agentRef)
      if (!observed || !atom || atom.meta !== observed.meta) throw invalid()
      if (request.task.mode === "development" && (observed.configuration.resolution !== "exact" || !observed.configuration.value?.tools.some(tool =>
        tool.name === "bun.evaluate" && tool.owner?.meta === "@metafor/repl" && object(tool.input) && Object.keys(tool.input).length === 0))) throw invalid()
      if (busy(atom)) throw new AgentUiError(409, "busy", "The Agent is busy; its task Field is not a queue")
      const expectedFrontier = await frontier()
      ready()
      const receipt = await options.peer.call<MetaFieldValueApplyReceipt>("dark", META_FIELD_VALUE_APPLY_METHOD,
        {contractVersion: 1, atom: {root: graph.root, ref: atom.ref, meta: atom.meta}, field: "task", value: JSON.stringify(request.task), expectedFrontier})
      return {schema: AGENT_UI_TASK_SCHEMA, version: 1, agentRef: atom.ref, taskId: request.task.id, receipt}
    } catch (error) {
      if (error instanceof AgentUiError) throw error
      throw new AgentUiError(409, "conflict", "The task was not confirmed; refresh the world before deciding whether to retry")
    } finally {tasks.delete(request.agentRef)}
  }

  const selectProvider = async (value: unknown) => {
    if (!exact(value, ["agentRef", "entryId"]) || typeof value.agentRef !== "string" || !/^atom:[A-Za-z0-9._:-]{1,128}$/.test(value.agentRef) ||
      typeof value.entryId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.entryId)) throw invalid()
    const agentRef = value.agentRef
    if (tasks.has(agentRef) || tasks.size >= 8) throw new AgentUiError(409, "busy", "The Agent is already admitting an action")
    tasks.add(agentRef)
    try {
      const expectedFrontier = await frontier()
      const {observation, graph, byRef} = await world()
      const observed = observation.agents.find(agent => agent.ref === agentRef)
      const atom = byRef.get(agentRef)
      if (!observed?.chat || !atom || atom.meta !== STANDARD_AGENT_META || !Object.hasOwn(atom.values, "providerBinding")) throw invalid()
      if (busy(atom)) throw new AgentUiError(409, "busy", "The Agent is busy")
      const provider = await readAgentProvider(options.peer, graph, agentRef)
      const selected = provider.registry.entries.find(entry => entry.id === value.entryId)
      if (!selected || selected.resolution !== "exact" || selected.connection !== "connected" || !selected.capabilities.modelTurn || selected.checks.status === "failed") throw invalid()
      const chat = observed.chat
      const session = await options.peer.call<EnergyMassResultReadReceipt>("energy", ENERGY_MASS_RESULT_READ_METHOD,
        {contractVersion: 1, atom: {root: graph.root, ref: chat.ref, meta: chat.meta}, key: "session", maxBytes: MAX_SESSION})
      if (session.atom.root !== graph.root || session.atom.ref !== chat.ref || session.atom.meta !== chat.meta || session.key !== "session" || session.resolution !== "exact") throw unavailable()
      if (chatBindingLocked(session)) throw new AgentUiError(409, "new_session_required", "This Chat retains requests or a native session; changing Provider requires an explicit new-session flow and preserves its history")
      const current = await frontier()
      if (JSON.stringify(current) !== JSON.stringify(expectedFrontier)) throw new AgentUiError(409, "conflict", "The world changed; refresh before selecting a Provider")
      ready()
      const receipt = await options.peer.call<MetaFieldValueApplyReceipt>("dark", META_FIELD_VALUE_APPLY_METHOD,
        {contractVersion: 1, atom: {root: graph.root, ref: atom.ref, meta: atom.meta}, field: "providerBinding", value: value.entryId, expectedFrontier})
      return {schema: AGENT_UI_PROVIDER_SCHEMA, version: 1, agentRef, entryId: value.entryId, receipt}
    } finally {tasks.delete(agentRef)}
  }

  const connectSlot = async (value: unknown) => {
    if (!exact(value, ["slotRef", "enabled"]) || typeof value.slotRef !== "string" || !/^atom:[A-Za-z0-9._:-]{1,128}$/.test(value.slotRef) || value.enabled !== true) throw invalid()
    if (tasks.size >= 8 || tasks.has(value.slotRef)) throw new AgentUiError(409, "busy", "The slot is already admitting a connection")
    const ref = value.slotRef
    tasks.add(ref)
    try {
      const expectedFrontier = await frontier()
      const graph = await options.peer.call<Graph>("dark", READ_GRAPH_METHOD, {})
      const slot = slots(graph).find(slot => slot.ref === ref)
      if (!slot || !slot.owner || slot.configuration.resolution !== "exact") throw invalid()
      ready()
      if (slot.enabled) return {schema: AGENT_UI_CONNECT_SCHEMA, version: 1, slotRef: ref, enabled: true, acceptance: "observed"}
      const current = await frontier()
      if (JSON.stringify(current) !== JSON.stringify(expectedFrontier)) throw new AgentUiError(409, "conflict", "The slot changed; refresh before connecting")
      ready()
      const receipt = await options.peer.call<MetaFieldValueApplyReceipt>("dark", META_FIELD_VALUE_APPLY_METHOD,
        {contractVersion: 1, atom: {root: graph.root, ref, meta: "@metafor/agent-slot"}, field: "enabled", value: true, expectedFrontier})
      return {schema: AGENT_UI_CONNECT_SCHEMA, version: 1, slotRef: ref, enabled: true, acceptance: "admitted", receipt}
    } finally {tasks.delete(ref)}
  }

  return {close() {if (closed) return; closed = true; stopped.reject(unavailable())}, async fetch(request: Request, host: Host): Promise<Response> {
    try {
      const path = new URL(request.url).pathname
      if (path !== AGENT_UI_PATH && path !== AGENT_UI_PROVIDER_PATH && path !== AGENT_UI_CONNECT_PATH && path !== AGENT_UI_PROFILE_PATH && path !== AGENT_UI_CONNECTIONS_PATH && path !== "/agents/settings") return new Response(null, {status: 404})
      authorizeAgentRequest(request, host)
      if (new URL(request.url).search) throw invalid()
      if (path === AGENT_UI_CONNECTIONS_PATH) {
        if (request.method !== "POST") return new Response(null, {status: 405})
        const value = await readAgentBody(request)
        if (!object(value) || !exact(value, ["providerRef", ...(value.configure === undefined ? [] : ["configure"]), ...(value.check === undefined ? [] : ["check"]), ...(value.options === undefined ? [] : ["options"])]) ||
            typeof value.providerRef !== "string" || !/^atom:[1-9][0-9]*$/.test(value.providerRef) || [value.configure, value.check, value.options].filter(item => item !== undefined).length !== 1) throw invalid()
        if (value.options !== undefined) {
          if (!object(value.options) || !exact(value.options, ["connectionId", ...(value.options.model === undefined ? [] : ["model"])]) ||
              typeof value.options.connectionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.options.connectionId) ||
              value.options.model !== undefined && (typeof value.options.model !== "string" || !value.options.model || value.options.model.length > 256)) throw invalid()
          ready()
          try {return Response.json(await providerConnectionOptions(options.peer, value.providerRef, value.options as {connectionId: string; model?: string}, request.signal), {headers: {"cache-control": "no-store"}})}
          catch {throw new AgentUiError(409, "conflict", "Каталог назначенного Ollama недоступен; проверьте сервер и установленные модели")}
        }
        let operation: Parameters<typeof providerConnections>[2]
        try {
          operation = value.configure === undefined ? {check: String(value.check)} : {configure: parseProviderExecutionSettings(value.configure)}
          if ("check" in operation && (typeof value.check !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.check))) throw invalid()
        } catch {throw invalid()}
        if (tasks.has(value.providerRef) || tasks.size >= 8) throw new AgentUiError(409, "busy", "Provider уже применяет настройки")
        ready()
        tasks.add(value.providerRef)
        try {return Response.json(await providerConnections(options.peer, value.providerRef, operation, request.signal), {headers: {"cache-control": "no-store"}})}
        catch {throw new AgentUiError(409, "conflict", "Операция Provider не подтверждена; обновите состояние перед повтором")}
        finally {tasks.delete(value.providerRef)}
      }
      if (path === "/agents/settings") {
        if (request.method !== "POST") return new Response(null, {status: 405})
        const value = await readAgentBody(request)
        if (!exact(value, ["agentRef", "selection"]) || typeof value.agentRef !== "string" || !/^atom:[1-9][0-9]*$/.test(value.agentRef) || !object(value.selection) || Object.keys(value.selection).some(key => key !== "model" && key !== "reasoning") || Object.values(value.selection).some(item => typeof item !== "string" || !item || item.length > 256)) throw invalid()
        if (tasks.has(value.agentRef)) throw new AgentUiError(409, "busy", "Agent занят")
        tasks.add(value.agentRef)
        try {return Response.json(await providerSettings(options.peer, value.agentRef, value.selection, request.signal), {headers: {"cache-control": "no-store"}})}
        catch (error) {throw new AgentUiError(409, "conflict", error instanceof Error ? error.message : "Настройки не подтверждены")}
        finally {tasks.delete(value.agentRef)}
      }
      if (path === AGENT_UI_CONNECT_PATH) return request.method === "POST"
        ? Response.json(await bounded(connectSlot(await readAgentBody(request))), {status: 202, headers: {"cache-control": "no-store"}}) : new Response(null, {status: 405})
      if (path === AGENT_UI_PROFILE_PATH) {
        if (request.method === "GET") return Response.json(await bounded(profiles()), {headers: {"cache-control": "no-store"}})
        if (request.method === "POST") {ready(); const receipt = await bounded(options.peer.call("energy", PROFILE_INTENT_METHOD, await readAgentBody(request))); ready(); return Response.json(receipt, {status: 202, headers: {"cache-control": "no-store"}})}
        return new Response(null, {status: 405})
      }
      if (path === AGENT_UI_PROVIDER_PATH) return request.method === "POST"
        ? Response.json(await bounded(selectProvider(await readAgentBody(request))), {status: 202, headers: {"cache-control": "no-store"}})
        : new Response(null, {status: 405})
      if (request.method === "GET") return Response.json(await bounded(read()), {headers: {"cache-control": "no-store"}})
      if (request.method === "POST") return Response.json(await bounded(submit(taskRequest(await readAgentBody(request)))), {status: 202, headers: {"cache-control": "no-store"}})
      return new Response(null, {status: 405, headers: {Allow: "GET, POST"}})
    } catch (error) {
      const failure = error instanceof AgentUiError ? error
        : request.method === "POST" && new URL(request.url).pathname === AGENT_UI_PROFILE_PATH &&
          error instanceof OracleRpcRemoteError && error.code === "admission_refused" && isProfileIntentRefusal(error.data)
          ? new AgentUiError(409, "profile_not_admitted", error.message)
          : unavailable()
      return Response.json({error: {code: failure.code, message: failure.message}} satisfies AgentUiFailure, {status: failure.status, headers: {"cache-control": "no-store"}})
    }
  }}
}

/** Caller injects this existing Oracle channel into its one Quantum runtime. */
export function createAgentUiOracle(options: {admitted?: () => boolean, verseId?: string | null | undefined} = {}) {
  if (!isAgentUiVerseId(options.verseId ?? null)) throw new Error("Invalid assigned COSMOS_VERSE_ID address")
  const local = createLocalOracleChannelPair("cosmos-agent-ui", () => [])
  const peer = new OracleRpcPeer(local.peer)
  const bridge = createAgentUiBridge({peer, ...options})
  const browser = createAgentBrowserBridge({peer, ...options})
  let closing: Promise<void> | undefined
  return {channel: local.router, owns: browser.owns, websocket: browser.websocket, fetch(request: Request, host: Parameters<typeof browser.fetch>[1]) {
    return new URL(request.url).pathname.startsWith(AGENT_BROWSER_PATH + "/") ? browser.fetch(request, host) : bridge.fetch(request, host)
  }, close() {
    return closing ??= (async () => {bridge.close(); await browser.close(); peer.close(); await local.peer.close(); await local.router.close()})()
  }}
}
