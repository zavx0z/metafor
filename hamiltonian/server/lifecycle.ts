import {
  HamiltonianLifecycleRetainedJournal,
  HamiltonianLifecycleSource,
  HamiltonianNodeSystemDeclarationRegistry,
  createHamiltonianLifecycleObservation,
  createHamiltonianNodeSystemDeclaration,
  hamiltonianLifecycleEntityId,
  hamiltonianLogicalContourId,
  isHamiltonianLifecycleEnvelope,
  isHamiltonianLifecycleOwnershipClosed,
  isHamiltonianLifecycleSnapshot,
  projectHamiltonianLifecycleOwnershipScope,
  projectHamiltonianNodeSystemBoundaryTransports,
  type HamiltonianLifecycleEnvelope,
  type HamiltonianLifecycleObservation,
  type HamiltonianLifecycleSnapshot,
  type HamiltonianNodeSystemBoundaryTransport,
  type HamiltonianNodeSystemDeclaration,
} from "../core/lifecycle.js"
import {hamiltonianBrowserNodeId} from "../core/orchestration.js"
import {isHamiltonianServiceWorkerCodeVersion} from "../update/shared/service-worker-release.js"
import type {HamiltonianControlSocketData} from "./control/endpoint.ts"
import type {HamiltonianServerObservation} from "./observation.ts"

type ControlSocket = Bun.ServerWebSocket<HamiltonianControlSocketData>

export interface HamiltonianLifecycleOptions {
  identity: string
  version: string
  placement: "browser" | "server"
  hostEpoch: string
  hostStartedAt: number
  connections(): Iterable<ControlSocket>
  observation: HamiltonianServerObservation
  browserProfileReachable(deviceId: string, workerEntityId: string): boolean
  workerCodeVersion(workerEntityId: string): string | undefined
  workerDeviceId(workerEntityId: string): string | null | undefined
  forgetWorker(workerEntityId: string): void
}

export function hamiltonianServerBootstrapDeclaration(
  declaration: HamiltonianNodeSystemDeclaration,
): HamiltonianNodeSystemDeclaration {
  return declaration.boundaryTransports.length === 0
    ? declaration
    : createHamiltonianNodeSystemDeclaration({...declaration, boundaryTransports: []})
}

export function isBrowserProfileLifecycleSnapshot(
  value: unknown,
  socket: HamiltonianControlSocketData,
  workerIdentity: string,
  workerRuntimeIncarnation: string,
  workerCodeVersion: string,
): value is HamiltonianLifecycleSnapshot {
  const browserEntityId = hamiltonianBrowserNodeId(socket.deviceId)
  if (
    !isHamiltonianLifecycleSnapshot(value) ||
    value.scopeId !== socket.workerEntityId ||
    !isHamiltonianLifecycleOwnershipClosed(value, [browserEntityId])
  ) return false
  const entities = value.envelopes
    .filter(({observation}) => observation.type === "entity")
    .map(({observation}) => observation)
  const browser = entities.find(({subjectId}) => subjectId === browserEntityId)
  const worker = entities.find(({subjectId}) => subjectId === socket.workerEntityId)
  return entities.filter(({subjectKind}) => subjectKind === "browser-runtime").length === 1 &&
    entities.filter(({subjectKind}) => subjectKind === "service-worker").length === 1 &&
    browser?.subjectKind === "browser-runtime" &&
    browser.ownerId === browserEntityId &&
    browser.attributes.profileId === socket.deviceId &&
    typeof browser.attributes.runtime === "string" &&
    browser.attributes.runtime.length > 0 &&
    worker?.subjectKind === "service-worker" &&
    worker.ownerId === browserEntityId &&
    worker.attributes.identity === workerIdentity &&
    worker.attributes.runtimeIncarnation === workerRuntimeIncarnation &&
    worker.attributes.codeVersion === workerCodeVersion &&
    isHamiltonianServiceWorkerCodeVersion(worker.attributes.codeVersion)
}

