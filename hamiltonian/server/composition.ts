import {readHamiltonianServerConfiguration, type HamiltonianServerOptions} from "./configuration.ts"
import {HamiltonianServerObservation} from "./observation.ts"
import {HamiltonianBrowserPublication} from "./browser/publication.ts"
import {HamiltonianBrowserRelease} from "./browser/release.ts"
import {HamiltonianServerLifecycle} from "./lifecycle.ts"
import {HamiltonianServerWebPush} from "./web-push/coordinator.ts"
import {HamiltonianServerTopology} from "./topology.ts"
import {HamiltonianPeerCoordinator} from "./peer/coordinator.ts"
import {HamiltonianProcessCoordinator} from "./process/coordinator.ts"
import {HamiltonianControlSession} from "./control/session.ts"
import {HamiltonianStatusProjection} from "./status.ts"
import {HamiltonianRoutes} from "./routes.ts"
import type {HamiltonianControlSocketData} from "./control/endpoint.ts"

/**
 * Связывает именованных server owners, но не создаёт listener и не реализует
 * route/socket behavior. Production и test harness сами создают listener.
 */
export class HamiltonianServerComposition {
  readonly configuration
  readonly hostEpoch = crypto.randomUUID()
  readonly observation = new HamiltonianServerObservation()
  readonly lifecycle: HamiltonianServerLifecycle
  readonly publication: HamiltonianBrowserPublication
  readonly release: HamiltonianBrowserRelease
  readonly webPush: HamiltonianServerWebPush
  readonly topology: HamiltonianServerTopology
  readonly peer: HamiltonianPeerCoordinator
  readonly process: HamiltonianProcessCoordinator
  readonly control: HamiltonianControlSession
  readonly status: HamiltonianStatusProjection
  readonly routes: HamiltonianRoutes
  readonly tls
  #stopping = false
  #boundPort: number
  #server: Bun.Server<HamiltonianControlSocketData> | null = null
  #bunReady: ReturnType<HamiltonianProcessCoordinator["start"]> | null = null
  #stopPromise: Promise<void> | null = null

  constructor(options: HamiltonianServerOptions = {}) {
    this.configuration = readHamiltonianServerConfiguration(options)
    this.#boundPort = this.configuration.port
    const hostStartedAt = Date.now()
    let control!: HamiltonianControlSession
    let release!: HamiltonianBrowserRelease
    let webPush!: HamiltonianServerWebPush
    let topology!: HamiltonianServerTopology
    let peer!: HamiltonianPeerCoordinator
    let status!: HamiltonianStatusProjection

    this.lifecycle = new HamiltonianServerLifecycle({
      identity: this.configuration.identity,
      version: this.configuration.version,
      placement: this.configuration.placement,
      hostEpoch: this.hostEpoch,
      hostStartedAt,
      connections: () => control?.connections() ?? [],
      observation: this.observation,
      browserProfileReachable: (deviceId, workerEntityId) =>
        [...(control?.connections() ?? [])].some((candidate) =>
          candidate.data.identityConfirmed && candidate.data.deviceId === deviceId) ||
        Boolean(webPush?.has(workerEntityId)) || Boolean(webPush?.hasPendingWake(workerEntityId)),
      workerCodeVersion: (workerEntityId) => release?.workerCodeVersion(workerEntityId),
      workerDeviceId: (workerEntityId) => webPush?.deviceIdFor(workerEntityId),
      forgetWorker: (workerEntityId) => release?.forgetWorker(workerEntityId),
    })
    this.publication = new HamiltonianBrowserPublication({
      identity: this.configuration.identity,
      hostEpoch: this.hostEpoch,
      version: this.configuration.version,
      ...(options.browserBundles === undefined ? {} : {bundles: options.browserBundles}),
      observation: this.observation,
    })
    release = this.release = new HamiltonianBrowserRelease({
      identity: this.configuration.identity,
      version: this.configuration.version,
      publication: this.publication,
      observation: this.observation,
      connections: () => control?.connections() ?? [],
      disconnectApplication: (connectionId) => topology.disconnect(connectionId),
      broadcastTopology: () => topology.broadcast(),
      peerOperations: () => peer.operations(),
      sendControl: (socket, message) => control.send(socket, message),
    })
    webPush = this.webPush = new HamiltonianServerWebPush({
      configuration: this.configuration,
      serverEntityId: this.lifecycle.serverEntityId,
      lifecycle: this.lifecycle,
      observation: this.observation,
      controlConnectionGeneration: () => control?.connectionGeneration ?? 0,
    })
    topology = this.topology = new HamiltonianServerTopology({
      hostEpoch: this.hostEpoch,
      placement: this.configuration.placement,
      heartbeatMs: this.configuration.heartbeatMs,
      observation: this.observation,
      connections: () => control?.connections() ?? [],
      socket: (connectionId) => control?.socket(connectionId),
      sendControl: (socket, message) => control.send(socket, message),
      hostState: () => status.hostState(),
      synchronizePeer: (leader) => peer.synchronize(leader),
      rebindPeer: (previousConnectionId, connectionId) => peer.rebindConnection(previousConnectionId, connectionId),
    })
    peer = this.peer = new HamiltonianPeerCoordinator({
      hostname: this.configuration.hostname,
      serverEntityId: this.lifecycle.serverEntityId,
      lifecycle: this.lifecycle,
      observation: this.observation,
      socket: (connectionId) => control?.socket(connectionId),
      hasConnection: (connectionId) => control?.hasConnection(connectionId) ?? false,
      leader: () => this.topology.leader(),
      broadcastTopology: () => this.topology.broadcast(),
      sendControl: (socket, message) => control.send(socket, message),
      stopping: () => this.#stopping,
    })
    this.process = new HamiltonianProcessCoordinator({
      placement: this.configuration.placement,
      hostEpoch: this.hostEpoch,
      serverEntityId: this.lifecycle.serverEntityId,
      versionPayload: this.release.embodimentVersionPayload(),
      lifecycle: this.lifecycle,
      broadcastTopology: () => this.topology.broadcast(),
    })
    control = this.control = new HamiltonianControlSession({
      token: this.configuration.token,
      heartbeatMs: this.configuration.heartbeatMs,
      serverEntityId: this.lifecycle.serverEntityId,
      lifecycle: this.lifecycle,
      publication: this.publication,
      release: this.release,
      webPush: this.webPush,
      topology: this.topology,
      peer: this.peer,
      observation: this.observation,
      hostState: () => status.hostState(),
      stopping: () => this.#stopping,
    })
    status = this.status = new HamiltonianStatusProjection({
      configuration: this.configuration,
      hostEpoch: this.hostEpoch,
      process: this.process,
      peer: this.peer,
      control: this.control,
      topology: this.topology,
      webPush: this.webPush,
      observation: this.observation,
      boundPort: () => this.#boundPort,
    })
    this.routes = new HamiltonianRoutes(
      this.publication,
      this.release,
      this.webPush,
      this.control,
      this.status,
      this.configuration.token,
    )
    this.tls = this.configuration.tlsCertPath && this.configuration.tlsKeyPath
      ? {tls: {cert: Bun.file(this.configuration.tlsCertPath), key: Bun.file(this.configuration.tlsKeyPath)}}
      : {}
    this.publication.onSourceUpdate(async (revision, serviceWorkerSource) => {
      await this.control.publishSourceUpdate(revision, serviceWorkerSource)
    })
  }

