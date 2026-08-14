import {
  createHamiltonianLifecycleObservation,
  hamiltonianLifecycleEntityId,
} from "../../core/lifecycle.js"
import {hamiltonianBrowserNodeId} from "../../core/orchestration.js"
import {
  isHamiltonianRealtimePayloadOnControlChannel,
  parseHamiltonianControlClientMessage,
} from "./protocol.ts"
import {
  HamiltonianControlEndpoint,
  type HamiltonianControlSocketData,
} from "./endpoint.ts"
import {
  isBrowserProfileLifecycleSnapshot,
  isObservedSupersededServiceWorkerEnd,
  type HamiltonianServerLifecycle,
} from "../lifecycle.ts"
import type {HamiltonianBrowserPublication} from "../browser/publication.ts"
import type {HamiltonianBrowserRelease} from "../browser/release.ts"
import type {HamiltonianServerWebPush} from "../web-push/coordinator.ts"
import type {HamiltonianServerTopology} from "../topology.ts"
import type {HamiltonianPeerCoordinator} from "../peer/coordinator.ts"
import type {HamiltonianServerObservation} from "../observation.ts"
import {safeEqual} from "../authentication.ts"

type ControlSocket = Bun.ServerWebSocket<HamiltonianControlSocketData>

export interface HamiltonianControlSessionOptions {
  token: string
  heartbeatMs: number
  serverEntityId: string
  lifecycle: HamiltonianServerLifecycle
  publication: HamiltonianBrowserPublication
  release: HamiltonianBrowserRelease
  webPush: HamiltonianServerWebPush
  topology: HamiltonianServerTopology
  peer: HamiltonianPeerCoordinator
  observation: HamiltonianServerObservation
  hostState(): Record<string, unknown>
  stopping(): boolean
}

/** Владеет control socket registry, heartbeat и stateful session admission. */
export class HamiltonianControlSession {
  readonly #options: HamiltonianControlSessionOptions
  readonly #sockets = new Map<string, ControlSocket>()
  readonly #endpoint: HamiltonianControlEndpoint
  #controlFramesIn = 0
  #controlBytesIn = 0
  #heartbeatAcks = 0
  #realtimeFramesRejected = 0

  readonly websocket: Bun.WebSocketHandler<HamiltonianControlSocketData>

  constructor(options: HamiltonianControlSessionOptions) {
    this.#options = options
    this.#endpoint = new HamiltonianControlEndpoint((suppliedToken) => safeEqual(suppliedToken, options.token))
    this.websocket = {
      open: (socket) => this.#open(socket),
      message: async (socket, rawMessage) => await this.#message(socket, rawMessage),
      close: (socket, code, reason) => this.#close(socket, code, reason),
      drain: (socket) => {
        if (socket.getBufferedAmount() === 0) options.topology.broadcast()
      },
    }
  }

  get connectionGeneration(): number {
    return this.#endpoint.currentConnectionGeneration
  }

  connections(): Iterable<ControlSocket> {
    return this.#sockets.values()
  }

  socket(connectionId: string): ControlSocket | undefined {
    return this.#sockets.get(connectionId)
  }

  hasConnection(connectionId: string): boolean {
    return this.#sockets.has(connectionId)
  }

  upgrade(
    request: Request,
    url: URL,
    server: Bun.Server<HamiltonianControlSocketData>,
  ): Response | undefined {
    return this.#endpoint.upgrade(request, url, server)
  }

