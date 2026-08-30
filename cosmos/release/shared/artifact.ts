/** Root artifact keeps the historical package URL and omits a wire field. */
export const rootPackageArtifact = "." as const

/** Reserved output namespace for future derived chunks and copied assets. */
export const generatedPackageArtifactPrefix = "./.cosmos/" as const

/** Canonical public package export subpath used as a non-root artifact key. */
export type PackageExportSubpath = `./${string}`

/** Private build output derived from public entrypoints, never a package export. */
export type GeneratedPackageArtifactKey = `./.cosmos/${string}`

/** Canonical non-root key carried by identity and wire readers. */
export type NonRootPackageArtifactKey = PackageExportSubpath | GeneratedPackageArtifactKey

/** Canonical identity key of one package-owned artifact. */
export type PackageArtifactKey = typeof rootPackageArtifact | NonRootPackageArtifactKey

/** Root or public export key before any derived build outputs exist. */
export type PublicPackageArtifactKey = typeof rootPackageArtifact | PackageExportSubpath

/** Returns whether a value is one exact governed public export subpath. */
export function isPackageExportSubpath(value: unknown): value is PackageExportSubpath {
  if (typeof value !== "string" || !value.startsWith("./")) return false
  if (value.startsWith(generatedPackageArtifactPrefix)) return false
  return hasCanonicalSegments(value.slice(2))
}

/** Returns whether a value is one exact private generated artifact key. */
export function isGeneratedPackageArtifactKey(value: unknown): value is GeneratedPackageArtifactKey {
  return typeof value === "string"
    && value.startsWith(generatedPackageArtifactPrefix)
    && hasCanonicalSegments(value.slice(generatedPackageArtifactPrefix.length))
}

/** Returns whether a value is the root artifact or one exact non-root key. */
export function isPackageArtifactKey(value: unknown): value is PackageArtifactKey {
  return value === rootPackageArtifact
    || isPackageExportSubpath(value)
    || isGeneratedPackageArtifactKey(value)
}

/** Reader-first normalization: an omitted wire field is the historical root. */
export function readPackageArtifactKey(value: unknown): PackageArtifactKey | null {
  if (value === undefined) return rootPackageArtifact
  return isPackageExportSubpath(value) || isGeneratedPackageArtifactKey(value) ? value : null
}

/** Returns the canonical wire value: root stays omitted, non-root stays exact. */
export function packageArtifactWireValue(artifact: PackageArtifactKey) {
  return artifact === rootPackageArtifact ? undefined : artifact
}

function hasCanonicalSegments(value: string) {
  if (value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#")) return false

  const segments = value.split("/")
  return segments.length > 0 && segments.every((segment) =>
    segment.length > 0
    && segment !== "."
    && segment !== ".."
    && segment !== "node_modules"
    && segment !== ".cosmos"
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))
}
