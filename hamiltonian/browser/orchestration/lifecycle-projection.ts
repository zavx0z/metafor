import type {
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemFact,
  NodeSystemNode,
  NodeSystemPort,
  PositionedNodeSystem,
} from "nodes/types"
import type {
  HamiltonianLifecycleEnvelope,
  HamiltonianLifecycleFrontierEntry,
  HamiltonianLifecycleGap,
  HamiltonianLifecycleSnapshot,
  HamiltonianNodeSystemDeclaration,
  HamiltonianNodeSystemBoundaryTransport,
} from "../../core/lifecycle.js"
import {
  HamiltonianNodeSystemDeclarationRegistry,
  createHamiltonianLifecycleEnvelope,
  createHamiltonianLifecycleObservation,
  hamiltonianLifecycleTransportSlot,
  hamiltonianLogicalContourId,
} from "../../core/lifecycle.js"
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
const SERVER_CONTOUR_NODE_ID = "server-contour"

export class HamiltonianLifecycleProjection {
  readonly #context: HamiltonianLifecycleContext
  readonly #navigationServerId: string
  readonly #serverLogicalContourId: string
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
  readonly #snapshotEntitiesByScope = new Map<string, Set<string>>()
  readonly #snapshotTransportsByScope = new Map<string, Set<string>>()
  readonly #declarationRegistry = new HamiltonianNodeSystemDeclarationRegistry()
  readonly #declarationRoots = new Map<string, string>()
  readonly #declaredEntityIds = new Set<string>()
  readonly #declaredTransportIds = new Set<string>()
  readonly #declaredSourceKeys = new Set<string>()
  readonly #boundaryTransportsByContour = new Map<string, Set<string>>()
  readonly #supersededDeclarationSources = new Set<string>()
  #currentServerId: string
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
    this.#navigationServerId = hamiltonianServerNodeId(context.server.hostEpoch || context.origin)
    this.#serverLogicalContourId = hamiltonianLogicalContourId(
      "server",
      context.server.identity || "hamiltonian",
    )
    this.#currentServerId = this.#navigationServerId
    this.#pageId = hamiltonianPageNodeId(context.pageIncarnation)
    this.#entities.set(this.#navigationServerId, {
      id: this.#navigationServerId,
      kind: "server",
      ownerId: this.#navigationServerId,
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
    return this.#currentServerId
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
   * covers, except for structural subjects retained by a current declaration.
   * Only the next accepted declaration may change that membership; a raw
   * snapshot cannot make its still-current endpoint disappear between wire
   * updates. Undeclared subjects missing from the frontier are no longer
   * active, repairing a close/end event missed during a disconnect.
  */
  replaceSnapshot(snapshot: HamiltonianLifecycleSnapshot): void {
    this.#replaceSnapshot(snapshot, false)
  }

  #replaceSnapshot(snapshot: HamiltonianLifecycleSnapshot, declarationAuthority: boolean): void {
    const retainedFrontier = snapshot.frontier.filter((entry) =>
      !this.#supersededDeclarationSources.has(
        `${entry.sourceId}\u0000${entry.sourceIncarnation}`,
      ))
    const retainedEnvelopes = snapshot.envelopes.filter((envelope) =>
      !this.#supersededDeclarationSources.has(
        `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`,
      ))
    const coveredSources = new Set(retainedFrontier.map((entry) =>
      `${entry.sourceId}\u0000${entry.sourceIncarnation}`))
    const retainedEntities = new Set<string>()
    const retainedTransports = new Set<string>()
    for (const envelope of retainedEnvelopes) {
      if (envelope.observation.type === "entity") retainedEntities.add(envelope.observation.subjectId)
      if (envelope.observation.type === "transport") retainedTransports.add(envelope.observation.subjectId)
    }

    let retired = false
    const previousEntities = this.#snapshotEntitiesByScope.get(snapshot.scopeId) ?? new Set<string>()
    const previousTransports = this.#snapshotTransportsByScope.get(snapshot.scopeId) ?? new Set<string>()
    const retainedLocalPage = retainedEnvelopes.find(({observation}) =>
      observation.type === "entity" && observation.subjectId === this.#pageId)
    const localBrowserOwnerId = retainedLocalPage?.observation.ownerId ??
      this.#entities.get(this.#pageId)?.ownerId
    const missingPreviousBrowserRoots = [...previousEntities].filter((entityId) => {
      const entity = this.#entities.get(entityId)
      return entity?.kind === "browser-runtime" &&
        entityId !== localBrowserOwnerId &&
        !retainedEntities.has(entityId)
    })
    for (const browserId of missingPreviousBrowserRoots) {
      if (this.#declaredEntityIds.has(browserId)) continue
      this.#forgetEntity(browserId)
      retired = true
    }
    for (const entityId of previousEntities) {
      const entity = this.#entities.get(entityId)
      if (
        retainedEntities.has(entityId) ||
        this.#declaredEntityIds.has(entityId) ||
        entityId === this.#navigationServerId ||
        entityId === this.#pageId ||
        (entity?.kind === "browser-runtime" && entityId === localBrowserOwnerId)
      ) continue
      if (!entity) continue
      this.#retireEntity(entityId)
      retired = true
    }
    for (const transportId of previousTransports) {
      if (
        retainedTransports.has(transportId) ||
        this.#declaredTransportIds.has(transportId) ||
        !this.#transports.has(transportId)
      ) continue
      this.#retireTransport(transportId)
      retired = true
    }
    this.#snapshotEntitiesByScope.set(snapshot.scopeId, retainedEntities)
    this.#snapshotTransportsByScope.set(snapshot.scopeId, retainedTransports)

    const missingCoveredBrowserRoots = [...this.#entities.values()].filter((entity) => {
      if (entity.kind !== "browser-runtime" || entity.id === localBrowserOwnerId) return false
      const event = this.#structuralEvents.get(structuralEventKey("entity", entity.id))
      return event !== undefined &&
        coveredSources.has(event.sourceKey) &&
        !retainedEntities.has(entity.id)
    })
    for (const browser of missingCoveredBrowserRoots) {
      if (this.#declaredEntityIds.has(browser.id)) continue
      this.#forgetEntity(browser.id)
      retired = true
    }
    for (const entity of this.#entities.values()) {
      if (
        entity.id === this.#navigationServerId ||
        entity.id === this.#pageId ||
        entity.kind === "browser-runtime" ||
        this.#declaredEntityIds.has(entity.id)
      ) continue
      const event = this.#structuralEvents.get(structuralEventKey("entity", entity.id))
      if (!event || !coveredSources.has(event.sourceKey) || retainedEntities.has(entity.id)) continue
      this.#retireEntity(entity.id)
      retired = true
    }
    for (const transport of this.#transports.values()) {
      if (this.#declaredTransportIds.has(transport.id)) continue
      const event = this.#structuralEvents.get(structuralEventKey("transport", transport.id))
      if (!event || !coveredSources.has(event.sourceKey) || retainedTransports.has(transport.id)) continue
      this.#retireTransport(transport.id)
      retired = true
    }
    if (retired) this.#revision += 1
    for (const envelope of retainedEnvelopes) this.#observe(envelope, null, declarationAuthority)
  }

  /**
   * Applies one validated retained contour as an indivisible structural unit.
   * A newer incarnation removes the previous root and every transport that
   * referenced it before any envelope from the successor is materialized.
   */
  replaceDeclaration(declaration: HamiltonianNodeSystemDeclaration): boolean {
    const accepted = this.#declarationRegistry.accept(declaration)
    if (!accepted) return false
    this.#refreshDeclaredSubjects()
    for (const reconciled of accepted.reconciled) {
      this.#replaceBoundaryTransports(reconciled.declaration)
    }
    if (accepted.previous !== null && accepted.previous.incarnation !== declaration.incarnation) {
      for (const entry of accepted.previous.snapshot.frontier) {
        const key = `${entry.sourceId}\u0000${entry.sourceIncarnation}`
        this.#supersededDeclarationSources.add(key)
        this.#retiredLifecycleSources.set(key, {
          sourceId: entry.sourceId,
          sourceIncarnation: entry.sourceIncarnation,
        })
      }
    }
    const previousRootId = this.#declarationRoots.get(declaration.logicalContourId) ?? null
    if (previousRootId !== null && previousRootId !== declaration.rootId) {
      this.#forgetEntity(previousRootId)
    }
    this.#declarationRoots.set(declaration.logicalContourId, declaration.rootId)
    this.#terminalEntities.delete(declaration.rootId)
    this.#replaceSnapshot(declaration.snapshot, true)
    this.#replaceBoundaryTransports(declaration)
    if (declaration.logicalContourId === this.#serverLogicalContourId) {
      this.#currentServerId = declaration.rootId
    }
    return true
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

  observe(
    envelope: HamiltonianLifecycleEnvelope,
    gap: HamiltonianLifecycleGap | null,
  ): HamiltonianLifecyclePresentation | null {
    return this.#observe(envelope, gap, false)
  }

  #observe(
    envelope: HamiltonianLifecycleEnvelope,
    gap: HamiltonianLifecycleGap | null,
    declarationAuthority: boolean,
  ): HamiltonianLifecyclePresentation | null {
    if (this.#supersededDeclarationSources.has(
      `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`,
    )) return null
    this.#revision += 1
    if (gap !== null) {
      this.#gaps.set(`${gap.sourceId}\u0000${gap.sourceIncarnation}`, gap)
    }
    const observation = envelope.observation
    if (observation.type === "entity") {
      this.#observeEntity(envelope, declarationAuthority)
      return null
    }
    if (observation.type === "transport") {
      this.#observeTransport(envelope, declarationAuthority)
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
      .filter((transport) =>
        visibleEntityIds.has(transport.sourceEntityId) &&
        visibleEntityIds.has(transport.targetEntityId) &&
        !this.#transportCrossesBrowserOwnershipBoundary(transport))
      .sort((left, right) => left.openedAt - right.openedAt || left.id.localeCompare(right.id))

    for (const [index, transport] of activeTransports.entries()) {
      const label = transportLabel(transport.kind, transport.attributes)
      const connectionType = transportConnectionType(transport.kind, transport.attributes)
      const directedPair = transport.kind === "service-worker-api"
      const sharedParameterRole = transport.kind === "websocket"
        ? "duplex"
        : directedPair ? "channel" : null
      const sourceSlot = transportEndpointSlot(label, "out", sharedParameterRole)
      const targetSlot = transportEndpointSlot(label, "in", sharedParameterRole)
      const tone = transport.state === "opened" ? "live" : transport.state === "changed" ? "neutral" : "paused"
      addPort(ports, transport.sourceEntityId, {
        id: sourceSlot.portId,
        parameterId: sourceSlot.parameterId,
        direction: "out",
        connectionType,
      })
      addPort(ports, transport.targetEntityId, {
        id: targetSlot.portId,
        parameterId: targetSlot.parameterId,
        direction: "in",
        connectionType,
      })
      if (directedPair) {
        addPort(ports, transport.sourceEntityId, {
          id: targetSlot.portId,
          parameterId: targetSlot.parameterId,
          direction: "in",
          connectionType,
        })
        addPort(ports, transport.targetEntityId, {
          id: sourceSlot.portId,
          parameterId: sourceSlot.parameterId,
          direction: "out",
          connectionType,
        })
      }
      addParameter(transportParameters, transport.sourceEntityId, {
        id: sourceSlot.parameterId,
        label,
        value: sharedParameterRole === null ? "выход" : "вход / выход",
        tone,
      })
      addParameter(transportParameters, transport.targetEntityId, {
        id: targetSlot.parameterId,
        label,
        value: sharedParameterRole === null ? "вход" : "вход / выход",
        tone,
      })
      edges.push({
        id: transport.id,
        source: {nodeId: transport.sourceEntityId, portId: sourceSlot.portId},
        target: {nodeId: transport.targetEntityId, portId: targetSlot.portId},
        label,
        connectionType,
        tone,
        order: 100 + index * 2,
      })
      if (directedPair) {
        edges.push({
          id: serviceWorkerApiReverseEdgeId(transport.id),
          source: {nodeId: transport.targetEntityId, portId: sourceSlot.portId},
          target: {nodeId: transport.sourceEntityId, portId: targetSlot.portId},
          label,
          connectionType,
          tone,
          order: 101 + index * 2,
        })
      }
    }

    const layoutIds = stableEntityLayoutIds(
      visibleEntities,
      visibleEntityIds,
      this.#currentServerId,
      this.#pageId,
      this.#context.tabId,
    )
    const entityNodes = visibleEntities
      .sort((left, right) =>
        entityOrder(left.kind) - entityOrder(right.kind) ||
        requiredLayoutId(layoutIds, left.id).localeCompare(requiredLayoutId(layoutIds, right.id)))
      .map((entity, index): NodeSystemNode => {
        const failedHeartbeat = serviceWorkerControlFailed(entity, activeTransports)
        const presentedEntity = failedHeartbeat
          ? {
              ...entity,
              state: "error",
              attributes: {...entity.attributes, state: "error", heartbeat: "failed"},
            }
          : entity
        const parentId = visualParentId(presentedEntity, visibleEntityIds, this.#currentServerId)
        return {
          id: presentedEntity.id,
          layoutId: requiredLayoutId(layoutIds, presentedEntity.id),
          ...(parentId === null ? {} : {parentId}),
          title: entityTitle(presentedEntity, this.#pageId),
          kind: presentedEntity.kind === "browser-runtime"
            ? browserProfileHeader(presentedEntity)
            : presentedEntity.kind === "service-worker"
              ? serviceWorkerHeader(presentedEntity)
              : entityKindLabel(presentedEntity.kind),
          tone: nodeTone(presentedEntity.state, this.#hasGap(presentedEntity)),
          order: index,
          ports: ports.get(presentedEntity.id) ?? [],
          facts: [
            ...entityFacts(presentedEntity, this.#gapsFor(presentedEntity)),
            ...(transportParameters.get(presentedEntity.id) ?? []),
          ],
          ...(presentedEntity.id === this.#pageId ? {
            summary: "Текущая page realm; существует с начала этой загрузки",
            actions: [
              {id: "open-window", label: "Открыть ещё одно окно", tone: "neutral" as const},
              {id: "rebirth-worker", label: "Перезапустить выделенный воркер", tone: "paused" as const},
              {id: "reload", label: "Перезагрузить это окно", tone: "neutral" as const},
            ],
          } : {}),
          ...(presentedEntity.kind === "service-worker" ? {
            actions: [
              {id: "enable-push", label: "Настроить Web Push", tone: "neutral" as const},
            ],
          } : {}),
        }
      })
    const nodes: NodeSystemNode[] = [
      {
        id: SERVER_CONTOUR_NODE_ID,
        title: "Сервер",
        tone: "live",
        order: -1,
      },
      ...entityNodes,
    ]

    return {
      revision: `lifecycle:${this.#revision}`,
      nodes,
      edges,
    }
  }

  #observeEntity(envelope: HamiltonianLifecycleEnvelope, declarationAuthority = false): void {
    const observation = envelope.observation
    if (
      !declarationAuthority &&
      !this.#declaredEntityIds.has(observation.subjectId) &&
      (
        this.#declaredSourceKeys.has(lifecycleSourceKey(envelope)) ||
        (observation.ownerId !== null && this.#declaredEntityIds.has(observation.ownerId))
      )
    ) return
    if (
      observation.phase === "ended" &&
      !declarationAuthority &&
      this.#declaredEntityIds.has(observation.subjectId)
    ) return
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
    if (observation.ownerId !== null && this.#terminalEntities.has(observation.ownerId)) {
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

  #observeTransport(envelope: HamiltonianLifecycleEnvelope, declarationAuthority = false): void {
    const observation = envelope.observation
    if (
      !declarationAuthority &&
      !this.#declaredTransportIds.has(observation.subjectId) &&
      (
        this.#declaredSourceKeys.has(lifecycleSourceKey(envelope)) ||
        [observation.ownerId, observation.sourceEntityId, observation.targetEntityId]
          .some((entityId) => entityId !== null && this.#declaredEntityIds.has(entityId))
      )
    ) return
    if (
      observation.phase === "closed" &&
      !declarationAuthority &&
      this.#declaredTransportIds.has(observation.subjectId)
    ) return
    if (observation.phase !== "closed" && this.#terminalTransports.has(observation.subjectId)) return
    if (!this.#advanceStructuralEvent("transport", envelope)) return
    if (observation.ownerId === null || observation.sourceEntityId === null || observation.targetEntityId === null) return
    if (
      this.#terminalEntities.has(observation.ownerId) ||
      this.#terminalEntities.has(observation.sourceEntityId) ||
      this.#terminalEntities.has(observation.targetEntityId)
    ) {
      this.#retireTransport(observation.subjectId)
      return
    }
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
      if (observation.subjectKind === "service-worker-api") {
        this.#retiredTransports.add(serviceWorkerApiReverseEdgeId(observation.subjectId))
      }
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
      !this.#entities.has(transport.targetEntityId) ||
      this.#transportCrossesBrowserOwnershipBoundary(transport)
    ) return null
    const forward =
      observation.sourceEntityId === transport.sourceEntityId &&
      observation.targetEntityId === transport.targetEntityId
    const reverse =
      observation.sourceEntityId === transport.targetEntityId &&
      observation.targetEntityId === transport.sourceEntityId
    if (!forward && !reverse) return null
    this.#retainMessageIdentity(observation.messageId)
    const directedPair = transport.kind === "service-worker-api"
    return {
      messageId: observation.messageId,
      edgeId: directedPair && reverse
        ? serviceWorkerApiReverseEdgeId(observation.transportId)
        : observation.transportId,
      direction: directedPair ? "forward" : forward ? "forward" : "reverse",
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

  #browserOwnershipRoot(entityId: string): string | null {
    const visited = new Set<string>()
    let currentId = entityId
    while (!visited.has(currentId)) {
      visited.add(currentId)
      const current = this.#entities.get(currentId)
      if (current === undefined) return null
      if (current.kind === "browser-runtime") return current.id
      if (current.ownerId === null || current.ownerId === currentId) return null
      currentId = current.ownerId
    }
    return null
  }

  #transportCrossesBrowserOwnershipBoundary(transport: LifecycleTransport): boolean {
    const browserRoots = new Set([
      this.#browserOwnershipRoot(transport.ownerId),
      this.#browserOwnershipRoot(transport.sourceEntityId),
      this.#browserOwnershipRoot(transport.targetEntityId),
    ].filter((rootId): rootId is string => rootId !== null))
    return browserRoots.size > 1
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
    const removed = new Set([entityId])
    let expanded = true
    while (expanded) {
      expanded = false
      for (const entity of this.#entities.values()) {
        if (
          removed.has(entity.id) ||
          entity.ownerId === null ||
          !removed.has(entity.ownerId)
        ) continue
        removed.add(entity.id)
        expanded = true
      }
    }

    for (const removedId of removed) {
      const entity = this.#entities.get(removedId)
      const incarnation = stringAttribute(entity?.attributes.incarnation)
      if (entity && incarnation && isLifecycleSourceEntityKind(entity.kind)) {
        const key = `${entity.id}\u0000${incarnation}`
        this.#retiredLifecycleSources.set(key, {sourceId: entity.id, sourceIncarnation: incarnation})
      }
      this.#retainTerminalIdentity(
        this.#terminalEntities,
        this.#terminalEntityOrder,
        removedId,
      )
      this.#structuralEvents.delete(structuralEventKey("entity", removedId))
      this.#entities.delete(removedId)
    }
    for (const transport of [...this.#transports.values()]) {
      if (
        removed.has(transport.ownerId) ||
        removed.has(transport.sourceEntityId) ||
        removed.has(transport.targetEntityId)
      ) {
        this.#retireTransport(transport.id)
      }
    }
  }

  #forgetEntity(entityId: string): void {
    const removed = new Set([entityId])
    let expanded = true
    while (expanded) {
      expanded = false
      for (const entity of this.#entities.values()) {
        if (removed.has(entity.id) || entity.ownerId === null || !removed.has(entity.ownerId)) continue
        removed.add(entity.id)
        expanded = true
      }
    }

    for (const removedId of removed) {
      this.#structuralEvents.delete(structuralEventKey("entity", removedId))
      this.#entities.delete(removedId)
    }
    for (const transport of [...this.#transports.values()]) {
      if (
        removed.has(transport.ownerId) ||
        removed.has(transport.sourceEntityId) ||
        removed.has(transport.targetEntityId)
      ) this.#forgetTransport(transport.id)
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
    if (transport?.kind === "service-worker-api") {
      this.#retiredTransports.add(serviceWorkerApiReverseEdgeId(transportId))
    }
    if (transport && this.#transportSlots.get(transport.slot) === transportId) {
      this.#transportSlots.delete(transport.slot)
    }
    this.#transports.delete(transportId)
  }

  #forgetTransport(transportId: string): void {
    const transport = this.#transports.get(transportId)
    this.#structuralEvents.delete(structuralEventKey("transport", transportId))
    this.#retiredTransports.add(transportId)
    if (transport?.kind === "service-worker-api") {
      this.#retiredTransports.add(serviceWorkerApiReverseEdgeId(transportId))
    }
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
    const visible = new Set([this.#pageId])
    for (const rootId of this.#declarationRoots.values()) visible.add(rootId)
    if (this.#entities.has(this.#currentServerId)) visible.add(this.#currentServerId)
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
        if (this.#transportCrossesBrowserOwnershipBoundary(transport)) continue
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

  #replaceBoundaryTransports(declaration: HamiltonianNodeSystemDeclaration): void {
    for (const transportId of this.#boundaryTransportsByContour.get(declaration.logicalContourId) ?? []) {
      this.#forgetTransport(transportId)
    }
    this.#boundaryTransportsByContour.delete(declaration.logicalContourId)
    if (declaration.boundaryTransports.length === 0) return
    const retained = new Set<string>()
    for (const [index, transport] of declaration.boundaryTransports.entries()) {
      const envelope = boundaryTransportEnvelope(declaration, transport, index)
      this.#observeTransport(envelope, true)
      retained.add(transport.transportId)
    }
    this.#boundaryTransportsByContour.set(declaration.logicalContourId, retained)
  }

  #refreshDeclaredSubjects(): void {
    this.#declaredEntityIds.clear()
    this.#declaredTransportIds.clear()
    this.#declaredSourceKeys.clear()
    for (const declaration of this.#declarationRegistry.values()) {
      for (const entry of declaration.snapshot.frontier) {
        this.#declaredSourceKeys.add(`${entry.sourceId}\u0000${entry.sourceIncarnation}`)
      }
      for (const {observation} of declaration.snapshot.envelopes) {
        if (observation.type === "entity") this.#declaredEntityIds.add(observation.subjectId)
        if (observation.type === "transport") this.#declaredTransportIds.add(observation.subjectId)
      }
      for (const transport of declaration.boundaryTransports) {
        this.#declaredTransportIds.add(transport.transportId)
      }
    }
    for (const entityId of this.#declaredEntityIds) this.#terminalEntities.delete(entityId)
    for (const transportId of this.#declaredTransportIds) this.#terminalTransports.delete(transportId)
    removeIdentities(this.#terminalEntityOrder, this.#declaredEntityIds)
    removeIdentities(this.#terminalTransportOrder, this.#declaredTransportIds)
  }
}

function removeIdentities(order: string[], retained: ReadonlySet<string>): void {
  for (let index = order.length - 1; index >= 0; index -= 1) {
    if (retained.has(order[index]!)) order.splice(index, 1)
  }
}

function boundaryTransportEnvelope(
  declaration: HamiltonianNodeSystemDeclaration,
  transport: HamiltonianNodeSystemBoundaryTransport,
  index: number,
): HamiltonianLifecycleEnvelope {
  const sequence = declaration.snapshot.revision + index + 1
  const root = declaration.snapshot.envelopes.find(({observation}) =>
    observation.type === "entity" && observation.subjectId === declaration.rootId)?.observation
  if (!root) throw new Error("Hamiltonian declaration root is unavailable")
  return createHamiltonianLifecycleEnvelope({
    sourceId: declaration.rootId,
    sourceKind: root.subjectKind,
    sourceIncarnation: declaration.incarnation,
    sourceStartedAt: declaration.incarnationStartedAt,
    sequence,
    at: declaration.snapshot.at,
    observation: createHamiltonianLifecycleObservation({
      type: "transport",
      phase: transport.phase,
      subjectId: transport.transportId,
      subjectKind: transport.kind,
      ownerId: transport.owner.entityId,
      sourceEntityId: transport.source.entityId,
      targetEntityId: transport.target.entityId,
      transportId: transport.transportId,
      attributes: transport.attributes,
    }),
  })
}

function structuralEventKey(type: "entity" | "transport", subjectId: string): string {
  return `${type}\u0000${subjectId}`
}

function lifecycleSourceKey(envelope: HamiltonianLifecycleEnvelope): string {
  return `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`
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

/** Same-geometry telemetry waits for the active layout instead of starving it. */
export function hamiltonianLayoutRequestRequiresCancellation(
  inFlightStructureKey: string | null,
  nextStructureKey: string,
): boolean {
  return inFlightStructureKey !== null && inFlightStructureKey !== nextStructureKey
}

/** Structural identity excludes telemetry and node copy, so layout is reused. */
export function nodeSystemStructureKey(document: NodeSystemDocument): string {
  return JSON.stringify({
    nodes: document.nodes.map((node) => ({
      id: node.id,
      layoutId: node.layoutId ?? node.id,
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
  const existing = current.find((candidate) => candidate.id === port.id)
  if (existing) {
    if (
      existing.parameterId !== port.parameterId ||
      existing.direction !== port.direction ||
      existing.connectionType !== port.connectionType
    ) {
      throw new Error(`Conflicting lifecycle port slot: ${nodeId}/${port.id}`)
    }
    return
  }
  current.push(port)
  ports.set(nodeId, current)
}

function addParameter(
  parameters: Map<string, NodeSystemFact[]>,
  nodeId: string,
  parameter: NodeSystemFact,
): void {
  const current = parameters.get(nodeId) ?? []
  const existingIndex = current.findIndex((candidate) => candidate.id === parameter.id)
  if (existingIndex >= 0) {
    const existing = current[existingIndex]!
    if (existing.label !== parameter.label || existing.value !== parameter.value) {
      throw new Error(`Conflicting lifecycle parameter slot: ${nodeId}/${parameter.id}`)
    }
    const tone = strongerTransportTone(existing.tone, parameter.tone)
    current[existingIndex] = tone === undefined
      ? {id: existing.id, label: existing.label, value: existing.value}
      : {...existing, tone}
    return
  }
  current.push(parameter)
  parameters.set(nodeId, current)
}

function transportEndpointSlot(
  label: string,
  direction: "in" | "out",
  sharedParameterRole: "duplex" | "channel" | null,
): {portId: string; parameterId: string} {
  const family = safeId(label)
  const role = sharedParameterRole ?? direction
  return {
    portId: `${direction}:${family}`,
    parameterId: `transport:${family}:${role}`,
  }
}

function serviceWorkerApiReverseEdgeId(transportId: string): string {
  return `${transportId}:reverse`
}

function strongerTransportTone(
  left: NodeSystemFact["tone"],
  right: NodeSystemFact["tone"],
): NodeSystemFact["tone"] {
  const rank = {neutral: 0, paused: 1, live: 2, warn: 3} as const
  return rank[right ?? "neutral"] > rank[left ?? "neutral"] ? right : left
}

function entityFacts(entity: LifecycleEntity, gaps: HamiltonianLifecycleGap[]) {
  const facts: Array<NonNullable<NodeSystemNode["facts"]>[number]> = Object.entries(entity.attributes)
    .filter(([key, value]) =>
      !(entity.kind === "service-worker" && key === "identity") &&
      value !== null &&
      value !== "")
    .map(([key, value]) => ({id: key, label: factLabel(key, entity.kind), value: compactValue(value ?? "")}))
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
  if (entity.kind === "page") return "Страница"
  if (entity.kind === "server") return "Hamiltonian"
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
  if (kind === "page") return "page realm"
  if (kind === "dedicated-worker") return "DedicatedWorkerGlobalScope"
  if (kind === "window-main") return "Window main realm"
  if (kind === "bun-process") return "процесс Bun в ОС"
  if (kind === "peer-process") return "процесс WebRTC peer в ОС"
  if (kind === "rtc-peer") return "RTCPeerConnection"
  return kind
}

function browserProfileHeader(entity: LifecycleEntity): string {
  const profileId = stringAttribute(entity.attributes.profileId) ||
    stringAttribute(entity.attributes.deviceId) ||
    entity.id.replace(/^browser:/, "")
  return compactValue(profileId)
}

function serviceWorkerHeader(entity: LifecycleEntity): string {
  const identity = stringAttribute(entity.attributes.identity) ||
    entity.id.replace(/^service-worker:/, "")
  return compactValue(identity)
}

function transportLabel(kind: string, attributes: Record<string, string | number | boolean | null>): string {
  if (kind === "websocket") return attributes.protocol === "wss" ? "WSS" : "WS"
  if (kind === "service-worker-api") return "Service Worker API"
  if (kind === "controller") return "ServiceWorker controller"
  if (kind === "message-port") return "MessagePort"
  if (kind === "worker-message") return "Worker messaging"
  if (kind === "broadcast-channel") return "BroadcastChannel"
  if (kind === "web-push") return "Web Push"
  if (kind === "ipc") return "IPC"
  if (kind === "data-channel") {
    const lane = stringAttribute(attributes.lane)
    if (lane === "oracle") return "Oracle RTCDataChannel"
    if (lane === "force") return "Force RTCDataChannel"
    return "RTCDataChannel"
  }
  return kind
}

function transportConnectionType(
  kind: string,
  attributes: Record<string, string | number | boolean | null>,
): string {
  if (kind === "websocket") return "websocket"
  if (kind === "service-worker-api") return "service-worker-api"
  if (kind === "controller") return "service-worker-controller"
  if (kind === "message-port") return "message-port"
  if (kind === "worker-message") return "worker-messaging"
  if (kind === "broadcast-channel") return "broadcast-channel"
  if (kind === "web-push") return "web-push"
  if (kind === "ipc") return "ipc"
  if (kind === "data-channel") {
    const lane = stringAttribute(attributes.lane)
    if (lane === "oracle") return "oracle-rtc-data-channel"
    if (lane === "force") return "force-rtc-data-channel"
    return "rtc-data-channel"
  }
  return safeId(kind).toLowerCase()
}

function nodeTone(state: string, hasGap: boolean): "neutral" | "live" | "paused" | "warn" {
  if (hasGap || state === "error" || state === "failed") return "warn"
  if (state === "paused" || state === "stopped" || state === "standby") return "paused"
  if (state === "waking") return "neutral"
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

function visualParentId(
  entity: LifecycleEntity,
  visible: ReadonlySet<string>,
  serverId: string,
): string | null {
  if (entity.id === serverId) return SERVER_CONTOUR_NODE_ID
  if (
    entity.ownerId === serverId &&
    (entity.kind === "bun-process" || entity.kind === "peer-process")
  ) return SERVER_CONTOUR_NODE_ID
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

function stableEntityLayoutIds(
  entities: readonly LifecycleEntity[],
  visible: ReadonlySet<string>,
  serverId: string,
  currentPageId: string,
  currentTabId: string,
): ReadonlyMap<string, string> {
  const byId = new Map(entities.map((entity) => [entity.id, entity]))
  const resolved = new Map<string, string>()
  const resolving = new Set<string>()

  const resolve = (entity: LifecycleEntity): string => {
    const cached = resolved.get(entity.id)
    if (cached !== undefined) return cached
    if (resolving.has(entity.id)) return entity.id
    resolving.add(entity.id)

    const owner = entity.ownerId === null || entity.ownerId === entity.id || !visible.has(entity.ownerId)
      ? null
      : byId.get(entity.ownerId) ?? null
    const ownerLayoutId = owner === null ? null : resolve(owner)
    const tabId = stringAttribute(entity.attributes.tabId) ||
      (entity.id === currentPageId ? currentTabId : "")
    const role = stringAttribute(entity.attributes.role)
    const endpoint = stringAttribute(entity.attributes.endpoint)
    const layoutId = entity.id === serverId
      ? entity.id
      : entity.kind === "page" && tabId
        ? stableLayoutSlot("page", tabId)
        : entity.kind === "window-main" && ownerLayoutId !== null
          ? stableLayoutSlot(ownerLayoutId, "window-main")
          : entity.kind === "dedicated-worker" && ownerLayoutId !== null
            ? stableLayoutSlot(ownerLayoutId, "dedicated-worker", role || "primary")
            : entity.kind === "rtc-peer" && ownerLayoutId !== null
              ? stableLayoutSlot(ownerLayoutId, "rtc-peer", endpoint || "peer")
              : entity.id

    resolving.delete(entity.id)
    resolved.set(entity.id, layoutId)
    return layoutId
  }

  for (const entity of entities) resolve(entity)
  return resolved
}

function stableLayoutSlot(...parts: readonly string[]): string {
  return `hamiltonian:${JSON.stringify(parts)}`
}

function requiredLayoutId(layoutIds: ReadonlyMap<string, string>, entityId: string): string {
  const layoutId = layoutIds.get(entityId)
  if (layoutId === undefined) throw new Error(`Missing Hamiltonian layout identity: ${entityId}`)
  return layoutId
}

function isLifecycleSourceEntityKind(kind: string): boolean {
  return kind === "page" ||
    kind === "service-worker" ||
    kind === "dedicated-worker" ||
    kind === "bun-process" ||
    kind === "peer-process" ||
    kind === "server"
}

function factLabel(key: string, entityKind: string): string {
  if (key === "deviceId" && entityKind === "browser-runtime") return "Профиль"
  const labels: Record<string, string> = {
    connectionId: "Соединение",
    codeVersion: "Версия кода",
    deviceId: "Устройство",
    endpoint: "Сторона",
    epoch: "Эпоха",
    failedWorker: "Завершённый Worker",
    generation: "Поколение",
    heartbeat: "Heartbeat",
    heartbeatSequence: "Heartbeat №",
    incarnation: "Воплощение",
    identity: "Identity",
    lastFailure: "Последний отказ",
    navigation: "Navigation",
    origin: "Адрес",
    pid: "PID",
    profileId: "Профиль",
    peerId: "Peer",
    role: "Роль",
    runtime: "Runtime",
    runtimeIncarnation: "Исполнение",
    push: "Push",
    reason: "Причина",
    state: "Состояние",
    sessionEpoch: "Сессия",
    tabId: "Вкладка",
    version: "Версия",
    visibility: "Видимость",
    wakeId: "Пробуждение",
  }
  return labels[key] ?? key
}

function serviceWorkerControlFailed(
  entity: LifecycleEntity,
  transports: readonly LifecycleTransport[],
): boolean {
  if (entity.kind !== "service-worker") return false
  const push = stringAttribute(entity.attributes.push)
  if (push === "ready" || push === "received" || push === "sent") return false
  let latest: LifecycleTransport | null = null
  for (const transport of transports) {
    if (transport.kind !== "websocket" || transport.sourceEntityId !== entity.id) continue
    if (latest === null || transport.changedAt >= latest.changedAt) latest = transport
  }
  return latest?.state === "closed"
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
