import {readdir} from "node:fs/promises"
import {basename, dirname, extname, join} from "node:path"
import {
  generatedPackageArtifactPrefix,
  isGeneratedPackageArtifactKey,
  isPackageArtifactKey,
  rootPackageArtifact,
  type PackageArtifactKey,
  type PackageExportSubpath,
} from "../../shared/artifact"
import type {PackageOwner} from "../shared/contracts"
import {packagePublicArtifactOutput} from "../package/source"

export type PackageArtifactStorageOwner = Pick<PackageOwner, "root" | "env">
  & Partial<Pick<PackageOwner, "artifact" | "sources">>

/** Historical versioned path derived from one mutable package build output. */
export function legacyVersionedArtifact(artifact: string, version: string) {
  return join(dirname(artifact), "versions", version, basename(artifact))
}

/** Canonical immutable root path independent of mutable package build output flags. */
export function canonicalVersionedRootArtifact(
  owner: Pick<PackageOwner, "root" | "env">,
  version: string,
) {
  return join(owner.root, "dist", "versions", version, `${owner.env}.js`)
}

/** Directory that stores every non-root output of one immutable environment. */
export function versionedPackageGraphDirectory(
  owner: Pick<PackageOwner, "root" | "env">,
  version: string,
) {
  return join(
    dirname(canonicalVersionedRootArtifact(owner, version)),
    ".cosmos",
    owner.env,
  )
}

/** Resolves one logical identity to its deterministic immutable storage path. */
export function versionedPackageArtifactPath(
  owner: PackageArtifactStorageOwner,
  version: string,
  artifact: PackageArtifactKey,
) {
  if (!isPackageArtifactKey(artifact))
    throw new Error(`Invalid package artifact path: ${String(artifact)}`)
  if (artifact === rootPackageArtifact) return canonicalVersionedRootArtifact(owner, version)
  const graph = versionedPackageGraphDirectory(owner, version)
  if (isGeneratedPackageArtifactKey(artifact)) {
    const relative = artifact.slice(generatedPackageArtifactPrefix.length)
    if (!/^(?:entry|chunk|asset)\//.test(relative))
      throw new Error(`Generated package artifact is outside derived output roots: ${artifact}`)
    return join(graph, relative)
  }
  if (owner.sources === undefined)
    throw new Error(`Current sources are unavailable for public artifact ${artifact}`)
  return join(
    dirname(dirname(graph)),
    ".public",
    owner.env,
    publicArtifactOutput(owner as PackageOwner, artifact),
  )
}

/** Returns the physical suffix of one semantic public subpath. */
export function publicArtifactOutput(owner: PackageOwner, artifact: PackageExportSubpath) {
  const source = owner.sources.find((candidate) => candidate.artifact === artifact)
  if (!source) throw new Error(`${owner.env} does not export artifact ${artifact}`)
  const extension = extname(packagePublicArtifactOutput(artifact, source.source))
  return join(artifact.slice(2), `.cosmos-artifact${extension}`)
}

/** Resolves an immutable public alias even after the current exports graph changes. */
export async function resolveVersionedPackageArtifactPath(
  owner: PackageArtifactStorageOwner,
  version: string,
  artifact: PackageArtifactKey,
) {
  if (artifact === rootPackageArtifact) {
    const canonical = canonicalVersionedRootArtifact(owner, version)
    if (await Bun.file(canonical).exists()) return canonical
    if (owner.artifact !== undefined) {
      const legacy = legacyVersionedArtifact(owner.artifact, version)
      if (await Bun.file(legacy).exists()) return legacy
    }
    return canonical
  }
  if (isGeneratedPackageArtifactKey(artifact))
    return versionedPackageArtifactPath(owner, version, artifact)

  const current = owner.sources?.some((candidate) => candidate.artifact === artifact)
    ? versionedPackageArtifactPath(owner as PackageOwner, version, artifact)
    : null
  if (current !== null && await Bun.file(current).exists()) return current

  const directory = join(
    dirname(dirname(versionedPackageGraphDirectory(owner, version))),
    ".public",
    owner.env,
    artifact.slice(2),
  )
  let candidates
  try {
    candidates = (await readdir(directory, {withFileTypes: true}))
      .filter((entry) => entry.isFile() && /^\.cosmos-artifact(?:\.[A-Za-z0-9._+-]+)?$/.test(entry.name))
  } catch {
    return null
  }
  if (candidates.length > 1)
    throw new Error(`Immutable public artifact ${artifact}@${version} has multiple physical aliases`)
  return candidates[0] === undefined ? null : join(directory, candidates[0].name)
}
