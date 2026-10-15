import {lstat, mkdir, mkdtemp, realpath, rm} from "node:fs/promises"
import {createHash} from "node:crypto"
import {basename, dirname, isAbsolute, join, resolve} from "node:path"
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
  PackageBuildProvenance,
  PackageBuildProvenanceAssignment,
  PackageBuildResult,
  PackageOwner,
} from "./contracts"
import {packageArtifact, createPackageReader, type PackageReaderOptions} from "./manifest"
import {externalizeSourceMap, sourceMapArtifact} from "./source-map"
import {packageBuildEntrypoints} from "./source"
import {isGeneratedPackageArtifactKey, rootPackageArtifact} from "./identity/artifact"
import {validatePackageBuildOutputs} from "./report"
import {preparePackageDependencies, type PreparedPackageDependency, type PreparedDependencyGraph} from "./prepared"
import {readBuildToolchain, snapshotBuildInventory, verifyBuildInventory} from "./provenance"

export interface PackageBuilderOptions extends PackageReaderOptions {
  profile?: "development" | "production"
  /** Политика host передаёт готовые прямые зависимости только выбранному environment. */
  preparedDependencies?(owner: PackageOwner): Promise<readonly PreparedPackageDependency[]>
  /** Исполнитель дочерних процессов экземпляра сохраняет переданные signal и detached. */
  spawn?: typeof Bun.spawn
  /** Назначенные хостом корни для ограниченного подтверждения исходников. */
  provenance?: PackageBuildProvenanceAssignment
  /** Хост возвращает абсолютный путь к проверенному адаптеру установленного выпуска. */
  adapterEntrypoint?(): Promise<string>
  /** Сигнал жизненного цикла владельца завершает принадлежащие сборщику дочерние процессы. */
  signal?: AbortSignal
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
Сигнал владельца привязан к жизненному циклу экземпляра и передаётся проверке
типов и компилятору; прерванная операция не возвращает успешный граф выходов.
При отмене завершается отдельная группа принадлежащего сборке процесса, включая
вложенный скрипт пакета. Подменённый `spawn` сохраняет параметры signal и detached.

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
  const preparedDependenciesFor = options.preparedDependencies
  const provenanceAssignment = options.provenance
  const adapterEntrypointFor = options.adapterEntrypoint
  const signal = options.signal
  const childLifetime = signal === undefined ? {} : {signal, killSignal: "SIGKILL" as const, detached: true}
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
        version: string
        command: string[]
        reportDirectory?: string
        inputReport?: string
      }
    | {
        kind: "adapter"
        command: string[]
        output: {mode: "single"; artifact: string} | {mode: "multi"; outdir: string}
        plan: PackageProgrammaticBuildPlan
        reportDirectory: string
        report: string
        version: string
        preparedDependencies: readonly PreparedDependencyGraph[]
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
    signal?.throwIfAborted()
    const before = provenanceAssignment === undefined
      ? undefined
      : await snapshotBuildInventory(provenanceAssignment)
    signal?.throwIfAborted()
    const owner = await packageOwner(name, options.env)
    signal?.throwIfAborted()
    const key = [
      name,
      owner.env,
      options.artifact ?? "default",
      options.outdir ?? "default",
      options.version ?? owner.version,
    ].join("\u0000")
    const pending = pendingBuilds.get(key)
    if (pending) return pending

    const build = runPackageBuild(name, owner, options, before)
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
    before?: Awaited<ReturnType<typeof snapshotBuildInventory>>,
  ): Promise<PackageBuildResult> {
    let reportDirectory: string | undefined
    let finishChild: (() => Promise<void>) | undefined
    let releaseChildGroup: (() => void) | undefined
    let stage: NonNullable<PackageBuildResult["stage"]> = "configuration"
    let exitCode: number | null = null
    let stdout = ""
    let stderr = ""
    try {
      const profile = optionsProfile()
      signal?.throwIfAborted()
      const execution = await packageBuildExecution(name, owner, options, profile)
      reportDirectory = execution.reportDirectory
      const compilerToolchain = before === undefined
        ? undefined
        : await readBuildToolchain(execution.command[0]!)
      const adapterArtifact = execution.kind === "adapter" && before !== undefined
        ? await readAdapterArtifact(execution.command[1]!)
        : undefined
      stage = "typecheck"
      const typecheck = await runPackageTypecheck(name, owner)
      signal?.throwIfAborted()
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
      signal?.throwIfAborted()
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
              ...childLifetime,
              stdout: "pipe",
              stderr: "pipe",
            })
          : spawn(execution.command, {
              cwd: owner.root,
              ...childLifetime,
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
                  preparedDependencies: execution.preparedDependencies,
                  output: execution.output,
                }),
              ]),
              stdout: "pipe",
              stderr: "pipe",
            })
      releaseChildGroup = bindOwnedGroup(child)
      finishChild = async () => {
        if (child.exitCode === null && child.signalCode === null) {
          if (signal) killOwnedGroup(child)
          else child.kill("SIGTERM")
        }
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
      signal?.throwIfAborted()

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
      signal?.throwIfAborted()
      const report = execution.kind === "adapter"
        ? await Bun.file(execution.report).json()
        : undefined
      const outputs =
        execution.kind === "legacy"
          ? await legacyBuildOutputs(execution.artifact)
          : await validatePackageBuildOutputs(
              name,
              owner,
              execution,
              report,
              profile,
            )
      if (outputs.length === 0)
        return buildContractFailure(
          {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs: []},
          execution.kind === "legacy" ? execution.artifact : execution.report,
        )

      debug("сборка artifact завершена", {outputs, env: owner.env, exitCode, package: name})

      signal?.throwIfAborted()
      if (before === undefined)
        return {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs}

      stage = "inputs"
      const inputReport = execution.kind === "legacy"
        ? execution.inputReport === undefined ? undefined : await Bun.file(execution.inputReport).json()
        : report
      if (!Array.isArray(inputReport?.inputs) &&
        (typeof inputReport?.inputs !== "object" || inputReport.inputs === null))
        throw new Error("Build compiler input graph is missing")
      const compilerInputs = Array.isArray(inputReport.inputs)
        ? inputReport.inputs
        : Object.keys(inputReport.inputs)
      if (compilerInputs.length === 0 || compilerInputs.some((input: unknown) => typeof input !== "string"))
        throw new Error("Build compiler input graph is invalid")
      const rawSources = owner.sources
        .filter(({source}) => source !== owner.entrypoint)
        .map(({source}) => resolve(owner.root, source))
      const bunfig = join(owner.root, "bunfig.toml")
      const required = [owner.manifest, ...owner.plugins, ...rawSources]
      if (await Bun.file(bunfig).exists()) required.push(bunfig)
      if (execution.kind === "adapter" && adapterEntrypointFor === undefined)
        required.push(execution.command[1]!)
      if (adapterArtifact !== undefined &&
        (await readAdapterArtifact(adapterArtifact.path)).sha256 !== adapterArtifact.sha256)
        throw new Error("Package build adapter changed during preparation")
      const provenance = await verifyBuildInventory(
        before,
        await snapshotBuildInventory(provenanceAssignment!),
        owner.root,
        compilerInputs,
        required,
        profile,
        compilerToolchain!,
        adapterArtifact,
        execution.kind === "adapter"
          ? execution.preparedDependencies.flatMap((graph) => graph.files.map((file) => ({
              path: join(graph.root, file.path), sha256: file.digest,
            })))
          : [],
        execution.version,
        buildPlanDigest(name, owner, execution.version, profile, execution.kind === "adapter" ? execution.plan : undefined),
      )
      signal?.throwIfAborted()
      return {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs, provenance}
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
      releaseChildGroup?.()
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

    const preparedDependencies = await preparePackageDependencies(
      owner, await preparedDependenciesFor?.(owner) ?? [],
    )

    const onlyLegacyRoot =
      owner.sources.length === 1 &&
      owner.sources[0]?.artifact === rootPackageArtifact &&
      preparedDependencies.length === 0 &&
      owner.plugins.length === 0
    if (onlyLegacyRoot) {
      if (options.outdir !== undefined)
        throw new Error("Legacy package build does not accept an outdir override")
      const version = canonicalBuildVersion(options.version ?? owner.version)
      const artifact = options.artifact ?? owner.artifact
      await mkdir(dirname(artifact), {recursive: true})
      const reportDirectory = provenanceAssignment === undefined
        ? undefined
        : await mkdtemp(join(tmpdir(), "cosmos-package-build-report-"))
      const inputReport = reportDirectory === undefined ? undefined : join(reportDirectory, "metafile.json")
      return {
        kind: "legacy",
        artifact,
        version,
        ...(reportDirectory === undefined ? {} : {reportDirectory}),
        ...(inputReport === undefined ? {} : {inputReport}),
        command: [
          ...withPackageBuildOutput(packageBuildCommand(owner.build, profile), artifact),
          ...(inputReport === undefined ? [] : [`--metafile=${inputReport}`]),
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
      preparedDependencies,
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
    const source = adapterEntrypointFor === undefined
      ? fileURLToPath(import.meta.resolve("@metafor/tech-build/adapter"))
      : await adapterEntrypointFor()
    return (await readAdapterArtifact(source)).path
  }

  async function readAdapterArtifact(path: string) {
    if (!isAbsolute(path)) throw new Error("Package build adapter entrypoint must be absolute")
    let canonical: string
    try {
      canonical = await realpath(path)
    } catch {
      throw new Error(`Package build adapter is missing: ${path}`)
    }
    if (!(await lstat(canonical)).isFile())
      throw new Error(`Package build adapter is not a file: ${path}`)
    const sha256 = createHash("sha256")
      .update(new Uint8Array(await Bun.file(canonical).arrayBuffer()))
      .digest("hex")
    return {path: canonical, sha256}
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

  async function executePackageTypecheck(owner: PackageOwner, ownerSignal = signal): Promise<PackageTypecheckResult> {
    ownerSignal?.throwIfAborted()
    const child = spawn([Bun.which("bun") ?? "bun", "run", "--silent", owner.typecheck], {
      cwd: owner.root,
      ...(ownerSignal === undefined ? {} : {signal: ownerSignal, killSignal: "SIGKILL" as const, detached: true}),
      stdout: "pipe",
      stderr: "pipe",
    })
    const releaseGroup = bindOwnedGroup(child, ownerSignal)
    try {
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return {exitCode, stdout, stderr}
    } finally {
      if (ownerSignal && child.exitCode === null && child.signalCode === null) killOwnedGroup(child)
      await child.exited
      releaseGroup()
    }
  }

  /** Отдельная группа процессов принадлежит только этому потомку и его дочерним процессам. */
  function bindOwnedGroup(child: Bun.Subprocess, ownerSignal = signal) {
    if (!ownerSignal) return () => {}
    const abort = () => killOwnedGroup(child)
    ownerSignal.addEventListener("abort", abort, {once: true})
    if (ownerSignal.aborted) abort()
    return () => ownerSignal.removeEventListener("abort", abort)
  }

  function killOwnedGroup(child: Bun.Subprocess) {
    try {process.kill(-child.pid, "SIGKILL")}
    catch (error) {if (!(error instanceof Error && "code" in error && error.code === "ESRCH"))
      debug("owned build group cancellation failed", {pid: child.pid, error: errorMessage(error)})}
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

  /** Проверяет типы пакета в том же управляемом контуре без сборки артефактов. */
  async function checkPackage(name: string, request: {signal?: AbortSignal} = {}): Promise<PackageTypecheckResult> {
    const ownerSignal = signal && request.signal
      ? AbortSignal.any([signal, request.signal])
      : signal ?? request.signal
    ownerSignal?.throwIfAborted()
    const owner = (await reader.packageOwners(name))[0]
    if (!owner) throw new Error(`Package ${name} has no build environment`)
    ownerSignal?.throwIfAborted()
    const result = request.signal
      ? await executePackageTypecheck(owner, ownerSignal)
      : await runPackageTypecheck(name, owner)
    ownerSignal?.throwIfAborted()
    return result
  }

  async function preparePackage(name: string, target: {outdir: string; version?: string}) {
    signal?.throwIfAborted()
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
  /** Та же назначенная хостом область исходников связывает проверку с подготовкой. */
  async function sourceInventory() {
    if (provenanceAssignment === undefined) throw new Error("Build source inventory is not assigned")
    const snapshot = await snapshotBuildInventory(provenanceAssignment)
    return {
      roots: snapshot.roots,
      excludedDirectoryNames: snapshot.excludedDirectoryNames,
      excludedDirectoryNamePrefixes: snapshot.excludedDirectoryNamePrefixes,
      sha256: snapshot.digest,
    }
  }
  /** Проверяет прежнее подтверждение без компиляции, временных файлов и записи. */
  async function verifyProvenance(
    name: string,
    target: {env: PackageEnvironment; version: string},
    proof: PackageBuildProvenance,
    expectedInventorySha256: string,
  ) {
    if (provenanceAssignment === undefined) throw new Error("Build source inventory is not assigned")
    if (proof.kind !== "bounded-source-inventory" || proof.targetVersion !== target.version)
      throw new Error("Prepared build provenance target differs")
    const inventory = await sourceInventory()
    if (inventory.sha256 !== expectedInventorySha256 || proof.inventorySha256 !== inventory.sha256 ||
      JSON.stringify(proof.roots) !== JSON.stringify(inventory.roots) ||
      JSON.stringify(proof.excludedDirectoryNames) !== JSON.stringify(inventory.excludedDirectoryNames) ||
      JSON.stringify(proof.excludedDirectoryNamePrefixes) !== JSON.stringify(inventory.excludedDirectoryNamePrefixes))
      throw new Error("Prepared build provenance source inventory differs")
    const owner = await packageOwner(name, target.env)
    const profile = optionsProfile()
    if (proof.profile !== profile) throw new Error("Prepared build provenance profile differs")
    const prepared = await preparePackageDependencies(owner, await preparedDependenciesFor?.(owner) ?? [])
    const actualPrepared = prepared.flatMap((graph) => graph.files.map((file) => ({
      path: join(graph.root, file.path), sha256: file.digest,
    }))).sort((left, right) => left.path.localeCompare(right.path))
    if (JSON.stringify(proof.prepared) !== JSON.stringify(actualPrepared))
      throw new Error("Prepared build provenance dependency graph differs")
    const legacy = owner.sources.length === 1 && owner.sources[0]?.artifact === rootPackageArtifact &&
      prepared.length === 0 && owner.plugins.length === 0
    const plan = legacy ? undefined : packageProgrammaticBuildPlan(
      owner.build,
      profile,
      packageBuildEntrypoints(owner.sources).length > 1 ? "multi" : "single",
    )
    if (proof.buildPlanSha256 !== buildPlanDigest(name, owner, target.version, profile, plan))
      throw new Error("Prepared build provenance plan differs")
    const actualAdapter = legacy ? undefined : await readAdapterArtifact(await packageBuildAdapterEntrypoint())
    if (JSON.stringify(proof.adapter) !== JSON.stringify(actualAdapter))
      throw new Error("Prepared build provenance adapter differs")
    const currentToolchain = await readBuildToolchain(proof.bun.path)
    if (JSON.stringify(proof.bun) !== JSON.stringify(currentToolchain))
      throw new Error("Prepared build provenance toolchain differs")
    const after = await sourceInventory()
    if (after.sha256 !== inventory.sha256)
      throw new Error("Build source inventory changed during provenance check")
  }

  function buildPlanDigest(
    name: string,
    owner: PackageOwner,
    version: string,
    profile: "development" | "production",
    plan?: PackageProgrammaticBuildPlan,
  ) {
    return createHash("sha256").update(JSON.stringify({
      name,
      env: owner.env,
      version,
      profile,
      build: owner.build,
      loaders: owner.loaders,
      plugins: owner.plugins,
      sources: owner.sources,
      ...(plan === undefined ? {} : {plan}),
    })).digest("hex")
  }

  return {...reader, buildPackage, preparePackage, checkPackage, buildablePackage, knownPackage, sourceInventory, verifyProvenance}
}

export type PackageBuilder = ReturnType<typeof createPackageBuilder>
