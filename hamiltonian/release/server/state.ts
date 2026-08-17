import {basename, dirname, join} from "node:path"
import {
  browserPackageEnvironments,
  type BrowserPackageEnvironment,
} from "../../web/package-environment"
import {packageIdentityHeaders} from "../../web/package-integrity"
import {packageResponse} from "./build"
import {readReleaseComposition} from "./composition"
import type {
  BuildablePackage,
  ReleasedPackage,
  ReleasablePackage,
} from "./contracts"
import {
  packageArtifact,
  packageManifest,
  packageOwner,
  packageOwners,
} from "./package"
import {waitForPublication} from "./queue"
import {isVersion} from "./version"

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
      const artifact = await packageArtifact(versionedArtifact(environmentOwner.artifact, version))
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
) {
  const packages = await releasedPackages()
  const current = packages.find((entry) => entry.name === name && entry.env === env)
  const owner = await packageOwner(name, env)
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
      ...packageIdentityHeaders({
        name,
        env,
        version,
        sha256: artifact.sha256,
        size: artifact.size,
      }),
    })
    for (const [header, value] of Object.entries(owner.headers)) headers.set(header, value)
    return new Response(Bun.file(artifact.path), {headers})
  }

  if (current !== undefined || version !== currentVersion) return new Response(null, {status: 404})

  const response = await packageResponse(name, env)
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
  return new Response(response.body, {status: response.status, headers})
}

/** Возвращает путь immutable artifact указанной package version. */
export function versionedArtifact(artifact: string, version: string) {
  return join(dirname(artifact), "versions", version, basename(artifact))
}
