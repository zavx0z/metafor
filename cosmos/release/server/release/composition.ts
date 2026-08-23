import {isBrowserPackageEnvironment} from "../../../shared/package/environment"
import type {PackageManifest, PackageOwner, ReleasablePackage} from "../shared/contracts"
import {packageManifest, packageOwners} from "../package/manifest"
import {cosmosManifest} from "../shared/paths"
import {caretVersion, isVersion} from "../package/version"

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

/** Читает и полностью проверяет действующий root membership. */
export async function readReleaseComposition(): Promise<ReleaseCompositionMember[]> {
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
export async function readReleaseIntentComposition(): Promise<ReleaseCompositionMember[]> {
  const root = await packageManifest(cosmosManifest)
  const members = await Promise.all(Object.entries(root.dependencies ?? {}).flatMap(
    ([name, dependency]) => {
      if (!isReleasableName(name) || typeof dependency !== "string") return []
      const version = caretVersion(dependency)
      if (version === null) return []
      return [readReleaseMember(name, version)]
    },
  ))
  validateReleaseDependencyGraph(members)
  return members
}

/** Проверяет dependency closure и version ranges готового membership. */
export function validateReleaseDependencyGraph(members: ReleaseDependencyMember[]) {
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
) {
  for (const name of targetVersions.keys()) {
    if (!current.some((member) => member.name === name))
      throw new Error(`Target release package ${name} is not in root membership`)
  }
  const target = current.map((member) => ({
    ...member,
    version: targetVersions.get(member.name) ?? member.version,
  }))
  validateReleaseDependencyGraph(target)
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

async function readReleaseMember(
  name: ReleasablePackage,
  version: string,
): Promise<ReleaseCompositionMember> {
  const owners = await packageOwners(name)
  validateBrowserReleaseEnvironments(name, owners)
  const manifestPath = owners[0]?.manifest
  if (manifestPath === undefined) throw new Error(`Released package ${name} has no environments`)
  const manifest = await packageManifest(manifestPath)
  if (manifest.name !== name || typeof manifest.version !== "string" || !isVersion(manifest.version))
    throw new Error(`Released package ${name} has invalid child manifest version`)
  return {
    name,
    version,
    childVersion: manifest.version,
    dependencies: dependencies(manifest),
    manifest: manifestPath,
    owners,
  }
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

function isReleasableName(value: string): value is ReleasablePackage {
  return value === "@cosmos/release" || value.startsWith("@internal/")
}
