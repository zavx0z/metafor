import {copyFile, mkdir, mkdtemp, rename, rm} from "node:fs/promises"
import {dirname, join} from "node:path"
import {buildPackage} from "./build"
import type {
  PackageChange,
  PackageEnvironment,
  PackageManifest,
  PackageReleaseResultSet,
} from "./contracts"
import {packageArtifact, packageOwner, packageOwners} from "./package"
import {hamiltonianManifest, hamiltonianRoot} from "./paths"
import {serializePublication} from "./queue"
import {readReleasedPackages, versionedArtifact} from "./state"
import {nextPackageVersion} from "./version"

interface ReleasePlan extends PackageChange {
  previousVersion: string
  version: string
  artifacts: ReleaseArtifactPlan[]
}

interface ReleaseArtifactPlan {
  env: PackageEnvironment
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
    const plans = await Promise.all(changes.map(async ({name, change}, packageIndex) => {
      const released = current.get(name)
      if (!released) throw new Error(`Released package ${name} is missing`)
      const version = nextPackageVersion(released.version, change)
      const owners = await packageOwners(name)
      return {
        name,
        change,
        previousVersion: released.version,
        version,
        artifacts: owners.map((owner, envIndex) => ({
          env: owner.env,
          stagedArtifact: join(staging, `${packageIndex}-${envIndex}.js`),
          publishedArtifact: versionedArtifact(owner.artifact, version),
        })),
      } satisfies ReleasePlan
    }))

    const artifactPlans = plans.flatMap((plan) =>
      plan.artifacts.map((artifact) => ({plan, artifact})))
    const builds = await Promise.all(artifactPlans.map(({plan, artifact}) =>
      buildPackage(plan.name, {env: artifact.env, artifact: artifact.stagedArtifact})))
    const results = artifactPlans.map(({plan}, index) => ({
      ...builds[index]!,
      change: plan.change,
      previousVersion: plan.previousVersion,
      version: plan.version,
    }))

    if (results.some((result) => !result.success))
      return {success: false, results, packages: []}

    for (const [index, {artifact}] of artifactPlans.entries())
      results[index]!.outputs = [await publishArtifact(artifact)]
    await publishVersions(plans)

    const released = new Map((await readReleasedPackages()).map((entry) => [entry.name, entry]))
    return {
      success: true,
      results,
      packages: plans.flatMap(({name}) =>
        [...released.values()].filter((entry) => entry.name === name)),
    }
  } finally {
    await rm(staging, {recursive: true, force: true})
  }
}

async function publishArtifact(plan: ReleaseArtifactPlan) {
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
