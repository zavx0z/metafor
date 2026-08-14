import {HostTopology, type WindowCandidate} from "./topology-state.ts"
import type {HamiltonianControlSocketData} from "./control/endpoint.ts"
import type {HamiltonianServerObservation} from "./observation.ts"
import type {HamiltonianPeerLeader} from "./peer/coordinator.ts"

type ControlSocket = Bun.ServerWebSocket<HamiltonianControlSocketData>

interface DetachedAuthority {
  expiresAt: number
  deviceId: string
  workerIdentity: string
  resumeNonce: string
}

export interface HamiltonianTopologyOptions {
  hostEpoch: string
  placement: "browser" | "server"
  heartbeatMs: number
  observation: HamiltonianServerObservation
  connections(): Iterable<ControlSocket>
  socket(connectionId: string): ControlSocket | undefined
  sendControl(socket: ControlSocket, message: Readonly<{kind: string}> & Record<string, unknown>): void
  hostState(): Record<string, unknown>
  synchronizePeer(leader: HamiltonianPeerLeader | null): void
  rebindPeer(previousConnectionId: string, connectionId: string): void
}

/** Владеет window inventory, browser authority lease и topology projection. */
export class HamiltonianServerTopology {
  readonly #options: HamiltonianTopologyOptions
  readonly #topology: HostTopology
  readonly #detached = new Map<string, DetachedAuthority>()
  readonly #detachedTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(options: HamiltonianTopologyOptions) {
    this.#options = options
    this.#topology = new HostTopology(options.hostEpoch)
  }

  model(): HostTopology {
    return this.#topology
  }

  connect(connectionId: string, deviceId: string): void {
    this.#topology.connect(connectionId, deviceId)
  }

  disconnect(connectionId: string): void {
    this.#topology.disconnect(connectionId)
  }

  windowsForConnection(connectionId: string): readonly WindowCandidate[] {
    return this.#topology.snapshot().peers.find((peer) => peer.connectionId === connectionId)?.windows ?? []
  }

  updateWindows(connectionId: string, windows: WindowCandidate[]): void {
    this.#topology.updateWindows(connectionId, windows)
  }

  state() {
    const snapshot = this.#topology.snapshot()
    if (this.#options.placement === "server") {
      return {...snapshot, leaseDurationMs: this.#options.heartbeatMs * 3, leader: null}
    }
    const leaderSocket = snapshot.leader ? this.#options.socket(snapshot.leader.connectionId) : null
    const detachedExpiry = snapshot.leader
      ? this.#detached.get(snapshot.leader.connectionId)?.expiresAt
      : undefined
    return {
      ...snapshot,
      leaseDurationMs: this.#options.heartbeatMs * 3,
      leader: snapshot.leader
        ? {
          ...snapshot.leader,
          leaseExpiresAt: leaderSocket
            ? leaderSocket.data.lastPongAt + this.#options.heartbeatMs * 3
            : detachedExpiry ?? 0,
        }
        : null,
    }
  }

  leader(): HamiltonianPeerLeader | null {
    return this.state().leader
  }

  broadcast(): void {
    const topology = this.state()
    const message = {kind: "topology", host: this.#options.hostState(), topology}
    for (const socket of this.#options.connections()) {
      if (!socket.data.identityConfirmed) continue
      if (socket.getBufferedAmount() > 256_000) {
        socket.close(1013, "control channel backpressure")
        continue
      }
      this.#options.sendControl(socket, message)
    }
    this.#options.synchronizePeer(topology.leader)
  }

  tryResume(socket: ControlSocket, windows: WindowCandidate[]): boolean {
    const leader = this.#topology.snapshot().leader
    if (!leader || this.#options.socket(leader.connectionId)) return false
    const detached = this.#detached.get(leader.connectionId)
    if (
      !detached || Date.now() >= detached.expiresAt ||
      detached.deviceId !== socket.data.deviceId ||
      detached.workerIdentity !== socket.data.workerIdentity ||
      detached.resumeNonce !== socket.data.resumeNonce
    ) return false
    if (!this.#topology.rebindLeaderConnection(leader.connectionId, socket.data.connectionId, windows)) return false
    const timer = this.#detachedTimers.get(leader.connectionId)
    if (timer) clearTimeout(timer)
    this.#detachedTimers.delete(leader.connectionId)
    this.#detached.delete(leader.connectionId)
    this.#options.rebindPeer(leader.connectionId, socket.data.connectionId)
    this.#options.observation.record({
      at: Date.now(), kind: "authority-resumed", connectionId: socket.data.connectionId,
      detail: `from ${leader.connectionId}`,
    })
    return true
  }

  closeConnection(socket: ControlSocket, retainCurrentAuthority: boolean): void {
    if (retainCurrentAuthority) {
      const expiresAt = socket.data.lastPongAt + this.#options.heartbeatMs * 3
      if (!socket.data.workerIdentity || !socket.data.resumeNonce) {
        this.#topology.disconnect(socket.data.connectionId)
        this.broadcast()
        return
      }
      this.#detached.set(socket.data.connectionId, {
        expiresAt,
        deviceId: socket.data.deviceId,
        workerIdentity: socket.data.workerIdentity,
        resumeNonce: socket.data.resumeNonce,
      })
      this.#options.observation.record({
        at: Date.now(), kind: "authority-detached", connectionId: socket.data.connectionId,
        detail: `valid until ${expiresAt}`,
      })
      const timer = setTimeout(() => {
        this.#detachedTimers.delete(socket.data.connectionId)
        this.#detached.delete(socket.data.connectionId)
        this.#topology.disconnect(socket.data.connectionId)
        this.#options.observation.record({
          at: Date.now(), kind: "detached-authority-expired", connectionId: socket.data.connectionId,
        })
        this.broadcast()
      }, Math.max(0, expiresAt - Date.now()))
      this.#detachedTimers.set(socket.data.connectionId, timer)
    } else {
      this.#detached.delete(socket.data.connectionId)
      this.#topology.disconnect(socket.data.connectionId)
    }
    this.broadcast()
  }

  stop(): void {
    for (const timer of this.#detachedTimers.values()) clearTimeout(timer)
    this.#detachedTimers.clear()
    this.#detached.clear()
  }
}
