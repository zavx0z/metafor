import {HTMLElement, type DisplayElement, type DOMComponentConstructor, type Presentation} from "@zavx0z/immersive"
import {ViewPoint} from "@zavx0z/immersive/engine"
import {AgentView} from "@metafor/agent/view"
import type {AtomContext} from "@metafor/agent/atom"
import type {OfficeBounds} from "@metafor/agent/office-layout"
import type {AgentWorkspaceSnapshot, AgentWorkspaceSource, CosmosConversationClient} from "./agent-workspace-types"
export type {AgentWorkspaceSource, AgentWorkspaceSnapshot, AgentOfficeSnapshot, AgentConnectableSlot, AgentFieldValue, AgentFieldUpdate} from "./agent-workspace-types"
import type {NetworkSpaceModel} from "./network-space"
import {CosmosAgentChat, type CosmosAgentChatProps} from "./cosmos-agent-chat"
import {createOfficeDisplayView, type OfficeDisplayGeometry} from "./office-display-view"

const empty: AgentWorkspaceSnapshot = {status: "loading", offices: [], graph: null, verseId: null, observedWorld: null}
const keyOf = (office: string, agent: string) => JSON.stringify([office, agent])
export const AGENT_CONTROL_DISPLAY = Object.freeze({width: 2200, height: 1237.5, pixelWidth: 1200, pixelHeight: 675})

/** Производное размещение разных offices в одном Space; local roomBounds каждого офиса сохраняются. */
function arrange(snapshot: AgentWorkspaceSnapshot) {
  const offices = snapshot.offices.filter(office => office.agents.length > 0).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const ids = new Set<string>()
  let width = 9000
  let depth = 7000
  for (const office of offices) {
    if (!office.id || ids.has(office.id)) throw new TypeError("Office identity повторяется")
    ids.add(office.id)
    const size = {width: office.bounds.max.x - office.bounds.min.x, depth: office.bounds.max.y - office.bounds.min.y, height: office.bounds.max.z - office.bounds.min.z}
    if (Object.values(size).some(value => !Number.isFinite(value) || value <= 0)) throw new RangeError("Office bounds должны быть конечными и положительными")
    width = Math.max(width, size.width)
    depth = Math.max(depth, size.depth)
    const agents = new Set<string>()
    for (const agent of office.agents) {
      if (!agent.id || agents.has(agent.id)) throw new TypeError("Agent identity повторяется в офисе")
      agents.add(agent.id)
    }
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(offices.length)))
  const rows = Math.max(1, Math.ceil(offices.length / columns))
  const placed = offices.map((office, index) => ({office, position: {
    x: (index % columns - (columns - 1) / 2) * (width + 1200) - (office.bounds.min.x + office.bounds.max.x) / 2,
    y: (Math.floor(index / columns) - (rows - 1) / 2) * (depth + 1800) - (office.bounds.min.y + office.bounds.max.y) / 2,
    z: -office.bounds.min.z,
  }}))
  const min = {x: -width / 2, y: -depth / 2, z: 0}
  const max = {x: width / 2, y: depth / 2, z: 2600}
  for (const {office, position} of placed) for (const axis of ["x", "y", "z"] as const) {
    min[axis] = Math.min(min[axis], office.bounds.min[axis] + position[axis])
    max[axis] = Math.max(max[axis], office.bounds.max[axis] + position[axis])
  }
  const control = {x: (min.x + max.x) / 2, y: min.y - 1600, z: max.z + 900}
  const agents = placed.flatMap(({office}) => office.agents.map(agent => ({...agent, officeId: office.id, label: agent.profile?.name ?? `${office.label} · ${agent.id}`, key: keyOf(office.id, agent.id)})))
  return {offices: placed, agents, bounds: {min, max}, control}
}

