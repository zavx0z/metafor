import {authorityKey} from "../../core/runtime.js"
import {isHamiltonianLifecycleEnvelope} from "../../core/lifecycle.js"
import {PeerProcessSupervisor} from "./process-supervisor.ts"
import type {PeerSignal, WeriftPeerSnapshot} from "./werift-peer.ts"
import type {HamiltonianServerLifecycle} from "../lifecycle.ts"
import type {HamiltonianServerObservation} from "../observation.ts"
import type {HamiltonianControlSocketData} from "../control/endpoint.ts"

type ControlSocket = Bun.ServerWebSocket<HamiltonianControlSocketData>

export interface HamiltonianPeerLeader {
  hostEpoch: string
  fencingToken: number
  leaseId: string
  leaseExpiresAt: number
  connectionId: string
  tabId: string
}

export interface HamiltonianPeerAssignment {
  key: string
  peerId: string
  sessionEpoch: string
  peerGeneration: number
  authorityKey: string
  connectionId: string
  tabId: string
}

export interface HamiltonianPeerCoordinatorOptions {
  hostname: string
  serverEntityId: string
  lifecycle: HamiltonianServerLifecycle
  observation: HamiltonianServerObservation
  socket(connectionId: string): ControlSocket | undefined
  hasConnection(connectionId: string): boolean
  leader(): HamiltonianPeerLeader | null
  broadcastTopology(): void
  sendControl(socket: ControlSocket, message: Readonly<{kind: string}> & Record<string, unknown>): void
  stopping(): boolean
}

/** Владеет peer assignment, repair sequencing и peer-process signaling. */
export class HamiltonianPeerCoordinator {
  readonly #options: HamiltonianPeerCoordinatorOptions
  readonly #supervisor: PeerProcessSupervisor
  #snapshot: WeriftPeerSnapshot | null = null
  #error: string | null = null
  #assignment: HamiltonianPeerAssignment | null = null
  #generation = 0
  #operations: Promise<void> = Promise.resolve()
  #readyPeerKey: string | null = null
  #signalingUp = 0
  #signalingDown = 0
  #staleFramesDropped = 0
  #repairs = 0

