import type {createReleaseStorage} from "./storage"
import {readExistingVersion} from "./legacy"
import {copyFile, link, mkdir, mkdtemp, rename, rm} from "node:fs/promises"
import {dirname, join} from "node:path"
import {
  isBrowserPackageEnvironment,
  type BrowserPackageEnvironment,
  type PackageEnvironment,
} from "@metafor/tech-build/identity"
import {validateTargetReleaseVersions, type ReleaseCompositionMember} from "./composition"
import type {PackageBuildArtifact, PackageManifest, PackageOwner} from "@metafor/tech-build"
import type {PackageChange, PackageReleaseResult, PackageReleaseResultSet} from "./contracts"
import {packageArtifact, packageManifest} from "@metafor/tech-build"
import {nextPackageVersion} from "./version"
import {sourceMapArtifact} from "@metafor/tech-build"
import {
  isGeneratedPackageArtifactKey,
  rootPackageArtifact,
  type PackageArtifactKey,
} from "@metafor/tech-build/identity"
import {
  resolveVersionedPackageArtifactPath,
  legacyVersionedArtifact,
  versionedPackageArtifactPath,
} from "./artifact-path"
import type {BrowserPackageArtifactIdentity} from "@metafor/tech-build/identity"

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

import type {PackageBuilder} from "@metafor/tech-build"
import type {createReleaseComposition} from "./composition"
import type {createPublicationQueue} from "./queue"
import type {createArtifactProjection} from "./desired"
import type {createReleaseState} from "./state"

