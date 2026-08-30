import {
  browserPackageEnvironments,
  type BrowserPackageEnvironment,
} from "../../../shared/package/environment"
import {packageIdentityHeaders} from "../../../shared/package/integrity"
import {
  isGeneratedPackageArtifactKey,
  rootPackageArtifact,
  type PackageArtifactKey,
} from "../../shared/artifact"
import {packageArtifactIdentityHeaders} from "../../shared/artifact-integrity"
import {browserPackageArtifactUrl} from "../../shared/artifact-url"
import {packageResponse, packageSourceMapResponse} from "../package/build"
import {readReleaseComposition} from "./composition"
import type {
  BuildablePackage,
  ReleasedPackage,
} from "../shared/contracts"
import {
  packageArtifact,
  packageManifest,
  packageOwner,
  packageSourceLocation,
} from "../package/manifest"
import {waitForPublication} from "./queue"
import {isVersion} from "../package/version"
import {artifactResponse} from "../package/response"
import {browserPackageSourceMapUrl, sourceMapArtifact} from "../package/source-map"
import {
  legacyVersionedArtifact,
  resolveVersionedPackageArtifactPath,
  versionedPackageArtifactPath,
} from "./artifact-path"

/** Возвращает текущее доказанное состояние из корневых caret dependencies. */
export async function releasedPackages(): Promise<ReleasedPackage[]> {
  await waitForPublication()
  return await readReleasedPackages()
}

/** Читает release state внутри уже сериализованной publication. */
export async function readReleasedPackages(): Promise<ReleasedPackage[]> {
  const composition = await readReleaseComposition()
  const packages: ReleasedPackage[] = []

  for (const {name, version, owners} of composition) {
    const environments = owners
      .filter(({env}) => browserPackageEnvironments.some((browserEnv) => browserEnv === env))
    for (const environmentOwner of environments) {
      const {env} = environmentOwner
      const browserEnv = env as BrowserPackageEnvironment
      const path = await resolveVersionedPackageArtifactPath(
        environmentOwner,
        version,
        rootPackageArtifact,
      )
      if (path === null)
        throw new Error(`Released artifact ${name}:${browserEnv}@${version} is missing`)
      const artifact = await packageArtifact(path)
      if (!artifact)
        throw new Error(`Released artifact ${name}:${browserEnv}@${version} is missing`)
      packages.push({
        name,
        env: browserEnv,
        version,
        sha256: artifact.sha256,
        size: artifact.size,
      })
    }
  }

  return packages
}

/** Отдаёт JSON текущего package state без отдельного manifest-файла. */
export async function releaseStateResponse() {
  return Response.json(
    {packages: await releasedPackages()},
    {headers: {"Cache-Control": "no-cache"}},
  )
}

/** Отдаёт точную versioned сборку либо текущий initial artifact package. */
export async function releasedPackageResponse(
  name: BuildablePackage,
  env: BrowserPackageEnvironment,
  requestedVersion: string | null,
  request?: Request,
) {
  return await releasedPackageArtifactResponse(
    name,
    env,
    rootPackageArtifact,
    requestedVersion,
    request,
  )
}

