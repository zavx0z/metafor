import {copyFile, mkdir, mkdtemp, rename, rm} from "node:fs/promises"
import {dirname, join} from "node:path"
import {buildPackage} from "./build"
import type {
  PackageChange,
  PackageManifest,
  PackageReleaseResultSet,
} from "./contracts"
import {packageArtifact, packageOwner} from "./package"
import {hamiltonianManifest, hamiltonianRoot} from "./paths"
import {serializePublication} from "./queue"
import {readReleasedPackages, versionedArtifact} from "./state"
import {nextPackageVersion} from "./version"

interface ReleasePlan extends PackageChange {
  previousVersion: string
  version: string
  stagedArtifact: string
  publishedArtifact: string
}

/** Сериализует и выполняет одну атомарно публикуемую build-группу. */
export function publishPackages(changes: PackageChange[]): Promise<PackageReleaseResultSet> {
  return serializePublication(() => runPublication(changes))
}

async function runPublication(changes: PackageChange[]): Promise<PackageReleaseResultSet> {
  const current = new Map((await readReleasedPackages()).map((entry) => [entry.name, entry]))
  const staging = await mkdtemp(join(hamiltonianRoot, ".package-update-"))

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

    const rootSource = await Bun.file(hamiltonianManifest).text()
    const root = JSON.parse(rootSource) as PackageManifest
    const dependencies = {...root.dependencies}
    for (const plan of plans) dependencies[plan.name] = `workspace:^${plan.version}`
    root.dependencies = dependencies
    await writeJsonAtomic(hamiltonianManifest, root)
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
