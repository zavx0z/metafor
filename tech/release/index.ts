import {join} from "node:path"
import type {PackageBuilder} from "@metafor/tech-build"
import {createReleaseComposition} from "./composition"
import {createPublicationQueue} from "./queue"
import {createArtifactProjection} from "./desired"
import {createReleaseState} from "./state"
import {createReleaseStorage} from "./storage"
import {createPublication} from "./publication"

export interface ReleaseOptions {
  root: string
  builder: PackageBuilder
  /** Принадлежность зависимости составу выпуска задаёт приложение. */
  isMember(name: string): boolean
}

/** Выпуск владеет очередью, составом, публикацией и восстановлением версий. */
export function createRelease(options: ReleaseOptions) {
  const context = {...options, manifest: join(options.root, "package.json")}
  const storage = createReleaseStorage(options.root)
  const composition = createReleaseComposition(context, storage)
  const queue = createPublicationQueue()
  const projection = createArtifactProjection()
  const state = createReleaseState(composition, queue)
  const publication = createPublication(context, composition, queue, projection, state, storage)
  return {...composition, ...queue, ...projection, ...state, ...publication}
}

export * from "./contracts"
export {
  validateReleaseDependencyGraph,
  validateBrowserReleaseEnvironments,
  validateTargetReleaseVersions,
  satisfiesWorkspaceRange,
} from "./composition"
export type {ReleaseCompositionMember, ReleaseDependencyMember} from "./composition"
export {publishImmutableArtifact, writeRootVersions, restoreManifest} from "./publication"
export type {RecoveryResult} from "./publication"
export * from "./artifact-path"
export * from "./version"