  constructor(options: HamiltonianPeerCoordinatorOptions) {
    this.#options = options
    this.#supervisor = new PeerProcessSupervisor({
      serverEntityId: options.serverEntityId,
      ...(isLoopbackHostname(options.hostname) ? {iceLite: true} : {}),
      onLifecycle: (envelope) => {
        if (!isHamiltonianLifecycleEnvelope(envelope)) return
        options.lifecycle.relay(envelope)
        if (!options.stopping() && envelope.observation.type !== "message") {
          options.lifecycle.broadcastServerDeclaration()
        }
      },
      onMessage: (event) => options.lifecycle.observeHostIpcMessage(event),
      onProcessExit: (event) => options.lifecycle.observeProcessExit({...event, kind: "peer-process"}),
      onSignal: (peerId, signal) => {
        const assignment = this.#assignment
        if (!assignment || assignment.peerId !== peerId) return
        const socket = options.socket(assignment.connectionId)
        if (!socket || socket.getBufferedAmount() > 256_000) return
        this.#signalingDown += 1
        options.sendControl(socket, {
          kind: "peer-signal",
          peerId,
          sessionEpoch: assignment.sessionEpoch,
          peerGeneration: assignment.peerGeneration,
          authorityKey: assignment.authorityKey,
          tabId: assignment.tabId,
          signal,
        })
      },
      onState: (snapshot, error, errorPeerId) => {
        this.#snapshot = snapshot
        const assignment = this.#assignment
        const matchesAssignment = Boolean(
          snapshot && assignment &&
          snapshot.peerId === assignment.peerId && snapshot.sessionEpoch === assignment.sessionEpoch,
        )
        const snapshotKey = snapshot ? `${snapshot.peerId}:${snapshot.sessionEpoch}` : null
        const errorMatchesAssignment = Boolean(
          error && assignment && (errorPeerId ? errorPeerId === assignment.peerId : matchesAssignment),
        )
        if (errorMatchesAssignment) {
          this.#error = error ?? null
          this.#readyPeerKey = null
          queueMicrotask(() => this.requestRepair(`peer process failure: ${error}`))
        } else if (
          matchesAssignment && snapshot && snapshot.state === "connected" &&
          snapshot.channels.includes("oracle") && snapshot.channels.includes("force")
        ) {
          this.#error = null
          this.#readyPeerKey = snapshotKey
        } else if (
          matchesAssignment && snapshot && this.#readyPeerKey === snapshotKey &&
          (snapshot.state === "failed" || snapshot.state === "closed" || snapshot.channels.length < 2)
        ) {
          this.#readyPeerKey = null
          queueMicrotask(() => this.requestRepair(`server peer ${snapshot.state}`))
        }
        options.broadcastTopology()
      },
    })
  }

  assignment(): HamiltonianPeerAssignment | null {
    return this.#assignment
  }

  operations(): Promise<void> {
    return this.#operations
  }

  snapshot() {
    return {
      assignment: this.#assignment,
      snapshot: this.#snapshot,
      process: this.#supervisor.processSnapshot(),
      error: this.#error,
      signalingUp: this.#signalingUp,
      signalingDown: this.#signalingDown,
      stalePeerFramesDropped: this.#staleFramesDropped,
      peerRepairs: this.#repairs,
    }
  }

  synchronize(leader: HamiltonianPeerLeader | null): void {
    const nextKey = leader?.leaseId ?? null
    if (this.#assignment?.key === nextKey || (!this.#assignment && !nextKey)) return
    const previous = this.#assignment
    this.#assignment = leader
      ? {
        key: leader.leaseId,
        peerId: `peer:${leader.leaseId}:${this.#generation += 1}`,
        sessionEpoch: crypto.randomUUID(),
        peerGeneration: this.#generation,
        authorityKey: authorityKey(leader)!,
        connectionId: leader.connectionId,
        tabId: leader.tabId,
      }
      : null
    this.#readyPeerKey = null
    const next = this.#assignment
    this.#operations = this.#operations.then(async () => {
      if (previous) await this.#supervisor.closePeer(previous.peerId)
      if (next && this.#assignment?.key === next.key) {
        this.#options.observation.record({
          at: Date.now(), kind: "peer-begin", connectionId: next.connectionId, detail: next.peerId,
        })
        await this.#supervisor.begin(next.peerId, next.sessionEpoch)
      }
    }).catch((error) => {
      this.#error = error instanceof Error ? error.message : String(error)
    })
  }

  rebindConnection(previousConnectionId: string, connectionId: string): void {
    if (this.#assignment?.connectionId === previousConnectionId) {
      this.#assignment = {...this.#assignment, connectionId}
    }
    const assignment = this.#assignment
    const readyAfterResume = assignment &&
      !this.#error &&
      this.#readyPeerKey === `${assignment.peerId}:${assignment.sessionEpoch}` &&
      this.#snapshot?.peerId === assignment.peerId &&
      this.#snapshot.sessionEpoch === assignment.sessionEpoch &&
      this.#snapshot.state === "connected" &&
      this.#snapshot.channels.includes("oracle") &&
      this.#snapshot.channels.includes("force")
    if (assignment && !readyAfterResume) {
      queueMicrotask(() => this.requestRepair("control resumed without a ready peer session"))
    }
  }

  handleSignal(socket: ControlSocket, message: {
    peerId: string
    sessionEpoch: string
    peerGeneration: number
    authorityKey: string
    tabId: string
    signal: PeerSignal
  }): "accepted" | "stale" | "unauthorized" {
    const assignment = this.#assignment
    if (!assignment || assignment.connectionId !== socket.data.connectionId || assignment.tabId !== message.tabId) {
      return "unauthorized"
    }
    if (
      assignment.peerId !== message.peerId || assignment.sessionEpoch !== message.sessionEpoch ||
      assignment.peerGeneration !== message.peerGeneration || assignment.authorityKey !== message.authorityKey
    ) {
      this.#staleFramesDropped += 1
      this.#options.observation.record({
        at: Date.now(), kind: "stale-peer-signal", connectionId: socket.data.connectionId,
      })
      return "stale"
    }
    this.#signalingUp += 1
    void this.#supervisor.signal(message.peerId, message.signal)
    return "accepted"
  }

  handleFailure(socket: ControlSocket, message: {
    peerId: string
    sessionEpoch: string
    peerGeneration: number
    authorityKey: string
    tabId: string
    reason: string
  }): "accepted" | "stale" | "unauthorized" {
    const assignment = this.#assignment
    if (!assignment || assignment.connectionId !== socket.data.connectionId || assignment.tabId !== message.tabId) {
      return "unauthorized"
    }
    if (
      assignment.peerId !== message.peerId || assignment.sessionEpoch !== message.sessionEpoch ||
      assignment.peerGeneration !== message.peerGeneration || assignment.authorityKey !== message.authorityKey
    ) {
      this.#staleFramesDropped += 1
      return "stale"
    }
    this.requestRepair(`browser: ${message.reason}`)
    return "accepted"
  }

  requestRepair(reason: string): HamiltonianPeerAssignment | null {
    const previous = this.#assignment
    if (!previous) return null
    const leader = this.#options.leader()
    if (
      !leader || !this.#options.hasConnection(previous.connectionId) ||
      leader.connectionId !== previous.connectionId || leader.tabId !== previous.tabId ||
      authorityKey(leader) !== previous.authorityKey || Date.now() >= leader.leaseExpiresAt
    ) return this.#assignment
    this.#generation += 1
    const next = {
      ...previous,
      peerId: `peer:${leader.leaseId}:${this.#generation}`,
      sessionEpoch: crypto.randomUUID(),
      peerGeneration: this.#generation,
    }
    this.#assignment = next
    this.#readyPeerKey = null
    this.#repairs += 1
    this.#options.observation.record({
      at: Date.now(), kind: "peer-repair", connectionId: next.connectionId,
      detail: `${reason} -> ${next.peerId}`,
    })
    this.#operations = this.#operations.then(async () => {
      await this.#supervisor.closePeer(previous.peerId)
      if (this.#assignment?.peerId !== next.peerId) return
      await this.#supervisor.begin(next.peerId, next.sessionEpoch)
    }).catch((error) => {
      this.#error = error instanceof Error ? error.message : String(error)
    })
    this.#options.broadcastTopology()
    return this.#assignment
  }

  crashForTest(): number | null {
    return this.#supervisor.crashForTest()
  }

  reportErrorForTest(peerId: string, error: string): void {
    this.#supervisor.reportErrorForTest(peerId, error)
  }

  async stop(): Promise<void> {
    await this.#supervisor.stop()
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}
