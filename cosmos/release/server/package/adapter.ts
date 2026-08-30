/**
Изолированный child entrypoint package build plugins.

Parent release process передаёт уже проверенный single-output план через stdin.
Adapter загружает только разрешённые parent-ом modules, запускает один
`Bun.build()` и записывает единственный entry artifact в staging path.

@packageDocumentation
*/
import {pathToFileURL} from "node:url"
import {mkdir} from "node:fs/promises"
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path"
import type {PackageProgrammaticBuildPlan} from "./command"
import type {
  PackageBuildReport,
  PackageBuildReportImport,
  PackageBuildReportOutput,
  PackageBuildSource,
} from "../shared/contracts"
import {packageBuildSourceKind} from "./source"
import {
  isBrowserPackageEnvironment,
  type BrowserPackageEnvironment,
  type PackageEnvironment,
} from "../../../shared/package/environment"
import {
  browserPackageArtifactUrl,
  browserPackageGeneratedPublicPath,
} from "../../shared/artifact-url"

export interface IsolatedPackageBuildRequest {
  readonly name: string
  readonly env: PackageEnvironment
  readonly version: string
  readonly loaders: Readonly<Record<string, Bun.Loader>>
  readonly plan: PackageProgrammaticBuildPlan
  readonly plugins: readonly string[]
  readonly report: string
  readonly sources: readonly PackageBuildSource[]
  readonly output:
    | {readonly mode: "single"; readonly artifact: string}
    | {readonly mode: "multi"; readonly outdir: string}
}

/**
Выполняет один plugin-enabled build вне release server process.

Plugin code имеет обычные права child process, но не получает mutable build
config: entrypoints, profile, resolution conditions и staging destination уже
зафиксированы parent-ом. Multi-entry выполняется только in-memory; child пишет
полученные blobs и raw public files после успешного `Bun.build()`, затем создаёт
временный structural report для parent validation.

@param request - Проверенный build plan и canonical plugin file paths.

@returns Process exit code: `0` только после записи единственного artifact.
*/
export async function runIsolatedPackageBuild(
  request: IsolatedPackageBuildRequest,
): Promise<number> {
  try {
    const plugins = await Promise.all(request.plugins.map(loadPlugin))
    const buildSources = request.sources.filter(({source}) =>
      packageBuildSourceKind(source) !== "copy")
    const copySources = request.sources.filter(({source}) =>
      packageBuildSourceKind(source) === "copy")
    if (buildSources.length !== (request.plan.mode === "single" ? 1 : buildSources.length))
      throw new Error("Package single-entry build must receive one Bun source")

    const multi = request.plan.mode === "multi"
    const publicPath = multi && isBrowserPackageEnvironment(request.env)
      ? browserPackageGeneratedPublicPath(request.name, request.env, request.version)
      : undefined
    const result = await Bun.build({
      entrypoints: buildSources.map(({source}) => source),
      target: request.plan.target,
      conditions: [...request.plan.conditions],
      ...(request.plan.format === undefined ? {} : {format: request.plan.format}),
      ...(request.plan.packages === undefined ? {} : {packages: request.plan.packages}),
      ...(request.plan.external.length === 0 ? {} : {external: [...request.plan.external]}),
      minify: request.plan.minify,
      drop: [...request.plan.drop],
      sourcemap: request.plan.sourcemap,
      loader: {...request.loaders},
      plugins,
      metafile: true,
      ...(multi ? {
        splitting: true,
        root: ".",
        naming: {
          entry: "entry/[hash].[ext]",
          chunk: "chunk/[hash].[ext]",
          asset: "asset/[hash].[ext]",
        },
        ...(publicPath === undefined ? {} : {publicPath}),
        define: {
          "import.meta.env.COSMOS_PACKAGE_NAME": JSON.stringify(request.name),
          "import.meta.env.COSMOS_PACKAGE_ENV": JSON.stringify(request.env),
          "import.meta.env.COSMOS_PACKAGE_VERSION": JSON.stringify(request.version),
        },
      } : {}),
      throw: false,
    })

    for (const log of result.logs) {
      console.error("[@cosmos/release:server:build-adapter]", "Bun build diagnostic", {
        message: String(log),
      })
    }
    if (!result.success) return 1

    if (!result.metafile) throw new Error("Package build metafile is missing")
    const outputs = await writeBuildOutputs(request, result.outputs, result.metafile)
    const copies = await writeRawCopies(request, copySources)
    const externalImports = reportExternalImports(result.metafile)
    const rootProjection = await projectRootClosure(
      request,
      outputs,
      result.outputs,
    )
    const report: PackageBuildReport = {
      outputs: [...outputs, ...copies],
      externalImports,
      rootClosure: rootProjection.outputs,
      publicArtifactUrls: rootProjection.publicArtifactUrls,
    }
    await Bun.write(request.report, `${JSON.stringify(report)}\n`)
    return 0
  } catch (error) {
    console.error("[@cosmos/release:server:build-adapter]", "isolated package build failed", {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    })
    return 1
  }
}