export function isObservedSupersededServiceWorkerEnd(
  envelope: HamiltonianLifecycleEnvelope,
  successorWorkerEntityId: string,
  browserEntityId: string,
): boolean {
  const observation = envelope.observation
  return envelope.sourceKind === "page" &&
    envelope.sourceId === hamiltonianLifecycleEntityId("page", envelope.sourceIncarnation) &&
    observation.type === "entity" &&
    observation.phase === "ended" &&
    observation.subjectKind === "service-worker" &&
    observation.subjectId !== successorWorkerEntityId &&
    observation.ownerId === browserEntityId &&
    observation.attributes.state === "ended" &&
    observation.attributes.successor === successorWorkerEntityId
}

/** Владеет server lifecycle journal и его node-system projection. */
export class HamiltonianServerLifecycle {
  readonly #options: HamiltonianLifecycleOptions
  readonly #serverEntityId: string
  readonly #serverLogicalContourId: string
  readonly #journal: HamiltonianLifecycleRetainedJournal
  readonly #source: HamiltonianLifecycleSource
  readonly #declarations = new HamiltonianNodeSystemDeclarationRegistry()
  readonly #reachabilityTimers = new Map<string, ReturnType<typeof setTimeout>>()
  #serverDeclarationRevision = 0

  constructor(options: HamiltonianLifecycleOptions) {
    this.#options = options
    this.#serverEntityId = hamiltonianLifecycleEntityId("server", options.hostEpoch)
    this.#serverLogicalContourId = hamiltonianLogicalContourId("server", options.identity)
    this.#journal = new HamiltonianLifecycleRetainedJournal(this.#serverEntityId)
    this.#source = new HamiltonianLifecycleSource({
      id: this.#serverEntityId,
      kind: "server",
      incarnation: options.hostEpoch,
      startedAt: options.hostStartedAt,
    })
    this.observe(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: this.#serverEntityId,
      subjectKind: "server",
      ownerId: this.#serverEntityId,
      attributes: {
        identity: options.identity,
        hostEpoch: options.hostEpoch,
        version: options.version,
        placement: options.placement,
        state: "active",
      },
    }))
  }

  get serverEntityId(): string {
    return this.#serverEntityId
  }

  snapshot(): HamiltonianLifecycleSnapshot {
    return this.#journal.snapshot()
  }

  observe(observation: HamiltonianLifecycleObservation, causedBy?: string): HamiltonianLifecycleEnvelope {
    const envelope = this.#source.next(observation, causedBy === undefined ? undefined : {causedBy})
    this.relay(envelope)
    return envelope
  }

  relay(value: unknown): boolean {
    if (!isHamiltonianLifecycleEnvelope(value)) return false
    this.#journal.observe(value)
    const payload = JSON.stringify({kind: "lifecycle", envelope: value})
    for (const socket of this.#options.connections()) {
      if (socket.data.identityConfirmed && socket.getBufferedAmount() <= 256_000) socket.send(payload)
    }
    return true
  }

  mergeBrowserSnapshot(snapshot: HamiltonianLifecycleSnapshot): boolean {
    if (!this.#journal.merge(snapshot)) return false
    this.broadcastSnapshot()
    return true
  }

  broadcastSnapshot(): void {
    const payload = JSON.stringify({kind: "lifecycle-snapshot", snapshot: this.#journal.snapshot()})
    for (const socket of this.#options.connections()) {
      if (socket.data.identityConfirmed && socket.getBufferedAmount() <= 256_000) socket.send(payload)
    }
  }

  sendSnapshot(socket: ControlSocket): void {
    socket.send(JSON.stringify({kind: "lifecycle-snapshot", snapshot: this.#journal.snapshot()}))
  }

  browserDeclarationForSnapshot(
    snapshot: HamiltonianLifecycleSnapshot,
    socket: HamiltonianControlSocketData,
    workerRuntimeIncarnation: string,
    supplied?: HamiltonianNodeSystemDeclaration,
  ): HamiltonianNodeSystemDeclaration | null {
    const logicalContourId = hamiltonianLogicalContourId("browser-profile", socket.deviceId)
    const rootId = hamiltonianBrowserNodeId(socket.deviceId)
    const startedAt = snapshot.envelopes.find((envelope) =>
      envelope.sourceIncarnation === workerRuntimeIncarnation)?.sourceStartedAt ?? -1
    if (startedAt < 0) return null
    if (supplied !== undefined) {
      return supplied.logicalContourId === logicalContourId &&
        supplied.incarnation === workerRuntimeIncarnation &&
        supplied.incarnationStartedAt === startedAt &&
        supplied.revision === snapshot.revision &&
        supplied.rootId === rootId &&
        supplied.snapshot.snapshotId === snapshot.snapshotId &&
        supplied.boundaryTransports.length === 0
        ? supplied
        : null
    }
    return createHamiltonianNodeSystemDeclaration({
      logicalContourId,
      incarnation: workerRuntimeIncarnation,
      incarnationStartedAt: startedAt,
      revision: snapshot.revision,
      rootId,
      snapshot,
    })
  }

  acceptBrowserDeclaration(declaration: HamiltonianNodeSystemDeclaration): HamiltonianNodeSystemDeclaration | null {
    const accepted = this.#declarations.accept(declaration)
    if (accepted) {
      this.#broadcastDeclaration(accepted.declaration)
      return accepted.declaration
    }
    const current = this.#declarations.current(declaration.logicalContourId)
    return current?.incarnation === declaration.incarnation &&
      current.revision === declaration.revision &&
      current.snapshot.snapshotId === declaration.snapshot.snapshotId
      ? current
      : null
  }

  broadcastServerDeclaration(): HamiltonianNodeSystemDeclaration {
    const declaration = this.#refreshServerDeclaration()
    this.#broadcastDeclaration(declaration)
    return declaration
  }

  sendBootstrapDeclaration(socket: ControlSocket): void {
    this.#sendDeclaration(socket, hamiltonianServerBootstrapDeclaration(this.#refreshServerDeclaration()))
  }

  sendBrowserDeclarations(socket: ControlSocket): void {
    for (const declaration of this.#declarations.values()) {
      if (declaration.logicalContourId !== this.#serverLogicalContourId) this.#sendDeclaration(socket, declaration)
    }
  }

  retireEntity(entityId: string, envelope: HamiltonianLifecycleEnvelope): void {
    this.#journal.retireEntity(entityId)
    const payload = JSON.stringify({kind: "lifecycle", envelope})
    for (const socket of this.#options.connections()) {
      if (socket.data.identityConfirmed && socket.getBufferedAmount() <= 256_000) socket.send(payload)
    }
  }

  observeServiceWorkerAvailability(
    workerEntityId: string,
    deviceId: string,
    attributes: Record<string, string | number | boolean | null>,
    causedBy?: string,
  ): void {
    const codeVersion = this.#options.workerCodeVersion(workerEntityId)
    this.observe(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: workerEntityId,
      subjectKind: "service-worker",
      ownerId: hamiltonianBrowserNodeId(this.#options.workerDeviceId(workerEntityId) ?? deviceId),
      attributes: {...attributes, ...(codeVersion === undefined ? {} : {codeVersion})},
    }), causedBy)
  }

  observeHostIpcMessage(event: {
    phase: "sent" | "received"
    messageId: string
    messageClass: string
    processEntityId: string
    transportId: string
  }): void {
    const sent = event.phase === "sent"
    this.observe(createHamiltonianLifecycleObservation({
      type: "message",
      phase: event.phase,
      subjectId: event.messageId,
      subjectKind: "ipc-message",
      ownerId: this.#serverEntityId,
      sourceEntityId: sent ? this.#serverEntityId : event.processEntityId,
      targetEntityId: sent ? event.processEntityId : this.#serverEntityId,
      transportId: event.transportId,
      messageId: event.messageId,
      messageClass: event.messageClass,
    }))
  }

  observeProcessExit(event: {
    entityId: string
    incarnation: string
    role: string
    transportId: string
    reason: string
    exitCode?: number | null
    kind: "bun-process" | "peer-process"
  }): void {
    const closed = this.observe(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "closed",
      subjectId: event.transportId,
      subjectKind: "ipc",
      ownerId: this.#serverEntityId,
      sourceEntityId: this.#serverEntityId,
      targetEntityId: event.entityId,
      transportId: event.transportId,
      attributes: {
        ...(event.exitCode === undefined ? {} : {exitCode: event.exitCode}),
        reason: event.reason.slice(0, 256),
      },
    }))
    this.observe(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: event.entityId,
      subjectKind: event.kind,
      ownerId: this.#serverEntityId,
      attributes: {
        incarnation: event.incarnation,
        role: event.role,
        state: "stopped",
        reason: event.reason.slice(0, 256),
      },
    }), closed.eventId)
  }

  cancelBrowserReachabilityExpiry(deviceId: string): void {
    const timer = this.#reachabilityTimers.get(deviceId)
    if (timer) clearTimeout(timer)
    this.#reachabilityTimers.delete(deviceId)
  }

  scheduleBrowserReachabilityExpiry(
    deviceId: string,
    workerEntityId: string,
    connectionId: string,
    expiresAt: number,
  ): void {
    this.cancelBrowserReachabilityExpiry(deviceId)
    const timer = setTimeout(() => {
      this.#reachabilityTimers.delete(deviceId)
      this.forgetBrowserIfUnreachable(deviceId, workerEntityId, connectionId)
    }, Math.max(0, expiresAt - Date.now()))
    this.#reachabilityTimers.set(deviceId, timer)
  }

  forgetBrowserIfUnreachable(deviceId: string, workerEntityId: string, connectionId?: string): boolean {
    if (this.#options.browserProfileReachable(deviceId, workerEntityId)) return false
    this.cancelBrowserReachabilityExpiry(deviceId)
    const browserEntityId = hamiltonianBrowserNodeId(deviceId)
    if (!this.#journal.forgetEntityTree(browserEntityId)) return false
    this.#options.forgetWorker(workerEntityId)
    this.broadcastSnapshot()
    this.#options.observation.record({
      at: Date.now(),
      kind: "browser-profile-unreachable",
      ...(connectionId === undefined ? {} : {connectionId}),
      detail: browserEntityId,
    })
    return true
  }

  stop(): void {
    for (const timer of this.#reachabilityTimers.values()) clearTimeout(timer)
    this.#reachabilityTimers.clear()
  }

  #sendDeclaration(socket: ControlSocket, declaration: HamiltonianNodeSystemDeclaration): void {
    if (socket.getBufferedAmount() <= 256_000) {
      socket.send(JSON.stringify({kind: "node-system-declaration", declaration}))
    }
  }

  #broadcastDeclaration(declaration: HamiltonianNodeSystemDeclaration): void {
    for (const socket of this.#options.connections()) {
      if (socket.data.identityConfirmed) this.#sendDeclaration(socket, declaration)
    }
  }

  #serverBoundaryTransports(
    snapshot: HamiltonianLifecycleSnapshot,
    observedSnapshot: HamiltonianLifecycleSnapshot,
  ): readonly HamiltonianNodeSystemBoundaryTransport[] {
    return projectHamiltonianNodeSystemBoundaryTransports({
      logicalContourId: this.#serverLogicalContourId,
      incarnation: this.#options.hostEpoch,
      rootId: this.#serverEntityId,
      snapshot,
      observedSnapshot,
      declarations: this.#declarations.values(),
    })
  }

  #refreshServerDeclaration(): HamiltonianNodeSystemDeclaration {
    const observedSnapshot = this.#journal.snapshot()
    const projected = projectHamiltonianLifecycleOwnershipScope(observedSnapshot, [this.#serverEntityId])
    if (!projected) throw new Error("Hamiltonian server lifecycle is not ownership-closed")
    const retainedSources = new Set(projected.envelopes.map((envelope) =>
      `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`))
    for (const entry of this.#declarations.current(this.#serverLogicalContourId)?.snapshot.frontier ?? []) {
      retainedSources.add(`${entry.sourceId}\u0000${entry.sourceIncarnation}`)
    }
    const snapshot = Object.freeze({
      ...projected,
      frontier: Object.freeze(projected.frontier.filter((entry) =>
        retainedSources.has(`${entry.sourceId}\u0000${entry.sourceIncarnation}`))),
    })
    const declaration = createHamiltonianNodeSystemDeclaration({
      logicalContourId: this.#serverLogicalContourId,
      incarnation: this.#options.hostEpoch,
      incarnationStartedAt: this.#options.hostStartedAt,
      revision: ++this.#serverDeclarationRevision,
      rootId: this.#serverEntityId,
      snapshot,
      boundaryTransports: this.#serverBoundaryTransports(snapshot, observedSnapshot),
    })
    const accepted = this.#declarations.accept(declaration)
    if (!accepted) throw new Error("Hamiltonian server declaration did not advance monotonically")
    return accepted.declaration
  }
}
