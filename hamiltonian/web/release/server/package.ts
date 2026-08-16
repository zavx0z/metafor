import {dirname, join} from "node:path"
import {packageArtifactPath} from "./command"
import type {
  BuildablePackage,
  PackageBuildArtifact,
  PackageManifest,
  PackageOwner,
} from "./contracts"
import {hamiltonianRoot} from "./paths"

const packageOwners = new Map<BuildablePackage, Promise<PackageOwner>>()

/** Возвращает проверенный package-owned browser build contract. */
export async function packageOwner(name: BuildablePackage) {
  let owner = packageOwners.get(name)
  if (!owner) {
    owner = findPackage(name).catch((error: unknown) => {
      packageOwners.delete(name)
      throw error
    })
    packageOwners.set(name, owner)
  }
  return await owner
}

/** Читает непустой JavaScript artifact. */
export async function packageArtifact(path: string): Promise<PackageBuildArtifact | null> {
  const artifact = Bun.file(path, {type: "text/javascript; charset=utf-8"})
  if (!await artifact.exists() || artifact.size === 0) return null
  return {path, size: artifact.size, type: artifact.type}
}

/** Читает package manifest без изменения его представления. */
export async function packageManifest(path: string): Promise<PackageManifest> {
  return await Bun.file(path).json() as PackageManifest
}

async function findPackage(name: BuildablePackage): Promise<PackageOwner> {
  const entrypoint = Bun.resolveSync(name, hamiltonianRoot)
  let root = dirname(entrypoint)

  while (root === hamiltonianRoot || root.startsWith(`${hamiltonianRoot}/`)) {
    const manifestPath = join(root, "package.json")
    const manifestFile = Bun.file(manifestPath)
    if (await manifestFile.exists()) {
      const manifest = await manifestFile.json() as PackageManifest
      if (manifest.name !== name)
        throw new Error(`Resolved package ${String(manifest.name)} does not match ${name}`)
      if (typeof manifest.scripts?.typecheck !== "string")
        throw new Error(`${name} typecheck script is missing`)
      if (manifest.scripts.prebuild !== "bun run typecheck")
        throw new Error(`${name} prebuild must run \`bun run typecheck\``)
      if (typeof manifest.scripts.build !== "string")
        throw new Error(`${name} build script is missing`)

      const headers: Record<string, string> = {}
      for (const [header, value] of Object.entries(manifest.artifact?.headers ?? {})) {
        if (typeof value !== "string")
          throw new Error(`${name} artifact header ${header} must be a string`)
        headers[header] = value
      }

      const cache = manifest.artifact?.cache
      if (cache !== undefined && typeof cache !== "string")
        throw new Error(`${name} artifact cache must be a string`)

      return {
        root,
        manifest: manifestPath,
        artifact: packageArtifactPath(root, manifest.scripts.build),
        build: manifest.scripts.build,
        cache: cache ?? null,
        headers,
      }
    }

    const parent = dirname(root)
    if (parent === root) break
    root = parent
  }

  throw new Error(`Hamiltonian package is missing for ${name}`)
}