async function writeBuildOutputs(
  request: IsolatedPackageBuildRequest,
  artifacts: readonly Bun.BuildArtifact[],
  metafile: Bun.BuildMetafile,
) {
  const metadata = new Map(Object.entries(metafile.outputs).map(([path, value]) => [
    outputRelative(path),
    value,
  ]))
  const buildSources = request.sources.filter(({source}) =>
    packageBuildSourceKind(source) !== "copy")
  const singleSource = request.output.mode === "single" ? buildSources[0]?.source : undefined
  const outputs: PackageBuildReportOutput[] = []

  for (const artifact of artifacts) {
    if (artifact.kind === "sourcemap" || artifact.kind === "bytecode")
      throw new Error(`Package build output kind is unsupported: ${artifact.kind}`)
    const relativePath = outputRelative(artifact.path)
    const outputMetadata = metadata.get(relativePath)
    if (!outputMetadata) throw new Error(`Package build output metadata is missing: ${relativePath}`)
    const entryPoint = normalizeEntryPoint(outputMetadata.entryPoint)
    const target = request.output.mode === "multi"
      ? join(request.output.outdir, relativePath)
      : entryPoint === singleSource
        ? request.output.artifact
        : join(dirname(request.output.artifact), ".cosmos", relativePath)
    await mkdir(dirname(target), {recursive: true})
    await Bun.write(target, artifact)
    outputs.push({
      path: target,
      relative: relativePath,
      kind: artifact.kind,
      loader: artifact.loader,
      ...(entryPoint === undefined ? {} : {entryPoint}),
      imports: outputMetadata.imports.map(reportImport),
    })
  }
  return outputs
}

async function writeRawCopies(
  request: IsolatedPackageBuildRequest,
  sources: readonly PackageBuildSource[],
) {
  const outputRoot = request.output.mode === "multi"
    ? request.output.outdir
    : dirname(request.output.artifact)
  return await Promise.all(sources.map(async ({artifact, source}) => {
    const relativePath = `raw/${artifact.slice(artifact === "." ? 1 : 2)}`
    const target = join(outputRoot, relativePath)
    await mkdir(dirname(target), {recursive: true})
    await Bun.write(target, Bun.file(resolve(source)))
    return {
      path: target,
      relative: relativePath,
      kind: "copy" as const,
      loader: "file",
      source,
      imports: [],
    }
  }))
}

function reportExternalImports(metafile: Bun.BuildMetafile) {
  const imports = new Map<string, PackageBuildReportImport>()
  for (const input of Object.values(metafile.inputs)) {
    for (const value of input.imports) {
      if (!value.external) continue
      const key = `${value.kind}\u0000${value.path}`
      imports.set(key, {path: value.path, kind: value.kind, external: true})
    }
  }
  return [...imports.values()].sort((left, right) =>
    left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind))
}

async function projectRootClosure(
  request: IsolatedPackageBuildRequest,
  reportOutputs: readonly PackageBuildReportOutput[],
  artifacts: readonly Bun.BuildArtifact[],
) {
  const rootSource = request.sources.find(({artifact}) => artifact === ".")?.source
  const rootOutput = reportOutputs.find(({entryPoint}) => entryPoint === rootSource)
  if (!rootOutput) throw new Error("Package build root output is missing")
  const byRelative = new Map(reportOutputs.map((output) => [output.relative, output]))
  const blobs = new Map(artifacts.map((artifact) => [outputRelative(artifact.path), artifact]))
  const closure = new Set<string>()
  const pending = [rootOutput.relative]
  while (pending.length > 0) {
    const relativePath = pending.pop()!
    if (closure.has(relativePath)) continue
    closure.add(relativePath)
    const output = byRelative.get(relativePath)
    if (!output) continue
    for (const imported of output.imports) {
      if (imported.external || imported.kind === "dynamic-import") continue
      if (byRelative.has(imported.path)) pending.push(imported.path)
    }
  }
  const source = (await Promise.all([...closure].map((path) => blobs.get(path)?.text())))
    .filter((value): value is string => value !== undefined)
    .join("\n")
  const publicArtifactUrls = isBrowserPackageEnvironment(request.env)
    ? request.sources
        .filter(({artifact}) => artifact !== ".")
        .map(({artifact}) => browserPackageArtifactUrl(
          request.name,
          request.env as BrowserPackageEnvironment,
          artifact,
          request.version,
        ))
        .filter((url) => source.includes(url))
        .sort()
    : []
  return {outputs: [...closure].sort(), publicArtifactUrls}
}

