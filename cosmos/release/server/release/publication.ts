import {copyFile, link, mkdir, mkdtemp, rename, rm} from "node:fs/promises"
import {dirname, join} from "node:path"
import {
  isBrowserPackageEnvironment,
  type BrowserPackageEnvironment,
  type PackageEnvironment,
} from "../../../shared/package/environment"
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
  PackageManifest,
  PackageOwner,
  PackageReleaseResult,
  PackageReleaseResultSet,
} from "../shared/contracts"
import {packageArtifact} from "../package/manifest"
import {cosmosManifest, cosmosRoot} from "../shared/paths"
import {serializePublication} from "./queue"
import {readReleasedPackages} from "./state"
import {nextPackageVersion} from "../package/version"
import {sourceMapArtifact} from "../package/source-map"
import {
  isGeneratedPackageArtifactKey,
  rootPackageArtifact,
  type PackageArtifactKey,
} from "../../shared/artifact"
import {
  resolveVersionedPackageArtifactPath,
  legacyVersionedArtifact,
  versionedPackageArtifactPath,
} from "./artifact-path"
import {
  replaceDesiredBrowserArtifacts,
  replaceDesiredPackageArtifacts,
} from "./desired"
import type {BrowserPackageArtifactIdentity} from "../../shared/artifact-integrity"

interface ReleasePlan extends PackageChange {
  member: ReleaseCompositionMember
  previousVersion: string
  version: string
  artifacts: ReleaseArtifactPlan[]
}

interface ReleaseArtifactPlan {
  env: PackageEnvironment
  owner: PackageOwner
  stagedArtifact: string
  stagedOutdir: string
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

  const staging = await mkdtemp(join(cosmosRoot, ".package-update-"))
  const rootSource = await Bun.file(cosmosManifest).text()
  const childSources = new Map(await Promise.all(plans.map(async ({member}) => [
    member.manifest,
    await Bun.file(member.manifest).text(),
  ] as const)))
  let rootIntentWritten = false
  let childrenWritten = false

