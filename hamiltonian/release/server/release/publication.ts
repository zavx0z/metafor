import {copyFile, mkdir, mkdtemp, rename, rm} from "node:fs/promises"
import {dirname, join} from "node:path"
import {buildPackage} from "../package/build"
import {
  readReleaseComposition,
  readReleaseIntentComposition,
  validateTargetReleaseVersions,
  type ReleaseCompositionMember,
} from "./composition"
import type {
  PackageBuildArtifact,
  PackageChange,
  PackageEnvironment,
  PackageManifest,
  PackageReleaseResult,
  PackageReleaseResultSet,
} from "../shared/contracts"
import {packageArtifact} from "../package/manifest"
import {hamiltonianManifest, hamiltonianRoot} from "../shared/paths"
import {serializePublication} from "./queue"
import {readReleasedPackages, versionedArtifact} from "./state"
import {nextPackageVersion} from "../package/version"

interface ReleasePlan extends PackageChange {
  member: ReleaseCompositionMember
  previousVersion: string
  version: string
  artifacts: ReleaseArtifactPlan[]
}

interface ReleaseArtifactPlan {
  env: PackageEnvironment
  stagedArtifact: string
  publishedArtifact: string
}

export interface RecoveryResult {
  recovered: string[]
  artifacts: PackageBuildArtifact[]
}

/** Сериализует и выполняет одну package root-first publication. */
export function publishPackages(changes: PackageChange[]): Promise<PackageReleaseResultSet> {
  return serializePublication(() => runPublication(changes))
}

/** До открытия listener доводит durable root intent до полного состояния. */
export function recoverPublication(): Promise<RecoveryResult> {
  return serializePublication(runRecovery)
}

async function runPublication(changes: PackageChange[]): Promise<PackageReleaseResultSet> {
  const composition = await readReleaseComposition()
  const members = new Map(composition.map((member) => [member.name, member]))
  const plans = changes.map(({name, change}) => {
    const member = members.get(name)
    if (!member) throw new Error(`Released package ${name} is missing`)
    return {
      name,
      change,
      member,
      previousVersion: member.version,
      version: nextPackageVersion(member.version, change),
      artifacts: [],
    } satisfies ReleasePlan
  })
  validateTargetReleaseVersions(
    composition,
    new Map(plans.map(({name, version}) => [name, version])),
  )

  const staging = await mkdtemp(join(hamiltonianRoot, ".package-update-"))
  const rootSource = await Bun.file(hamiltonianManifest).text()
  const childSources = new Map(await Promise.all(plans.map(async ({member}) => [
    member.manifest,
    await Bun.file(member.manifest).text(),
  ] as const)))
  let rootIntentWritten = false
  let childrenWritten = false

  try {
    assignArtifacts(plans, staging)
    await writeRootVersions(
      hamiltonianManifest,
      new Map(plans.map(({name, version}) => [name, version])),
    )
    rootIntentWritten = true
    debug("root intent публикации сохранён", {
      packages: plans.map(({name, previousVersion, version}) => ({
        from: previousVersion,
        name,
        to: version,
      })),
    })

    const results = await buildPlans(plans)
    if (results.some((result) => !result.success)) {
      await restoreManifest(hamiltonianManifest, rootSource)
      rootIntentWritten = false
      debug("публикация отменена с восстановлением root", {
        packages: plans.map(({name, previousVersion, version}) => ({
          from: previousVersion,
          name,
          to: version,
        })),
        reason: "build-failed",
      })
      return {success: false, results, packages: []}
    }

    await materializePlans(plans, results)
    childrenWritten = true
    await writeChildVersions(plans)
    const packages = await readReleasedPackages()
    return {
      success: true,
      results,
      packages: plans.flatMap(({name}) => packages.filter((entry) => entry.name === name)),
    }
  } catch (error) {
    if (childrenWritten)
      await Promise.all([...childSources].map(([path, source]) => restoreManifest(path, source)))
    if (rootIntentWritten) await restoreManifest(hamiltonianManifest, rootSource)
    console.error("[@hamiltonian/release:server:update]", "публикация завершилась с ошибкой", {
      error: errorMessage(error),
      packages: plans.map(({name, previousVersion, version}) => ({
        from: previousVersion,
        name,
        to: version,
      })),
    })
    throw error
  } finally {
    await rm(staging, {recursive: true, force: true})
  }
}

