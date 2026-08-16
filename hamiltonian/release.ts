import {copyFile, mkdir, mkdtemp, rename, rm} from "node:fs/promises"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {
  buildPackage,
  packageOwner,
  packageResponse,
  type BuildableModule,
  type PackageBuildArtifact,
  type PackageBuildResult,
  type RebuildableModule,
} from "./build"

/** Разрешённый вид следующего SemVer одного package. */
export type VersionChange = "patch" | "minor" | "major"

/** Внешнее намерение изменить один package без готового номера версии. */
export interface PackageChange {
  name: RebuildableModule
  change: VersionChange
}

/** Точное доказанное состояние одного browser artifact. */
export interface ReleasedPackage {
  name: RebuildableModule
  version: string
  endpoint: string
  cache: string
}

/** Результат сборки и назначения следующей версии package. */
export interface PackageReleaseResult extends PackageBuildResult {
  change: VersionChange
  previousVersion: string
  version: string
}

/** Итог одной серверной транзакции package group. */
export interface PackageReleaseResultSet {
  success: boolean
  results: PackageReleaseResult[]
  packages: ReleasedPackage[]
}

interface PackageManifest {
  name?: unknown
  version?: unknown
  dependencies?: Record<string, unknown>
}

interface ReleasePlan extends PackageChange {
  previousVersion: string
  version: string
  stagedArtifact: string
  publishedArtifact: string
}

const hamiltonian = dirname(fileURLToPath(import.meta.url))
const rootManifestPath = join(hamiltonian, "package.json")
const workspaceCaret = /^workspace:\^(\d+)\.(\d+)\.(\d+)$/

let publication = Promise.resolve()

/** Возвращает текущее доказанное состояние из корневых caret dependencies. */
export async function releasedPackages(): Promise<ReleasedPackage[]> {
  await publication
  return await readReleasedPackages()
}

async function readReleasedPackages(): Promise<ReleasedPackage[]> {
  const root = await readManifest(rootManifestPath)
  const packages: ReleasedPackage[] = []

  for (const [name, dependency] of Object.entries(root.dependencies ?? {})) {
    if (!isRebuildableName(name) || typeof dependency !== "string") continue
    const version = caretVersion(dependency)
    if (version === null) continue

    const owner = await packageOwner(name)
    if (owner.cache === null)
      throw new Error(`Released package ${name} must declare artifact.cache`)
    const manifest = await readManifest(owner.manifest)
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
  name: BuildableModule,
  requestedVersion: string | null,
) {
  const packages = await releasedPackages()
  const current = packages.find((entry) => entry.name === name)
  if (!current) return await packageResponse(name)

  const version = requestedVersion ?? current.version
  if (!isVersion(version)) return new Response(null, {status: 404})

  const owner = await packageOwner(name)
  const published = versionedArtifact(owner.artifact, version)
  const artifact = await packageArtifact(published)
  if (artifact) return packageArtifactResponse(owner.headers, name, version, artifact)

  if (version !== current.version) return new Response(null, {status: 404})

  const response = await packageResponse(name)
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  headers.set("X-Package-Name", name)
  headers.set("X-Package-Version", version)
  return new Response(response.body, {status: response.status, headers})
}

/** Разбирает единственный JSON-контракт version change группы. */
export async function packageChanges(
  request: Request,
): Promise<PackageChange[] | Response> {
  const mediaType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (mediaType !== "application/json") return new Response(null, {status: 415})
  if (new URL(request.url).search !== "") return new Response(null, {status: 400})

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return new Response(null, {status: 400})
  }

  if (!isPackageChangeInput(input)) return new Response(null, {status: 400})

  const released = new Set((await releasedPackages()).map(({name}) => name))
  const changes = new Map<RebuildableModule, VersionChange>()
  for (const entry of input.packages) {
    if (!released.has(entry.name as RebuildableModule)) return new Response(null, {status: 404})
    const name = entry.name as RebuildableModule
    const previous = changes.get(name)
    if (previous !== undefined && previous !== entry.change)
      return new Response(null, {status: 400})
    changes.set(name, entry.change)
  }

  return [...changes].map(([name, change]) => ({name, change}))
}

/** Сериализует и выполняет одну атомарно публикуемую build-группу. */
export function publishPackages(changes: PackageChange[]): Promise<PackageReleaseResultSet> {
  const current = publication.then(() => runPublication(changes))
  publication = current.then(() => undefined, () => undefined)
  return current
}

