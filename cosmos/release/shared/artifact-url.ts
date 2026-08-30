import {
  isBrowserPackageEnvironment,
  type BrowserPackageEnvironment,
} from "../../shared/package/environment"
import {
  browserPackageUrl,
  parseBrowserPackageUrl,
  type BrowserPackageUrl,
} from "../../shared/package/url"
import {
  generatedPackageArtifactPrefix,
  isGeneratedPackageArtifactKey,
  isPackageArtifactKey,
  isPackageExportSubpath,
  readPackageArtifactKey,
  rootPackageArtifact,
  type NonRootPackageArtifactKey,
  type PackageArtifactKey,
} from "./artifact"

const packageNamePattern = /^@(cosmos|internal|metafor)\/[^/]+$/
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** Canonical root, public export or private generated artifact URL. */
export interface BrowserPackageArtifactUrl extends BrowserPackageUrl {
  artifact?: NonRootPackageArtifactKey
}

/**
 * Formats one canonical browser artifact URL.
 *
 * Root delegates to the historical formatter. Public exports add their exact
 * subpath and retain canonical `env`, then `version` query order. Generated
 * outputs are exact-only below a version-pinned `.cosmos` path.
 */
export function browserPackageArtifactUrl(
  name: string,
  env: BrowserPackageEnvironment,
  artifact: PackageArtifactKey,
  version?: string,
) {
  if (!isPackageArtifactKey(artifact))
    throw new Error(`Некорректный artifact browser package: ${String(artifact)}`)
  if (artifact === rootPackageArtifact) return browserPackageUrl(name, env, version)
  if (version !== undefined && !versionPattern.test(version))
    throw new Error(`Некорректная версия browser package: ${version}`)
  if (isGeneratedPackageArtifactKey(artifact)) {
    if (version === undefined) throw new Error("Generated browser artifact requires an exact version")
    return `${browserPackageGeneratedPublicPath(name, env, version)}${
      artifact.slice(generatedPackageArtifactPrefix.length)
    }`
  }

  const root = browserPackageUrl(name, env, version)
  return `/${name}/${artifact.slice(2)}${root.slice(`/${name}`.length)}`
}

/** Strict reader for historical root, public export and generated exact URLs. */
export function parseBrowserPackageArtifactUrl(url: URL): BrowserPackageArtifactUrl | null {
  const root = parseBrowserPackageUrl(url)
  if (root !== null) return root

  const parsed = packageArtifactPath(url.pathname)
  if (parsed === null) return null
  if (parsed.generated) {
    if (url.search !== "") return null
    const canonical = browserPackageArtifactUrl(
      parsed.name,
      parsed.env,
      parsed.artifact,
      parsed.version,
    )
    return url.pathname === canonical ? {
      name: parsed.name,
      env: parsed.env,
      artifact: parsed.artifact,
      version: parsed.version,
    } : null
  }

  const rootUrl = new URL(`/${parsed.name}${url.search}`, url)
  const rootIdentity = parseBrowserPackageUrl(rootUrl)
  if (rootIdentity === null) return null
  if (rootIdentity.version !== null && !versionPattern.test(rootIdentity.version)) return null
  const canonical = browserPackageArtifactUrl(
    parsed.name,
    rootIdentity.env,
    parsed.artifact,
    rootIdentity.version ?? undefined,
  )
  return `${url.pathname}${url.search}` === canonical ? {
    ...rootIdentity,
    artifact: parsed.artifact,
  } : null
}

/** Stable public-export slot; generated outputs deliberately have no stable URL. */
export function browserPackageArtifactSlot(
  name: string,
  env: BrowserPackageEnvironment,
  artifact: PackageArtifactKey,
) {
  if (isGeneratedPackageArtifactKey(artifact))
    throw new Error("Generated browser artifact has no stable URL")
  return browserPackageArtifactUrl(name, env, artifact)
}

/** Root-relative Bun publicPath for one exact generated output directory. */
export function browserPackageGeneratedPublicPath(
  name: string,
  env: BrowserPackageEnvironment,
  version: string,
) {
  browserPackageUrl(name, env, version)
  if (!versionPattern.test(version)) throw new Error(`Некорректная версия browser package: ${version}`)
  return `/${name}/.cosmos/${env}/${version}/`
}

/** Exact URL from a reader-first identity with an omitted root artifact field. */
export function browserPackageIdentityUrl(
  identity: Readonly<{
    name: string
    env: BrowserPackageEnvironment
    artifact?: NonRootPackageArtifactKey
    version: string
  }>,
) {
  const artifact = readPackageArtifactKey(identity.artifact)
  if (artifact === null) throw new Error(`Некорректный artifact browser package: ${String(identity.artifact)}`)
  return browserPackageArtifactUrl(identity.name, identity.env, artifact, identity.version)
}

/** Opaque comparison slot that never pretends a generated artifact has a stable URL. */
export function browserPackageIdentitySlot(
  identity: Readonly<{
    name: string
    env: BrowserPackageEnvironment
    artifact?: NonRootPackageArtifactKey
  }>,
) {
  const artifact = readPackageArtifactKey(identity.artifact)
  if (artifact === null) throw new Error(`Некорректный artifact browser package: ${String(identity.artifact)}`)
  return `${identity.name}\u0000${identity.env}\u0000${artifact}`
}

function packageArtifactPath(pathname: string) {
  if (!pathname.startsWith("/")) return null
  const segments = pathname.slice(1).split("/")
  if (segments.length < 3) return null
  const name = `${segments[0]}/${segments[1]}`
  if (!packageNamePattern.test(name)) return null

  if (segments[2] === ".cosmos") {
    if (segments.length < 6) return null
    const env = segments[3]
    const version = segments[4]
    const artifact = `${generatedPackageArtifactPrefix}${segments.slice(5).join("/")}`
    if (
      typeof env !== "string"
      || !isBrowserPackageEnvironment(env)
      || typeof version !== "string"
      || !versionPattern.test(version)
      || !isGeneratedPackageArtifactKey(artifact)
    ) return null
    return {
      name,
      env,
      version,
      artifact,
      generated: true,
    } as const
  }

  const artifact = `./${segments.slice(2).join("/")}`
  return isPackageExportSubpath(artifact)
    ? {name, artifact, generated: false} as const
    : null
}
