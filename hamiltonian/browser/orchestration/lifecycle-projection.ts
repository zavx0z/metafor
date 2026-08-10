import type {
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemFact,
  NodeSystemNode,
  NodeSystemPort,
  PositionedNodeSystem,
} from "@ui/node"
import type {
  HamiltonianLifecycleEnvelope,
  HamiltonianLifecycleFrontierEntry,
  HamiltonianLifecycleGap,
  HamiltonianLifecycleSnapshot,
} from "../../core/lifecycle.js"
import {hamiltonianLifecycleTransportSlot} from "../../core/lifecycle.js"
import {hamiltonianPageNodeId} from "../../core/orchestration.js"

export {hamiltonianPageNodeId}

export type HamiltonianLifecycleContext = Readonly<{
  origin: string
  deviceId: string
  tabId: string
  pageIncarnation: string
  observedAt: number
  navigationId: string
  servedAt: number
  server: Readonly<{
    identity: string
    hostEpoch: string
    version: string
  }>
}>

type LifecycleEntity = {
  id: string
  kind: string
  ownerId: string | null
  state: string
  attributes: Record<string, string | number | boolean | null>
  bornAt: number
  changedAt: number
}

type LifecycleTransport = {
  id: string
  kind: string
  ownerId: string
  sourceEntityId: string
  targetEntityId: string
  state: string
  attributes: Record<string, string | number | boolean | null>
  openedAt: number
  changedAt: number
  slot: string
}

export type HamiltonianLifecyclePresentation = Readonly<{
  messageId: string
  edgeId: string
  direction: "forward" | "reverse"
  messageClass: string
  at: number
}>

export type HamiltonianLifecycleProjectionOptions = Readonly<{
  messageIdentityCapacity?: number
  terminalIdentityCapacity?: number
}>

const DEFAULT_MESSAGE_IDENTITY_CAPACITY = 4_096
const DEFAULT_TERMINAL_IDENTITY_CAPACITY = 2_048

export class HamiltonianLifecycleProjection {
  readonly #context: HamiltonianLifecycleContext
  readonly #serverId: string
  readonly #pageId: string
  readonly #entities = new Map<string, LifecycleEntity>()
  readonly #transports = new Map<string, LifecycleTransport>()
  readonly #transportSlots = new Map<string, string>()
  readonly #messageIdentityCapacity: number
  readonly #messageIdentities = new Set<string>()
  readonly #messageIdentityOrder: string[] = []
  readonly #terminalEntities = new Set<string>()
  readonly #terminalEntityOrder: string[] = []
  readonly #terminalTransports = new Set<string>()
  readonly #terminalTransportOrder: string[] = []
  readonly #terminalIdentityCapacity: number
  readonly #retiredTransports = new Set<string>()
  readonly #retiredLifecycleSources = new Map<string, {sourceId: string; sourceIncarnation: string}>()
  readonly #gaps = new Map<string, HamiltonianLifecycleGap>()
  readonly #structuralEvents = new Map<string, {sourceKey: string; sequence: number}>()
  #revision = 0