async function runRecovery(): Promise<RecoveryResult> {
  const intent = await readReleaseIntentComposition()
  const staging = await mkdtemp(join(hamiltonianRoot, ".package-recovery-"))
  const packages = intent.map(({name, childVersion, version}) => ({
    from: childVersion,
    name,
    to: version,
  }))

  try {
    const plans = intent.map((member) => ({
      name: member.name,
      change: "patch" as const,
      member,
      previousVersion: member.childVersion,
      version: member.version,
      artifacts: [],
    }))
    assignArtifacts(plans, staging)
    const incomplete = await incompletePlans(plans)
    const pending = plans.filter(({member, version}) => member.childVersion !== version)
    const recoveryNeeded = incomplete.length > 0 || pending.length > 0
    if (recoveryNeeded) debug("восстановление публикации начато", {packages})
    const results = await buildPlans(plans)
    const failure = results.find((result) => !result.success)
    if (failure)
      throw new Error(`Recovery build failed for ${failure.module}:${failure.env}: ${failure.stderr}`)

    await materializePlans(plans, results)
    await writeChildVersions(pending)
    await readReleasedPackages()
    const artifacts = await exactPlanArtifacts(plans)
    const recovered = pending.map(({name}) => name)
    if (recoveryNeeded) {
      debug("восстановление публикации завершено", {
        artifacts: artifacts.map(({path, sha256, size}) => ({path, sha256, size})),
        recovered,
      })
    }
    return {recovered, artifacts}
  } catch (error) {
    console.error("[@hamiltonian/release:server:update]", "восстановление публикации завершилось с ошибкой", {
      error: errorMessage(error),
      packages,
    })
    throw error
  } finally {
    await rm(staging, {recursive: true, force: true})
  }
}

/** Возвращает только packages, у которых отсутствует хотя бы один exact env artifact. */
async function incompletePlans(plans: ReleasePlan[]) {
  const complete = await Promise.all(plans.map(async (plan) => {
    const artifacts = await Promise.all(plan.artifacts.map(({publishedArtifact}) =>
      packageArtifact(publishedArtifact)))
    return artifacts.every((artifact) => artifact !== null)
  }))
  return plans.filter((_, index) => !complete[index])
}

async function exactPlanArtifacts(plans: ReleasePlan[]) {
  return await Promise.all(plans.flatMap((plan) => plan.artifacts).map(async ({publishedArtifact}) => {
    const artifact = await packageArtifact(publishedArtifact)
    if (!artifact) throw new Error(`Recovered artifact is missing: ${publishedArtifact}`)
    return artifact
  }))
}

function assignArtifacts(plans: ReleasePlan[], staging: string) {
  let index = 0
  for (const plan of plans) {
    plan.artifacts = plan.member.owners.map((owner) => ({
      env: owner.env,
      stagedArtifact: join(staging, `${index++}.js`),
      publishedArtifact: versionedArtifact(owner.artifact, plan.version),
    }))
  }
}

async function buildPlans(plans: ReleasePlan[]): Promise<PackageReleaseResult[]> {
  const artifactPlans = plans.flatMap((plan) =>
    plan.artifacts.map((artifact) => ({plan, artifact})))
  const builds = await Promise.all(artifactPlans.map(({plan, artifact}) =>
    buildPackage(plan.name, {env: artifact.env, artifact: artifact.stagedArtifact})))
  return artifactPlans.map(({plan}, index) => ({
    ...builds[index]!,
    change: plan.change,
    previousVersion: plan.previousVersion,
    version: plan.version,
  }))
}

async function materializePlans(
  plans: ReleasePlan[],
  results: PackageReleaseResult[],
) {
  const artifactPlans = plans.flatMap((plan) => plan.artifacts)
  const artifacts: PackageBuildArtifact[] = []
  for (const [index, plan] of artifactPlans.entries()) {
    const artifact = await publishImmutableArtifact(plan.stagedArtifact, plan.publishedArtifact)
    results[index]!.outputs = [artifact]
    artifacts.push(artifact)
  }
  return artifacts
}

/** Публикует missing exact artifact, но никогда не заменяет существующую identity. */
export async function publishImmutableArtifact(staged: string, target: string) {
  const expected = await packageArtifact(staged)
  if (!expected) throw new Error(`Staged artifact is missing: ${staged}`)
  const existing = await packageArtifact(target)
  if (existing) {
    if (existing.sha256 !== expected.sha256 || existing.size !== expected.size)
      throw new Error(`Immutable artifact conflict: ${target}`)
    return existing
  }

  await mkdir(dirname(target), {recursive: true})
  const temporary = `${target}.${crypto.randomUUID()}.tmp`
  try {
    await copyFile(staged, temporary)
    await rename(temporary, target)
  } finally {
    await rm(temporary, {force: true})
  }
  const published = await packageArtifact(target)
  if (!published) throw new Error(`Published artifact is missing: ${target}`)
  return published
}

/** Первой durable записью меняет только target caret dependencies root. */
export async function writeRootVersions(path: string, versions: ReadonlyMap<string, string>) {
  const root = await Bun.file(path).json() as PackageManifest
  const dependencies = {...root.dependencies}
  for (const [name, version] of versions) dependencies[name] = `workspace:^${version}`
  root.dependencies = dependencies
  await writeJsonAtomic(path, root)
}

async function writeChildVersions(plans: ReleasePlan[]) {
  for (const {member, version} of plans) {
    const manifest = await Bun.file(member.manifest).json() as PackageManifest
    manifest.version = version
    await writeJsonAtomic(member.manifest, manifest)
  }
}

export async function restoreManifest(path: string, source: string) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await Bun.write(temporary, source)
  await rename(temporary, path)
}

async function writeJsonAtomic(path: string, value: unknown) {
  await restoreManifest(path, `${JSON.stringify(value, null, 2)}\n`)
}

function debug(event: string, details: unknown) {
  if (Bun.env.NODE_ENV === "development")
    console.debug("[@hamiltonian/release:server:update]", event, details)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
