/** Window projection of the existing local Agent HTTP adapter; no canonical state or autonomous mutation. @packageDocumentation */
import type {AtomContext, AtomViewActions, AtomViewSnapshot, AtomBrowserConnection, ProviderBrowserTarget} from "@metafor/agent/atom"
import {projectAgentChatMessages} from "./agent-chat"
import type {AgentJsonValue, AgentToolReference} from "@metafor/types/metafor/agents"
import {observeAgentConfiguration} from "@metafor/types/metafor/agent-observation"
import {validateGraph, type AtomRef} from "@metafor/types/metafor/graph"
import type {AgentWorkspaceSnapshot, AgentOfficeSnapshot, AgentOfficeActor, AgentFieldUpdate, CosmosConversationDirectoryClient} from "@internal/visual"
import type {CosmosAgentProfile, CosmosAgentScope, CosmosAgentProfileUpdate} from "@metafor/types/cosmos/agent-profile"
import type {CosmosConversationAgent} from "@metafor/types/cosmos/conversations"
import type {ClientWorkspaceObserver} from "@metafor/types/cosmos/client"
import {AGENT_UI_PATH, AGENT_UI_SCHEMA, AGENT_UI_TASK_SCHEMA, AGENT_UI_PROVIDER_SCHEMA, AGENT_UI_CONNECT_SCHEMA, isAgentUiVerseId, providerRegistryOwners, type AgentUiSnapshot, type AgentUiItem, type AgentUiTask} from "../shared/agents"
import {connectAgentBrowser} from "./agents-browser"
import {parseProviderRegistry} from "@metafor/types/metafor/provider-validation"
import type {ProfileIntentRequest} from "@metafor/types/metafor/profile-intent"
import {ATOM_FIELD_EDIT_SCHEMA, ATOM_FIELDS_EDIT_SCHEMA} from "../shared/atom-fields"
import type {MetaCausalFrontier, MetaRuntimeFieldValue} from "shared/protocol/metafor/observation"

type Transport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Actions = {-readonly [K in keyof AtomViewActions]: AtomViewActions[K]}
type Entry = {atom: AtomContext; value: AtomViewSnapshot; actions: Actions; listeners: Set<() => void>; item: AgentUiItem | null; pending: string | null; selecting: boolean; browsers: Set<AbortController>}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const sameGraphData = (left: unknown, right: unknown): boolean => {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((item, index) => sameGraphData(item, right[index]))
  return object(left) && object(right) && Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(key => Object.hasOwn(right, key) && sameGraphData(left[key], right[key]))
}
const sameOffice = (left: AgentOfficeSnapshot | undefined, right: AgentOfficeSnapshot) => left !== undefined &&
  left.id === right.id && left.owner === right.owner && left.label === right.label && sameJson(left.bounds, right.bounds) &&
  left.agents.length === right.agents.length && left.agents.every((agent, index) => agent.id === right.agents[index]?.id && agent.atom === right.agents[index]?.atom &&
    agent.profile === right.agents[index]?.profile && sameJson(agent.scope, right.agents[index]?.scope))
const bounds = {min: {x: -4500, y: -3500, z: 0}, max: {x: 4500, y: 3500, z: 2600}}
const developmentTool = (tool: AgentToolReference) => tool.name === "bun.evaluate" && tool.owner?.meta === "@metafor/repl" && object(tool.input) && Object.keys(tool.input).length === 0
const supported = (tool: AgentToolReference) => object(tool.input) && (
  tool.name === "scenario.run" && Object.keys(tool.input).length === 1 && tool.input.scenario === "agent-system.integrity" &&
  (tool.owner === undefined || tool.owner.meta === "@metafor/scenario") ||
  ["codespace.status", "codespace.start"].includes(tool.name) && Object.keys(tool.input).length === 0 &&
  (tool.owner === undefined || tool.owner.meta === "@metafor/codespace"))

function session(item: AgentUiItem): Record<string, unknown> | null {
  const receipt = item.chatSession
  if (receipt === null) return null
  if (!item.chat || receipt.atom.ref !== item.chat.ref || receipt.key !== "session" || receipt.content.format !== "json")
    throw new Error("Беседа получена для другой identity")
  if (!receipt.content.present || receipt.content.value === null) return null
  if (!object(receipt.content.value) || !Array.isArray(receipt.content.value.messages) || !Array.isArray(receipt.content.value.requests))
    throw new Error("Недоступна поддерживаемая история беседы")
  return receipt.content.value
}


async function responseValue(response: Response): Promise<unknown> {
  let value: unknown
  try {value = await response.json()} catch {throw new Error("Среда вернула неподдерживаемый ответ")}
  if (!response.ok) {
    const error = object(value) && object(value.error) ? value.error : null
    throw Object.assign(new Error(error && typeof error.message === "string" ? error.message : `Среда недоступна (${response.status})`),
      {code: error?.code})
  }
  return value
}

