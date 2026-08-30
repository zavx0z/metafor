import {mkdir, mkdtemp, realpath, rm} from "node:fs/promises"
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from "node:path"
import {tmpdir} from "node:os"
import {fileURLToPath} from "node:url"
import {
  packageBuildCommand,
  packageProgrammaticBuildPlan,
  type PackageProgrammaticBuildPlan,
  withPackageBuildOutput,
} from "./command"
import type {
  BrowserPackageEnvironment,
  PackageEnvironment,
} from "../../../shared/package/environment"
import type {
  BuildablePackage,
  PackageBuildArtifact,
  PackageBuildOptions,
  PackageBuildReport,
  PackageBuildReportOutput,
  PackageBuildResult,
  PackageOwner,
} from "../shared/contracts"
import {packageArtifact, packageOwner, packageSourceLocation} from "./manifest"
import {artifactResponse} from "./response"
import {cosmosRoot} from "../shared/paths"
import {
  browserPackageSourceMapUrl,
  canonicalizeInlineSourceMap,
  externalizeSourceMap,
  sourceMapArtifact,
} from "./source-map"
import {packageBuildEntrypoints, packageBuildSourceKind} from "./source"
import {
  isGeneratedPackageArtifactKey,
  rootPackageArtifact,
  type PackageArtifactKey,
} from "../../shared/artifact"
import {browserPackageArtifactUrl} from "../../shared/artifact-url"
import {isBrowserPackageEnvironment} from "../../../shared/package/environment"

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
      output:
        | {mode: "single"; artifact: string}
        | {mode: "multi"; outdir: string}
      plan: PackageProgrammaticBuildPlan
      reportDirectory: string
      report: string
      version: string
    }

/** Возвращает env artifact, лениво собирая его при отсутствии или пустом файле. */
export async function packageResponse(
  name: BuildablePackage,
  env?: BrowserPackageEnvironment,
  request?: Request,
) {
  const owner = await packageOwner(name, env)
  let artifact = await packageArtifact(owner.artifact)

  if (!artifact) {
    const result = await buildPackage(name, {env: owner.env})
    if (!result.success) return Response.json(result, {status: 422})

    artifact = await packageArtifact(owner.artifact)
    if (!artifact) {
      const failure = buildContractFailure(result, owner.artifact)
      return Response.json(failure, {status: 422})
    }
  }

  const headers = new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
    "X-Package-Env": owner.env,
    "X-Package-SHA256": artifact.sha256,
    "X-Package-Size": String(artifact.size),
  })
  const sourceMap = await packageArtifact(sourceMapArtifact(artifact.path))
  if (sourceMap) headers.set(
    "SourceMap",
    browserPackageSourceMapUrl(name, owner.env as BrowserPackageEnvironment),
  )
  for (const [header, value] of Object.entries(owner.headers)) headers.set(header, value)
  return await artifactResponse(request, artifact, headers)
}

/** Возвращает внешнюю development source map initial package. */
export async function packageSourceMapResponse(
  name: BuildablePackage,
  env: BrowserPackageEnvironment,
  request?: Request,
) {
  const owner = await packageOwner(name, env)
  const artifact = await packageArtifact(sourceMapArtifact(owner.artifact))
  if (!artifact) return new Response(null, {status: 404})
  return await artifactResponse(request, artifact, new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
  }))
}