  constructor(
    context: HamiltonianLifecycleContext,
    options: HamiltonianLifecycleProjectionOptions = {},
  ) {
    this.#context = context
    const requestedMessageCapacity = Math.floor(
      options.messageIdentityCapacity ?? DEFAULT_MESSAGE_IDENTITY_CAPACITY,
    )
    this.#messageIdentityCapacity = Number.isFinite(requestedMessageCapacity)
      ? Math.max(1, requestedMessageCapacity)
      : DEFAULT_MESSAGE_IDENTITY_CAPACITY
    const requestedTerminalCapacity = Math.floor(
      options.terminalIdentityCapacity ?? DEFAULT_TERMINAL_IDENTITY_CAPACITY,
    )
    this.#terminalIdentityCapacity = Number.isFinite(requestedTerminalCapacity)
      ? Math.max(1, requestedTerminalCapacity)
      : DEFAULT_TERMINAL_IDENTITY_CAPACITY
    this.#serverId = hamiltonianServerNodeId(context.server.hostEpoch || context.origin)
    this.#pageId = hamiltonianPageNodeId(context.pageIncarnation)
    this.#entities.set(this.#serverId, {
      id: this.#serverId,
      kind: "server",
      ownerId: this.#serverId,
      state: "live",
      attributes: {
        identity: context.server.identity || "hamiltonian",
        version: context.server.version || "unknown",
        epoch: context.server.hostEpoch || "unknown",
        origin: context.origin,
      },
      bornAt: context.servedAt,
      changedAt: context.servedAt,
    })
    this.#entities.set(this.#pageId, {
      id: this.#pageId,
      kind: "page",
      ownerId: this.#pageId,
      state: "live",
      attributes: {
        incarnation: context.pageIncarnation,
        navigation: context.navigationId,
        visibility: "visible",
      },
      bornAt: context.observedAt,
      changedAt: context.observedAt,
    })
  }

  get serverId(): string {
    return this.#serverId
  }

  get pageId(): string {
    return this.#pageId
  }

  get retainedMessageIdentityCount(): number {
    return this.#messageIdentities.size
  }

  get retainedTerminalIdentityCount(): number {
    return this.#terminalEntities.size + this.#terminalTransports.size
  }

  get retainedStructuralEventCount(): number {
    return this.#structuralEvents.size
  }

  get firstGap(): HamiltonianLifecycleGap | null {
    const visible = this.#visibleEntityIds()
    for (const entityId of visible) {
      const entity = this.#entities.get(entityId)
      if (!entity) continue
      const gap = this.#gapsFor(entity)[0]
      if (gap) return gap
    }
    return null
  }

  resolveFrontier(frontier: readonly HamiltonianLifecycleFrontierEntry[]): void {
    for (const entry of frontier) {
      const key = `${entry.sourceId}\u0000${entry.sourceIncarnation}`
      const gap = this.#gaps.get(key)
      if (!gap || entry.sequence < gap.missingFrom) continue
      if (entry.sequence >= gap.missingTo) {
        this.#gaps.delete(key)
      } else {
        this.#gaps.set(key, {
          ...gap,
          expectedSequence: entry.sequence + 1,
          missingFrom: entry.sequence + 1,
        })
      }
    }
  }

  /**
   * A newer retained snapshot is authoritative for every source frontier it
   * covers. Structural subjects missing from that frontier are no longer
   * active; this repairs a close/end event missed during a disconnect without
   * replaying or fabricating the missing event.
   */
  replaceSnapshot(snapshot: HamiltonianLifecycleSnapshot): void {
    const coveredSources = new Set(snapshot.frontier.map((entry) =>
      `${entry.sourceId}\u0000${entry.sourceIncarnation}`))
    const retainedEntities = new Set<string>()
    const retainedTransports = new Set<string>()
    for (const envelope of snapshot.envelopes) {
      if (envelope.observation.type === "entity") retainedEntities.add(envelope.observation.subjectId)
      if (envelope.observation.type === "transport") retainedTransports.add(envelope.observation.subjectId)
    }

    let retired = false
    for (const entity of this.#entities.values()) {
      if (
        entity.id === this.#serverId ||
        entity.id === this.#pageId ||
        entity.kind === "browser-runtime"
      ) continue
      const event = this.#structuralEvents.get(structuralEventKey("entity", entity.id))
      if (!event || !coveredSources.has(event.sourceKey) || retainedEntities.has(entity.id)) continue
      this.#retireEntity(entity.id)
      retired = true
    }
    for (const transport of this.#transports.values()) {
      const event = this.#structuralEvents.get(structuralEventKey("transport", transport.id))
      if (!event || !coveredSources.has(event.sourceKey) || retainedTransports.has(transport.id)) continue
      this.#retireTransport(transport.id)
      retired = true
    }
    if (retired) this.#revision += 1
    for (const envelope of snapshot.envelopes) this.observe(envelope, null)
  }

  takeRetiredTransportIds(): string[] {
    const retired = [...this.#retiredTransports]
    this.#retiredTransports.clear()
    return retired
  }

  takeRetiredLifecycleSources(): Array<{sourceId: string; sourceIncarnation: string}> {
    const retired = [...this.#retiredLifecycleSources.values()]
    this.#retiredLifecycleSources.clear()
    return retired
  }

  observe(envelope: HamiltonianLifecycleEnvelope, gap: HamiltonianLifecycleGap | null): HamiltonianLifecyclePresentation | null {
    this.#revision += 1
    if (gap !== null) {
      this.#gaps.set(`${gap.sourceId}\u0000${gap.sourceIncarnation}`, gap)
    }
    const observation = envelope.observation
    if (observation.type === "entity") {
      this.#observeEntity(envelope)
      return null
    }
    if (observation.type === "transport") {
      this.#observeTransport(envelope)
      return null
    }
    return this.#observeMessage(envelope)
  }

  document(): NodeSystemDocument {
    const ports = new Map<string, NodeSystemPort[]>()
    const transportParameters = new Map<string, NodeSystemFact[]>()
    const edges: NodeSystemEdge[] = []
    const visibleEntityIds = this.#visibleEntityIds()
    const visibleEntities = [...this.#entities.values()].filter((entity) => visibleEntityIds.has(entity.id))
    const activeTransports = [...this.#transports.values()]
      .filter((transport) => visibleEntityIds.has(transport.sourceEntityId) && visibleEntityIds.has(transport.targetEntityId))
      .sort((left, right) => left.openedAt - right.openedAt || left.id.localeCompare(right.id))

    for (const [index, transport] of activeTransports.entries()) {
      const sourcePort = `out:${safeId(transport.id)}`
      const targetPort = `in:${safeId(transport.id)}`
      const sourceParameter = `transport:${safeId(transport.id)}:out`
      const targetParameter = `transport:${safeId(transport.id)}:in`
      const label = transportLabel(transport.kind, transport.attributes)
      addPort(ports, transport.sourceEntityId, {
        id: sourcePort,
        parameterId: sourceParameter,
        direction: "out",
      })
      addPort(ports, transport.targetEntityId, {
        id: targetPort,
        parameterId: targetParameter,
        direction: "in",
      })
      addParameter(transportParameters, transport.sourceEntityId, {
        id: sourceParameter,
        label,
        value: "выход",
        tone: transport.state === "opened" ? "live" : transport.state === "changed" ? "neutral" : "paused",
      })
      addParameter(transportParameters, transport.targetEntityId, {
        id: targetParameter,
        label,
        value: "вход",
        tone: transport.state === "opened" ? "live" : transport.state === "changed" ? "neutral" : "paused",
      })
      edges.push({
        id: transport.id,
        source: {nodeId: transport.sourceEntityId, portId: sourcePort},
        target: {nodeId: transport.targetEntityId, portId: targetPort},
        label,
        tone: transport.state === "opened" ? "live" : transport.state === "changed" ? "neutral" : "paused",
        order: 100 + index,
      })
    }

    const nodes = visibleEntities
      .sort((left, right) => entityOrder(left.kind) - entityOrder(right.kind) || left.bornAt - right.bornAt || left.id.localeCompare(right.id))
      .map((entity, index): NodeSystemNode => ({
        id: entity.id,
        ...(visualParentId(entity, visibleEntityIds) === null
          ? {}
          : {parentId: visualParentId(entity, visibleEntityIds)!}),
        title: entityTitle(entity, this.#pageId),
        kind: entityKindLabel(entity.kind),
        tone: nodeTone(entity.state, this.#hasGap(entity)),
        order: entityOrder(entity.kind) + index,
        ports: ports.get(entity.id) ?? [],
        facts: [
          ...entityFacts(entity, this.#gapsFor(entity)),
          ...(transportParameters.get(entity.id) ?? []),
        ],
        ...(entity.id === this.#pageId ? {
          summary: "Текущая page realm; существует с начала этой загрузки",
          actions: [
            {id: "open-window", label: "Открыть ещё одно окно", tone: "neutral" as const},
            {id: "rebirth-worker", label: "Перезапустить выделенный воркер", tone: "paused" as const},
            {id: "reload", label: "Перезагрузить это окно", tone: "neutral" as const},
          ],
        } : {}),
      }))

    return {
      revision: `lifecycle:${this.#revision}`,
      nodes,
      edges,
    }
  }

  #observeEntity(envelope: HamiltonianLifecycleEnvelope): void {
    const observation = envelope.observation
    if (observation.phase !== "ended" && this.#terminalEntities.has(observation.subjectId)) return
    const existing = this.#entities.get(observation.subjectId)
    if (!this.#advanceStructuralEvent("entity", envelope)) return
    if (observation.phase === "ended") {
      const incarnation = stringAttribute(existing?.attributes.incarnation)
      for (const [key, gap] of this.#gaps) {
        if (gap.sourceId === observation.subjectId || (incarnation && gap.sourceIncarnation === incarnation)) {
          this.#gaps.delete(key)
        }
      }
      this.#retireEntity(observation.subjectId)
      return
    }
    this.#entities.set(observation.subjectId, {
      id: observation.subjectId,
      kind: observation.subjectKind,
      ownerId: observation.ownerId,
      state: stringAttribute(observation.attributes.state) || (observation.phase === "born" ? "live" : existing?.state ?? "live"),
      attributes: {...(existing?.attributes ?? {}), ...observation.attributes},
      bornAt: existing?.bornAt ?? envelope.at,
      changedAt: envelope.at,
    })
  }

  #observeTransport(envelope: HamiltonianLifecycleEnvelope): void {
    const observation = envelope.observation
    if (observation.phase !== "closed" && this.#terminalTransports.has(observation.subjectId)) return
    if (!this.#advanceStructuralEvent("transport", envelope)) return
    if (observation.ownerId === null || observation.sourceEntityId === null || observation.targetEntityId === null) return
    const slot = hamiltonianLifecycleTransportSlot(observation)
    if (slot === null) return
    const previousTransportId = this.#transportSlots.get(slot)
    if (previousTransportId && previousTransportId !== observation.subjectId) {
      this.#retireTransport(previousTransportId)
    }
    const existing = this.#transports.get(observation.subjectId)
    this.#transports.set(observation.subjectId, {
      id: observation.subjectId,
      kind: observation.subjectKind,
      ownerId: observation.ownerId,
      sourceEntityId: observation.sourceEntityId,
      targetEntityId: observation.targetEntityId,
      state: observation.phase,
      attributes: {...(existing?.attributes ?? {}), ...observation.attributes},
      openedAt: existing?.openedAt ?? envelope.at,
      changedAt: envelope.at,
      slot,
    })
    this.#transportSlots.set(slot, observation.subjectId)
    if (observation.phase === "closed") {
      this.#retainTerminalIdentity(
        this.#terminalTransports,
        this.#terminalTransportOrder,
        observation.subjectId,
      )
      this.#retiredTransports.add(observation.subjectId)
    }
  }

  #observeMessage(envelope: HamiltonianLifecycleEnvelope): HamiltonianLifecyclePresentation | null {
    const observation = envelope.observation
    if (
      observation.messageId === null ||
      observation.transportId === null ||
      observation.messageClass === null ||
      observation.sourceEntityId === null ||
      observation.targetEntityId === null
    ) return null
    if (this.#messageIdentities.has(observation.messageId)) return null
    const transport = this.#transports.get(observation.transportId)
    if (
      transport === undefined ||
      transport.state === "closed" ||
      !this.#entities.has(transport.sourceEntityId) ||
      !this.#entities.has(transport.targetEntityId)
    ) return null
    const forward =
      observation.sourceEntityId === transport.sourceEntityId &&
      observation.targetEntityId === transport.targetEntityId
    const reverse =
      observation.sourceEntityId === transport.targetEntityId &&
      observation.targetEntityId === transport.sourceEntityId
    if (!forward && !reverse) return null
    this.#retainMessageIdentity(observation.messageId)
    return {
      messageId: observation.messageId,
      edgeId: observation.transportId,
      direction: forward ? "forward" : "reverse",
      messageClass: observation.messageClass,
      at: envelope.at,
    }
  }

  #retainMessageIdentity(messageId: string): void {
    this.#messageIdentities.add(messageId)
    this.#messageIdentityOrder.push(messageId)
    if (this.#messageIdentityOrder.length <= this.#messageIdentityCapacity) return
    const removed = this.#messageIdentityOrder.splice(
      0,
      this.#messageIdentityOrder.length - this.#messageIdentityCapacity,
    )
    for (const id of removed) this.#messageIdentities.delete(id)
  }

  #gapsFor(entity: LifecycleEntity): HamiltonianLifecycleGap[] {
    return [...this.#gaps.values()].filter((gap) =>
      gap.sourceId === entity.id || gap.sourceIncarnation === stringAttribute(entity.attributes.incarnation))
  }

  #hasGap(entity: LifecycleEntity): boolean {
    return this.#gapsFor(entity).length > 0
  }

  #advanceStructuralEvent(type: "entity" | "transport", envelope: HamiltonianLifecycleEnvelope): boolean {
    const key = structuralEventKey(type, envelope.observation.subjectId)
    const sourceKey = `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`
    const previous = this.#structuralEvents.get(key)
    if (previous?.sourceKey === sourceKey && envelope.sequence <= previous.sequence) return false
    this.#structuralEvents.set(key, {sourceKey, sequence: envelope.sequence})
    return true
  }

  #retireEntity(entityId: string): void {
    const entity = this.#entities.get(entityId)
    const incarnation = stringAttribute(entity?.attributes.incarnation)
    if (entity && incarnation && isLifecycleSourceEntityKind(entity.kind)) {
      const key = `${entity.id}\u0000${incarnation}`
      this.#retiredLifecycleSources.set(key, {sourceId: entity.id, sourceIncarnation: incarnation})
    }
    this.#retainTerminalIdentity(
      this.#terminalEntities,
      this.#terminalEntityOrder,
      entityId,
    )
    this.#structuralEvents.delete(structuralEventKey("entity", entityId))
    this.#entities.delete(entityId)
    for (const transport of [...this.#transports.values()]) {
      if (transport.sourceEntityId === entityId || transport.targetEntityId === entityId) {
        this.#retireTransport(transport.id)
      }
    }
  }

  #retireTransport(transportId: string): void {
    const transport = this.#transports.get(transportId)
    this.#retainTerminalIdentity(
      this.#terminalTransports,
      this.#terminalTransportOrder,
      transportId,
    )
    this.#structuralEvents.delete(structuralEventKey("transport", transportId))
    this.#retiredTransports.add(transportId)
    if (transport && this.#transportSlots.get(transport.slot) === transportId) {
      this.#transportSlots.delete(transport.slot)
    }
    this.#transports.delete(transportId)
  }

  #retainTerminalIdentity(set: Set<string>, order: string[], id: string): void {
    if (set.has(id)) return
    set.add(id)
    order.push(id)
    if (order.length <= this.#terminalIdentityCapacity) return
    const removed = order.splice(0, order.length - this.#terminalIdentityCapacity)
    for (const removedId of removed) set.delete(removedId)
  }

  /**
   * A retained entity is visible only when its owner/transport chain reaches
   * this navigation's server or page. Merely retaining an old owner entity is
   * not enough: that previously leaked orphan RTC peers after a host restart.
   */
  #visibleEntityIds(): Set<string> {
    const visible = new Set([this.#serverId, this.#pageId])
    for (const entity of this.#entities.values()) {
      if (
        entity.ownerId === entity.id &&
        (
          entity.kind === "browser-runtime" ||
          entity.kind === "service-worker" ||
          entity.kind === "dedicated-worker"
        )
      ) visible.add(entity.id)
    }
    let changed = true
    while (changed) {
      changed = false
      for (const entity of this.#entities.values()) {
        if (visible.has(entity.id)) continue
        if (entity.ownerId !== null && visible.has(entity.ownerId)) {
          visible.add(entity.id)
          changed = true
        }
      }
      for (const transport of this.#transports.values()) {
        const sourceVisible = visible.has(transport.sourceEntityId)
        const targetVisible = visible.has(transport.targetEntityId)
        if (sourceVisible === targetVisible) continue
        const next = sourceVisible ? transport.targetEntityId : transport.sourceEntityId
        if (!this.#entities.has(next) || visible.has(next)) continue
        visible.add(next)
        changed = true
      }
    }
    return visible
  }
}

function structuralEventKey(type: "entity" | "transport", subjectId: string): string {
  return `${type}\u0000${subjectId}`
}

export function hamiltonianServerNodeId(hostEpochOrOrigin: string): string {
  return `server:${safeId(hostEpochOrOrigin || "unknown")}`
}

export function hamiltonianLifecycleNeedsDocument(
  envelope: HamiltonianLifecycleEnvelope,
  gap: HamiltonianLifecycleGap | null,
): boolean {
  return gap !== null || envelope.observation.type !== "message"
}

/** Structural identity excludes telemetry and node copy, so layout is reused. */
export function nodeSystemStructureKey(document: NodeSystemDocument): string {
  return JSON.stringify({
    nodes: document.nodes.map((node) => ({
      id: node.id,
      order: node.order ?? 0,
      parentId: node.parentId ?? null,
      ports: (node.ports ?? []).map((port) =>
        `${port.id}:${port.parameterId}:${port.direction}:${port.side ?? "auto"}`).sort(),
    })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: document.edges.map((item) => ({
      id: item.id,
      order: item.order ?? 0,
      source: `${item.source.nodeId}/${item.source.portId}`,
      target: `${item.target.nodeId}/${item.target.portId}`,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  })
}

/** Replaces observable labels/facts while preserving layout geometry and canvas transform. */
export function refreshPositionedNodeSystem(
  layout: PositionedNodeSystem,
  document: NodeSystemDocument,
): PositionedNodeSystem {
  const nodes = new Map(document.nodes.map((node) => [node.id, node]))
  const edges = new Map(document.edges.map((item) => [item.id, item]))
  return {
    ...layout,
    ...(document.revision === undefined ? {} : {revision: document.revision}),
    nodes: layout.nodes.map((entry) => {
      const node = nodes.get(entry.node.id)
      if (!node) throw new Error(`Structural update removed node: ${entry.node.id}`)
      const nodePorts = new Map((node.ports ?? []).map((port) => [port.id, port]))
      return {
        ...entry,
        node: preservePresentationFactOrder(entry.node, node),
        ports: entry.ports.map((entryPort) => ({
          ...entryPort,
          port: nodePorts.get(entryPort.port.id) ?? entryPort.port,
        })),
      }
    }),
    edges: layout.edges.map((entry) => {
      const next = edges.get(entry.edge.id)
      if (!next) throw new Error(`Structural update removed edge: ${entry.edge.id}`)
      return {...entry, edge: next}
    }),
  }
}

function preservePresentationFactOrder(
  previous: NodeSystemNode,
  current: NodeSystemNode,
): NodeSystemNode {
  if (previous.facts === undefined || current.facts === undefined) return current
  const currentById = new Map(current.facts.map((fact) => [fact.id, fact]))
  const ordered = previous.facts.flatMap((fact) => {
    const next = currentById.get(fact.id)
    if (next === undefined) return []
    currentById.delete(fact.id)
    return [next]
  })
  for (const fact of current.facts) {
    if (currentById.has(fact.id)) ordered.push(fact)
  }
  return ordered.every((fact, index) => fact === current.facts![index])
    ? current
    : {...current, facts: ordered}
}

function addPort(ports: Map<string, NodeSystemPort[]>, nodeId: string, port: NodeSystemPort): void {
  const current = ports.get(nodeId) ?? []
  current.push(port)
  ports.set(nodeId, current)
}

function addParameter(
  parameters: Map<string, NodeSystemFact[]>,
  nodeId: string,
  parameter: NodeSystemFact,
): void {
  const current = parameters.get(nodeId) ?? []
  current.push(parameter)
  parameters.set(nodeId, current)
}

function entityFacts(entity: LifecycleEntity, gaps: HamiltonianLifecycleGap[]) {
  const facts: Array<NonNullable<NodeSystemNode["facts"]>[number]> = Object.entries(entity.attributes)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => ({id: key, label: factLabel(key), value: compactValue(value ?? "")}))
  for (const [index, gap] of gaps.entries()) {
    facts.push({
      id: `gap-${index}`,
      label: "Потеряны события",
      value: `${gap.missingFrom}…${gap.missingTo}`,
      tone: "warn" as const,
    })
  }
  return facts
}

function entityTitle(entity: LifecycleEntity, pageId: string): string {
  if (entity.id === pageId) return "Эта страница"
  if (entity.kind === "server") return "Сервер"
  if (entity.kind === "browser-runtime") return stringAttribute(entity.attributes.runtime) || "Браузер"
  if (entity.kind === "service-worker") return "Service Worker"
  if (entity.kind === "dedicated-worker") return "Dedicated Worker"
  if (entity.kind === "window-main") return "main"
  if (entity.kind === "bun-process") return stringAttribute(entity.attributes.role) || "Процесс Bun"
  if (entity.kind === "peer-process") return "Peer process"
  if (entity.kind === "rtc-peer") {
    return stringAttribute(entity.attributes.endpoint) === "server"
      ? "RTCPeerConnection сервера"
      : "RTCPeerConnection страницы"
  }
  return entity.kind
}

function entityKindLabel(kind: string): string {
  if (kind === "server") return "Bun host Hamiltonian"
  if (kind === "browser-runtime") return "user-agent runtime"
  if (kind === "page") return "page realm"
  if (kind === "service-worker") return "ServiceWorkerGlobalScope"
  if (kind === "dedicated-worker") return "DedicatedWorkerGlobalScope"
  if (kind === "window-main") return "Window main realm"
  if (kind === "bun-process") return "процесс Bun в ОС"
  if (kind === "peer-process") return "процесс WebRTC peer в ОС"
  if (kind === "rtc-peer") return "RTCPeerConnection"
  return kind
}

function transportLabel(kind: string, attributes: Record<string, string | number | boolean | null>): string {
  if (kind === "websocket") return attributes.protocol === "wss" ? "WSS" : "WS"
  if (kind === "controller") return "ServiceWorker controller"
  if (kind === "message-port") return "MessagePort"
  if (kind === "worker-message") return "Worker messaging"
  if (kind === "broadcast-channel") return "BroadcastChannel"
  if (kind === "ipc") return "IPC"
  if (kind === "data-channel") {
    const lane = stringAttribute(attributes.lane)
    if (lane === "oracle") return "Oracle RTCDataChannel"
    if (lane === "force") return "Force RTCDataChannel"
    return "RTCDataChannel"
  }
  return kind
}

function nodeTone(state: string, hasGap: boolean): "neutral" | "live" | "paused" | "warn" {
  if (hasGap || state === "error" || state === "failed") return "warn"
  if (state === "paused" || state === "stopped") return "paused"
  return "live"
}

function entityOrder(kind: string): number {
  if (kind === "server") return 0
  if (kind === "browser-runtime") return 5
  if (kind === "page") return 10
  if (kind === "service-worker") return 20
  if (kind === "window-main") return 31
  if (kind === "bun-process") return 30
  if (kind === "peer-process") return 35
  if (kind === "dedicated-worker") return 40
  if (kind === "rtc-peer") return 50
  return 90
}

function visualParentId(entity: LifecycleEntity, visible: ReadonlySet<string>): string | null {
  if (
    entity.ownerId === null ||
    entity.ownerId === entity.id ||
    !visible.has(entity.ownerId)
  ) return null
  return entity.kind === "page" ||
    entity.kind === "service-worker" ||
    entity.kind === "window-main" ||
    entity.kind === "dedicated-worker" ||
    entity.kind === "rtc-peer"
    ? entity.ownerId
    : null
}

function isLifecycleSourceEntityKind(kind: string): boolean {
  return kind === "page" ||
    kind === "service-worker" ||
    kind === "dedicated-worker" ||
    kind === "bun-process" ||
    kind === "peer-process" ||
    kind === "server"
}

function factLabel(key: string): string {
  const labels: Record<string, string> = {
    connectionId: "Соединение",
    deviceId: "Устройство",
    endpoint: "Сторона",
    epoch: "Эпоха",
    generation: "Поколение",
    incarnation: "Воплощение",
    identity: "Identity",
    navigation: "Navigation",
    origin: "Адрес",
    pid: "PID",
    peerId: "Peer",
    role: "Роль",
    runtime: "Runtime",
    state: "Состояние",
    sessionEpoch: "Сессия",
    version: "Версия",
    visibility: "Видимость",
  }
  return labels[key] ?? key
}

function compactValue(value: string | number | boolean): string {
  const text = String(value)
  return text.length <= 24 ? text : `${text.slice(0, 8)}…${text.slice(-6)}`
}

function stringAttribute(value: string | number | boolean | null | undefined): string {
  return typeof value === "string" ? value : ""
}

function safeId(value: string): string {
  return encodeURIComponent(value || "unknown")
}
