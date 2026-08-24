/**
 * Public Bun API server-части release.
 *
 * Entry point объединяет package discovery/build/publication, release state,
 * delivery и RPC под одним release-owned listener. Смысл полного состава и
 * handover принадлежит [release owner law](../README.md#как-сменяется-выпуск).
 *
 * @packageDocumentation
 */
import {runReleaseServer, startReleaseServer} from "./runtime"

export type {
  ActivePackage,
  PackageExecutor,
  PackageExit,
  VerifiedArtifact,
} from "../shared/execution"
export {runReleaseServer, startReleaseServer}
export {
  buildablePackage,
  buildPackage,
  packageResponse,
  packageSourceMapResponse,
} from "./package/build"
export {packageBuildCommand} from "./package/command"
export {acceptsBrotli} from "./package/response"
export {
  browserPackageSourceMapUrl,
  externalizeSourceMap,
  parseBrowserPackageSourceMapUrl,
  sourceMapArtifact,
} from "./package/source-map"
export {
  readReleaseComposition,
  readReleaseIntentComposition,
  satisfiesWorkspaceRange,
  validateBrowserReleaseEnvironments,
  validateReleaseDependencyGraph,
  validateTargetReleaseVersions,
} from "./release/composition"
export type {
  ReleaseCompositionMember,
  ReleaseDependencyMember,
} from "./release/composition"
export type {
  BuildablePackage,
  PackageBuildArtifact,
  PackageBuildOptions,
  PackageBuildResult,
  PackageChange,
  PackageEnvironmentExport,
  PackageReleaseResult,
  PackageReleaseResultSet,
  ReleasedPackage,
  ReleasablePackage,
  VersionChange,
} from "./shared/contracts"
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
export {
  browserPackageEnvironments,
  bunPackageEnvironments,
  isBunPackageEnvironment,
  isBrowserPackageEnvironment,
  isPackageEnvironment,
  packageEnvironmentBuildTarget,
  packageEnvironments,
} from "../../shared/package/environment"
export {getPackage, getRelease} from "./http/delivery"
export {packageEnvironmentExports, packageOwner, packageOwners} from "./package/manifest"
export {
  publishImmutableArtifact,
  publishPackages,
  recoverPublication,
  restoreManifest,
  writeRootVersions,
} from "./release/publication"
export type {RecoveryResult} from "./release/publication"
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
  releasedPackageResponse,
  releasedPackageSourceMapResponse,
  releasedPackages,
  releaseStateResponse,
} from "./release/state"
export {notifyRelease, publishRelease} from "./release/update"
export type {ReleaseNotification} from "./release/update"
export {nextPackageVersion} from "./package/version"

if (import.meta.main) {
  await runReleaseServer()
}