async function runPublication(changes: PackageChange[]): Promise<PackageReleaseResultSet> {
  const current = new Map((await readReleasedPackages()).map((entry) => [entry.name, entry]))
  const staging = await mkdtemp(join(hamiltonian, ".package-update-"))

  try {
    const plans = await Promise.all(changes.map(async ({name, change}, index) => {
      const released = current.get(name)
      if (!released) throw new Error(`Released package ${name} is missing`)
      const version = nextPackageVersion(released.version, change)
      const owner = await packageOwner(name)
      return {
        name,
        change,
        previousVersion: released.version,
        version,
        stagedArtifact: join(staging, `${index}.js`),
        publishedArtifact: versionedArtifact(owner.artifact, version),
      } satisfies ReleasePlan
    }))

    const builds = await Promise.all(plans.map((plan) =>
      buildPackage(plan.name, {artifact: plan.stagedArtifact})))
    const results = plans.map((plan, index) => ({
      ...builds[index]!,
      change: plan.change,
      previousVersion: plan.previousVersion,
      version: plan.version,
    }))

    if (results.some((result) => !result.success))
      return {success: false, results, packages: []}

    for (const [index, plan] of plans.entries())
      results[index]!.outputs = [await publishArtifact(plan)]
    await publishVersions(plans)

    const released = new Map((await readReleasedPackages()).map((entry) => [entry.name, entry]))
    return {
      success: true,
      results,
      packages: plans.map(({name}) => released.get(name)!),
    }
  } finally {
    await rm(staging, {recursive: true, force: true})
  }
}

async function publishArtifact(plan: ReleasePlan) {
  await mkdir(dirname(plan.publishedArtifact), {recursive: true})
  const temporary = `${plan.publishedArtifact}.${crypto.randomUUID()}.tmp`
  await copyFile(plan.stagedArtifact, temporary)
  await rename(temporary, plan.publishedArtifact)
  const artifact = await packageArtifact(plan.publishedArtifact)
  if (!artifact) throw new Error(`Published artifact is missing: ${plan.publishedArtifact}`)
  return artifact
}

/** Пишет package versions, а корневые dependencies — последним commit-point. */
async function publishVersions(plans: ReleasePlan[]) {
  const originals = new Map<string, string>()
  const written: string[] = []

  try {
    for (const plan of plans) {
      const owner = await packageOwner(plan.name)
      const source = await Bun.file(owner.manifest).text()
      originals.set(owner.manifest, source)
      const manifest = JSON.parse(source) as PackageManifest
      manifest.version = plan.version
      await writeJsonAtomic(owner.manifest, manifest)
      written.push(owner.manifest)
    }

    const rootSource = await Bun.file(rootManifestPath).text()
    const root = JSON.parse(rootSource) as PackageManifest
    const dependencies = {...root.dependencies}
    for (const plan of plans) dependencies[plan.name] = `workspace:^${plan.version}`
    root.dependencies = dependencies
    await writeJsonAtomic(rootManifestPath, root)
  } catch (error) {
    await Promise.allSettled(written.map((path) => Bun.write(path, originals.get(path)!)))
    throw error
  }
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporary, path)
}

async function readManifest(path: string): Promise<PackageManifest> {
  return await Bun.file(path).json() as PackageManifest
}

async function packageArtifact(path: string): Promise<PackageBuildArtifact | null> {
  const file = Bun.file(path, {type: "text/javascript; charset=utf-8"})
  if (!await file.exists() || file.size === 0) return null
  return {path, size: file.size, type: file.type}
}

function packageArtifactResponse(
  configuredHeaders: Record<string, string>,
  name: string,
  version: string,
  artifact: PackageBuildArtifact,
) {
  const headers = new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
    "X-Package-Name": name,
    "X-Package-Version": version,
  })
  for (const [header, value] of Object.entries(configuredHeaders)) headers.set(header, value)
  return new Response(Bun.file(artifact.path), {headers})
}

function releasedPackage(name: RebuildableModule, version: string, cache: string) {
  return {
    name,
    version,
    cache,
    endpoint: `/code?module=${name}&version=${version}`,
  }
}

function versionedArtifact(artifact: string, version: string) {
  return join(dirname(artifact), "versions", version, "index.js")
}

/** Вычисляет следующую стабильную SemVer без принятия номера извне. */
export function nextPackageVersion(version: string, change: VersionChange) {
  const parsed = workspaceCaret.exec(`workspace:^${version}`)
  if (!parsed) throw new Error(`Invalid released version ${version}`)
  let major = Number(parsed[1])
  let minor = Number(parsed[2])
  let patch = Number(parsed[3])

  if (change === "major") {
    major += 1
    minor = 0
    patch = 0
  } else if (change === "minor") {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }

  return `${major}.${minor}.${patch}`
}

function caretVersion(value: string) {
  const match = workspaceCaret.exec(value)
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null
}

function isVersion(value: string) {
  return workspaceCaret.test(`workspace:^${value}`)
}

function isRebuildableName(value: string): value is RebuildableModule {
  return value.startsWith("@import/") || value.startsWith("@internal/")
}

function isPackageChangeInput(
  value: unknown,
): value is {packages: {name: string, change: VersionChange}[]} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (Object.keys(input).length !== 1 || !Array.isArray(input.packages)) return false
  if (input.packages.length === 0) return false

  return input.packages.every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false
    const packageChange = entry as Record<string, unknown>
    return Object.keys(packageChange).length === 2
      && typeof packageChange.name === "string"
      && isVersionChange(packageChange.change)
  })
}

function isVersionChange(value: unknown): value is VersionChange {
  return value === "patch" || value === "minor" || value === "major"
}