export function createPublication(
  options: {
    root: string
    manifest: string
    builder: PackageBuilder
    isMember(name: string): boolean
  },
  composition: ReturnType<typeof createReleaseComposition>,
  queue: ReturnType<typeof createPublicationQueue>,
  projection: ReturnType<typeof createArtifactProjection>,
  state: ReturnType<typeof createReleaseState>,
  storage: ReturnType<typeof createReleaseStorage>,
) {
  const {buildPackage} = options.builder
  const {readReleaseComposition, readReleaseIntentComposition} = composition
  const {serializePublication} = queue
  const {replaceDesiredBrowserArtifacts, replaceDesiredPackageArtifacts} = projection
  const {readReleasedPackages} = state
  /** Сериализует и выполняет одну package root-first publication. */
  function publishPackages(changes: PackageChange[]): Promise<PackageReleaseResultSet> {
    return serializePublication(() => runPublication(changes))
  }

  /** До открытия listener доводит durable root intent до полного состояния. */
  function recoverPublication(): Promise<RecoveryResult> {
    return serializePublication(runRecovery)
  }

  async function runPublication(changes: PackageChange[]): Promise<PackageReleaseResultSet> {
    const composition = await readReleaseComposition()
    const members = new Map(composition.map((member) => [member.name, member]))
    const unique = new Map<string, PackageChange>()
    for (const entry of changes) {
      if (!["patch", "minor", "major"].includes(entry.change))
        throw new Error("Invalid version change")
      const previous = unique.get(entry.name)
      if (previous && previous.change !== entry.change)
        throw new Error(`Conflicting change for ${entry.name}`)
      unique.set(entry.name, entry)
    }
    if (unique.size === 0) throw new Error("Release changes are empty")
    const plans = await Promise.all(
      [...unique.values()].map(async ({name, change}) => {
        const member = members.get(name)
        if (!member) throw new Error(`Released package ${name} is missing`)
        const manifest = await packageManifest(member.manifest)
        return {
          name,
          change,
          member: {
            ...member,
            dependencies: manifest.dependencies ?? {},
            owners: await options.builder.packageOwners(name),
          },
          previousVersion: member.version,
          version: nextPackageVersion(member.version, change),
          artifacts: [],
        } satisfies ReleasePlan
      }),
    )
    validateTargetReleaseVersions(
      composition.map((member) => plans.find(({name}) => name === member.name)?.member ?? member),
      new Map(plans.map(({name, version}) => [name, version])),
      options.isMember,
    )

    const staging = await mkdtemp(join(options.root, ".package-update-"))
    const rootSource = await Bun.file(options.manifest).text()
    const childSources = new Map(
      await Promise.all(
        plans.map(
          async ({member}) => [member.manifest, await Bun.file(member.manifest).text()] as const,
        ),
      ),
    )
    let rootIntentWritten = false
    let childrenWritten = false

    try {
      assignArtifacts(plans, staging)
      await writeRootVersions(
        options.manifest,
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
        await restoreManifest(options.manifest, rootSource)
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
      for (const plan of plans) await storage.markReady(plan.name, plan.version)
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
      if (rootIntentWritten) await restoreManifest(options.manifest, rootSource)
      console.error("[@metafor/tech-release]", "публикация завершилась с ошибкой", {
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
    const staging = await mkdtemp(join(options.root, ".package-recovery-"))
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
        throw new Error(
          `Recovery build failed for ${failure.module}:${failure.env}: ${failure.stderr}`,
        )
      const recoveryNeeded = pending.length > 0
      if (recoveryNeeded) debug("восстановление публикации начато", {packages})

      await materializePlans(plans, results)
      for (const plan of plans) await storage.markReady(plan.name, plan.version)
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
      console.error("[@metafor/tech-release]", "восстановление публикации завершилось с ошибкой", {
        error: errorMessage(error),
        packages,
      })
      throw error
    } finally {
      await rm(staging, {recursive: true, force: true})
    }
  }

  async function exactPlanArtifacts(plans: ReleasePlan[]) {
    return await Promise.all(
      plans.flatMap((plan) =>
        plan.artifacts.map(async ({owner}) => {
          const path = versionedPackageArtifactPath(owner, plan.version, rootPackageArtifact)
          const artifact = await packageArtifact(path)
          if (!artifact) throw new Error(`Recovered artifact is missing: ${path}`)
          return artifact
        }),
      ),
    )
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
    const settled = await Promise.allSettled(
      plans.flatMap((plan) =>
        plan.artifacts.map(async (artifact) => {
          const records = await storage.read(plan.name, plan.version)
          const prepared = records.find(({env}) => env === artifact.env)
          if (!prepared && (await storage.isReady(plan.name, plan.version)))
            throw new Error(
              `Published environment record is missing: ${plan.name}:${artifact.env}@${plan.version}`,
            )
          if (prepared) {
            const root = prepared.outputs.find(
              ({artifact, kind}) => artifact === "." && kind !== "sourcemap",
            )
            const legacy = await packageArtifact(
              legacyVersionedArtifact(artifact.owner.artifact, plan.version),
            )
            if (root && legacy && (root.sha256 !== legacy.sha256 || root.size !== legacy.size))
              throw new Error(`Immutable artifact conflict: ${legacy.path}`)
          }
          const existing = prepared
            ? await storage.restore(prepared)
            : await readExistingVersion(plan.name, artifact.owner, plan.version)
          const build = existing
            ? {
                module: plan.name,
                env: artifact.env,
                success: true,
                exitCode: 0,
                stdout: "",
                stderr: "",
                outputs: existing,
              }
            : await buildPackage(
                plan.name,
                artifact.owner.sources.length > 1
                  ? {env: artifact.env, outdir: artifact.stagedOutdir, version: plan.version}
                  : {env: artifact.env, artifact: artifact.stagedArtifact},
              )
          if (build.success && !prepared) {
            const outputs = build.outputs.map((output) => ({
              ...output,
              path: publishedOutputPath(artifact.owner, plan.version, output),
            }))
            await storage.save(
              {
                name: plan.name,
                version: plan.version,
                env: artifact.env,
                owner: artifact.owner,
                dependencies: plan.member.dependencies,
                environments: plan.member.owners.map(({env}) => env),
                outputs,
              },
              build.outputs,
            )
          }
          return {
            ...build,
            change: plan.change,
            previousVersion: plan.previousVersion,
            version: plan.version,
          }
        }),
      ),
    )
    const failure = settled.find((result) => result.status === "rejected")
    if (failure?.status === "rejected") throw failure.reason
    return settled.map((result) => {
      if (result.status === "rejected") throw result.reason
      return result.value
    })
  }

  async function materializePlans(plans: ReleasePlan[], results: PackageReleaseResult[]) {
    const artifactPlans = plans.flatMap((plan) =>
      plan.artifacts.map((artifact) => ({plan, artifact})),
    )
    const roots: PackageBuildArtifact[] = []
    const publishedByIntegrity = new Map<string, string>()
    for (const [index, {plan, artifact}] of artifactPlans.entries()) {
      const result = results[index]!
      const outputs = await materializeEnvironmentOutputs(
        artifact.owner,
        plan.version,
        result.outputs,
        publishedByIntegrity,
      )
      result.outputs = outputs
      const root = outputs.find(
        ({artifact: key, kind}) => key === rootPackageArtifact && kind !== "sourcemap",
      )
      if (!root) throw new Error(`${plan.name}:${artifact.env} published root is missing`)
      roots.push(root)
    }
    return roots
  }

  async function materializeEnvironmentOutputs(
    owner: PackageOwner,
    version: string,
    outputs: readonly PackageBuildArtifact[],
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
      if (output.artifact === undefined)
        throw new Error(`${owner.env} build output lacks artifact identity`)
      const previous = targetOwners.get(target)
      if (previous !== undefined)
        throw new Error(
          `${owner.env} artifacts ${previous} and ${output.artifact} share target ${target}`,
        )
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
          output.artifact === undefined ||
          output.artifact === rootPackageArtifact ||
          isGeneratedPackageArtifactKey(output.artifact)
        )
          continue
        const existingPath = await resolveVersionedPackageArtifactPath(
          owner,
          version,
          output.artifact,
        )
        if (existingPath === null || existingPath === target) continue
        throw new Error(`Immutable artifact path conflict: ${existingPath}`)
      }
      let linkSource = publishedByIntegrity.get(integrity)
      if (
        group.some(
          ({output}) => output.artifact === rootPackageArtifact && output.kind !== "sourcemap",
        )
      ) {
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
      for (const record of [...group].sort((left, right) =>
        left.target.localeCompare(right.target),
      )) {
        const artifact = await publishPreparedArtifact(staged, record.target, expected, linkSource)
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

  function publishedOutputPath(owner: PackageOwner, version: string, output: PackageBuildArtifact) {
    if (output.artifact === undefined)
      throw new Error(`${owner.env} build output lacks artifact identity`)
    if (output.kind === "sourcemap") {
      if (output.sourceMapFor === undefined)
        throw new Error(`${owner.env} source map lacks its JavaScript owner`)
      return sourceMapArtifact(versionedPackageArtifactPath(owner, version, output.sourceMapFor))
    }
    return versionedPackageArtifactPath(owner, version, output.artifact)
  }

  function desiredBrowserArtifacts(
    results: readonly PackageReleaseResult[],
  ): BrowserPackageArtifactIdentity[] {
    return results.flatMap((result) => {
      if (!isBrowserPackageEnvironment(result.env)) return []
      const env = result.env as BrowserPackageEnvironment
      return result.outputs.flatMap((output) => {
        if (
          output.artifact === undefined ||
          output.kind === "sourcemap" ||
          (output.artifact !== rootPackageArtifact && output.load !== "eager")
        )
          return []
        return [
          {
            name: result.module,
            env,
            ...(output.artifact === rootPackageArtifact ? {} : {artifact: output.artifact}),
            version: result.version,
            sha256: output.sha256,
            size: output.size,
          },
        ]
      })
    })
  }

  return {publishPackages, recoverPublication}
}
async function publishPreparedArtifact(
  staged: string,
  target: string,
  expected: PackageBuildArtifact,
  linkSource?: string,
) {
  const existing = await packageArtifact(target)
  if (existing) {
    if (existing.sha256 !== expected.sha256 || existing.size !== expected.size)
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

/** Публикует missing exact artifact, но никогда не заменяет существующую identity. */
export async function publishImmutableArtifact(staged: string, target: string) {
  const expected = await packageArtifact(staged)
  if (!expected) throw new Error(`Staged artifact is missing: ${staged}`)
  return await publishPreparedArtifact(staged, target, expected)
}

/** Первой durable записью меняет только target caret dependencies root. */
export async function writeRootVersions(path: string, versions: ReadonlyMap<string, string>) {
  const root = (await Bun.file(path).json()) as PackageManifest
  const dependencies = {...root.dependencies}
  for (const [name, version] of versions) dependencies[name] = `workspace:^${version}`
  root.dependencies = dependencies
  await writeJsonAtomic(path, root)
}

async function writeChildVersions(plans: ReleasePlan[]) {
  for (const {member, version} of plans) {
    const manifest = (await Bun.file(member.manifest).json()) as PackageManifest
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
  if (Bun.env.NODE_ENV === "development") console.debug("[@metafor/tech-release]", event, details)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
