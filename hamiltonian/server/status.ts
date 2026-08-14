import type {HamiltonianServerConfiguration} from "./configuration.ts"
import type {HamiltonianProcessCoordinator} from "./process/coordinator.ts"
import type {HamiltonianPeerCoordinator} from "./peer/coordinator.ts"
import type {HamiltonianControlSession} from "./control/session.ts"
import type {HamiltonianServerTopology} from "./topology.ts"
import type {HamiltonianServerWebPush} from "./web-push/coordinator.ts"
import type {HamiltonianServerObservation} from "./observation.ts"
import {hamiltonianSecurityHeaders} from "./browser/publication.ts"

export interface HamiltonianStatusOptions {
  configuration: HamiltonianServerConfiguration
  hostEpoch: string
  process: HamiltonianProcessCoordinator
  peer: HamiltonianPeerCoordinator
  control: HamiltonianControlSession
  topology: HamiltonianServerTopology
  webPush: HamiltonianServerWebPush
  observation: HamiltonianServerObservation
  boundPort(): number
}

/** Read-only aggregation of snapshots; it owns no mutable mechanism state. */
export class HamiltonianStatusProjection {
  readonly #options: HamiltonianStatusOptions

  constructor(options: HamiltonianStatusOptions) {
    this.#options = options
  }

  hostState(): Record<string, unknown> {
    const {configuration, hostEpoch, process, peer} = this.#options
    return {
      identity: configuration.identity,
      hostEpoch,
      version: configuration.version,
      placement: configuration.placement,
      serverAuthority: process.authority(),
      bunEmbodiment: process.snapshot()[process.mainRole],
      bunEmbodiments: process.snapshot(),
      peer: {
        assignment: peer.assignment(),
        snapshot: peer.snapshot().snapshot,
        error: peer.snapshot().error,
      },
    }
  }

  snapshot() {
    const {configuration, hostEpoch, process, peer, control, topology, webPush, observation} = this.#options
    const peerState = peer.snapshot()
    const controlState = control.snapshot()
    return {
      identity: configuration.identity,
      hostEpoch,
      version: configuration.version,
      placement: configuration.placement,
      serverAuthority: process.authority(),
      listener: {hostname: configuration.hostname, port: this.#options.boundPort()},
      topology: topology.state(),
      serverEmbodiments: process.snapshot(),
      peer: {
        assignment: peerState.assignment,
        snapshot: peerState.snapshot,
        process: peerState.process,
        error: peerState.error,
        signalingUp: peerState.signalingUp,
        signalingDown: peerState.signalingDown,
        realtimeFramesOnControlSocket: 0,
        realtimeFramesRejected: controlState.realtimeFramesRejected,
        stalePeerFramesDropped: peerState.stalePeerFramesDropped,
        peerRepairs: peerState.peerRepairs,
        controlFramesIn: controlState.controlFramesIn,
        controlBytesIn: controlState.controlBytesIn,
        heartbeatAcks: controlState.heartbeatAcks,
      },
      connections: controlState.connections,
      push: {
        publicKey: webPush.publicKey,
        subscriptions: webPush.snapshots(),
        pendingWakeIds: webPush.pendingWakeIds(),
      },
      events: observation.events(),
    }
  }

  response(): Response {
    return Response.json(this.snapshot(), {
      headers: hamiltonianSecurityHeaders("application/json; charset=utf-8"),
    })
  }
}