  attach(server: Bun.Server<HamiltonianControlSocketData>) {
    if (this.#server) throw new Error("Hamiltonian server composition is already attached")
    this.#server = server
    this.#boundPort = server.port ?? this.configuration.port
    this.publication.startWatching()
    this.#bunReady = this.process.start()
    return this.running()
  }

  running() {
    const server = this.#server
    const bunReady = this.#bunReady
    if (!server || !bunReady) throw new Error("Hamiltonian server composition is not attached")
    return {
      server,
      identity: this.configuration.identity,
      version: this.configuration.version,
      token: this.configuration.token,
      topology: this.topology.model(),
      hostEpoch: this.hostEpoch,
      placement: this.configuration.placement,
      bunEmbodiments: this.process,
      getStatus: () => this.status.snapshot(),
      bunReady,
      rebirthBunEmbodiment: (role = this.process.mainRole) => this.process.rebirth(role),
      crashBunEmbodimentForTest: (role = this.process.mainRole) => this.process.crashForTest(role),
      acceptsServerAuthorityForTest: (candidate: Parameters<typeof this.process.acceptsAuthority>[0]) =>
        this.process.acceptsAuthority(candidate),
      crashPeerProcessForTest: () => this.peer.crashForTest(),
      requestPeerRepairForTest: (reason: string) => this.peer.requestRepair(reason),
      reportPeerErrorForTest: (peerId: string, error: string) => this.peer.reportErrorForTest(peerId, error),
      updateServiceWorkerReleaseForTest: (source: string) => this.release.updateForTest(source),
      stop: () => this.stop(),
    }
  }

  stop(): Promise<void> {
    if (this.#stopPromise) return this.#stopPromise
    const server = this.#server
    this.#stopPromise = (async () => {
      this.#stopping = true
      this.process.beginStopping()
      this.control.stop()
      this.publication.stop()
      this.topology.stop()
      this.lifecycle.stop()
      this.webPush.stop()
      if (server) await Promise.race([server.stop(true), Bun.sleep(250)])
      await Promise.all([this.peer.stop(), this.process.stop()])
    })()
    return this.#stopPromise
  }
}