function snapshotValue(value: unknown): AgentUiSnapshot {
  if (!object(value) || value.schema !== AGENT_UI_SCHEMA || value.version !== 1 || typeof value.root !== "string" ||
      !object(value.revision) || typeof value.revision.cutId !== "string" || !Number.isSafeInteger(value.revision.throughSequence) ||
      !object(value.observation) || value.observation.mechanism !== "public-oracle-poll" || value.observation.photonSubscription !== false ||
      !Array.isArray(value.agents) || value.agents.length > 64) throw new Error("Недоступна поддерживаемая проекция Agent")
  const graph = validateGraph(value.graph)
  if (!graph.ok || graph.value.root !== value.root || !isAgentUiVerseId(value.verseId) ||
      !object(value.observedWorld) || value.observedWorld.root !== value.root || value.observedWorld.cutId !== value.revision.cutId)
    throw new Error("Недоступен валидный Graph или назначенный адрес мира")
  const owners = new Set(providerRegistryOwners(graph.value).map(owner => owner.ref)), providerRefs = new Set<string>()
  if (!Array.isArray(value.providerRegistries) || value.providerRegistries.length > 64 || !Array.isArray(value.providerRegistryErrors) || value.providerRegistryErrors.length > 64) throw new Error("Недоступен каталог Provider")
  for (const provider of value.providerRegistries) {
    if (!object(provider) || Object.keys(provider).sort().join(",") !== "ref,registry" || typeof provider.ref !== "string" || !owners.has(provider.ref as AtomRef) || providerRefs.has(provider.ref)) throw new Error("Недоступен владелец каталога Provider")
    providerRefs.add(provider.ref); parseProviderRegistry(provider.registry)
  }
  for (const error of value.providerRegistryErrors) {
    if (!object(error) || Object.keys(error).sort().join(",") !== "message,ref" || typeof error.ref !== "string" || !owners.has(error.ref as AtomRef) || providerRefs.has(error.ref) || typeof error.message !== "string" || error.message.length > 512) throw new Error("Недопустимая ошибка каталога Provider")
    providerRefs.add(error.ref)
  }
  const refs = new Set<string>()
  for (const agent of value.agents) {
    if (!object(agent) || typeof agent.ref !== "string" || !agent.ref.startsWith("atom:") || refs.has(agent.ref) ||
        !object(agent.owner) || typeof agent.owner.ref !== "string" || typeof agent.owner.meta !== "string" ||
        !object(agent.configuration) || agent.configuration.resolution !== "exact" || typeof agent.busy !== "boolean")
      throw new Error("Agent не имеет подтверждённого владельца или конфигурации")
    refs.add(agent.ref)
    if (agent.providers !== undefined && agent.providers !== null) {
      if (!object(agent.providers) || typeof agent.providers.ref !== "string" || !agent.providers.ref.startsWith("atom:")) throw new Error("Недоступен владелец Provider")
      parseProviderRegistry(agent.providers.registry)
    }
  }
  if (value.connectableSlots !== undefined && (!Array.isArray(value.connectableSlots) || value.connectableSlots.length > 64 || value.connectableSlots.some(slot =>
    !object(slot) || typeof slot.ref !== "string" || !slot.ref.startsWith("atom:") || slot.meta !== "@metafor/agent-slot" || typeof slot.enabled !== "boolean" || !object(slot.configuration)
    || slot.owner !== null && (!object(slot.owner) || typeof slot.owner.ref !== "string" || typeof slot.owner.meta !== "string")))) throw new Error("Недоступны подготовленные места агентов")
  if (value.profiles !== undefined && value.profiles !== null && (!object(value.profiles) || value.profiles.schema !== "metafor/profile-targets/v1" || value.profiles.version !== 1 || !Array.isArray(value.profiles.targets)
    || value.profiles.targets.length > 64 || value.profiles.targets.some(target => !object(target) || typeof target.atomRef !== "string" || !target.atomRef.startsWith("atom:") || !object(target.worldIdentity)
      || typeof target.worldIdentity.peerId !== "string" || typeof target.worldIdentity.root !== "string" || typeof target.worldIdentity.cutId !== "string"
      || !object(target.expectedProfile) || typeof target.expectedProfile.name !== "string" || target.expectedProfile.saveId !== null && typeof target.expectedProfile.saveId !== "string"
      || !Array.isArray(target.supportedOperations) || target.supportedOperations.some(operation => operation !== "profile.open" && operation !== "profile.save" && operation !== "profile.reconfigure")
      || typeof target.available !== "boolean" || typeof target.state !== "string"))) throw new Error("Недоступно назначение профиля")
  return value as unknown as AgentUiSnapshot
}

/**
 * Проекция рабочего пространства со стабильной identity Agent AtomContext.
 * `start` читает начальный снимок и подписывается на уведомления существующего
 * Window connection. Глобальное уведомление объединяет чтения публичного Oracle,
 * уведомление комнаты обновляет только её каталог Cosmos. Периодического опроса
 * нет; после восстановления соединения сервер запрашивает новое наблюдение.
 * `stop` освобождает подписку и прерывает собственные чтения, `dispose` завершает
 * источник. Действия возвращают admission и никогда автоматически не повторяются.
 * Беседы принадлежат Cosmos, старые Quantum Chat доступны как отдельная проекция.
 * [Контракт рабочего пространства](../README.md),
 * [проверки](../spec/agent-view-model.spec.ts).
 */
