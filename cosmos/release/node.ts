/**
Public server composition of one network participant and the pinned artifact
source supplied by its caller. Importing this module starts no runtime or
listener. Meta-owned Processes retain startup, admission and shutdown policy.
Configuration and credential readers enforce private native files; the socket
factory applies a localhost proxy only to owned external WebSockets. These
operations create no participant until startReleaseNode is called.
The factory and types keep their [release owner](README.md).
@packageDocumentation
*/
export {startReleaseNode, readReleaseNodeConfiguration, readReleaseNodeToken, createReleaseWebSocketFactory} from "./server/node"
export type {ReleaseNode, ReleaseNodeConfiguration, ReleaseNodeDependencies, ReleaseNodeOptions} from "./server/node-contract"
export type {ReleaseNodeObservationSource} from "./server/peer-observation"
export type {DomainTransportReport, PeerNetworkObservation, ObservedPeer} from "./shared/peer-observation"
export {createReleaseNodeObservationBridge} from "./server/observation-bridge"
