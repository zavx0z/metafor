import {lstat, realpath} from "node:fs/promises"
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path"
import type {PackageBuildArtifact, PackageBuildReport, PackageBuildReportOutput, PackageOwner} from "./contracts"
import {packageArtifact} from "./manifest"
import {packageProgrammaticBuildPlan} from "./command"
import {builtinModules} from "node:module"
import {externalizeSourceMap, sourceMapArtifact} from "./source-map"
import {packageBuildEntrypoints, packageBuildSourceKind} from "./source"
import {isGeneratedPackageArtifactKey, rootPackageArtifact, type PackageArtifactKey} from "./identity/artifact"
import {browserPackageArtifactUrl} from "./identity/artifact-url"
import {isBrowserPackageEnvironment} from "./identity/environment"
import {preparedFileRelative, type PreparedDependencyGraph} from "./prepared"

/** Проверенная цель дочернего compiler; не является publication state. */
export interface PackageBuildOutputTarget {
  readonly output: {readonly mode: "single"; readonly artifact: string} | {readonly mode: "multi"; readonly outdir: string}
  readonly version: string
  readonly preparedDependencies?: readonly PreparedDependencyGraph[]
}

/**
Проверяет отчёт compiler, физические файлы и весь граф до вычисления integrity.

Отказ оставляет публикацию потребителю и не возвращает частичный граф.
Development JavaScript получает проверенную внешнюю companion map.
Повреждённые отчёты проверяются тем же API в `spec/failures.spec.ts`.
*/
export async function validatePackageBuildOutputs(
  name: string,
  owner: PackageOwner,
  execution: PackageBuildOutputTarget,
  report: PackageBuildReport,
  profile: "development" | "production",
): Promise<PackageBuildArtifact[]> {
  validatePackageBuildReport(report)
  await validateBuildReportPaths(execution, report)
  const bindings = await validateBuildReportGraph(name, owner, execution, report)
  const prepared = new Map((execution.preparedDependencies ?? []).flatMap(graph => graph.files.map(file =>
    [preparedFileRelative(graph, file.path), {
      ...file, imports: file.imports.map(edge => ({...edge, path: preparedFileRelative(graph, edge.path)})),
    }] as const,
  )))
  for (const [relative, file] of prepared) {
    const output = report.outputs.find(output => output.relative === relative)
    if (!output || (await packageArtifact(output.path))?.sha256 !== file.digest)
      throw new Error(`Prepared output digest differs: ${relative}`)
    if (output.entryPoint !== undefined || output.source !== undefined ||
        JSON.stringify(output.imports) !== JSON.stringify(file.imports))
      throw new Error(`Prepared output import graph differs: ${relative}`)
  }

  if (profile === "development") {
    const canonicalized = new Set<string>()
    for (const {output} of bindings) {
      if (canonicalized.has(output.path)) continue
      if (prepared.has(output.relative)) continue
      if (output.kind !== "entry-point" && output.kind !== "chunk") continue
      if (!output.path.endsWith(".js")) continue
      canonicalized.add(output.path)
      await externalizeSourceMap(output.path)
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
      profile === "development" &&
      !prepared.has(binding.output.relative) &&
      (binding.output.kind === "entry-point" || binding.output.kind === "chunk") &&
      binding.output.path.endsWith(".js")
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
  execution: PackageBuildOutputTarget,
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

  const plan = packageProgrammaticBuildPlan(
    owner.build,
    "production",
    packageBuildEntrypoints(owner.sources).length > 1 ? "multi" : "single",
  )
  const manifest = await Bun.file(owner.manifest).json()
  const runtimeDependencies = Object.keys(manifest.dependencies ?? {})
  const external = new Set(
    report.externalImports.map(({path, kind, external}) => {
      if (!external)
        throw new Error(`Package build report marks local import as external: ${path}`)
      return `${kind}\u0000${path}`
    }),
  )
  for (const output of report.outputs) {
    for (const imported of output.imports) {
      if (imported.external) {
        const path = imported.path
        const builtin = !isBrowserPackageEnvironment(owner.env) && (
          path === "bun" ||
          path.startsWith("bun:") ||
          builtinModules.includes(path) ||
          builtinModules.includes(path.replace(/^node:/, ""))
        )
        const declared = plan.external.some((pattern) => externalMatches(pattern, path)) || (
          plan.packages === "external" &&
          runtimeDependencies.some((name) => path === name || path.startsWith(`${name}/`))
        )
        if (!builtin && !declared)
          throw new Error(`Package build report has undeclared external import ${path}`)
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
  const rootClosureText = (
    await Promise.all(
      report.rootClosure.map((relativePath) =>
        Bun.file(byRelative.get(relativePath)!.path).text(),
      ),
    )
  ).join("\n")
  const eagerPublic = new Set<PackageArtifactKey>([rootPackageArtifact])
  if (new Set(report.publicArtifactUrls).size !== report.publicArtifactUrls.length)
    throw new Error("Package build report public artifact URLs contain duplicates")
  const recognizedUrls = [...expectedUrls.keys()]
    .filter((url) => rootClosureText.includes(url))
    .sort()
  if (JSON.stringify(recognizedUrls) !== JSON.stringify([...report.publicArtifactUrls].sort()))
    throw new Error(
      "Package build report public artifact URL projection differs from root closure",
    )
  for (const url of recognizedUrls) {
    const artifact = expectedUrls.get(url)
    if (!artifact) throw new Error(`Package build report has unknown public artifact URL ${url}`)
    eagerPublic.add(artifact)
  }

  const bindings: PackageBuildBinding[] = []
  const claimed = new Set<PackageBuildReportOutput>()
  for (const source of owner.sources) {
    const kind = packageBuildSourceKind(source.source)
    const matches =
      kind === "copy" ? byCopySource.get(source.source) : byEntrypoint.get(source.source)
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
  if (!identities.has(rootPackageArtifact))
    throw new Error("Package build root artifact is missing")
  return bindings
}

async function validateBuildReportPaths(
  execution: PackageBuildOutputTarget,
  report: PackageBuildReport,
) {
  const paths = new Set<string>()
  const canonicalRoot = await realpath(
    execution.output.mode === "multi"
      ? execution.output.outdir
      : dirname(execution.output.artifact),
  )
  for (const output of report.outputs) {
    canonicalReportRelative(output.relative)
    if (paths.has(resolve(output.path)))
      throw new Error(`Package build report duplicates path ${output.path}`)
    paths.add(resolve(output.path))
    const allowed =
      execution.output.mode === "multi"
        ? inside(execution.output.outdir, output.path)
        : output.path === execution.output.artifact ||
          inside(join(dirname(execution.output.artifact), ".cosmos"), output.path) ||
          inside(join(dirname(execution.output.artifact), "raw"), output.path)
    if (!allowed) throw new Error(`Package build output escapes staging boundary: ${output.path}`)
    if (execution.output.mode === "multi") {
      const actualRelative = relative(execution.output.outdir, output.path).split(sep).join("/")
      if (actualRelative !== output.relative)
        throw new Error(
          `Package build output relative path differs from staging path: ${output.path}`,
        )
    }
    if (!(await lstat(output.path)).isFile())
      throw new Error(`Package build output is not a regular file: ${output.path}`)
    const canonical = await realpath(output.path)
    if (!inside(canonicalRoot, canonical))
      throw new Error(`Package build output resolves outside staging boundary: ${output.path}`)
  }
}

function validatePackageBuildReport(value: PackageBuildReport) {
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray(value.outputs) ||
    !Array.isArray(value.externalImports) ||
    !Array.isArray(value.rootClosure) ||
    !Array.isArray(value.publicArtifactUrls)
  )
    throw new Error("Package build report has invalid shape")
  for (const output of value.outputs) {
    if (
      typeof output !== "object" ||
      output === null ||
      typeof output.path !== "string" ||
      typeof output.relative !== "string" ||
      !["entry-point", "chunk", "asset", "copy"].includes(output.kind) ||
      typeof output.loader !== "string" ||
      (output.entryPoint !== undefined && typeof output.entryPoint !== "string") ||
      (output.source !== undefined && typeof output.source !== "string") ||
      !Array.isArray(output.imports)
    )
      throw new Error("Package build report output has invalid shape")
    for (const imported of output.imports) {
      if (
        typeof imported !== "object" ||
        imported === null ||
        typeof imported.path !== "string" ||
        typeof imported.kind !== "string" ||
        typeof imported.external !== "boolean"
      )
        throw new Error("Package build report import has invalid shape")
    }
  }
  for (const imported of value.externalImports) {
    if (
      typeof imported !== "object" ||
      imported === null ||
      typeof imported.path !== "string" ||
      typeof imported.kind !== "string" ||
      imported.external !== true
    )
      throw new Error("Package build report external import has invalid shape")
  }
  if (
    value.rootClosure.some((item) => typeof item !== "string") ||
    value.publicArtifactUrls.some((item) => typeof item !== "string")
  )
    throw new Error("Package build report projection has invalid shape")
  for (const relativePath of value.rootClosure) canonicalReportRelative(relativePath)
}

function canonicalReportRelative(value: string) {
  if (
    value === "" ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new Error(`Package build report relative path is invalid: ${value}`)
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
  return (
    (left.artifact ?? "").localeCompare(right.artifact ?? "") ||
    left.path.localeCompare(right.path)
  )
}

function inside(root: string, path: string) {
  const pathFromRoot = relative(resolve(root), resolve(path))
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
}

function externalMatches(pattern: string, path: string) {
  if (!pattern.includes("*")) return path === pattern || path.startsWith(`${pattern}/`)
  const escaped = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")
  return new RegExp(`^${escaped}$`).test(path)
}