/** Разрешает внешнее имя как package с полным browser build contract. */
export async function buildablePackage(
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

/** Resolves a Cosmos package independently of its current environment graph. */
export async function knownPackage(value: string | null): Promise<BuildablePackage | null> {
  if (value === null) return null
  try {
    await packageSourceLocation(value)
    return value
  } catch {
    return null
  }
}

/** Запускает package-owned `scripts.build:<env>`, схлопывая одинаковые pending builds. */
export async function buildPackage(
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
  try {
    const typecheck = await runPackageTypecheck(name, owner)
    if (typecheck.exitCode !== 0) {
      return {
        module: name,
        env: owner.env,
        success: false,
        exitCode: typecheck.exitCode,
        stdout: typecheck.stdout,
        stderr: typecheck.stderr,
        outputs: [],
      }
    }

    const profile = Bun.env.NODE_ENV === "development" ? "development" : "production"
    const execution = await packageBuildExecution(owner, options, profile)
    if (execution.kind === "adapter") reportDirectory = execution.reportDirectory
    debug("сборка artifact начата", {
      artifact: execution.kind === "legacy" ? execution.artifact : execution.output,
      command: execution.command,
      env: owner.env,
      package: name,
      profile: Bun.env.NODE_ENV,
      root: owner.root,
    })

    const child = execution.kind === "legacy"
      ? Bun.spawn(execution.command, {
          cwd: owner.root,
          stdout: "pipe",
          stderr: "pipe",
        })
      : Bun.spawn(execution.command, {
          cwd: owner.root,
          env: {...process.env, NODE_ENV: profile},
          stdin: new Blob([JSON.stringify({
            name,
            env: owner.env,
            version: execution.version,
            loaders: owner.loaders,
            plan: execution.plan,
            plugins: owner.plugins,
            report: execution.report,
            sources: owner.sources,
            output: execution.output,
          })]),
          stdout: "pipe",
          stderr: "pipe",
        })
    const [exitCode, buildStdout, buildStderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    const stdout = `${typecheck.stdout}${buildStdout}`
    const stderr = `${typecheck.stderr}${buildStderr}`

    if (exitCode !== 0) {
      debug("сборка artifact завершилась с ошибкой", {
        env: owner.env,
        error: stderr,
        exitCode,
        package: name,
      })
      return {module: name, env: owner.env, success: false, exitCode, stdout, stderr, outputs: []}
    }

    const outputs = execution.kind === "legacy"
      ? await legacyBuildOutputs(execution.artifact)
      : await adapterBuildOutputs(name, owner, execution)
    if (outputs.length === 0) return buildContractFailure(
      {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs: []},
      execution.kind === "legacy" ? execution.artifact : execution.report,
    )

    debug("сборка artifact завершена", {outputs, env: owner.env, exitCode, package: name})

    return {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs}
  } catch (error) {
    debug("сборка artifact завершилась с ошибкой", {
      env: owner.env,
      error: errorMessage(error),
      exitCode: null,
      package: name,
    })
    return {
      module: name,
      env: owner.env,
      success: false,
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      outputs: [],
    }
  } finally {
    if (reportDirectory !== undefined) await rm(reportDirectory, {recursive: true, force: true})
  }
}

async function packageBuildExecution(
  owner: PackageOwner,
  options: PackageBuildOptions,
  profile: "development" | "production",
): Promise<PackageBuildExecution> {
  if (options.artifact !== undefined && (options.outdir !== undefined || options.version !== undefined))
    throw new Error("Package build artifact cannot be combined with outdir or version")

  const onlyLegacyRoot = owner.sources.length === 1
    && owner.sources[0]?.artifact === rootPackageArtifact
    && owner.plugins.length === 0
  if (onlyLegacyRoot) {
    if (options.outdir !== undefined || options.version !== undefined)
      throw new Error("Legacy package build does not accept outdir or version overrides")
    const artifact = options.artifact ?? owner.artifact
    await mkdir(dirname(artifact), {recursive: true})
    return {
      kind: "legacy",
      artifact,
      command: withPackageBuildOutput(packageBuildCommand(owner.build), artifact),
    }
  }

  const entrypoints = packageBuildEntrypoints(owner.sources)
  const mode = entrypoints.length > 1 ? "multi" : "single"
  const plan = packageProgrammaticBuildPlan(owner.build, profile, mode)
  const version = canonicalBuildVersion(options.version ?? owner.version)
  const completeGraph = owner.sources.length > 1
  if (completeGraph && ((options.outdir === undefined) !== (options.version === undefined)))
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
  if (Bun.env.NODE_ENV === "development") await externalizeSourceMap(artifactPath)
  const artifact = await packageArtifact(artifactPath)
  if (!artifact) return []
  const outputs: PackageBuildArtifact[] = [{
    ...artifact,
    artifact: rootPackageArtifact,
    kind: "entry-point",
    load: "eager",
  }]
  if (Bun.env.NODE_ENV !== "development") return outputs

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

async function adapterBuildOutputs(
  name: string,
  owner: PackageOwner,
  execution: Extract<PackageBuildExecution, {kind: "adapter"}>,
): Promise<PackageBuildArtifact[]> {
  const report = await readPackageBuildReport(execution.report)
  await validateBuildReportPaths(execution, report)
  const bindings = await validateBuildReportGraph(name, owner, execution, report)

  if (Bun.env.NODE_ENV === "development" && execution.plan.mode === "single") {
    for (const {output} of bindings) {
      if (output.kind !== "entry-point" && output.kind !== "chunk") continue
      if (!output.path.endsWith(".js")) continue
      await externalizeSourceMap(output.path)
    }
  } else if (Bun.env.NODE_ENV === "development") {
    const canonicalized = new Set<string>()
    for (const {output} of bindings) {
      if (canonicalized.has(output.path)) continue
      if (output.kind !== "entry-point" && output.kind !== "chunk") continue
      if (!output.path.endsWith(".js")) continue
      canonicalized.add(output.path)
      await canonicalizeInlineSourceMap(output.path)
    }
  }

  const outputs: PackageBuildArtifact[] = []
  const physical = new Map<string, Promise<PackageBuildArtifact | null>>()
  for (const binding of bindings) {
    let artifactRead = physical.get(binding.output.path)
    if (!artifactRead) {
      artifactRead = packageArtifact(binding.output.path)
      physical.set(binding.output.path, artifactRead)
    }
    const artifact = await artifactRead
    if (!artifact) throw new Error(`Package build output is missing: ${binding.output.path}`)
    outputs.push({
      ...artifact,
      artifact: binding.artifact,
      kind: binding.output.kind,
      load: binding.load,
    })
    if (
      Bun.env.NODE_ENV === "development"
      && execution.plan.mode === "single"
      && (binding.output.kind === "entry-point" || binding.output.kind === "chunk")
      && binding.output.path.endsWith(".js")
    ) {
      const mapPath = sourceMapArtifact(binding.output.path)
      const sourceMap = await packageArtifact(mapPath)
      if (!sourceMap) throw new Error(`Package development source map is missing: ${mapPath}`)
      outputs.push({
        ...sourceMap,
        artifact: generatedMapArtifact(`${binding.output.relative}.map`),
        kind: "sourcemap",
        sourceMapFor: binding.artifact,
        load: binding.load,
      })
    }
  }
  return outputs.sort(compareBuildArtifacts)
}

interface PackageBuildBinding {
  artifact: PackageArtifactKey
  load: "eager" | "lazy"
  output: PackageBuildReportOutput
}

async function validateBuildReportGraph(
  name: string,
  owner: PackageOwner,
  execution: Extract<PackageBuildExecution, {kind: "adapter"}>,
  report: PackageBuildReport,
): Promise<PackageBuildBinding[]> {
  const byRelative = new Map<string, PackageBuildReportOutput>()
  const byEntrypoint = new Map<string, PackageBuildReportOutput[]>()
  const byCopySource = new Map<string, PackageBuildReportOutput[]>()
  for (const output of report.outputs) {
    if (byRelative.has(output.relative))
      throw new Error(`Package build report duplicates output ${output.relative}`)
    byRelative.set(output.relative, output)
    if (output.entryPoint !== undefined) {
      const current = byEntrypoint.get(output.entryPoint) ?? []
      current.push(output)
      byEntrypoint.set(output.entryPoint, current)
    }
    if (output.source !== undefined) {
      const current = byCopySource.get(output.source) ?? []
      current.push(output)
      byCopySource.set(output.source, current)
    }
  }

  const external = new Set(report.externalImports.map(({path, kind, external}) => {
    if (!external) throw new Error(`Package build report marks local import as external: ${path}`)
    return `${kind}\u0000${path}`
  }))
  for (const output of report.outputs) {
    for (const imported of output.imports) {
      if (imported.external) {
        if (!external.has(`${imported.kind}\u0000${imported.path}`))
          throw new Error(`Package build output has undeclared external import ${imported.path}`)
      } else if (!byRelative.has(imported.path)) {
        throw new Error(`Package build output import is missing: ${imported.path}`)
      }
    }
  }

  const rootSource = owner.sources.find(({artifact}) => artifact === rootPackageArtifact)?.source
  if (!rootSource) throw new Error("Package build root source is missing")
  const rootOutput = byEntrypoint.get(rootSource)
  if (rootOutput?.length !== 1) throw new Error("Package build root must map to one output")
  const rootClosure = new Set(report.rootClosure)
  if (rootClosure.size !== report.rootClosure.length)
    throw new Error("Package build root closure contains duplicates")
  if (!rootClosure.has(rootOutput[0]!.relative))
    throw new Error("Package build root closure must contain root output")
  for (const relativePath of rootClosure) {
    if (!byRelative.has(relativePath))
      throw new Error(`Package build root closure output is missing: ${relativePath}`)
  }
  const projectedClosure = new Set<string>()
  const pendingClosure = [rootOutput[0]!.relative]
  while (pendingClosure.length > 0) {
    const relativePath = pendingClosure.pop()!
    if (projectedClosure.has(relativePath)) continue
    projectedClosure.add(relativePath)
    const output = byRelative.get(relativePath)!
    for (const imported of output.imports) {
      if (imported.external || imported.kind === "dynamic-import") continue
      if (byRelative.has(imported.path)) pendingClosure.push(imported.path)
    }
  }
  if (JSON.stringify([...projectedClosure].sort()) !== JSON.stringify([...rootClosure].sort()))
    throw new Error("Package build root closure projection differs from output imports")

  const expectedUrls = new Map<string, PackageArtifactKey>()
  if (isBrowserPackageEnvironment(owner.env)) {
    for (const source of owner.sources) {
      if (source.artifact === rootPackageArtifact) continue
      expectedUrls.set(
        browserPackageArtifactUrl(name, owner.env, source.artifact, execution.version),
        source.artifact,
      )
    }
  }
  const rootClosureText = (await Promise.all(report.rootClosure
    .map((relativePath) => Bun.file(byRelative.get(relativePath)!.path).text()))).join("\n")
  const eagerPublic = new Set<PackageArtifactKey>([rootPackageArtifact])
  if (new Set(report.publicArtifactUrls).size !== report.publicArtifactUrls.length)
    throw new Error("Package build report public artifact URLs contain duplicates")
  const recognizedUrls = [...expectedUrls.keys()].filter((url) => rootClosureText.includes(url)).sort()
  if (JSON.stringify(recognizedUrls) !== JSON.stringify([...report.publicArtifactUrls].sort()))
    throw new Error("Package build report public artifact URL projection differs from root closure")
  for (const url of recognizedUrls) {
    const artifact = expectedUrls.get(url)
    if (!artifact) throw new Error(`Package build report has unknown public artifact URL ${url}`)
    eagerPublic.add(artifact)
  }

  const bindings: PackageBuildBinding[] = []
  const claimed = new Set<PackageBuildReportOutput>()
  for (const source of owner.sources) {
    const kind = packageBuildSourceKind(source.source)
    const matches = kind === "copy"
      ? byCopySource.get(source.source)
      : byEntrypoint.get(source.source)
    if (matches?.length !== 1)
      throw new Error(`Package export source must map to one output: ${source.source}`)
    const output = matches[0]!
    claimed.add(output)
    if (source.artifact === rootPackageArtifact) {
      bindings.push({artifact: source.artifact, load: "eager", output})
      continue
    }
    bindings.push({
      artifact: source.artifact,
      load: eagerPublic.has(source.artifact) ? "eager" : "lazy",
      output,
    })
    if (kind !== "copy") {
      const generated = generatedOutputArtifact(output.relative)
      bindings.push({
        artifact: generated,
        load: rootClosure.has(output.relative) ? "eager" : "lazy",
        output,
      })
    }
  }

  for (const output of report.outputs) {
    if (claimed.has(output)) continue
    const artifact = generatedOutputArtifact(output.relative)
    bindings.push({
      artifact,
      load: rootClosure.has(output.relative) ? "eager" : "lazy",
      output,
    })
  }

  const identities = new Set<string>()
  for (const {artifact} of bindings) {
    if (identities.has(artifact)) throw new Error(`Package build duplicates artifact ${artifact}`)
    identities.add(artifact)
  }
  if (!identities.has(rootPackageArtifact)) throw new Error("Package build root artifact is missing")
  return bindings
}

async function validateBuildReportPaths(
  execution: Extract<PackageBuildExecution, {kind: "adapter"}>,
  report: PackageBuildReport,
) {
  const paths = new Set<string>()
  const canonicalRoot = await realpath(execution.output.mode === "multi"
    ? execution.output.outdir
    : dirname(execution.output.artifact))
  for (const output of report.outputs) {
    canonicalReportRelative(output.relative)
    if (paths.has(output.path)) throw new Error(`Package build report duplicates path ${output.path}`)
    paths.add(output.path)
    const allowed = execution.output.mode === "multi"
      ? inside(execution.output.outdir, output.path)
      : output.path === execution.output.artifact
        || inside(join(dirname(execution.output.artifact), ".cosmos"), output.path)
        || inside(join(dirname(execution.output.artifact), "raw"), output.path)
    if (!allowed) throw new Error(`Package build output escapes staging boundary: ${output.path}`)
    if (execution.output.mode === "multi") {
      const actualRelative = relative(execution.output.outdir, output.path).split(sep).join("/")
      if (actualRelative !== output.relative)
        throw new Error(`Package build output relative path differs from staging path: ${output.path}`)
    }
    const canonical = await realpath(output.path)
    if (!inside(canonicalRoot, canonical))
      throw new Error(`Package build output resolves outside staging boundary: ${output.path}`)
  }
}

async function readPackageBuildReport(path: string): Promise<PackageBuildReport> {
  const file = Bun.file(path)
  if (!await file.exists()) throw new Error("Package build report is missing")
  const value = await file.json() as PackageBuildReport
  if (
    typeof value !== "object"
    || value === null
    || !Array.isArray(value.outputs)
    || !Array.isArray(value.externalImports)
    || !Array.isArray(value.rootClosure)
    || !Array.isArray(value.publicArtifactUrls)
  ) throw new Error("Package build report has invalid shape")
  for (const output of value.outputs) {
    if (
      typeof output !== "object"
      || output === null
      || typeof output.path !== "string"
      || typeof output.relative !== "string"
      || !["entry-point", "chunk", "asset", "copy"].includes(output.kind)
      || typeof output.loader !== "string"
      || (output.entryPoint !== undefined && typeof output.entryPoint !== "string")
      || (output.source !== undefined && typeof output.source !== "string")
      || !Array.isArray(output.imports)
    ) throw new Error("Package build report output has invalid shape")
    for (const imported of output.imports) {
      if (
        typeof imported !== "object"
        || imported === null
        || typeof imported.path !== "string"
        || typeof imported.kind !== "string"
        || typeof imported.external !== "boolean"
      ) throw new Error("Package build report import has invalid shape")
    }
  }
  for (const imported of value.externalImports) {
    if (
      typeof imported !== "object"
      || imported === null
      || typeof imported.path !== "string"
      || typeof imported.kind !== "string"
      || imported.external !== true
    ) throw new Error("Package build report external import has invalid shape")
  }
  if (value.rootClosure.some((item) => typeof item !== "string")
    || value.publicArtifactUrls.some((item) => typeof item !== "string"))
    throw new Error("Package build report projection has invalid shape")
  for (const relativePath of value.rootClosure) canonicalReportRelative(relativePath)
  return value
}

function canonicalReportRelative(value: string) {
  if (
    value === ""
    || value.startsWith("/")
    || value.includes("\\")
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) throw new Error(`Package build report relative path is invalid: ${value}`)
  return value
}

function canonicalBuildVersion(value: string) {
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value))
    throw new Error(`Package build version is not canonical SemVer: ${value}`)
  return value
}

function generatedMapArtifact(path: string) {
  const artifact = `./.cosmos/asset/${path.split(sep).join("/")}` as const
  if (!isGeneratedPackageArtifactKey(artifact))
    throw new Error(`Package source map artifact key is invalid: ${artifact}`)
  return artifact
}

function generatedOutputArtifact(path: string) {
  const relativePath = path.split(sep).join("/")
  const rooted = /^(?:entry|chunk|asset)\//.test(relativePath)
    ? relativePath
    : `asset/${relativePath}`
  const artifact = `./.cosmos/${rooted}` as const
  if (!isGeneratedPackageArtifactKey(artifact))
    throw new Error(`Package generated artifact key is invalid: ${artifact}`)
  return artifact
}

function compareBuildArtifacts(left: PackageBuildArtifact, right: PackageBuildArtifact) {
  return (left.artifact ?? "").localeCompare(right.artifact ?? "")
    || left.path.localeCompare(right.path)
}

function inside(root: string, path: string) {
  const pathFromRoot = relative(resolve(root), resolve(path))
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
}

async function packageBuildAdapterEntrypoint() {
  const source = join(dirname(fileURLToPath(import.meta.url)), "adapter.ts")
  if (await Bun.file(source).exists()) return source

  const canonical = join(cosmosRoot, "release/server/package/adapter.ts")
  if (await Bun.file(canonical).exists()) return canonical
  throw new Error("Cosmos package build adapter source is missing")
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
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "run",
    "--silent",
    owner.typecheck,
  ], {
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
    stderr: [result.stderr.trimEnd(), message].filter(Boolean).join("\n"),
    outputs: [],
  }
}

function debug(event: string, details: unknown) {
  if (Bun.env.NODE_ENV === "development")
    console.debug("[@cosmos/release:server:build]", event, details)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
