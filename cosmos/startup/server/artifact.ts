import {join, resolve} from "node:path"
import {artifactIntegrity} from "../../shared/package/integrity"
import type {ServerProcessArtifact} from "./executor"

interface PackageManifest {
  name?: unknown
  version?: unknown
}

/** Возвращает корень Cosmos, содержащий startup и versioned release artifacts. */
export function serverStartupCosmosRoot() {
  return resolve(Bun.env.COSMOS_ROOT?.trim() || process.cwd())
}

/** Читает последнюю завершённую child version release и проверяет exact bytes. */
export async function currentServerReleaseArtifact(
  cosmosRoot = serverStartupCosmosRoot(),
): Promise<ServerProcessArtifact> {
  const root = await manifest(join(cosmosRoot, "package.json"))
  if (root.name !== "@metafor/cosmos") throw new Error(`Invalid Cosmos root: ${cosmosRoot}`)

  const releaseRoot = join(cosmosRoot, "release")
  const release = await manifest(join(releaseRoot, "package.json"))
  if (release.name !== "@cosmos/release" || !isVersion(release.version))
    throw new Error("Current server release version is invalid")

  const executable = join(releaseRoot, "dist", "versions", release.version, "server.js")
  const artifact = Bun.file(executable)
  if (!await artifact.exists() || artifact.size === 0)
    throw new Error(`Current server release artifact is missing: ${executable}`)
  const integrity = await artifactIntegrity(await artifact.arrayBuffer())

  return Object.freeze({
    identity: Object.freeze({
      name: "@cosmos/release",
      env: "server" as const,
      version: release.version,
      sha256: integrity.sha256,
      size: integrity.size,
    }),
    executable,
  })
}

async function manifest(path: string): Promise<PackageManifest> {
  try {
    return await Bun.file(path).json() as PackageManifest
  } catch {
    throw new Error(`Package manifest is unavailable: ${path}`)
  }
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value)
}