function reportImport(value: Bun.BuildMetafile["outputs"][string]["imports"][number]) {
  const external = "external" in value && value.external === true
  return {
    path: external ? value.path : outputRelative(value.path),
    kind: value.kind,
    external,
  }
}

function normalizeEntryPoint(value: string | undefined) {
  if (value === undefined) return undefined
  const path = isAbsolute(value) ? value : resolve(value)
  const fromRoot = relative(process.cwd(), path)
  if (fromRoot === "" || fromRoot.startsWith("..") || isAbsolute(fromRoot))
    throw new Error(`Package build entrypoint escapes package root: ${value}`)
  return `./${fromRoot.split(sep).join("/")}`
}

function outputRelative(value: string) {
  const normalized = value.replace(/^(?:\.\/)+/, "").split(sep).join("/")
  if (
    normalized === ""
    || normalized.startsWith("../")
    || isAbsolute(normalized)
    || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) throw new Error(`Package build output path is invalid: ${value}`)
  return normalized
}

async function loadPlugin(path: string): Promise<Bun.BunPlugin> {
  const module = await import(pathToFileURL(path).href)
  const plugin = module.default as Partial<Bun.BunPlugin> | undefined
  if (
    typeof plugin !== "object"
    || plugin === null
    || typeof plugin.name !== "string"
    || plugin.name.trim() === ""
    || typeof plugin.setup !== "function"
  ) throw new Error(`Build plugin must default export a Bun plugin: ${path}`)
  return protectBuildPlan(plugin as Bun.BunPlugin)
}

function protectBuildPlan(plugin: Bun.BunPlugin): Bun.BunPlugin {
  return {
    name: plugin.name,
    ...(plugin.target === undefined ? {} : {target: plugin.target}),
    setup(builder) {
      return plugin.setup(readonlyBuilder(builder))
    },
  }
}

function readonlyBuilder(builder: Bun.PluginBuilder): Bun.PluginBuilder {
  const values = new WeakMap<object, object>()
  let proxy!: Bun.PluginBuilder
  proxy = new Proxy(builder, {
    get(target, property, receiver) {
      if (property === "config") return readonlyValue(target.config, values)
      const value = Reflect.get(target, property, receiver) as unknown
      if (typeof value !== "function") return value
      return (...args: unknown[]) => {
        const result = Reflect.apply(value, target, args)
        return result === target ? proxy : result
      }
    },
    set() {
      throw new Error("Package build plugin cannot modify the validated build plan")
    },
    defineProperty() {
      throw new Error("Package build plugin cannot modify the validated build plan")
    },
    deleteProperty() {
      throw new Error("Package build plugin cannot modify the validated build plan")
    },
  })
  return proxy
}

function readonlyValue<T extends object>(value: T, values: WeakMap<object, object>): T {
  const existing = values.get(value)
  if (existing) return existing as T
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      const nested = Reflect.get(target, property, receiver) as unknown
      return typeof nested === "object" && nested !== null
        ? readonlyValue(nested, values)
        : nested
    },
    set() {
      throw new Error("Package build plugin cannot modify the validated build plan")
    },
    defineProperty() {
      throw new Error("Package build plugin cannot modify the validated build plan")
    },
    deleteProperty() {
      throw new Error("Package build plugin cannot modify the validated build plan")
    },
  })
  values.set(value, proxy)
  return proxy
}

if (import.meta.main) {
  let request: IsolatedPackageBuildRequest
  try {
    request = JSON.parse(await Bun.stdin.text()) as IsolatedPackageBuildRequest
  } catch (error) {
    console.error("[@cosmos/release:server:build-adapter]", "package build request invalid", {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
  process.exit(await runIsolatedPackageBuild(request))
}
