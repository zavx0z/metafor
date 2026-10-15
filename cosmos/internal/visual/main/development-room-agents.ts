import type {DisplayElement, Document, HTMLElement, Presentation} from "@zavx0z/immersive"
import type {DevelopmentRoomAgent, DevelopmentRoomChatHost, DevelopmentRoomPorts} from "./development-room-ports"
import {developmentActorId} from "./development-room-ports"
import {createOfficeDisplayView, type OfficeDisplayGeometry} from "./office-display-view"
import {createDevelopmentAgentSettings} from "./development-agent-settings"
import type {DevelopmentAgentProfileUpdate} from "../../../release/shared/development-agent"

type Room = {agents: readonly DevelopmentRoomAgent[]; loading: boolean; error: string | null}
export type DevelopmentRoomAgentsSnapshot = Readonly<{
  packageName: string | null
  agents: readonly DevelopmentRoomAgent[]
  loading: boolean
  error: string | null
  selectedActorId: string | null
  chatOpen: boolean
}>

/**
 * Участники читаются только после входа в комнату. Chat одного executorId
 * переносится между её Display, окном и parking того же Document без remount.
 */
export function createDevelopmentRoomAgents(ports: DevelopmentRoomPorts, addressFor: (packageName: string) => string | null) {
  const rooms = new Map<string, Room>()
  const pending = new Map<string, Promise<void>>()
  type Chat = {packageName: string; agent: DevelopmentRoomAgent; host: DevelopmentRoomChatHost; preparing: boolean;
    settings?: ReturnType<typeof createDevelopmentAgentSettings>}
  const chats = new Map<string, Chat>()
  const walls = new Map<string, HTMLElement>()
  const listeners = new Set<() => void>()
  const officeDisplays = createOfficeDisplayView()
  let packageName: string | null = null
  let selectedActorId: string | null = null
  let chatOpen = false
  let active = false
  let parking: HTMLElement | null = null
  let window: HTMLElement | null = null
  let disposed = false
  let document: Document | null = null
  let snapshot: DevelopmentRoomAgentsSnapshot = {packageName, agents: [], loading: false, error: null, selectedActorId, chatOpen}
  const assertAlive = () => {if (disposed) throw new Error("Development room agents are disposed")}
  const publish = () => {
    const room = packageName ? rooms.get(packageName) : null
    snapshot = {packageName, agents: room?.agents ?? [], loading: room?.loading ?? false, error: room?.error ?? null, selectedActorId, chatOpen}
    for (const listener of listeners) listener()
  }
  const place = () => {
    for (const [id, item] of chats) {
      const {packageName: owner, host} = item
      const inRoom = active && owner === packageName
      const preparing = inRoom && chatOpen && selectedActorId === id
      if (item.preparing !== preparing) {
        item.preparing = preparing
        host.setNativePreparationActive?.(preparing)
      }
      const target = preparing ? window : inRoom ? walls.get(id) : null
      if (target) {
        host.moveTo(target)
        host.setVisible(true)
      } else {
        if (parking) host.moveTo(parking)
        host.setVisible(false)
      }
    }
  }
  const updateProfile = async (owner: string, executorId: string, update: DevelopmentAgentProfileUpdate) => {
    if (!ports.agents.updateProfile) throw new Error("Настройки Source агента недоступны")
    const profile = await ports.agents.updateProfile(owner, executorId, update)
    if (disposed) return
    if (profile.scope.packageName !== owner || profile.scope.executorId !== executorId) throw new Error("Identity профиля агента изменилась")
    const room = rooms.get(owner)
    if (!room) throw new Error("Source комната больше не доступна")
    rooms.set(owner, {...room, agents: room.agents.map(agent => agent.executorId === executorId ? {...agent, label: profile.name, profile} : agent)})
    const item = chats.get(developmentActorId(owner, executorId))
    if (item) {item.agent = {...item.agent, label: profile.name, profile}; item.settings?.update(profile)}
    publish()
  }
  const ensureSettings = (item: Chat) => {
    const profile = item.agent.profile
    if (!document || !profile || !ports.agents.updateProfile || !item.host.setAgentSettings) return
    if (item.settings) {item.settings.update(profile); return}
    item.settings = createDevelopmentAgentSettings(document, {profile,
      onSave: update => updateProfile(item.packageName, item.agent.executorId, update)})
    item.host.setAgentSettings(item.settings.element)
  }
  const ensureChat = (owner: string, agent: DevelopmentRoomAgent) => {
    const id = developmentActorId(owner, agent.executorId)
    const previous = chats.get(id)
    if (previous) {previous.agent = agent; ensureSettings(previous); return}
    const address = addressFor(owner)
    if (!address) throw new Error("Development package address is unavailable")
    const item: Chat = {packageName: owner, agent, host: ports.chat({address, label: agent.label, executorId: agent.executorId}), preparing: false}
    chats.set(id, item)
    ensureSettings(item)
    place()
  }
  const list = (owner: string) => {
    const existing = pending.get(owner)
    if (existing) return existing
    rooms.set(owner, {agents: rooms.get(owner)?.agents ?? [], loading: true, error: null})
    publish()
    const task = ports.agents.list(owner).then(async listed => {
      const agents: DevelopmentRoomAgent[] = []
      for (const agent of listed) {
        if (disposed) return
        // Отдельное явное prepare касается только уже посещённого actor; list остаётся чтением.
        const profile = agent.profile ?? await ports.agents.prepareProfile?.(owner, agent.executorId)
        if (profile && (profile.scope.packageName !== owner || profile.scope.executorId !== agent.executorId)) throw new Error("Identity профиля агента изменилась")
        agents.push(profile ? {...agent, label: profile.name, profile} : agent)
      }
      if (disposed) return
      const ids = new Set<string>()
      for (const agent of agents) {
        if (!agent.executorId || ids.has(agent.executorId)) throw new Error("Development room returned duplicate executor identity")
        ids.add(agent.executorId)
      }
      rooms.set(owner, {agents, loading: false, error: null})
      for (const agent of agents) ensureChat(owner, agent)
      place()
      publish()
    }).catch(error => {
      if (disposed) return
      rooms.set(owner, {agents: rooms.get(owner)?.agents ?? [], loading: false,
        error: error instanceof Error ? error.message : "Не удалось получить агентов комнаты"})
      publish()
    }).finally(() => {pending.delete(owner)})
    pending.set(owner, task)
    return task
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    attach(root: Presentation) {
      assertAlive()
      if (document && document !== root.document) throw new Error("Source agents require the same Document")
      document = root.document
      officeDisplays.attach(root)
      for (const item of chats.values()) ensureSettings(item)
    },
    bindDisplay(actorId: string, display: DisplayElement | null, geometry: OfficeDisplayGeometry, onRotation: (value: string) => void) {
      if (disposed && display === null) return
      assertAlive()
      officeDisplays.bind(actorId, display, geometry, onRotation)
    },
    setRoom(next: string | null) {
      assertAlive()
      if (packageName === next) return
      packageName = next
      selectedActorId = null
      chatOpen = false
      place()
      publish()
    },
    setActive(next: boolean) {assertAlive(); active = next; place()},
    /** Каждый явный вход читает roster заново; одновременно идущий запрос переиспользуется. */
    visit(owner: string) {assertAlive(); return list(owner)},
    refresh(owner: string) {assertAlive(); return list(owner)},
    async create(label: string) {
      assertAlive()
      if (!packageName || !rooms.has(packageName)) throw new Error("Сначала войдите в комнату Package")
      const owner = packageName
      const agent = await ports.agents.create(owner, label)
      if (disposed) return
      if (!agent.executorId) throw new Error("Development agent has no executor identity")
      const previous = rooms.get(owner)!
      if (previous.agents.some(value => value.executorId === agent.executorId)) throw new Error("Development agent identity already exists")
      rooms.set(owner, {...previous, agents: [...previous.agents, agent], error: null})
      ensureChat(owner, agent)
      place()
      publish()
      return agent
    },
    open(executorId: string) {
      assertAlive()
      if (!packageName || !rooms.get(packageName)?.agents.some(agent => agent.executorId === executorId)) return false
      selectedActorId = developmentActorId(packageName, executorId)
      chatOpen = true
      place()
      publish()
      return true
    },
    close() {assertAlive(); chatOpen = false; place(); publish()},
    bindWall(actorId: string, element: HTMLElement | null) {
      if (disposed && element === null) return
      assertAlive()
      if (element) walls.set(actorId, element)
      else walls.delete(actorId)
      place()
    },
    bindWindow(element: HTMLElement | null) {if (disposed && element === null) return; assertAlive(); window = element; place()},
    bindParking(element: HTMLElement | null) {if (disposed && element === null) return; assertAlive(); parking = element; place()},
    dispose() {
      if (disposed) return
      disposed = true
      for (const {host, settings} of chats.values()) {host.setAgentSettings?.(null); settings?.dispose(); host.dispose()}
      chats.clear()
      walls.clear()
      rooms.clear()
      pending.clear()
      officeDisplays.dispose()
      listeners.clear()
      parking = window = null
    },
  }
}

export type DevelopmentRoomAgentsModel = ReturnType<typeof createDevelopmentRoomAgents>