  try {
    assignArtifacts(plans, staging)
    await writeRootVersions(
      cosmosManifest,
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
      await restoreManifest(cosmosManifest, rootSource)
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
    replaceDesiredPackageArtifacts(
      plans.map(({name}) => name),
      desiredBrowserArtifacts(results),
    )
    return {
      success: true,
      results,
      packages: plans.flatMap(({name}) => packages.filter((entry) => entry.name === name)),
    }
  } catch (error) {
    if (childrenWritten)
      await Promise.all([...childSources].map(([path, source]) => restoreManifest(path, source)))
    if (rootIntentWritten) await restoreManifest(cosmosManifest, rootSource)
    console.error("[@cosmos/release:server:update]", "публикация завершилась с ошибкой", {
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
  const staging = await mkdtemp(join(cosmosRoot, ".package-recovery-"))
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
    const pending = plans.filter(({member, version}) => member.childVersion !== version)
    const results = await buildPlans(plans)
    const failure = results.find((result) => !result.success)
    if (failure)
      throw new Error(`Recovery build failed for ${failure.module}:${failure.env}: ${failure.stderr}`)
    const recoveryNeeded = await hasIncompleteOutputs(plans, results) || pending.length > 0
    if (recoveryNeeded) debug("восстановление публикации начато", {packages})

    await materializeRecoveryPlans(plans, results)
    await writeChildVersions(pending)
    await readReleasedPackages()
    replaceDesiredBrowserArtifacts(desiredBrowserArtifacts(results))
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
    console.error("[@cosmos/release:server:update]", "восстановление публикации завершилось с ошибкой", {
      error: errorMessage(error),
      packages,
    })
    throw error
  } finally {
    await rm(staging, {recursive: true, force: true})
  }
}

async function exactPlanArtifacts(plans: ReleasePlan[]) {
  return await Promise.all(plans.flatMap((plan) => plan.artifacts.map(async ({owner}) => {
    const path = versionedPackageArtifactPath(owner, plan.version, rootPackageArtifact)
    const artifact = await packageArtifact(path)
    if (!artifact) throw new Error(`Recovered artifact is missing: ${path}`)
    return artifact
  })))
}

function assignArtifacts(plans: ReleasePlan[], staging: string) {
  let index = 0
  for (const plan of plans) {
    plan.artifacts = plan.member.owners.map((owner) => {
      const stage = join(staging, String(index++))
      return {
        env: owner.env,
        owner,
        stagedArtifact: join(stage, "root.js"),
        stagedOutdir: join(stage, "graph"),
      }
    })
  }
}

async function buildPlans(plans: ReleasePlan[]): Promise<PackageReleaseResult[]> {
  const artifactPlans = plans.flatMap((plan) =>
    plan.artifacts.map((artifact) => ({plan, artifact})))
  const builds = await Promise.all(artifactPlans.map(({plan, artifact}) =>
    buildPackage(plan.name, artifact.owner.sources.length > 1
      ? {env: artifact.env, outdir: artifact.stagedOutdir, version: plan.version}
      : {env: artifact.env, artifact: artifact.stagedArtifact})))
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
  return await materializeBuildResults(plans, results, false)
}

async function materializeRecoveryPlans(
  plans: ReleasePlan[],
  results: PackageReleaseResult[],
) {
  return await materializeBuildResults(plans, results, true)
}

async function materializeBuildResults(
  plans: ReleasePlan[],
  results: PackageReleaseResult[],
  recovery: boolean,
) {
  const artifactPlans = plans.flatMap((plan) =>
    plan.artifacts.map((artifact) => ({plan, artifact})))
  const roots: PackageBuildArtifact[] = []
  const publishedByIntegrity = new Map<string, string>()
  for (const [index, {plan, artifact}] of artifactPlans.entries()) {
    const result = results[index]!
    const outputs = await materializeEnvironmentOutputs(
      artifact.owner,
      plan.version,
      result.outputs,
      recovery,
      publishedByIntegrity,
    )
    result.outputs = outputs
    const root = outputs.find(({artifact: key, kind}) =>
      key === rootPackageArtifact && kind !== "sourcemap")
    if (!root) throw new Error(`${plan.name}:${artifact.env} published root is missing`)
    roots.push(root)
  }
  return roots
}

async function hasIncompleteOutputs(
  plans: ReleasePlan[],
  results: PackageReleaseResult[],
) {
  const artifactPlans = plans.flatMap((plan) =>
    plan.artifacts.map((artifact) => ({plan, artifact})))
  for (const [index, {plan, artifact}] of artifactPlans.entries()) {
    for (const output of results[index]?.outputs ?? []) {
      const target = publishedOutputPath(artifact.owner, plan.version, output)
      if (!await packageArtifact(target)) return true
    }
  }
  return false
}

async function materializeEnvironmentOutputs(
  owner: PackageOwner,
  version: string,
  outputs: readonly PackageBuildArtifact[],
  recovery: boolean,
  publishedByIntegrity: Map<string, string>,
) {
  if (outputs.length === 0) throw new Error(`${owner.env} build produced no outputs`)
  const records = outputs.map((output, index) => ({
    index,
    output,
    target: publishedOutputPath(owner, version, output),
  }))
  const targetOwners = new Map<string, PackageArtifactKey>()
  for (const {output, target} of records) {
    if (output.artifact === undefined) throw new Error(`${owner.env} build output lacks artifact identity`)
    const previous = targetOwners.get(target)
    if (previous !== undefined)
      throw new Error(`${owner.env} artifacts ${previous} and ${output.artifact} share target ${target}`)
    targetOwners.set(target, output.artifact)
  }

  const bySource = new Map<string, typeof records>()
  for (const record of records) {
    const group = bySource.get(record.output.path) ?? []
    group.push(record)
    bySource.set(record.output.path, group)
  }
  const published = new Array<PackageBuildArtifact>(outputs.length)

  for (const [staged, group] of bySource) {
    const expected = await packageArtifact(staged)
    if (!expected) throw new Error(`Staged artifact is missing: ${staged}`)
    const integrity = `${expected.sha256}\u0000${expected.size}`
    for (const {output, target} of group) {
      if (
        output.artifact === undefined
        || output.artifact === rootPackageArtifact
        || isGeneratedPackageArtifactKey(output.artifact)
      ) continue
      const existingPath = await resolveVersionedPackageArtifactPath(
        owner,
        version,
        output.artifact,
      )
      if (existingPath === null || existingPath === target) continue
      throw new Error(`Immutable artifact path conflict: ${existingPath}`)
    }
    let linkSource = publishedByIntegrity.get(integrity)
    if (group.some(({output}) =>
      output.artifact === rootPackageArtifact && output.kind !== "sourcemap")) {
      const legacy = legacyVersionedArtifact(owner.artifact, version)
      if (!group.some(({target}) => target === legacy)) {
        const existing = await packageArtifact(legacy)
        if (existing) {
          if (existing.sha256 !== expected.sha256 || existing.size !== expected.size)
            throw new Error(`Immutable artifact conflict: ${legacy}`)
          linkSource ??= legacy
          publishedByIntegrity.set(integrity, legacy)
        }
      }
    }
    if (linkSource === undefined) {
      for (const {target} of group) {
        const existing = await packageArtifact(target)
        if (existing?.sha256 === expected.sha256 && existing.size === expected.size) {
          linkSource = target
          publishedByIntegrity.set(integrity, target)
          break
        }
      }
    }
    for (const record of [...group].sort((left, right) => left.target.localeCompare(right.target))) {
      const artifact = await publishPreparedArtifact(
        staged,
        record.target,
        expected,
        linkSource,
        recovery && record.output.kind === "sourcemap",
      )
      if (artifact.sha256 === expected.sha256 && artifact.size === expected.size) {
        linkSource ??= record.target
        publishedByIntegrity.set(integrity, record.target)
      }
      published[record.index] = {
        ...artifact,
        artifact: record.output.artifact!,
        ...(record.output.kind === undefined ? {} : {kind: record.output.kind}),
        ...(record.output.sourceMapFor === undefined
          ? {}
          : {sourceMapFor: record.output.sourceMapFor}),
        ...(record.output.load === undefined ? {} : {load: record.output.load}),
      }
    }
  }
  return published
}

function publishedOutputPath(
  owner: PackageOwner,
  version: string,
  output: PackageBuildArtifact,
) {
  if (output.artifact === undefined) throw new Error(`${owner.env} build output lacks artifact identity`)
  if (output.kind === "sourcemap" && output.sourceMapFor === rootPackageArtifact)
    return sourceMapArtifact(versionedPackageArtifactPath(owner, version, rootPackageArtifact))
  return versionedPackageArtifactPath(owner, version, output.artifact)
}

async function publishPreparedArtifact(
  staged: string,
  target: string,
  expected: PackageBuildArtifact,
  linkSource?: string,
  retainExisting = false,
) {
  const existing = await packageArtifact(target)
  if (existing) {
    if (!retainExisting && (existing.sha256 !== expected.sha256 || existing.size !== expected.size))
      throw new Error(`Immutable artifact conflict: ${target}`)
    return existing
  }

  await mkdir(dirname(target), {recursive: true})
  const temporary = `${target}.${crypto.randomUUID()}.tmp`
  try {
    let linked = false
    if (linkSource !== undefined) {
      try {
        await link(linkSource, temporary)
        linked = true
      } catch {
        // Cross-device and unsupported hard links use the same atomic copy path.
      }
    }
    if (!linked) await copyFile(staged, temporary)
    await rename(temporary, target)
  } finally {
    await rm(temporary, {force: true})
  }
  const published = await packageArtifact(target)
  if (!published) throw new Error(`Published artifact is missing: ${target}`)
  if (published.sha256 !== expected.sha256 || published.size !== expected.size)
    throw new Error(`Published artifact differs from staged bytes: ${target}`)
  return published
}

function desiredBrowserArtifacts(
  results: readonly PackageReleaseResult[],
): BrowserPackageArtifactIdentity[] {
  return results.flatMap((result) => {
    if (!isBrowserPackageEnvironment(result.env)) return []
    const env = result.env as BrowserPackageEnvironment
    return result.outputs.flatMap((output) => {
      if (
        output.artifact === undefined
        || output.kind === "sourcemap"
        || (output.artifact !== rootPackageArtifact && output.load !== "eager")
      ) return []
      return [{
        name: result.module,
        env,
        ...(output.artifact === rootPackageArtifact ? {} : {artifact: output.artifact}),
        version: result.version,
        sha256: output.sha256,
        size: output.size,
      }]
    })
  })
}

/** Публикует missing exact artifact, но никогда не заменяет существующую identity. */
export async function publishImmutableArtifact(staged: string, target: string) {
  const expected = await packageArtifact(staged)
  if (!expected) throw new Error(`Staged artifact is missing: ${staged}`)
  return await publishPreparedArtifact(staged, target, expected)
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
    console.debug("[@cosmos/release:server:update]", event, details)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
