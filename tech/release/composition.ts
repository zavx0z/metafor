import {isBrowserPackageEnvironment} from "@metafor/tech-build/identity"
import type {PackageManifest, PackageOwner} from "@metafor/tech-build"
import type {ReleasablePackage} from "./contracts"
import {packageManifest} from "@metafor/tech-build"
import {caretVersion, isVersion} from "./version"

export interface ReleaseDependencyMember {
  name: ReleasablePackage
  version: string
  dependencies: Record<string, unknown>
}

export interface ReleaseCompositionMember extends ReleaseDependencyMember {
  childVersion: string
  manifest: string
  owners: PackageOwner[]
}

import type {PackageBuilder} from "@metafor/tech-build"
export interface ReleaseCompositionOptions {
  manifest: string
  builder: PackageBuilder
  isMember(name: string): boolean
}

import type {createReleaseStorage} from "./storage"

export function createReleaseComposition(
  options: ReleaseCompositionOptions,
  storage: ReturnType<typeof createReleaseStorage>,
) {
  const {packageOwners} = options.builder
  /** Читает и полностью проверяет действующий root membership. */
  async function readReleaseComposition(): Promise<ReleaseCompositionMember[]> {
    const members = await readReleaseIntentComposition()
    for (const member of members) {
      if (member.childVersion !== member.version)
        throw new Error(
          `Released package ${member.name} must have exact version ${member.version}, found ${member.childVersion}`,
        )
    }
    return members
  }

  /** Читает target root intent, разрешая ещё не сошедшиеся child versions. */
  async function readReleaseIntentComposition(): Promise<ReleaseCompositionMember[]> {
    const root = await packageManifest(options.manifest)
    const declarations = Object.entries(root.dependencies ?? {}).flatMap(([name, dependency]) => {
      if (!options.isMember(name) || typeof dependency !== "string") return []
      const version = caretVersion(dependency)
      if (version === null && dependency !== "workspace:*")
        throw new Error(`Invalid release dependency ${name}@${dependency}`)
      return [{name, version}]
    })
    // Проверка деклараций предшествует I/O. После начала чтения ждём каждого
    // участника даже при отказе соседа: очистка не должна опережать чтения.
    const settled = await Promise.allSettled(declarations.map(async ({name, version}) => {
      if (version !== null) return await readReleaseMember(name, version)
      const location = await options.builder.packageSourceLocation(name)
      const manifest = await packageManifest(location.manifest)
      if (!isVersion(manifest.version)) throw new Error(`Invalid release version ${name}`)
      return await readReleaseMember(name, manifest.version)
    }))
    const members = settled.map((result) => {
      if (result.status === "rejected") throw result.reason
      return result.value
    })
    validateReleaseDependencyGraph(members, options.isMember)
    return members
  }

  async function readReleaseMember(
    name: ReleasablePackage,
    version: string,
  ): Promise<ReleaseCompositionMember> {
    const prepared = await storage.read(name, version)
    if (await storage.isReady(name, version)) {
      if (prepared.length === 0) throw new Error(`Published release record is missing: ${name}@${version}`)
      const missing = prepared[0]!.environments.find((env) => !prepared.some((record) => record.env === env))
      if (missing) throw new Error(`Published environment record is missing: ${name}:${missing}@${version}`)
    }
    const complete =
      prepared.length > 0 &&
      prepared[0]!.environments.every((env) => prepared.some((record) => record.env === env))
    const owners = complete ? prepared.map(({owner}) => owner) : await packageOwners(name)
    validateBrowserReleaseEnvironments(name, owners)
    const manifestPath = owners[0]?.manifest
    if (manifestPath === undefined) throw new Error(`Released package ${name} has no environments`)
    const manifest = await packageManifest(manifestPath)
    if (
      manifest.name !== name ||
      typeof manifest.version !== "string" ||
      !isVersion(manifest.version)
    )
      throw new Error(`Released package ${name} has invalid child manifest version`)
    return {
      name,
      version,
      childVersion: manifest.version,
      dependencies: complete ? prepared[0]!.dependencies : dependencies(manifest),
      manifest: manifestPath,
      owners,
    }
  }

  return {readReleaseComposition, readReleaseIntentComposition}
}
/** Проверяет dependency closure и version ranges готового membership. */
export function validateReleaseDependencyGraph(
  members: ReleaseDependencyMember[],
  isReleasableName: (name: string) => boolean = () => true,
) {
  const membership = new Map<string, ReleaseDependencyMember>()
  for (const member of members) {
    if (!isReleasableName(member.name) || !isVersion(member.version))
      throw new Error(`Invalid release member ${member.name}@${member.version}`)
    if (membership.has(member.name)) throw new Error(`Duplicate release member ${member.name}`)
    membership.set(member.name, member)
  }

  for (const member of members) {
    for (const [dependency, range] of Object.entries(member.dependencies)) {
      if (!isReleasableName(dependency)) continue
      const selected = membership.get(dependency)
      if (selected === undefined)
        throw new Error(`${member.name} requires missing release package ${dependency}`)
      if (typeof range !== "string" || !satisfiesWorkspaceRange(selected.version, range))
        throw new Error(
          `${member.name} requires ${dependency}@${String(range)}, selected ${selected.version}`,
        )
    }
  }
}

/** Запрещает включать server-only package в browser release membership. */
export function validateBrowserReleaseEnvironments(name: string, owners: PackageOwner[]) {
  if (!owners.some(({env}) => isBrowserPackageEnvironment(env)))
    throw new Error(`Released package ${name} has no browser environment`)
}

/** Проверяет target versions до typecheck/build и root write. */
export function validateTargetReleaseVersions(
  current: ReleaseDependencyMember[],
  targetVersions: ReadonlyMap<string, string>,
  isReleasableName: (name: string) => boolean = () => true,
) {
  for (const name of targetVersions.keys()) {
    if (!current.some((member) => member.name === name))
      throw new Error(`Target release package ${name} is not in root membership`)
  }
  const target = current.map((member) => ({
    ...member,
    version: targetVersions.get(member.name) ?? member.version,
  }))
  validateReleaseDependencyGraph(target, isReleasableName)
  return target
}

export function satisfiesWorkspaceRange(version: string, range: string) {
  if (!isVersion(version)) return false
  if (range === "workspace:*") return true
  const match = /^workspace:\^(\d+)\.(\d+)\.(\d+)$/.exec(range)
  if (!match) return false
  const selected = version.split(".").map(Number) as [number, number, number]
  const base = match.slice(1).map(Number) as [number, number, number]
  if (compareVersion(selected, base) < 0) return false
  if (base[0] > 0) return selected[0] === base[0]
  if (base[1] > 0) return selected[0] === 0 && selected[1] === base[1]
  return selected[0] === 0 && selected[1] === 0 && selected[2] === base[2]
}

function dependencies(manifest: PackageManifest) {
  return manifest.dependencies ?? {}
}

function compareVersion(left: [number, number, number], right: [number, number, number]) {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!
    if (difference !== 0) return difference
  }
  return 0
}