export function createAgentWorkspace(options: {url?: string; fetch?: Transport; taskId?: () => string; conversations?: CosmosConversationDirectoryClient; observeChanges?: ClientWorkspaceObserver} = {}) {
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis)
  const url = options.url ?? AGENT_UI_PATH
  const entries = new Map<AtomRef, Entry>()
  const settings = new Map<AtomRef, {sessionId: string; bindingId: string; value: Pick<NonNullable<AtomViewSnapshot["provider"]>, "model" | "reasoning" | "models" | "reasoningLevels">}>()
  const listeners = new Set<() => void>()
  const requests = new Set<AbortController>()
  const providerBrowsers = new Map<AbortController, {target: ProviderBrowserTarget; binding: unknown; world: unknown}>()
  let state: AgentWorkspaceSnapshot = {status: "loading", error: null, offices: [], graph: null, verseId: null, observedWorld: null, providerRegistries: [], providerRegistryErrors: []}
  let frontier: MetaCausalFrontier | null = null
  let running = false, disposed = false, available = false, observed = false, generation = 0, queued = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribeChanges: (() => void) | undefined
  let inflight: Promise<void> | undefined
  let latest: AgentUiSnapshot | null = null
  const appearances = new Map<string, CosmosAgentProfile>()
  const roomActors = new Map<AtomRef, readonly CosmosConversationAgent[]>()
  const roomErrors = new Map<AtomRef, string>()
  const loadedRooms = new Set<AtomRef>(), pendingRooms = new Set<AtomRef>()
  let loadingRooms = false
  const scopeKey = (scope: CosmosAgentScope) => JSON.stringify([scope.verseId, scope.atomRef, scope.agentRef])
  const refreshRoom = async (atomRef: AtomRef) => {
    const directory = options.conversations, snapshot = latest
    if (!directory || !snapshot?.verseId || disposed || !running) return
    const scope = {verseId: snapshot.verseId, atomRef}
    const legacy = snapshot.agents.filter(agent => agent.owner?.ref === atomRef)
    let actors = await directory.listAgents(scope)
    if (actors.length === 0 && legacy.length === 0) actors = [await directory.ensureAgent(scope, "Ассистент")]
    const profiles = await Promise.all(legacy.map(agent => directory.readProfile({...scope, agentRef: agent.ref})))
    if (disposed || !running || !sameJson(snapshot.observedWorld, latest?.observedWorld)) return
    roomActors.set(atomRef, actors)
    roomErrors.delete(atomRef)
    for (const profile of [...profiles, ...actors.map(actor => actor.profile)]) appearances.set(scopeKey(profile.scope), profile)
    loadedRooms.add(atomRef)
    apply(latest!)
  }
  const loadRooms = async () => {
    if (loadingRooms || !options.conversations || disposed) return
    loadingRooms = true
    try {
      while (running && !disposed && pendingRooms.size) {
        const ref = pendingRooms.values().next().value!
        pendingRooms.delete(ref)
        loadedRooms.add(ref)
        try {await refreshRoom(ref)} catch (error) {
          roomErrors.set(ref, error instanceof Error ? error.message : "Агенты комнаты недоступны")
          if (latest && !disposed && running) apply(latest)
        }
      }
    } finally {loadingRooms = false}
  }
  const notify = (workspaceChanged = true) => {if (workspaceChanged) for (const listener of listeners) listener(); for (const entry of entries.values()) for (const listener of entry.listeners) listener()}
  const canAct = (entry: Entry) => running && !disposed && available && entry.item !== null && !entry.item.busy && entry.pending === null && !entry.selecting && entry.item.chatError === null && entry.item.providerError == null
  const updateActions = (entry: Entry) => {
    delete entry.actions.prepareProviderSettings
    delete entry.actions.configureProvider
    delete entry.actions.sendMessage
    delete entry.actions.recoverChat
    delete entry.actions.runDevelopment
    delete entry.actions.invokeTool
    delete entry.actions.connectBrowser
    delete entry.actions.selectProvider
    delete entry.actions.profileIntent
    const selectedBinding = entry.item?.providers?.registry.entries.find(binding => binding.id === entry.item?.providerBinding?.id)
    const retained = entry.item ? session(entry.item) : null
    const lastRequest = Array.isArray(retained?.requests) ? retained.requests.at(-1) : null
    if (canAct(entry) && selectedBinding?.service === "qwen" && selectedBinding.connection === "connected" && retained?.sessionId && object(lastRequest) && lastRequest.state === "pending" && typeof lastRequest.id === "string") {
      const requestId = lastRequest.id
      entry.actions.recoverChat = async signal => {
        signal.throwIfAborted()
        if (!canAct(entry)) throw new Error("Agent занят")
        const controller = new AbortController()
        requests.add(controller)
        entry.selecting = true
        publish(false)
        try {
          await responseValue(await transport(url.replace(/\/$/, "") + "/recover", {
            method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"},
            body: JSON.stringify({agentRef: entry.atom.ref, requestId}),
            signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(15_000)]),
          }))
        } finally {requests.delete(controller); entry.selecting = false; publish(false); refreshAfterIntent()}
      }
    }
    if (canAct(entry) && !entry.item?.error && selectedBinding?.resolution === "exact" && selectedBinding.connection === "connected" && selectedBinding.capabilities.modelTurn && selectedBinding.checks.status !== "failed" && entry.value.provider?.sessionId) {
      const configure = async (selection: {model?: string; reasoning?: string}, signal: AbortSignal) => {
        if (!canAct(entry)) throw new Error("Agent занят")
        const sessionId = entry.value.provider!.sessionId!, controller = new AbortController()
        requests.add(controller)
        entry.selecting = true
        publish(false)
        try {
          const result = await responseValue(await transport(url.replace(/\/$/, "") + "/settings", {method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"},
            body: JSON.stringify({agentRef: entry.atom.ref, selection}), signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(65000)])}))
          if (entry.value.provider?.sessionId !== sessionId || entry.item?.providerBinding?.id !== selectedBinding.id) throw new Error("Native session или назначение Provider изменились")
          const value = object(result) ? result.settings : null
          const choices = (input: unknown) => Array.isArray(input) && input.length <= 256 && input.every(item => object(item) && typeof item.id === "string" && typeof item.label === "string")
          if (!object(value) || !(value.model === null || typeof value.model === "string") || !(value.reasoning === null || typeof value.reasoning === "string") || !choices(value.models) || !choices(value.reasoningLevels)) throw new Error("Provider вернул неподдерживаемые настройки")
          const catalog = value as typeof settings extends Map<AtomRef, infer V> ? V extends {value: infer C} ? C : never : never
          settings.set(entry.atom.ref, {sessionId, bindingId: entry.item!.providerBinding!.id!, value: catalog})
          if (entry.value.provider?.sessionId === sessionId) entry.value = {...entry.value, provider: {...entry.value.provider, ...catalog}}
        } finally {requests.delete(controller); entry.selecting = false; publish(false)}
      }
      entry.actions.prepareProviderSettings = signal => configure({}, signal)
      entry.actions.configureProvider = (value, signal) => configure({...(value.model ? {model: value.model} : {}), ...(value.reasoning ? {reasoning: value.reasoning} : {})}, signal)
    }
    if (running && !disposed && available && !state.profileError && entry.value.profileTargets?.length) entry.actions.profileIntent = async (request, signal) => {
      const target = entry.value.profileTargets?.find(target => target.atomRef === request.target.atomRef && JSON.stringify(target.worldIdentity) === JSON.stringify(request.target.worldIdentity))
      if (!target?.available || !target.supportedOperations.includes(request.operation) || JSON.stringify(target.expectedProfile) !== JSON.stringify(request.expectedProfile)) throw new Error("Назначенный профиль изменился или его владелец занят")
      await profileIntent(request, signal)
    }
    if (canAct(entry) && entry.item?.providers && entry.item.providerBinding?.locked === false) entry.actions.selectProvider = async (entryId, signal) => {
      const candidate = entry.item?.providers?.registry.entries.find(value => value.id === entryId)
      if (!canAct(entry) || entry.item?.providerBinding?.locked !== false || !candidate || candidate.resolution !== "exact" || candidate.connection !== "connected" || !candidate.capabilities.modelTurn || candidate.checks.status === "failed") throw new Error("Провайдер не доступен для новой беседы")
      const controller = new AbortController()
      requests.add(controller)
      entry.selecting = true
      publish()
      try {
        const result = await responseValue(await transport(url.replace(/\/$/, "") + "/provider", {method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"},
          body: JSON.stringify({agentRef: entry.atom.ref, entryId}), signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(15_000)])}))
        if (!object(result) || result.schema !== AGENT_UI_PROVIDER_SCHEMA || result.agentRef !== entry.atom.ref || result.entryId !== entryId) throw new Error("Не подтверждена identity выбора провайдера")
      } finally {requests.delete(controller); entry.selecting = false; if (running && !disposed) {publish(); if (inflight) queued = true; else void refresh().catch(() => {})}}
    }
    if (running && !disposed && available && entry.item?.providers) entry.actions.connectBrowser = async (entryId, signal) => {
      const providers = entry.item?.providers
      const binding = providers?.registry.entries.find(value => value.id === entryId)
      if (!providers || !binding || binding.resolution !== "exact" || binding.connection !== "connected" || !binding.capabilities.browserPreview) throw new Error("Назначенный браузер недоступен")
      const controller = new AbortController()
      requests.add(controller)
      entry.browsers.add(controller)
      try {
        const connection = await connectAgentBrowser({agentRef: entry.atom.ref, providerRef: providers.ref, binding, url, fetch: transport, signal: AbortSignal.any([signal, controller.signal])})
        const client = connection.client
        return {...connection, client: {...client, async close() {try {await client.close()} finally {requests.delete(controller); entry.browsers.delete(controller)}}}}
      } catch (error) {requests.delete(controller); entry.browsers.delete(controller); throw error}
    }
    if (canAct(entry)) {
      entry.actions.sendMessage = async (text, signal) => {
        if (!text.trim() || text.length > 64 * 1024) throw new Error("Введите непустое сообщение допустимого размера")
        await submit(entry, {id: (options.taskId ?? (() => crypto.randomUUID()))(), text, mode: "conversation"}, signal)
      }
      if (entry.value.configuration.tools.some(developmentTool)) entry.actions.runDevelopment = async (text, signal) => {
        if (!text.trim() || text.length > 64 * 1024) throw new Error("Введите непустую задачу допустимого размера")
        await submit(entry, {id: (options.taskId ?? (() => crypto.randomUUID()))(), text, mode: "development"}, signal)
      }
      if (entry.value.configuration.tools.some(supported)) entry.actions.invokeTool = async (tool, signal) => {
        if (!supported(tool) || !entry.value.configuration.tools.some(value => supported(value) && JSON.stringify(value) === JSON.stringify(tool))) throw new Error("Инструмент не поддержан этой средой")
        const id = (options.taskId ?? (() => crypto.randomUUID()))()
        await submit(entry, tool.name === "scenario.run" ? {id, text: "Выполни проверку агентной системы.", mode: "scenario", scenario: "agent-system.integrity"}
          : {id, text: tool.name === "codespace.start" ? "Запусти назначенное рабочее место." : "Проверь состояние назначенного рабочего места.", mode: "codespace", operation: tool.name === "codespace.start" ? "start" : "status"}, signal)
      }
    }
    entry.value = {...entry.value, operations: canAct(entry) ? [...new Set(entry.value.configuration.tools.filter(supported).map(tool => tool.name))] : []}
  }
  const publish = (workspaceChanged = true) => {for (const entry of entries.values()) updateActions(entry); notify(workspaceChanged)}
  const fail = (error: unknown) => {
    available = false
    const message = error instanceof Error ? error.message : "Среда недоступна"
    const changed = state.status !== "error" || state.error !== message
    if (changed) state = {...state, status: "error", error: message}
    publish(changed)
  }
  const apply = (data: AgentUiSnapshot) => {
    if (state.observedWorld && !sameJson(state.observedWorld, data.observedWorld)) {
      settings.clear(); appearances.clear(); roomActors.clear(); roomErrors.clear(); loadedRooms.clear(); pendingRooms.clear()
    }
    latest = data
    const offices = new Map<string, {id: string; owner: AtomRef; label: string; bounds: typeof bounds; agents: AgentOfficeActor[]}>()
    const seen = new Set<AtomRef>()
    const errors: string[] = [...new Set(roomErrors.values())]
    const profiles = data.profiles ?? (data.profileError ? state.profiles ?? null : null)
    const prepared = data.agents.map(item => {
      const configuration = observeAgentConfiguration(JSON.stringify(item.configuration.value))
      if (configuration.resolution !== "exact" || !item.owner) throw new Error("Недоступна подтверждённая конфигурация Agent")
      const previous = entries.get(item.ref)?.value
      const stored = session(item)
      const provider = stored?.provider
      const providerData = object(provider) ? provider : null
      const providerId = typeof provider === "string" ? provider : typeof providerData?.id === "string" ? providerData.id : null
      const value: AtomViewSnapshot = {ref: item.ref, revision: `${data.revision.cutId}:${data.revision.throughSequence}`, state: item.state, error: item.error, busy: item.busy,
        configuration: configuration.value, chat: item.chatError ? previous?.chat ?? [] : projectAgentChatMessages(stored), provider: item.chatError ? previous?.provider ?? null : providerId ? {id: providerId,
          sessionId: typeof stored?.sessionId === "string" ? stored.sessionId : null,
          model: typeof providerData?.model === "string" ? providerData.model : typeof stored?.model === "string" ? stored.model : null,
          reasoning: typeof providerData?.reasoning === "string" ? providerData.reasoning : typeof stored?.reasoning === "string" ? stored.reasoning : null,
          models: [], reasoningLevels: [], ...(settings.has(item.ref) && settings.get(item.ref)?.sessionId === stored?.sessionId && settings.get(item.ref)?.bindingId === item.providerBinding?.id ? settings.get(item.ref)!.value : {})} : null,
        ...(item.providers ? {providers: item.providers} : item.providerError && previous?.providers ? {providers: previous.providers} : {}),
        ...(item.providerBinding ? {providerBinding: item.providerBinding} : {}),
        ...(profiles ? {profileTargets: profiles.targets} : {}),
        profileError: data.profileError ?? null,
        operations: [], context: {root: data.root, revision: data.revision, observation: data.observation, agent: item} as unknown as AgentJsonValue}
      return {item, owner: item.owner, stored, configuration, value}
    })
    for (const {item, owner, stored, configuration, value} of prepared) {
      let entry = entries.get(item.ref)
      if (!entry) {
        const actions: Actions = {}, callbacks = new Set<() => void>()
        entry = {value, actions, listeners: callbacks, item, pending: null, selecting: false, browsers: new Set(), atom: null as unknown as AtomContext}
        const bound = entry
        entry.atom = {ref: item.ref, getSnapshot: () => bound.value, subscribe(listener) {callbacks.add(listener); return () => {callbacks.delete(listener)}}, actions}
        entries.set(item.ref, entry)
      }
      entry.value = value
      entry.item = item
      if (entry.pending && (item.activeTaskId === entry.pending || Array.isArray(stored?.requests) && stored.requests.some(request => object(request) && request.id === `${entry.pending}:conversation`))) entry.pending = null
      seen.add(item.ref)
      if (!options.conversations && (item.error || item.chatError || item.providerError)) errors.push(`${configuration.value.id}: ${item.error ?? item.chatError ?? item.providerError}`)
      let office = offices.get(owner.ref)
      if (!office) {office = {id: owner.ref, owner: owner.ref, label: owner.meta, bounds, agents: []}; offices.set(owner.ref, office)}
      const scope = data.verseId ? {verseId: data.verseId, atomRef: owner.ref, agentRef: item.ref} : undefined
      const profile = scope ? appearances.get(scopeKey(scope)) : undefined
      office.agents.push({id: item.ref, atom: entry.atom, ...(scope ? {scope} : {}), ...(profile ? {profile} : {})})
    }
    if (options.conversations && data.verseId) {
      const nodes = [...data.graph.runtime.roots]
      for (const node of nodes) {
        nodes.push(...node.children ?? [])
        if (node.kind !== "atom") continue
        let office = offices.get(node.ref)
        if (!office) {office = {id: node.ref, owner: node.ref, label: node.meta, bounds, agents: []}; offices.set(node.ref, office)}
        for (const actor of roomActors.get(node.ref) ?? []) office.agents.push({id: actor.scope.agentRef, scope: actor.scope,
          profile: appearances.get(scopeKey(actor.scope)) ?? actor.profile})
        if (!loadedRooms.has(node.ref) || office.agents.length === 0 && roomActors.has(node.ref) && !roomErrors.has(node.ref)) pendingRooms.add(node.ref)
      }
    }
    for (const [ref, entry] of entries) if (!seen.has(ref)) {
      for (const controller of entry.browsers) controller.abort()
      entry.item = null
      updateActions(entry)
      for (const listener of entry.listeners) listener()
      entry.listeners.clear()
      entries.delete(ref)
    }
    available = true
    observed = true
    frontier = data.revision
    const previousOffices = new Map(state.offices.map(office => [office.id, office]))
    const nextOffices = [...offices.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(office =>
      sameOffice(previousOffices.get(office.id), office) ? previousOffices.get(office.id)! : office)
    const retainedOffices = nextOffices.length === state.offices.length && nextOffices.every((office, index) => office === state.offices[index]) ? state.offices : nextOffices
    const registries = [...data.providerRegistries]
    for (const error of data.providerRegistryErrors) {const previous = state.providerRegistries?.find(value => value.ref === error.ref); if (previous) registries.push(previous)}
    registries.sort((a, b) => a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)
    const next: AgentWorkspaceSnapshot = {status: "ready", error: errors.length ? errors.join("\n") : null,
      offices: retainedOffices,
      graph: sameGraphData(state.graph, data.graph) ? state.graph : data.graph,
      verseId: data.verseId,
      observedWorld: sameJson(state.observedWorld, data.observedWorld) ? state.observedWorld : data.observedWorld,
      providerRegistries: sameJson(state.providerRegistries, registries) ? state.providerRegistries ?? [] : registries,
      providerRegistryErrors: sameJson(state.providerRegistryErrors, data.providerRegistryErrors) ? state.providerRegistryErrors ?? [] : data.providerRegistryErrors,
      connectableSlots: sameJson(state.connectableSlots, data.connectableSlots ?? []) ? state.connectableSlots ?? [] : data.connectableSlots ?? [],
      profiles: sameJson(state.profiles, profiles) ? state.profiles ?? null : profiles, profileError: data.profileError ?? null}
    const changed = next.status !== state.status || next.error !== state.error || next.offices !== state.offices ||
      next.connectableSlots !== state.connectableSlots || next.profiles !== state.profiles || next.profileError !== state.profileError ||
      next.graph !== state.graph || next.verseId !== state.verseId || next.observedWorld !== state.observedWorld || next.providerRegistries !== state.providerRegistries || next.providerRegistryErrors !== state.providerRegistryErrors
    if (changed) state = next
    for (const [controller, grant] of providerBrowsers) {
      const entry = state.providerRegistries?.find(value => value.ref === grant.target.providerRef)?.registry.entries.find(value => value.id === grant.target.entryId)
      if (!entry || !sameJson(browserTuple(entry), grant.binding) || !sameJson(state.observedWorld, grant.world) || state.providerRegistryErrors?.some(value => value.ref === grant.target.providerRef) || entry.connection !== "connected" || entry.resolution !== "exact" || !entry.capabilities.browserPreview) controller.abort(new Error("Provider scope retired"))
    }
    publish(changed)
    void loadRooms()
  }
  const schedule = () => {
    clearTimeout(timer)
    if (!running || disposed) return
    timer = setTimeout(() => {void refresh().catch(() => {})}, 0)
  }
  const refresh = (): Promise<void> => {
    if (!running || disposed) return Promise.reject(new Error("Наблюдение Agent остановлено"))
    if (inflight) return inflight
    clearTimeout(timer)
    const epoch = generation, controller = new AbortController()
    requests.add(controller)
    const work = Promise.resolve().then(async () => {
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])
        const data = snapshotValue(await responseValue(await transport(url, {method: "GET", cache: "no-store", credentials: "same-origin", signal})))
        signal.throwIfAborted()
        if (running && generation === epoch && !disposed) apply(data)
      } catch (error) {
        if (running && generation === epoch && !disposed && !controller.signal.aborted) fail(error)
        throw error
      } finally {
        requests.delete(controller)
        if (inflight === work) {inflight = undefined; const again = queued; queued = false; if (again) schedule()}
      }
    })
    inflight = work
    return work
  }
  const submit = async (entry: Entry, task: AgentUiTask, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted()
    if (!canAct(entry)) throw new Error("Agent занят или его текущее состояние недоступно")
    const epoch = generation, controller = new AbortController()
    requests.add(controller)
    entry.pending = task.id
    publish()
    try {
      const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(15_000)])
      const result = await responseValue(await transport(url, {method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"},
        body: JSON.stringify({agentRef: entry.atom.ref, task}), signal: combined}))
      combined.throwIfAborted()
      if (!object(result) || result.schema !== AGENT_UI_TASK_SCHEMA || result.version !== 1 || result.agentRef !== entry.atom.ref || result.taskId !== task.id)
        throw new Error("Не подтверждена identity принятого запроса")
    } catch (error) {
      const code = object(error) ? error.code : undefined
      if (code === "busy" || code === "forbidden" || code === "invalid_request") entry.pending = null
      throw error
    } finally {
      requests.delete(controller)
      if (running && !disposed && epoch === generation) {publish(); if (inflight) queued = true; else void refresh().catch(() => {})}
    }
  }
  const visible = () => {if (typeof document !== "undefined" && document.visibilityState !== "hidden") {if (inflight) queued = true; else void refresh().catch(() => {})}}
  const refreshAfterIntent = () => {if (running && !disposed) {if (inflight) queued = true; else void refresh().catch(() => {})}}
  const changed: Parameters<ClientWorkspaceObserver>[0] = room => {
    if (!running || disposed) return
    if (room) {
      const office = state.offices.find(office => office.owner === room.atomRef)
      if (room.verseId !== latest?.verseId || !office) return
      pendingRooms.add(office.owner)
      void loadRooms()
    } else if (inflight) queued = true
    else schedule()
  }
  const profileIntent = async (request: ProfileIntentRequest, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (!running || disposed || !available || state.profileError) throw new Error("Среда недоступна")
    const target = state.profiles?.targets.find(target => target.atomRef === request.target.atomRef && JSON.stringify(target.worldIdentity) === JSON.stringify(request.target.worldIdentity))
    if (!target?.available || !target.supportedOperations.includes(request.operation) || JSON.stringify(target.expectedProfile) !== JSON.stringify(request.expectedProfile)) throw new Error("Назначенный профиль изменился или его владелец занят")
    const controller = new AbortController()
    requests.add(controller)
    try {
      const value = await responseValue(await transport(url.replace(/\/$/, "") + "/profile", {method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"},
        body: JSON.stringify(request), signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(15_000)])}))
      if (!object(value) || value.schema !== "metafor/profile-intent/v1" || value.version !== 1 || value.id !== request.id || value.operation !== request.operation || JSON.stringify(value.target) !== JSON.stringify(request.target)) throw new Error("Не подтверждена identity запроса профиля; не повторяйте действие автоматически")
    } finally {requests.delete(controller); refreshAfterIntent()}
  }
  const connecting = new Set<string>()
  const saveFields = async (atomRef: AtomRef, updates: readonly AgentFieldUpdate[], signal: AbortSignal) => {
    signal.throwIfAborted()
    if (!running || disposed || !available || !frontier || !state.observedWorld) throw new Error("Среда недоступна")
    const world = state.observedWorld
    const epoch = generation
    const controller = new AbortController()
    requests.add(controller)
    try {
      const result = await responseValue(await transport(url.replace(/\/$/, "") + "/fields", {
        method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"},
        body: JSON.stringify({atomRef, updates, expectedFrontier: frontier}),
        signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(15_000)]),
      }))
      signal.throwIfAborted()
      if (epoch !== generation || !sameJson(world, state.observedWorld)) throw new Error("Мир изменился во время сохранения")
      const savedFields = object(result) && Array.isArray(result.fields) ? result.fields : null
      if (!object(result) || result.schema !== ATOM_FIELDS_EDIT_SCHEMA || result.version !== 1 || result.atomRef !== atomRef || result.committed !== true ||
          !savedFields || savedFields.length !== updates.length || !updates.every(update => savedFields.includes(update.field)) ||
          !object(result.observedFrontier) || result.observedFrontier.cutId !== world.cutId)
        throw new Error("Общая запись полей не подтверждена; обновите состояние")
      if (inflight) await inflight.catch(() => {})
      await refresh()
    } finally {requests.delete(controller); refreshAfterIntent()}
  }
  const editField = async (atomRef: AtomRef, field: string, value: MetaRuntimeFieldValue, expectedValue: MetaRuntimeFieldValue, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (!running || disposed || !available || !frontier) throw new Error("Среда недоступна")
    const controller = new AbortController()
    requests.add(controller)
    try {
      const result = await responseValue(await transport(url.replace(/\/$/, "") + "/field", {
        method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"},
        body: JSON.stringify({atomRef, field, value, expectedValue, expectedFrontier: frontier}),
        signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(15_000)]),
      }))
      if (!object(result) || result.schema !== ATOM_FIELD_EDIT_SCHEMA || result.atomRef !== atomRef || result.field !== field || result.value !== value)
        throw new Error("Изменение поля не подтверждено; обновите наблюдение")
    } finally {requests.delete(controller); refreshAfterIntent()}
  }
  const browserTuple = (entry: import("@metafor/types/metafor/providers").ProviderBinding) => [entry.id, entry.service, entry.host, entry.remotePeerId, entry.executorId, entry.assignmentId ?? null]
  const connectProviderBrowser = async (target: ProviderBrowserTarget, signal: AbortSignal): Promise<AtomBrowserConnection> => {
    signal.throwIfAborted()
    const entry = state.providerRegistries?.find(value => value.ref === target.providerRef)?.registry.entries.find(value => value.id === target.entryId)
    if (!running || disposed || !available || !entry || state.providerRegistryErrors?.some(value => value.ref === target.providerRef) || entry.resolution !== "exact" || entry.connection !== "connected" || !entry.capabilities.browserPreview) throw new Error("Назначенный Provider браузер недоступен")
    const pinned = {target: {...target}, binding: browserTuple(entry), world: state.observedWorld}, controller = new AbortController()
    const combined = AbortSignal.any([signal, controller.signal])
    const cleanup = () => {requests.delete(controller); providerBrowsers.delete(controller); combined.removeEventListener("abort", cleanup)}
    requests.add(controller); providerBrowsers.set(controller, pinned); combined.addEventListener("abort", cleanup, {once: true})
    let connection: AtomBrowserConnection | undefined
    try {
      connection = await connectAgentBrowser({agentRef: null, providerRef: target.providerRef, binding: entry, url, fetch: transport, signal: combined})
      combined.throwIfAborted()
      const current = state.providerRegistries?.find(value => value.ref === target.providerRef)?.registry.entries.find(value => value.id === target.entryId)
      if (!current || !sameJson(browserTuple(current), pinned.binding) || !sameJson(state.observedWorld, pinned.world)) throw new Error("Provider scope изменился")
      const client = connection.client
      return {...connection, client: {...client, async close() {try {await client.close()} finally {cleanup()}}}}
    } catch (error) {await connection?.client.close().catch(() => {}); cleanup(); throw error}
  }
  const connectSlot = async (slotRef: string, signal: AbortSignal) => {
    signal.throwIfAborted()
    const slot = state.connectableSlots?.find(slot => slot.ref === slotRef)
    if (!running || disposed || !available || !slot || connecting.has(slotRef) || slot.configuration.resolution !== "exact") throw new Error("Подготовленное место агента недоступно")
    const controller = new AbortController()
    requests.add(controller)
    connecting.add(slotRef)
    try {
      const value = await responseValue(await transport(url.replace(/\/$/, "") + "/connect", {method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"}, body: JSON.stringify({slotRef, enabled: true}),
        signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(15_000)])}))
      if (!object(value) || value.schema !== AGENT_UI_CONNECT_SCHEMA || value.version !== 1 || value.slotRef !== slotRef || value.enabled !== true || value.acceptance !== "admitted" && value.acceptance !== "observed") throw new Error("Не подтверждено подключение места агента")
    } finally {connecting.delete(slotRef); requests.delete(controller); refreshAfterIntent()}
  }
  const stop = () => {
    if (!running) return
    running = false
    available = false
    generation++
    clearTimeout(timer)
    unsubscribeChanges?.()
    unsubscribeChanges = undefined
    for (const controller of requests) controller.abort()
    requests.clear()
    inflight = undefined
    queued = false
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visible)
    publish()
  }
  return {
    getSnapshot: () => state,
    ...(options.conversations ? {conversations: options.conversations} : {}),
    refreshRoom,
    async saveAgentProfile(scope: CosmosAgentScope, update: CosmosAgentProfileUpdate) {
      if (!options.conversations || scope.verseId !== state.verseId) throw new Error("Профиль агента недоступен")
      const profile = await options.conversations.updateProfile(scope, update)
      if (!disposed && latest && scope.verseId === state.verseId) {appearances.set(scopeKey(scope), profile); apply(latest)}
      return profile
    },
    async createAgent(atomRef: AtomRef, name: string) {
      if (!options.conversations || !state.verseId) throw new Error("Создание агента недоступно")
      await options.conversations.createAgent({verseId: state.verseId, atomRef}, name)
      await refreshRoom(atomRef)
    },
    connectProviderBrowser,
    subscribe(listener: () => void) {if (disposed) throw new Error("Agent workspace освобождён"); listeners.add(listener); return () => {listeners.delete(listener)}},
    start() {
      if (disposed) throw new Error("Agent workspace освобождён")
      if (!running) {
        running = true
        generation++
        if (!observed) state = {...state, status: "loading", error: null}
        publish(!observed)
        if (typeof document !== "undefined") document.addEventListener("visibilitychange", visible)
        unsubscribeChanges = options.observeChanges?.(changed, error => {if (running && !disposed) fail(error)})
        void refresh().catch(() => {})
      }
      return stop
    },
    refresh,
    editField,
    saveFields,
    connectSlot,
    profileIntent,
    dispose() {if (disposed) return; stop(); disposed = true; options.conversations?.dispose(); pendingRooms.clear(); listeners.clear(); for (const entry of entries.values()) entry.listeners.clear(); entries.clear()},
  }
}

export type AgentWorkspace = ReturnType<typeof createAgentWorkspace>
