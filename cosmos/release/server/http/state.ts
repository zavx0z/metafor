import {packageHeaders} from "./headers"
import {builder, release} from "../services"
const {packageOwner, packageSourceLocation} = builder
const {releasedPackages, readReleaseComposition} = release
import {type BrowserPackageEnvironment} from "@metafor/tech-build/identity"
import {packageIdentityHeaders} from "@metafor/tech-build/identity"
import {isGeneratedPackageArtifactKey, rootPackageArtifact, type PackageArtifactKey} from "@metafor/tech-build/identity"
import {packageArtifactIdentityHeaders} from "@metafor/tech-build/identity"
import {browserPackageArtifactUrl} from "@metafor/tech-build/identity"
import {packageResponse, packageSourceMapResponse} from "./package"

import type {BuildablePackage} from "@metafor/tech-build"
import {packageArtifact, packageManifest} from "@metafor/tech-build"

import {isVersion} from "@metafor/tech-release"
import {artifactResponse} from "./artifact"
import {browserPackageSourceMapUrl} from "./source-map"
import {sourceMapArtifact} from "@metafor/tech-build"
import {legacyVersionedArtifact, resolveVersionedPackageArtifactPath, versionedPackageArtifactPath} from "@metafor/tech-release"





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
    const sourceMap = await packageArtifact(sourceMapArtifact(artifact.path))
    if (sourceMap) {
      headers.set("SourceMap", browserPackageSourceMapUrl(name, env, version, artifactKey))
    } else if (generated) {
      const generatedMap = `${artifactKey}.map` as PackageArtifactKey
      const sourceMap = await packageArtifact(
        versionedPackageArtifactPath(storageOwner, version, generatedMap),
      )
      if (sourceMap)
        headers.set("SourceMap", browserPackageArtifactUrl(name, env, generatedMap, version))
    }
    for (const [header, value] of Object.entries(packageHeaders(env))) headers.set(header, value)
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
  artifactKey: PackageArtifactKey = rootPackageArtifact,
) {
  const target = await releasedPackageTarget(name, env, requestedVersion)
  if (!target) return new Response(null, {status: 404})
  const {current, currentVersion, owner, storageOwner, version} = target

  const root = await resolveVersionedPackageArtifactPath(
    storageOwner,
    version,
    artifactKey,
  )
  if (root === null) return new Response(null, {status: 404})
  const artifact = await packageArtifact(sourceMapArtifact(root))
  if (artifact) return await artifactResponse(request, artifact, new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
  }))

  if (artifactKey !== rootPackageArtifact || current !== undefined || version !== currentVersion || !owner)
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
  const member = (await readReleaseComposition()).find((member) => member.name === name)
  const owner = member?.owners.find((owner) => owner.env === env)
    ?? await packageOwner(name, env).catch(() => null)
  const manifest = await packageManifest(location.manifest)
  const currentVersion = current?.version
    ?? (owner !== null && isVersion(manifest.version) ? manifest.version : null)
  if (requestedVersion === null && currentVersion === null) return null

  const version = requestedVersion ?? currentVersion
  if (!isVersion(version)) return null
  const storageOwner = owner ?? {root: location.root, env}
  return {current, currentVersion, owner, storageOwner, version}
}



/** Возвращает путь immutable artifact указанной package version. */
export function versionedArtifact(artifact: string, version: string) {
  return legacyVersionedArtifact(artifact, version)
}