/**
UI controller одного existing Browser Root. Source не становится вторым Store:
controller сохраняет readonly pointer и локальные выбор/камеру/hosts. Один AgentView
constructor на Agent перемещается append между wall и common Display того же
Document; смена камеры не создаёт новый Chat и не remount UI.
*/
export function createAgentWorkspace(options: Readonly<{externalNavigation?: boolean}> = {}) {
  let focusedChat: string | null = null
  const officeDisplays = createOfficeDisplayView({onFocusChange(key) {
    if (disposed) return
    const agent = key === null ? undefined : geometry.agents.find(agent => JSON.stringify([agent.officeId, agent.id, "chat"]) === key)
    const next = agent?.key ?? null
    if (next === focusedChat) return
    focusedChat = next
    if (agent) {selected = agent.key; mode = "agents"}
    publish()
  }})
  let input = empty
  let geometry = arrange(input)
  let selected: string | null = null
  let mode: "agents" | "offices" | "network" = "agents"
  let state: {input: AgentWorkspaceSnapshot; selected: string | null; focusedChat: string | null; mode: "agents" | "offices" | "network"} & ReturnType<typeof arrange> = {input, ...geometry, selected, focusedChat, mode}
  const listeners = new Set<() => void>()
  const hosts = new Map<string, HTMLElement>()
  type LegacyView = InstanceType<DOMComponentConstructor<{atom: AtomContext; chatOnly: boolean}>>
  type CosmosView = InstanceType<DOMComponentConstructor<CosmosAgentChatProps>>
  type MountedChat = {kind: "legacy"; view: LegacyView; atom: AtomContext} | {kind: "cosmos"; view: CosmosView; client: CosmosConversationClient}
  const views = new Map<string, MountedChat>()
  const selectedSessions = new Map<string, string>()
  let common: HTMLElement | null = null
  let commonForced = false
  let parking: HTMLElement | null = null
  let parked = false
  let root: Presentation | null = null
  let network: NetworkSpaceModel | null = null
  let source: AgentWorkspaceSource | null = null
  let unsubscribe = () => {}
  let disposed = false
  let followedInitial = false
  const Constructor = AgentView as unknown as DOMComponentConstructor<{atom: AtomContext; chatOnly: boolean}>
  const CosmosConstructor = CosmosAgentChat as unknown as DOMComponentConstructor<CosmosAgentChatProps>
  const releaseView = (mounted: MountedChat) => {
    mounted.view.dispose()
    if (mounted.kind === "cosmos") mounted.client.dispose()
  }
  const syncViews = () => {
    if (root === null || disposed) return
    const active = new Set(geometry.agents.map(agent => agent.key))
    let changed = false
    for (const [key, mounted] of views) if (!active.has(key)) {
      releaseView(mounted)
      views.delete(key)
      hosts.delete(key)
      changed = true
    }
    const connections = input.providerRegistries?.flatMap(owner => owner.registry.settings.configuration?.connections ?? [])
      .filter((connection, index, all) => all.findIndex(other => other.id === connection.id) === index)
      .map(connection => ({id: connection.id, label: connection.label ?? connection.id, enabled: connection.enabled})) ?? []
    for (const agent of geometry.agents) {
      let mounted = views.get(agent.key)
      const directory = source?.conversations
      if (directory && (!agent.scope || !agent.profile)) continue
      const kind = directory ? "cosmos" : "legacy"
      if (mounted && mounted.kind !== kind) {releaseView(mounted); views.delete(agent.key); mounted = undefined}
      const host = (parked ? null : (mode === "agents" || commonForced) && selected === agent.key && common !== null ? common : hosts.get(agent.key)) ?? (mounted ? parking : null)
      if (host === undefined || host === null) continue
      if (host.ownerDocument !== root.document) throw new Error("Agent host принадлежит другому Document")
      if (directory && agent.scope && agent.profile) {
        const actorScope = agent.scope
        const client = mounted?.kind === "cosmos" ? mounted.client : directory.forActor(actorScope)
        const props: CosmosAgentChatProps = {actorScope, client, profile: agent.profile, connections,
          providerAccess: {atom: agent.atom ?? null, registries: input.providerRegistries, profiles: input.profiles?.targets},
          selectedSessionId: selectedSessions.get(agent.key),
          visible: !parked && host !== parking,
          nativePreparationActive: !parked && common !== null && host === common && selected === agent.key,
          ...(source?.saveAgentProfile ? {onProfileChange: update => source!.saveAgentProfile!(actorScope, update)} : {})}
        if (mounted?.kind === "cosmos") mounted.view.update(props)
        else {mounted = {kind: "cosmos", client, view: new CosmosConstructor(root.document, props)}; views.set(agent.key, mounted)}
      } else if (agent.atom) {
        if (mounted?.kind === "legacy") {
          if (mounted.atom !== agent.atom) {mounted.view.update({atom: agent.atom, chatOnly: true}); mounted.atom = agent.atom}
        } else {mounted = {kind: "legacy", atom: agent.atom, view: new Constructor(root.document, {atom: agent.atom, chatOnly: true})}; views.set(agent.key, mounted)}
      }
      if (!mounted) continue
      const view = mounted.view
      if (!(view instanceof HTMLElement)) throw new Error("Chat должен предоставлять свой native root Element")
      if (view.parentElement !== host) {host.append(view); changed = true}
    }
    if (changed) root.invalidate()
  }
  const publish = () => {
    state = {input, ...geometry, selected, focusedChat, mode}
    for (const listener of listeners) listener()
    syncViews()
  }
  const fit = (bounds: OfficeBounds, direction: {x: number; y: number; z: number}) => {
    if (root === null) return
    network?.suspend()
    const viewport = root.canvas.getBoundingClientRect()
    const pose = ViewPoint.fitPoseForBounds(bounds, direction, {fov: root.viewPoint.fov, aspect: Math.max(1, viewport.width) / Math.max(1, viewport.height)})
    const range = ViewPoint.depthRangeForBounds(bounds, pose)
    root.document.transaction(() => {
      root!.viewPoint.x = pose.position.x
      root!.viewPoint.y = pose.position.y
      root!.viewPoint.z = pose.position.z
      root!.viewPoint.targetX = pose.target.x
      root!.viewPoint.targetY = pose.target.y
      root!.viewPoint.targetZ = pose.target.z
      root!.viewPoint.near = Math.max(1, range?.near ?? 1)
      root!.viewPoint.far = Math.max(range?.far ?? 100000, 100000)
      root!.viewPoint.controls = true
      root!.viewPoint.navigation = "orbit"
    })
    root.invalidate()
  }
  const agentsCamera = () => {
    if (options.externalNavigation) return
    const p = geometry.control
    fit({min: {x: p.x - AGENT_CONTROL_DISPLAY.width / 2, y: p.y - AGENT_CONTROL_DISPLAY.height / 2, z: p.z - .01},
      max: {x: p.x + AGENT_CONTROL_DISPLAY.width / 2, y: p.y + AGENT_CONTROL_DISPLAY.height / 2, z: p.z}}, {x: 0, y: 0, z: 1})
  }
  return {
    get disposed() {return disposed},
    get conversations() {return source?.conversations},
    async refreshRoom(atomRef: import("@metafor/types/metafor/graph").AtomRef) {
      if (!source?.refreshRoom) throw new Error("Комната недоступна")
      await source.refreshRoom(atomRef)
    },
    async createAgent(scope: import("@metafor/types/cosmos/conversation-groups").CosmosRoomScope, name: string, connectionId: string) {
      const directory = source?.conversations
      const connection = input.providerRegistries?.flatMap(owner => owner.registry.settings.configuration?.connections ?? [])
        .find(connection => connection.id === connectionId && connection.enabled)
      if (!directory || scope.verseId !== input.verseId || !connection) throw new Error("Выберите доступное подключение агента")
      const agent = await directory.createAgent(scope, name)
      const client = directory.forActor(agent.scope)
      let configurationError: string | undefined
      try {
        const session = await client.read()
        await client.configureExecution(session.sessionId, {connectionId})
        selectedSessions.set(keyOf(scope.atomRef, agent.scope.agentRef), session.sessionId)
      } catch (error) {
        configurationError = `Агент создан. Подключение пока не сохранено: ${error instanceof Error ? error.message : String(error)}. Откройте настройки этого агента.`
      } finally {client.dispose()}
      return {agent, ...(configurationError ? {configurationError} : {})}
    },
    async createChat(scope: import("@metafor/types/cosmos/agent-profile").CosmosAgentScope, label?: string) {
      const directory = source?.conversations
      const agent = geometry.agents.find(agent => agent.scope?.verseId === scope.verseId && agent.scope.atomRef === scope.atomRef && agent.scope.agentRef === scope.agentRef)
      if (!directory || !agent) throw new Error("Выбранный агент отсутствует в комнате")
      const client = directory.forActor(scope)
      try {
        const session = await client.create(label)
        selectedSessions.set(agent.key, session.sessionId)
        selected = agent.key
        publish()
        officeDisplays.focus(JSON.stringify([agent.officeId, agent.id, "chat"]))
      } finally {client.dispose()}
    },
    getSnapshot: () => state,
    openChat(key: string) {
      const agent = geometry.agents.find(agent => agent.key === key)
      if (!agent) throw new Error("Агент отсутствует в этой комнате")
      officeDisplays.focus(JSON.stringify([agent.officeId, agent.id, "chat"]))
    },
    closeChat(restore = true) {officeDisplays.back(restore)},
    clearSelection() {if (selected === null) return; selected = null; publish()},
    parkViews() {parked = true; common = null; syncViews()},
    setDisplayFocused(focused: boolean) {
      const next = focused ? "agents" : "offices"
      if (mode === next) return
      mode = next
      publish()
    },
    bindParking(element: unknown) {
      if (element !== null && !(element instanceof HTMLElement)) throw new TypeError("Agent parking host должен быть native Element")
      parking = element
      syncViews()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {listeners.delete(listener)}
    },
    attach(presentation: Presentation, networkModel: NetworkSpaceModel) {
      if (disposed || root !== null && root !== presentation) throw new Error("Agent workspace уже имеет другой Root")
      root = presentation
      officeDisplays.attach(presentation)
      network = networkModel
      syncViews()
      agentsCamera()
    },
    connect(value: AgentWorkspaceSource) {
      if (disposed) throw new Error("Agent workspace освобождён")
      unsubscribe()
      const sameSource = source === value
      source = value
      if (!sameSource) input = empty
      const refresh = () => {
        if (source !== value || disposed) return
        const next = value.getSnapshot()
        input = next.status !== "ready" && next.offices.length === 0 && input.offices.length > 0
          ? {...next, offices: input.offices, ...(input.connectableSlots ? {connectableSlots: input.connectableSlots} : {}), profiles: input.profiles ?? null, profileError: next.profileError ?? input.profileError ?? null}
          : next
        geometry = arrange(input)
        if (!geometry.agents.some(agent => agent.key === selected)) selected = options.externalNavigation ? null : geometry.agents[0]?.key ?? null
        publish()
        if (!followedInitial && geometry.agents.length > 0) {
          followedInitial = true
          agentsCamera()
        }
      }
      unsubscribe = value.subscribe(refresh)
      refresh()
      return () => {
        if (source !== value) return
        unsubscribe()
        unsubscribe = () => {}
        source = null
        input = {...empty, status: "ready"}
        geometry = arrange(input)
        selected = null
        publish()
      }
    },
    bindAgentDisplay(key: string, element: DisplayElement | null, geometry: OfficeDisplayGeometry, onRotation: (value: string) => void) {
      officeDisplays.bind(key, element, geometry, onRotation)
    },
    bindWall(office: string, agent: string, value: unknown) {
      const key = keyOf(office, agent)
      if (value === null) hosts.delete(key)
      else if (value instanceof HTMLElement) {hosts.set(key, value); parked = false}
      else throw new TypeError("Agent Display host должен быть native Element")
      syncViews()
    },
    bindCommon(value: unknown, force = false) {
      if (value !== null && !(value instanceof HTMLElement)) throw new TypeError("Agent common host должен быть native Element")
      common = value
      commonForced = value !== null && force
      if (value !== null) parked = false
      syncViews()
    },
    releaseCommon(value: unknown) {
      if (value === null || common !== value) return
      common = null
      commonForced = false
      syncViews()
    },
    select(key: string) {
      if (!geometry.agents.some(agent => agent.key === key)) throw new Error("Agent не подключён")
      selected = key
      mode = "agents"
      publish()
      agentsCamera()
    },
    showAgents() {
      mode = "agents"
      publish()
      agentsCamera()
    },
    async connectSlot(slotRef: import("@metafor/types/metafor/graph").AtomRef, signal: AbortSignal) {
      signal.throwIfAborted()
      const slot = input.connectableSlots?.find(slot => slot.ref === slotRef)
      if (disposed || !source?.connectSlot || !slot || slot.enabled) throw new Error("Объявленный слот недоступен для подключения")
      await source.connectSlot(slotRef, signal)
    },
    async editField(atomRef: import("@metafor/types/metafor/graph").AtomRef, field: string, value: string | number | boolean | null, expectedValue: string | number | boolean | null, signal: AbortSignal) {
      signal.throwIfAborted()
      if (disposed || !source?.editField) throw new Error("Изменение полей недоступно")
      await source.editField(atomRef, field, value, expectedValue, signal)
    },
    async saveFields(atomRef: import("@metafor/types/metafor/graph").AtomRef, updates: readonly import("./agent-workspace-types").AgentFieldUpdate[], signal: AbortSignal) {
      signal.throwIfAborted()
      if (disposed || !source?.saveFields) throw new Error("Сохранение полей недоступно")
      await source.saveFields(atomRef, updates, signal)
    },
    async profileIntent(request: import("@metafor/types/metafor/profile-intent").ProfileIntentRequest, signal: AbortSignal) {
      signal.throwIfAborted()
      const target = input.profiles?.targets.find(target => target.atomRef === request.target.atomRef
        && target.worldIdentity.peerId === request.target.worldIdentity.peerId && target.worldIdentity.root === request.target.worldIdentity.root
        && target.worldIdentity.cutId === request.target.worldIdentity.cutId
        && target.expectedProfile.name === request.expectedProfile.name && target.expectedProfile.saveId === request.expectedProfile.saveId)
      if (disposed || !source?.profileIntent || !target?.available || !target.supportedOperations.includes(request.operation)) throw new Error("Назначенный владелец профиля недоступен")
      await source.profileIntent(request, signal)
    },
    async connectProviderBrowser(target: {providerRef: import("@metafor/types/metafor/graph").AtomRef; entryId: string}, signal: AbortSignal) {
      signal.throwIfAborted()
      const admitted = source
      const entry = input.providerRegistries?.find(provider => provider.ref === target.providerRef)?.registry.entries.find(entry => entry.id === target.entryId)
      if (disposed || !admitted?.connectProviderBrowser || !entry || entry.resolution !== "exact" || entry.connection !== "connected" || !entry.capabilities.browserPreview)
        throw new Error("Просмотр назначенного Provider недоступен")
      const grant = await admitted.connectProviderBrowser(target, signal)
      if (disposed || source !== admitted) {await grant.client.close(); throw new Error("Окружение Provider изменилось")}
      return grant
    },
    showOffices() {
      mode = "offices"
      publish()
      if (!options.externalNavigation) fit(geometry.bounds, {x: .25, y: -.8, z: .65})
    },
    showNetwork() {
      mode = "network"
      publish()
      if (root !== null && network !== null) {
        network.attach(root)
        network.fit()
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      officeDisplays.dispose()
      unsubscribe()
      for (const view of views.values()) releaseView(view)
      views.clear()
      selectedSessions.clear()
      hosts.clear()
      listeners.clear()
      root = null
      network = null
    },
  }
}

export type AgentWorkspaceModel = ReturnType<typeof createAgentWorkspace>
