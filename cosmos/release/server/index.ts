/**
Public Bun API server-части release.

Entry point предоставляет HTTP delivery и RPC под одним release-owned listener.
Сборка и публикация подключены через публичные пакеты tech. Смысл полного состава и
handover принадлежит [release owner law](../README.md#как-сменяется-выпуск).

@packageDocumentation
*/
import {runReleaseServer, startReleaseServer} from "./runtime"

export type {
  ActivePackage,
  PackageExecutor,
  PackageExit,
  VerifiedArtifact,
} from "../shared/execution"
export {runReleaseServer, startReleaseServer}
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
export type {RpcSocketData} from "./rpc"
export {
  releasedPackageArtifactResponse,
  releasedPackageResponse,
  releasedPackageSourceMapResponse,
  releaseStateResponse,
} from "./http/state"
export {notifyRelease, publishRelease} from "./release/update"
export type {ReleaseNotification} from "./release/update"

if (import.meta.main) {
  await runReleaseServer()
}

export {browserPackageSourceMapUrl, parseBrowserPackageSourceMapUrl} from "./http/source-map"