/** Отдаёт exact root, public subpath либо generated output одной package version. */
export async function releasedPackageArtifactResponse(
  name: BuildablePackage,
  env: BrowserPackageEnvironment,
  artifactKey: PackageArtifactKey,
  requestedVersion: string | null,
  request?: Request,
) {
  const target = await releasedPackageTarget(name, env, requestedVersion)
  if (!target) return new Response(null, {status: 404})
  const {current, currentVersion, owner, storageOwner, version} = target
  const generated = isGeneratedPackageArtifactKey(artifactKey)
  const publicArtifact = artifactKey !== rootPackageArtifact && !generated
  if (
    publicArtifact
    && requestedVersion === null
    && !owner?.sources.some(({artifact}) => artifact === artifactKey)
  ) return new Response(null, {status: 404})

  const artifactPath = await resolveVersionedPackageArtifactPath(storageOwner, version, artifactKey)
  const artifact = artifactPath === null ? null : await packageArtifact(artifactPath)
  if (artifact) {
    const identity = {
      name,
      env,
      ...(artifactKey === rootPackageArtifact ? {} : {artifact: artifactKey}),
      version,
      sha256: artifact.sha256,
      size: artifact.size,
    }
    const headers = new Headers({
      "Cache-Control": "no-cache",
      "Content-Type": artifact.type,
      ...packageArtifactIdentityHeaders(identity),
    })
    const sourceMap = artifactKey === rootPackageArtifact
      ? await packageArtifact(sourceMapArtifact(artifact.path))
      : null
    if (sourceMap) {
      headers.set("SourceMap", browserPackageSourceMapUrl(name, env, version))
    } else if (generated) {
      const generatedMap = `${artifactKey}.map` as PackageArtifactKey
      const sourceMap = await packageArtifact(
        versionedPackageArtifactPath(storageOwner, version, generatedMap),
      )
      if (sourceMap)
        headers.set("SourceMap", browserPackageArtifactUrl(name, env, generatedMap, version))
    }
    for (const [header, value] of Object.entries(packageHeaders(env, owner))) headers.set(header, value)
    return await artifactResponse(request, artifact, headers)
  }

  if (
    artifactKey !== rootPackageArtifact
    || current !== undefined
    || version !== currentVersion
  ) return new Response(null, {status: 404})

  if (!owner) return new Response(null, {status: 404})
  const response = await packageResponse(name, env, request)
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  const sha256 = headers.get("X-Package-SHA256")
  const size = Number(headers.get("X-Package-Size"))
  if (sha256 === null || !Number.isSafeInteger(size) || size <= 0)
    return new Response(null, {status: 500})
  for (const [header, value] of Object.entries(packageIdentityHeaders({
    name,
    env,
    version,
    sha256,
    size,
  }))) headers.set(header, value)
  const sourceMap = await packageArtifact(sourceMapArtifact(owner.artifact))
  if (sourceMap)
    headers.set("SourceMap", browserPackageSourceMapUrl(name, env, version))
  return new Response(response.body, {status: response.status, headers})
}

/** Отдаёт immutable source map отдельно от browser package identity и caches. */
export async function releasedPackageSourceMapResponse(
  name: BuildablePackage,
  env: BrowserPackageEnvironment,
  requestedVersion: string | null,
  request?: Request,
) {
  const target = await releasedPackageTarget(name, env, requestedVersion)
  if (!target) return new Response(null, {status: 404})
  const {current, currentVersion, owner, storageOwner, version} = target

  const root = await resolveVersionedPackageArtifactPath(
    storageOwner,
    version,
    rootPackageArtifact,
  )
  if (root === null) return new Response(null, {status: 404})
  const artifact = await packageArtifact(sourceMapArtifact(root))
  if (artifact) return await artifactResponse(request, artifact, new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
  }))

  if (current !== undefined || version !== currentVersion || !owner)
    return new Response(null, {status: 404})
  return await packageSourceMapResponse(name, env, request)
}

async function releasedPackageTarget(
  name: BuildablePackage,
  env: BrowserPackageEnvironment,
  requestedVersion: string | null,
) {
  const packages = await releasedPackages()
  const current = packages.find((entry) => entry.name === name && entry.env === env)
  const location = await packageSourceLocation(name)
  const owner = await packageOwner(name, env).catch(() => null)
  const manifest = await packageManifest(location.manifest)
  const currentVersion = current?.version
    ?? (owner !== null && isVersion(manifest.version) ? manifest.version : null)
  if (requestedVersion === null && currentVersion === null) return null

  const version = requestedVersion ?? currentVersion
  if (!isVersion(version)) return null
  const storageOwner = owner ?? {root: location.root, env}
  return {current, currentVersion, owner, storageOwner, version}
}

function packageHeaders(env: BrowserPackageEnvironment, owner: Awaited<ReturnType<typeof packageOwner>> | null) {
  if (owner) return owner.headers
  return env === "service" ? {
    "Content-Security-Policy": "script-src 'unsafe-eval'",
    "Service-Worker-Allowed": "/",
  } : {}
}

/** Возвращает путь immutable artifact указанной package version. */
export function versionedArtifact(artifact: string, version: string) {
  return legacyVersionedArtifact(artifact, version)
}
