import type {DisplayElement, HTMLElement, Presentation} from "@zavx0z/immersive"
import type {DevelopmentRoomAgent, DevelopmentRoomChatHost, DevelopmentRoomPorts} from "./development-room-ports"
import {developmentActorId} from "./development-room-ports"
import {createOfficeDisplayView, type OfficeDisplayGeometry} from "./office-display-view"

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
  const chats = new Map<string, {packageName: string; agent: DevelopmentRoomAgent; host: DevelopmentRoomChatHost; preparing: boolean}>()
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
  const ensureChat = (owner: string, agent: DevelopmentRoomAgent) => {
    const id = developmentActorId(owner, agent.executorId)
    if (chats.has(id)) return
    const address = addressFor(owner)
    if (!address) throw new Error("Development package address is unavailable")
    chats.set(id, {packageName: owner, agent, host: ports.chat({address, label: agent.label, executorId: agent.executorId}), preparing: false})
    place()
  }
  const list = (owner: string) => {
    const existing = pending.get(owner)
    if (existing) return existing
    rooms.set(owner, {agents: rooms.get(owner)?.agents ?? [], loading: true, error: null})
    publish()
    const task = ports.agents.list(owner).then(agents => {
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
    attach(root: Presentation) {assertAlive(); officeDisplays.attach(root)},
    bindDisplay(actorId: string, display: DisplayElement | null, geometry: OfficeDisplayGeometry, onRotation: (value: string) => void) {
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
      assertAlive()
      if (element) walls.set(actorId, element)
      else walls.delete(actorId)
      place()
    },
    bindWindow(element: HTMLElement | null) {assertAlive(); window = element; place()},
    bindParking(element: HTMLElement | null) {assertAlive(); parking = element; place()},
    dispose() {
      if (disposed) return
      disposed = true
      for (const {host} of chats.values()) host.dispose()
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
