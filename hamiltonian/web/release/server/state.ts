import {dirname, join} from "node:path"
import {browserPackageUrl} from "../../package-url"
import {packageResponse} from "./build"
import type {
  BuildablePackage,
  ReleasedPackage,
  ReleasablePackage,
} from "./contracts"
import {packageArtifact, packageManifest, packageOwner} from "./package"
import {hamiltonianManifest} from "./paths"
import {waitForPublication} from "./queue"
import {caretVersion, isVersion} from "./version"

/** Возвращает текущее доказанное состояние из корневых caret dependencies. */
export async function releasedPackages(): Promise<ReleasedPackage[]> {
  await waitForPublication()
  return await readReleasedPackages()
}

/** Читает release state внутри уже сериализованной publication. */
export async function readReleasedPackages(): Promise<ReleasedPackage[]> {
  const root = await packageManifest(hamiltonianManifest)
  const packages: ReleasedPackage[] = []

  for (const [name, dependency] of Object.entries(root.dependencies ?? {})) {
    if (!isReleasableName(name) || typeof dependency !== "string") continue
    const version = caretVersion(dependency)
    if (version === null) continue

    const owner = await packageOwner(name)
    if (owner.cache === null)
      throw new Error(`Released package ${name} must declare artifact.cache`)
    const manifest = await packageManifest(owner.manifest)
    if (manifest.name !== name || manifest.version !== version)
      throw new Error(`Released package ${name} must have exact version ${version}`)
    packages.push(releasedPackage(name, version, owner.cache))
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
  requestedVersion: string | null,
) {
  const packages = await releasedPackages()
  const current = packages.find((entry) => entry.name === name)
  const owner = await packageOwner(name)
  const manifest = await packageManifest(owner.manifest)
  const currentVersion = current?.version ?? (isVersion(manifest.version) ? manifest.version : null)
  if (currentVersion === null) return new Response(null, {status: 404})

  const version = requestedVersion ?? currentVersion
  if (!isVersion(version)) return new Response(null, {status: 404})

  const artifact = await packageArtifact(versionedArtifact(owner.artifact, version))
  if (artifact) {
    const headers = new Headers({
      "Cache-Control": "no-cache",
      "Content-Type": artifact.type,
      "X-Package-Name": name,
      "X-Package-Version": version,
    })
    for (const [header, value] of Object.entries(owner.headers)) headers.set(header, value)
    return new Response(Bun.file(artifact.path), {headers})
  }

  if (version !== currentVersion) return new Response(null, {status: 404})

  const response = await packageResponse(name)
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  headers.set("X-Package-Name", name)
  headers.set("X-Package-Version", version)
  return new Response(response.body, {status: response.status, headers})
}

/** Возвращает путь immutable artifact указанной package version. */
export function versionedArtifact(artifact: string, version: string) {
  return join(dirname(artifact), "versions", version, "index.js")
}

function releasedPackage(name: ReleasablePackage, version: string, cache: string) {
  return {
    name,
    version,
    cache,
    endpoint: browserPackageUrl(name, version),
  }
}

function isReleasableName(value: string): value is ReleasablePackage {
  return value.startsWith("@release/") || value.startsWith("@internal/")
}