  send(socket: ControlSocket, message: Readonly<{kind: string}> & Record<string, unknown>): void {
    const messageId = `message:${encodeURIComponent(crypto.randomUUID())}`
    const monitor = {messageId, transportId: socket.data.lifecycleTransportId}
    if (socket.data.identityConfirmed) {
      this.#options.lifecycle.observe(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "sent",
        subjectId: messageId,
        subjectKind: "websocket-message",
        ownerId: this.#options.serverEntityId,
        sourceEntityId: this.#options.serverEntityId,
        targetEntityId: socket.data.workerEntityId,
        transportId: socket.data.lifecycleTransportId,
        messageId,
        messageClass: message.kind,
      }))
    }
    socket.send(JSON.stringify({...message, monitor}))
  }

  async publishSourceUpdate(revision: string, serviceWorkerSource: string): Promise<void> {
    await this.#options.release.reconcileSource(serviceWorkerSource)
    for (const socket of this.#sockets.values()) {
      if (!socket.data.identityConfirmed || socket.getBufferedAmount() > 256_000) continue
      this.send(socket, {kind: "source-update", revision})
    }
  }

  snapshot() {
    return {
      connections: [...this.#sockets.values()].map((socket) => ({
        connectionId: socket.data.connectionId,
        deviceId: socket.data.deviceId,
        workerIdentity: socket.data.workerIdentity,
        workerRuntimeIncarnation: socket.data.workerRuntimeIncarnation,
        workerCodeVersion: socket.data.workerCodeVersion,
        identityConfirmed: socket.data.identityConfirmed,
        workerUpdateRequired: socket.data.workerUpdateRequired,
        openedAt: socket.data.openedAt,
        lastPongAt: socket.data.lastPongAt,
        lastChallengeSeq: socket.data.lastChallengeSeq,
        lastAckSeq: socket.data.lastAckSeq,
      })),
      controlFramesIn: this.#controlFramesIn,
      controlBytesIn: this.#controlBytesIn,
      heartbeatAcks: this.#heartbeatAcks,
      realtimeFramesRejected: this.#realtimeFramesRejected,
    }
  }

  stop(): void {
    for (const socket of this.#sockets.values()) this.#clearHeartbeatTimers(socket)
  }

  #open(socket: ControlSocket): void {
    const {lifecycle, topology, publication, observation} = this.#options
    this.#sockets.set(socket.data.connectionId, socket)
    topology.connect(socket.data.connectionId, socket.data.deviceId)
    observation.record({at: Date.now(), kind: "connection-open", connectionId: socket.data.connectionId})
    lifecycle.sendBootstrapDeclaration(socket)
    lifecycle.sendSnapshot(socket)
    this.send(socket, {kind: "hello", connectionId: socket.data.connectionId, host: this.#options.hostState()})
    topology.broadcast()
    this.#challengeHeartbeat(socket)
    void publication.sourceRevision().then((revision) => {
      if (this.#sockets.get(socket.data.connectionId) !== socket || !socket.data.identityConfirmed) return
      this.send(socket, {kind: "source-update", revision})
    }).catch((error: unknown) => {
      observation.record({
        at: Date.now(), kind: "source-update-failed", connectionId: socket.data.connectionId,
        detail: error instanceof Error ? error.message : String(error),
      })
    })
  }

  async #message(socket: ControlSocket, rawMessage: string | Buffer): Promise<void> {
    const {lifecycle, topology, publication, release, webPush, peer, observation} = this.#options
    this.#controlFramesIn += 1
    this.#controlBytesIn += rawMessage.length
    if (isHamiltonianRealtimePayloadOnControlChannel(rawMessage)) {
      this.#realtimeFramesRejected += 1
      socket.data.retainAuthorityOnClose = false
      socket.close(1008, "realtime payload is forbidden on control channel")
      return
    }
    const message = parseHamiltonianControlClientMessage(rawMessage)
    if (!message) {
      socket.data.retainAuthorityOnClose = false
      socket.close(1008, "invalid control message")
      return
    }
    if (!release.applicationMessageAllowed(socket.data.identityConfirmed, message.kind)) return
    if (message.monitor) {
      if (message.monitor.transportId !== socket.data.lifecycleTransportId) {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "control message transport identity mismatch")
        return
      }
      if (socket.data.identityConfirmed) {
        lifecycle.observe(createHamiltonianLifecycleObservation({
          type: "message", phase: "received", subjectId: message.monitor.messageId,
          subjectKind: "websocket-message", ownerId: this.#options.serverEntityId,
          sourceEntityId: socket.data.workerEntityId, targetEntityId: this.#options.serverEntityId,
          transportId: socket.data.lifecycleTransportId, messageId: message.monitor.messageId,
          messageClass: message.kind,
        }))
      }
    }
    if (message.kind === "lifecycle-retirement") {
      if (
        message.monitor === undefined ||
        !isObservedSupersededServiceWorkerEnd(
          message.envelope,
          socket.data.workerEntityId,
          hamiltonianBrowserNodeId(socket.data.deviceId),
        )
      ) {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "invalid browser lifecycle retirement")
        return
      }
      lifecycle.retireEntity(message.envelope.observation.subjectId, message.envelope)
      release.forgetWorker(message.envelope.observation.subjectId)
      return
    }
    if (message.kind === "browser-lifecycle-snapshot") {
      if (
        !socket.data.identityConfirmed || !socket.data.workerIdentity ||
        !socket.data.workerRuntimeIncarnation || !socket.data.workerCodeVersion ||
        !isBrowserProfileLifecycleSnapshot(
          message.snapshot, socket.data, socket.data.workerIdentity,
          socket.data.workerRuntimeIncarnation, socket.data.workerCodeVersion,
        )
      ) {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "invalid browser lifecycle snapshot")
        return
      }
      const declaration = lifecycle.browserDeclarationForSnapshot(
        message.snapshot, socket.data, socket.data.workerRuntimeIncarnation, message.declaration,
      )
      if (!declaration || !lifecycle.acceptBrowserDeclaration(declaration)) {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "invalid browser node-system declaration")
        return
      }
      lifecycle.mergeBrowserSnapshot(message.snapshot)
      lifecycle.broadcastServerDeclaration()
      return
    }
    if (message.kind === "pong") {
      if (
        message.seq !== socket.data.lastChallengeSeq || message.seq <= socket.data.lastAckSeq ||
        socket.data.workerEntityId !== hamiltonianLifecycleEntityId("service-worker", message.workerIdentity) ||
        (socket.data.workerIdentity !== null && socket.data.workerIdentity !== message.workerIdentity) ||
        (socket.data.workerRuntimeIncarnation !== null &&
          socket.data.workerRuntimeIncarnation !== message.workerRuntimeIncarnation)
      ) {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "invalid heartbeat acknowledgement")
        return
      }
      socket.data.lastPongAt = Date.now()
      socket.data.lastAckSeq = message.seq
      if (socket.data.heartbeatTimeoutTimer !== null) {
        clearTimeout(socket.data.heartbeatTimeoutTimer)
        socket.data.heartbeatTimeoutTimer = null
      }
      this.#scheduleHeartbeatAfterAck(socket)
      this.#heartbeatAcks += 1
      if (socket.data.identityConfirmed) {
        lifecycle.observe(createHamiltonianLifecycleObservation({
          type: "transport", phase: "changed", subjectId: socket.data.lifecycleTransportId,
          subjectKind: "websocket", ownerId: socket.data.workerEntityId,
          sourceEntityId: socket.data.workerEntityId, targetEntityId: this.#options.serverEntityId,
          transportId: socket.data.lifecycleTransportId,
          attributes: {
            connectionId: socket.data.connectionId, heartbeat: "observed",
            heartbeatSequence: socket.data.lastAckSeq, lastPongAt: socket.data.lastPongAt,
            observedBy: "server",
          },
        }))
        lifecycle.broadcastServerDeclaration()
      }
      topology.broadcast()
      return
    }
    if (message.kind === "identity") {
      socket.data.workerUpdateRequired = true
      if (
        socket.data.workerEntityId !== hamiltonianLifecycleEntityId("service-worker", message.workerIdentity) ||
        (socket.data.workerIdentity !== null && socket.data.workerIdentity !== message.workerIdentity) ||
        (socket.data.workerRuntimeIncarnation !== null &&
          socket.data.workerRuntimeIncarnation !== message.workerRuntimeIncarnation) ||
        (socket.data.workerCodeVersion !== null && socket.data.workerCodeVersion !== message.workerCodeVersion) ||
        !isBrowserProfileLifecycleSnapshot(
          message.lifecycleSnapshot, socket.data, message.workerIdentity,
          message.workerRuntimeIncarnation, message.workerCodeVersion,
        )
      ) {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "worker identity does not match control endpoint")
        return
      }
      if (message.wakeId !== undefined) {
        const pendingWake = webPush.pendingWake(socket.data.workerEntityId)
        if (
          message.wakeProof === undefined || pendingWake?.wakeId !== message.wakeId ||
          !safeEqual(pendingWake.wakeProof, message.wakeProof) ||
          socket.data.connectionGeneration <= pendingWake.armedAfterConnectionGeneration ||
          !webPush.matchesDevice(socket.data.workerEntityId, socket.data.deviceId)
        ) {
          socket.data.retainAuthorityOnClose = false
          socket.close(1008, "unexpected Web Push wake identity")
          return
        }
      }
      const target = await release.currentServiceWorkerRelease()
      const claim = {
        profileId: socket.data.deviceId,
        workerEntityId: socket.data.workerEntityId,
        runtimeIncarnation: message.workerRuntimeIncarnation,
        codeVersion: message.workerCodeVersion,
        applicationAdmitted: socket.data.identityConfirmed,
      }
      const admission = release.decideIdentity(claim, target)
      if (admission.kind === "reject") {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, admission.reason)
        return
      }
      socket.data.workerIdentity = message.workerIdentity
      socket.data.workerRuntimeIncarnation = message.workerRuntimeIncarnation
      socket.data.workerCodeVersion = message.workerCodeVersion
      socket.data.resumeNonce = message.resumeNonce
      if (admission.kind === "stale") {
        release.markUpdateRequired(socket)
        if (admission.revokeApplication) await release.revokeApplication([socket])
        release.sendUpdate(socket, admission.target)
        return
      }
      const declaration = lifecycle.browserDeclarationForSnapshot(
        message.lifecycleSnapshot, socket.data, message.workerRuntimeIncarnation,
        message.lifecycleDeclaration,
      )
      if (!declaration || !lifecycle.acceptBrowserDeclaration(declaration)) {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "invalid browser node-system declaration")
        return
      }
      release.confirmCurrent(claim)
      socket.data.identityConfirmed = true
      socket.data.workerUpdateRequired = false
      socket.data.retainAuthorityOnClose = true
      lifecycle.cancelBrowserReachabilityExpiry(socket.data.deviceId)
      lifecycle.mergeBrowserSnapshot(message.lifecycleSnapshot)
      lifecycle.sendSnapshot(socket)
      lifecycle.sendBrowserDeclarations(socket)
      lifecycle.observe(createHamiltonianLifecycleObservation({
        type: "transport", phase: "opened", subjectId: socket.data.lifecycleTransportId,
        subjectKind: "websocket", ownerId: socket.data.workerEntityId,
        sourceEntityId: socket.data.workerEntityId, targetEntityId: this.#options.serverEntityId,
        transportId: socket.data.lifecycleTransportId,
        attributes: {connectionId: socket.data.connectionId, heartbeat: "awaiting", observedBy: "server"},
      }))
      lifecycle.broadcastServerDeclaration()
      observation.record({
        at: Date.now(), kind: "worker-identity", connectionId: socket.data.connectionId,
        detail: `${message.workerIdentity} runtime ${message.workerRuntimeIncarnation} code ${message.workerCodeVersion}`,
      })
      this.send(socket, {kind: "service-worker-current", target})
      void publication.sourceRevision().then((revision) => {
        if (this.#sockets.get(socket.data.connectionId) === socket && socket.data.identityConfirmed) {
          this.send(socket, {kind: "source-update", revision})
        }
      }).catch((error: unknown) => {
        observation.record({
          at: Date.now(), kind: "source-update-failed", connectionId: socket.data.connectionId,
          detail: error instanceof Error ? error.message : String(error),
        })
      })
      if (message.wakeId !== undefined) {
        webPush.confirmWake(socket.data.workerEntityId, message.wakeId)
        observation.record({
          at: Date.now(), kind: "push-reconnect-confirmed", connectionId: socket.data.connectionId,
          detail: `${socket.data.workerEntityId} ${message.wakeId}`,
        })
        lifecycle.observeServiceWorkerAvailability(socket.data.workerEntityId, socket.data.deviceId, {
          identity: message.workerIdentity, runtimeIncarnation: message.workerRuntimeIncarnation,
          codeVersion: message.workerCodeVersion, state: "active", push: "received", wakeId: message.wakeId,
        })
        this.send(socket, {kind: "wake-confirmed", wakeId: message.wakeId})
      } else {
        lifecycle.observeServiceWorkerAvailability(socket.data.workerEntityId, socket.data.deviceId, {
          identity: message.workerIdentity, runtimeIncarnation: message.workerRuntimeIncarnation,
          codeVersion: message.workerCodeVersion, state: "active",
          push: webPush.has(socket.data.workerEntityId) ? "ready" : "unavailable",
        })
      }
      return
    }
    if (message.kind === "push-subscription") {
      if (!socket.data.identityConfirmed || !socket.data.workerIdentity || !socket.data.workerRuntimeIncarnation) {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "PushSubscription requires an identified Service Worker")
        return
      }
      try {
        const subscription = await webPush.register(
          socket.data.workerEntityId, socket.data.workerIdentity, socket.data.deviceId,
          message.subscription, message.registrationId,
        )
        observation.record({
          at: Date.now(), kind: "push-subscription", connectionId: socket.data.connectionId,
          detail: socket.data.workerEntityId,
        })
        lifecycle.observeServiceWorkerAvailability(socket.data.workerEntityId, socket.data.deviceId, {
          identity: socket.data.workerIdentity, runtimeIncarnation: socket.data.workerRuntimeIncarnation,
          ...(socket.data.workerCodeVersion === null ? {} : {codeVersion: socket.data.workerCodeVersion}),
          state: "active", push: "ready",
        })
        this.send(socket, {kind: "push-subscription-confirmed", registrationId: message.registrationId, subscription})
      } catch (error) {
        this.send(socket, {
          kind: "push-subscription-rejected", registrationId: message.registrationId,
          reason: (error instanceof Error ? error.message : String(error)).slice(0, 256),
        })
      }
      return
    }
    if (message.kind === "peer-signal") {
      const result = peer.handleSignal(socket, message)
      if (result === "unauthorized") {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "unauthorized peer signal")
      }
      return
    }
    if (message.kind === "peer-failed") {
      const result = peer.handleFailure(socket, message)
      if (result === "unauthorized") {
        socket.data.retainAuthorityOnClose = false
        socket.close(1008, "unauthorized peer failure")
      }
      return
    }
    socket.data.reportedEmptyWindowInventory = message.windows.length === 0
    if (!topology.tryResume(socket, message.windows)) topology.updateWindows(socket.data.connectionId, message.windows)
    topology.broadcast()
  }

  #close(socket: ControlSocket, code: number, reason: string | Buffer): void {
    const {lifecycle, topology, webPush, observation} = this.#options
    this.#clearHeartbeatTimers(socket)
    observation.record({at: Date.now(), kind: "connection-close", connectionId: socket.data.connectionId})
    this.#sockets.delete(socket.data.connectionId)
    const closingWindows = topology.windowsForConnection(socket.data.connectionId)
    const anotherProfileConnection = () => [...this.#sockets.values()].some((candidate) =>
      candidate.data.identityConfirmed && candidate.data.deviceId === socket.data.deviceId)
    const browserScopeUnreachable =
      socket.data.identityConfirmed && socket.data.retainAuthorityOnClose &&
      socket.data.reportedEmptyWindowInventory && closingWindows.length === 0 &&
      !webPush.has(socket.data.workerEntityId) && !webPush.hasPendingWake(socket.data.workerEntityId) &&
      !anotherProfileConnection()
    if (socket.data.identityConfirmed && socket.data.retainAuthorityOnClose) {
      lifecycle.observe(createHamiltonianLifecycleObservation({
        type: "transport", phase: "closed", subjectId: socket.data.lifecycleTransportId,
        subjectKind: "websocket", ownerId: socket.data.workerEntityId,
        sourceEntityId: socket.data.workerEntityId, targetEntityId: this.#options.serverEntityId,
        transportId: socket.data.lifecycleTransportId,
        attributes: {
          connectionId: socket.data.connectionId, code, reason: String(reason).slice(0, 256), observedBy: "server",
        },
      }))
      lifecycle.broadcastServerDeclaration()
    }
    if (browserScopeUnreachable) {
      lifecycle.forgetBrowserIfUnreachable(socket.data.deviceId, socket.data.workerEntityId, socket.data.connectionId)
    } else if (
      !this.#options.stopping() && socket.data.identityConfirmed && socket.data.retainAuthorityOnClose &&
      !webPush.has(socket.data.workerEntityId) && !webPush.hasPendingWake(socket.data.workerEntityId) &&
      !anotherProfileConnection()
    ) {
      lifecycle.scheduleBrowserReachabilityExpiry(
        socket.data.deviceId, socket.data.workerEntityId, socket.data.connectionId,
        socket.data.lastPongAt + this.#options.heartbeatMs * 3,
      )
    }
    if (
      socket.data.identityConfirmed && socket.data.retainAuthorityOnClose &&
      !browserScopeUnreachable && !webPush.hasPendingWake(socket.data.workerEntityId)
    ) {
      lifecycle.observeServiceWorkerAvailability(
        socket.data.workerEntityId, socket.data.deviceId,
        webPush.has(socket.data.workerEntityId)
          ? {state: "standby", push: "ready", heartbeat: "paused"}
          : {state: "error", push: "unavailable", heartbeat: "failed"},
      )
    }
    const leader = topology.leader()
    const retainsCurrentAuthority =
      !this.#options.stopping() && !browserScopeUnreachable && socket.data.retainAuthorityOnClose &&
      leader?.connectionId === socket.data.connectionId
    topology.closeConnection(socket, retainsCurrentAuthority)
  }

  #clearHeartbeatTimers(socket: ControlSocket): void {
    if (socket.data.nextHeartbeatTimer !== null) clearTimeout(socket.data.nextHeartbeatTimer)
    if (socket.data.heartbeatTimeoutTimer !== null) clearTimeout(socket.data.heartbeatTimeoutTimer)
    socket.data.nextHeartbeatTimer = null
    socket.data.heartbeatTimeoutTimer = null
  }

  #challengeHeartbeat(socket: ControlSocket): void {
    if (this.#options.stopping() || this.#sockets.get(socket.data.connectionId) !== socket) return
    if (socket.data.lastChallengeSeq > socket.data.lastAckSeq) return
    socket.data.nextHeartbeatTimer = null
    socket.data.lastChallengeSeq += 1
    this.send(socket, {kind: "ping", at: Date.now(), seq: socket.data.lastChallengeSeq})
    const expiresAt = socket.data.lastPongAt + this.#options.heartbeatMs * 3
    socket.data.heartbeatTimeoutTimer = setTimeout(() => {
      socket.data.heartbeatTimeoutTimer = null
      if (socket.data.lastChallengeSeq === socket.data.lastAckSeq) return
      this.#options.observation.record({
        at: Date.now(), kind: "heartbeat-timeout", connectionId: socket.data.connectionId,
      })
      socket.data.retainAuthorityOnClose = false
      socket.close(4000, "heartbeat timeout")
    }, Math.max(1, expiresAt - Date.now()))
  }

  #scheduleHeartbeatAfterAck(socket: ControlSocket): void {
    if (socket.data.nextHeartbeatTimer !== null) clearTimeout(socket.data.nextHeartbeatTimer)
    socket.data.nextHeartbeatTimer = setTimeout(() => this.#challengeHeartbeat(socket), this.#options.heartbeatMs)
  }
}
