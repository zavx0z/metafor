/**
Public Bun API server-части release.

Entry point предоставляет HTTP delivery и RPC под одним release-owned listener.
Сборка и публикация подключены через публичные пакеты tech. Смысл полного состава и
handover принадлежит [release owner law](../README.md#как-сменяется-выпуск).

@packageDocumentation
*/
import "reflect-metadata"
import {runReleaseServer, startReleaseServer} from "./runtime"
import {runQuantumDomain} from "./quantum"

export type {
  ActivePackage,
  PackageExecutor,
  PackageExit,
  ReleaseHandover,
  VerifiedArtifact,
} from "../shared/execution"
export {runReleaseServer, startReleaseServer}
export type {ReleaseServerOptions} from "./runtime"
export {acceptsBrotli} from "./http/artifact"
export {releaseDelta} from "./release/delta"
export {
  parseReleaseChangedMessage,
  parseReleaseCurrentMessage,
  parseReleaseDeltaMessage,
  releaseChangedMessage,
  releaseCurrentMessage,
  releaseDeltaMessage,
} from "../shared/protocol"
export type {
  ReleaseChangedMessage,
  ReleaseCurrentMessage,
  ReleaseDelta,
  ReleaseDeltaMessage,
  ReleaseRemoval,
} from "../shared/protocol"
export {getPackage, getRelease} from "./http/delivery"
export {packageChanges} from "./release/request"
export {
  closeRpc,
  messageRpc,
  openRpc,
  rpcServiceTopic,
  upgradeRpc,
} from "./rpc"
export type {RpcSocketData, ReleaseServerSocketData} from "./rpc"
export {
  releasedPackageArtifactResponse,
  releasedPackageResponse,
  releasedPackageSourceMapResponse,
  releaseStateResponse,
} from "./http/state"
export {notifyRelease, publishRelease} from "./release/update"
export type {ReleaseNotification} from "./release/update"

if (import.meta.main) {
  if (Bun.env.COSMOS_QUANTUM_DOMAIN) await runQuantumDomain(Bun.env.COSMOS_QUANTUM_DOMAIN)
  else await runReleaseServer()
}

export {browserPackageSourceMapUrl, parseBrowserPackageSourceMapUrl} from "./http/source-map"
export {createServerReleaseReceiver} from "./installed/receive"
export type {ServerReleaseSource, ServerReleaseReceiverOptions} from "./installed/receive"
export {runInstalledRelease} from "./installed/runtime"
export type {InstalledServerOptions} from "./installed/runtime"
export {createInstalledReleaseDelivery} from "./installed/delivery"
export {createReleasePeer, createWeriftReleaseChannel} from "./peer"
export type {ReleasePeer, ReleasePeerSource, ReleaseDataChannelPort} from "./peer"
export {createConnectedReleasePeer, acceptReleasePeer} from "./peer/connect"
