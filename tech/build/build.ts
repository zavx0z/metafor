import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {basename, dirname, join, resolve} from "node:path"
import {tmpdir} from "node:os"
import {fileURLToPath} from "node:url"
import {
  packageBuildCommand,
  packageProgrammaticBuildPlan,
  type PackageProgrammaticBuildPlan,
  withPackageBuildOutput,
} from "./command"
import type {PackageEnvironment} from "./identity/environment"
import type {
  BuildablePackage,
  PackageBuildArtifact,
  PackageBuildOptions,
  PackageBuildResult,
  PackageOwner,
} from "./contracts"
import {packageArtifact, createPackageReader, type PackageReaderOptions} from "./manifest"
import {externalizeSourceMap, sourceMapArtifact} from "./source-map"
import {packageBuildEntrypoints} from "./source"
import {isGeneratedPackageArtifactKey, rootPackageArtifact} from "./identity/artifact"
import {validatePackageBuildOutputs} from "./report"

export interface PackageBuilderOptions extends PackageReaderOptions {
  profile?: "development" | "production"
  /** Instance-owned executor; по умолчанию штатный Bun.spawn. */
  spawn?: typeof Bun.spawn
}

/**
Создаёт экземпляр [сборщика](./README.md) с явными разрешением пакетов и профилем.

`preparePackage` подготавливает все объявленные окружения, `buildPackage` — одно.
Target version задаётся отдельно от исходного manifest и передаётся как CLI,
так и compiler-plugin сборке. Совпадающие незавершённые операции объединяются
внутри экземпляра. Публикация не выполняется, source manifests не меняются.

`spawn` сохраняет семантику Bun process executor. Каждая операция ожидает выход
дочернего процесса, собирает stdout/stderr, проверяет полный compiler report
и освобождает временный report при успехе, отказе и прерывании. Development
выносит карты исходников в отдельные companions перед вычислением identity.

@throws Проверка входного контракта отклоняет недопустимые декларации до
  запуска compiler. Отказы исполнения возвращаются с exitCode, стадией и
  исходной диагностикой; частичный граф не возвращается успешным.

Сценарии: [примеры](./spec/scenario.spec.ts),
[исполнение](./spec/execution.spec.ts), [отказы](./spec/failures.spec.ts).
*/
export function createPackageBuilder(options: PackageBuilderOptions) {
  const spawn = options.spawn ?? Bun.spawn
  const reader = createPackageReader(options)
  const {packageOwner, packageSourceLocation} = reader
  const optionsProfile = () => options.profile ?? "production"
  const pendingBuilds = new Map<string, Promise<PackageBuildResult>>()
  const pendingTypechecks = new Map<string, Promise<PackageTypecheckResult>>()

  interface PackageTypecheckResult {
    exitCode: number
    stdout: string
    stderr: string
  }

  type PackageBuildExecution =
    | {
        kind: "legacy"
        artifact: string
        command: string[]
      }
    | {
        kind: "adapter"
        command: string[]
        output: {mode: "single"; artifact: string} | {mode: "multi"; outdir: string}
        plan: PackageProgrammaticBuildPlan
        reportDirectory: string
        report: string
        version: string
      }

  /** Разрешает внешнее имя как package с полным browser build contract. */
  async function buildablePackage(
    value: string | null,
    env?: PackageEnvironment,
  ): Promise<BuildablePackage | null> {
    if (value === null) return null
    try {
      await packageOwner(value, env)
      return value
    } catch {
      return null
    }
  }

  /** Разрешает известный пакет независимо от выбранного окружения. */
  async function knownPackage(value: string | null): Promise<BuildablePackage | null> {
    if (value === null) return null
    try {
      await packageSourceLocation(value)
      return value
    } catch {
      return null
    }
  }

  /** Запускает package-owned `scripts.build:<env>`, схлопывая одинаковые pending builds. */
  async function buildPackage(
    name: BuildablePackage,
    options: PackageBuildOptions = {},
  ): Promise<PackageBuildResult> {
    const owner = await packageOwner(name, options.env)
    const key = [
      name,
      owner.env,
      options.artifact ?? "default",
      options.outdir ?? "default",
      options.version ?? owner.version,
    ].join("\u0000")
    const pending = pendingBuilds.get(key)
    if (pending) return pending

    const build = runPackageBuild(name, owner, options)
    pendingBuilds.set(key, build)
    void build.then(
      () => pendingBuilds.delete(key),
      () => pendingBuilds.delete(key),
    )
    return build
  }

  async function runPackageBuild(
    name: BuildablePackage,
    owner: PackageOwner,
    options: PackageBuildOptions,
  ): Promise<PackageBuildResult> {
    let reportDirectory: string | undefined
    let finishChild: (() => Promise<void>) | undefined
    let stage: NonNullable<PackageBuildResult["stage"]> = "configuration"
    let exitCode: number | null = null
    let stdout = ""
    let stderr = ""
    try {
      const profile = optionsProfile()
      const execution = await packageBuildExecution(name, owner, options, profile)
      if (execution.kind === "adapter") reportDirectory = execution.reportDirectory
      stage = "typecheck"
      const typecheck = await runPackageTypecheck(name, owner)
      if (typecheck.exitCode !== 0) {
        return {
          module: name,
          env: owner.env,
          success: false,
          stage,
          exitCode: typecheck.exitCode,
          stdout: typecheck.stdout,
          stderr: typecheck.stderr,
          outputs: [],
        }
      }

      stage = "compiler"
      debug("сборка artifact начата", {
        artifact: execution.kind === "legacy" ? execution.artifact : execution.output,
        command: execution.command,
        env: owner.env,
        package: name,
        profile: optionsProfile(),
        root: owner.root,
      })

      const child =
        execution.kind === "legacy"
          ? spawn(execution.command, {
              cwd: owner.root,
              stdout: "pipe",
              stderr: "pipe",
            })
          : spawn(execution.command, {
              cwd: owner.root,
              env: {...process.env, NODE_ENV: profile},
              stdin: new Blob([
                JSON.stringify({
                  name,
                  env: owner.env,
                  version: execution.version,
                  loaders: owner.loaders,
                  plan: execution.plan,
                  plugins: owner.plugins,
                  report: execution.report,
                  sources: owner.sources,
                  output: execution.output,
                }),
              ]),
              stdout: "pipe",
              stderr: "pipe",
            })
      finishChild = async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM")
        await child.exited
      }
      const [buildExitCode, buildStdout, buildStderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      exitCode = buildExitCode
      stdout = `${typecheck.stdout}${buildStdout}`
      stderr = `${typecheck.stderr}${buildStderr}`

      if (exitCode !== 0) {
        if (execution.kind === "adapter" && await Bun.file(execution.report).exists()) {
          const failure = await Bun.file(execution.report).json()
          if (failure?.failure?.stage === "outputs") stage = "outputs"
        }
        if (child.signalCode !== null) stderr += `\nPackage build process interrupted by ${child.signalCode}`
        debug("сборка artifact завершилась с ошибкой", {
          env: owner.env,
          error: stderr,
          exitCode,
          package: name,
        })
        return {module: name, env: owner.env, success: false, stage, exitCode, stdout, stderr, outputs: []}
      }

      stage = "outputs"
      const outputs =
        execution.kind === "legacy"
          ? await legacyBuildOutputs(execution.artifact)
          : await validatePackageBuildOutputs(
              name,
              owner,
              execution,
              await Bun.file(execution.report).json(),
              profile,
            )
      if (outputs.length === 0)
        return buildContractFailure(
          {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs: []},
          execution.kind === "legacy" ? execution.artifact : execution.report,
        )

      debug("сборка artifact завершена", {outputs, env: owner.env, exitCode, package: name})

      return {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs}
    } catch (error) {
      debug("сборка artifact завершилась с ошибкой", {
        env: owner.env,
        error: errorMessage(error),
        exitCode,
        package: name,
      })
      return {
        module: name,
        env: owner.env,
        success: false,
        stage,
        exitCode,
        stdout,
        stderr: [stderr.trimEnd(), errorMessage(error)].filter(Boolean).join("\n"),
        outputs: [],
      }
    } finally {
      await finishChild?.()
      if (reportDirectory !== undefined) await rm(reportDirectory, {recursive: true, force: true})
    }
  }

  async function packageBuildExecution(
    name: string,
    owner: PackageOwner,
    options: PackageBuildOptions,
    profile: "development" | "production",
  ): Promise<PackageBuildExecution> {
    if (options.artifact !== undefined && options.outdir !== undefined)
      throw new Error("Package build artifact cannot be combined with outdir")

    const onlyLegacyRoot =
      owner.sources.length === 1 &&
      owner.sources[0]?.artifact === rootPackageArtifact &&
      owner.plugins.length === 0
    if (onlyLegacyRoot) {
      if (options.outdir !== undefined)
        throw new Error("Legacy package build does not accept an outdir override")
      const version = canonicalBuildVersion(options.version ?? owner.version)
      const artifact = options.artifact ?? owner.artifact
      await mkdir(dirname(artifact), {recursive: true})
      return {
        kind: "legacy",
        artifact,
        command: [
          ...withPackageBuildOutput(packageBuildCommand(owner.build, profile), artifact),
          `--define=import.meta.env.COSMOS_PACKAGE_NAME=${JSON.stringify(name)}`,
          `--define=import.meta.env.COSMOS_PACKAGE_ENV=${JSON.stringify(owner.env)}`,
          `--define=import.meta.env.COSMOS_PACKAGE_VERSION=${JSON.stringify(version)}`,
        ],
      }
    }

    const entrypoints = packageBuildEntrypoints(owner.sources)
    const mode = entrypoints.length > 1 ? "multi" : "single"
    const plan = packageProgrammaticBuildPlan(owner.build, profile, mode)
    const version = canonicalBuildVersion(options.version ?? owner.version)
    const completeGraph = owner.sources.length > 1
    if (completeGraph && (options.outdir === undefined) !== (options.version === undefined))
      throw new Error("Complete graph staging outdir and version must be provided together")
    let output: Extract<PackageBuildExecution, {kind: "adapter"}>["output"]

    if (mode === "multi") {
      if (plan.mode !== "multi") throw new Error("Package multi-entry build plan is missing")
      if (options.artifact !== undefined)
        throw new Error("Multi-entry package build does not accept an artifact override")
      if ((options.outdir === undefined) !== (options.version === undefined))
        throw new Error("Multi-entry staging outdir and version must be provided together")
      const outdir = resolve(owner.root, options.outdir ?? plan.outdir)
      await mkdir(outdir, {recursive: true})
      output = {mode, outdir}
    } else {
      if (owner.sources.length > 1 && options.artifact !== undefined)
        throw new Error("Package build with raw public files requires its complete default output")
      if (options.outdir !== undefined) {
        if (!completeGraph)
          throw new Error("Single-root package build does not accept an outdir override")
        const outdir = resolve(owner.root, options.outdir)
        await mkdir(outdir, {recursive: true})
        output = {mode: "multi", outdir}
      } else {
        const artifact = options.artifact ?? owner.artifact
        await mkdir(dirname(artifact), {recursive: true})
        output = {mode, artifact}
      }
    }

    const command = [Bun.which("bun") ?? "bun", await packageBuildAdapterEntrypoint()]
    const reportDirectory = await mkdtemp(join(tmpdir(), "cosmos-package-build-report-"))
    return {
      kind: "adapter",
      command,
      output,
      plan,
      reportDirectory,
      report: join(reportDirectory, "report.json"),
      version,
    }
  }

  async function legacyBuildOutputs(artifactPath: string): Promise<PackageBuildArtifact[]> {
    if (optionsProfile() === "development") await externalizeSourceMap(artifactPath)
    const artifact = await packageArtifact(artifactPath)
    if (!artifact) return []
    const outputs: PackageBuildArtifact[] = [
      {
        ...artifact,
        artifact: rootPackageArtifact,
        kind: "entry-point",
        load: "eager",
      },
    ]
    if (optionsProfile() !== "development") return outputs

    const mapPath = sourceMapArtifact(artifactPath)
    const sourceMap = await packageArtifact(mapPath)
    if (!sourceMap) throw new Error(`Package development source map is missing: ${mapPath}`)
    outputs.push({
      ...sourceMap,
      artifact: generatedMapArtifact(basename(mapPath)),
      kind: "sourcemap",
      sourceMapFor: rootPackageArtifact,
      load: "eager",
    })
    return outputs
  }

  function generatedMapArtifact(path: string) {
    const artifact = `./.cosmos/asset/${path}` as const
    if (!isGeneratedPackageArtifactKey(artifact))
      throw new Error(`Package source map artifact key is invalid: ${artifact}`)
    return artifact
  }

  function canonicalBuildVersion(value: string) {
    if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value))
      throw new Error(`Package build version is not canonical SemVer: ${value}`)
    return value
  }

  async function packageBuildAdapterEntrypoint() {
    const source = fileURLToPath(import.meta.resolve("@metafor/tech-build/adapter"))
    if (await Bun.file(source).exists()) return source

    throw new Error("Package build adapter source is missing")
  }

  /** Один раз проверяет package перед параллельной группой его env builds. */
  async function runPackageTypecheck(name: BuildablePackage, owner: PackageOwner) {
    const pending = pendingTypechecks.get(owner.manifest)
    if (pending) return pending

    debug("package typecheck начат", {package: name, root: owner.root})
    const typecheck = executePackageTypecheck(owner).then((result) => {
      debug("package typecheck завершён", {
        exitCode: result.exitCode,
        package: name,
        stderr: result.stderr.trim() || null,
      })
      return result
    })
    pendingTypechecks.set(owner.manifest, typecheck)
    void typecheck.then(
      () => pendingTypechecks.delete(owner.manifest),
      () => pendingTypechecks.delete(owner.manifest),
    )
    return typecheck
  }

  async function executePackageTypecheck(owner: PackageOwner): Promise<PackageTypecheckResult> {
    const child = spawn([Bun.which("bun") ?? "bun", "run", "--silent", owner.typecheck], {
      cwd: owner.root,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    return {exitCode, stdout, stderr}
  }

  function buildContractFailure(result: PackageBuildResult, artifact: string): PackageBuildResult {
    const message = `${result.module} build did not produce non-empty ${artifact}`
    return {
      ...result,
      success: false,
      stage: "outputs",
      stderr: [result.stderr.trimEnd(), message].filter(Boolean).join("\n"),
      outputs: [],
    }
  }

  function debug(event: string, details: unknown) {
    if (optionsProfile() === "development") console.debug("[@metafor/tech-build]", event, details)
  }

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }

  async function preparePackage(name: string, target: {outdir: string; version?: string}) {
    const owners = await reader.packageOwners(name)
    return await Promise.all(
      owners.map((owner) =>
        buildPackage(
          name,
          owner.sources.length > 1
            ? {
                env: owner.env,
                outdir: join(target.outdir, owner.env),
                version: target.version ?? owner.version,
              }
            : {
                env: owner.env,
                artifact: join(target.outdir, `${owner.env}.js`),
                version: target.version ?? owner.version,
              },
        ),
      ),
    )
  }
  return {...reader, buildPackage, preparePackage, buildablePackage, knownPackage}
}

export type PackageBuilder = ReturnType<typeof createPackageBuilder>
