/**
Meta preparation evaluates the original declaration before compiling action
modules. Serialized callbacks remain source strings; Bun never rewrites their
closures. Outputs use the ordinary package artifact graph and integrity checks,
ready for existing release/storage owners. No publication or version mutation.
@packageDocumentation
*/
import {mkdir, mkdtemp, readFile, readdir, realpath, rename, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"
import {metaPackageScope, resolveMetaDependency} from "./meta-imports"
import {packageExportGraph} from "./export-graph"
import {packageVersionArtifactPath} from "./identity/artifact-path"
import {isPackageExportSubpath, type PublicPackageArtifactKey} from "./identity/artifact"
import {packagePublicArtifactOutput} from "./source"
import {extname} from "node:path"
import {packageBuildSourceKind} from "./source"
import {readPackageBuildConfigurations} from "./config"
import {packageProgrammaticBuildPlan} from "./command"
import {validatePackageBuildOutputs} from "./report"
import type {PackageBuildReport, PackageBuildResult, PackageManifest, PackageOwner} from "./contracts"

/** Caller supplies the owning DSL evaluator; preparation does not execute actions. */
export interface PrepareMetaPackageOptions {
  readonly root: string
  readonly address: string
  readonly outdir: string
  /** Structural declarations use ./meta; Meta-only roots require explicit selection. */
  readonly metaArtifact?: "./meta" | "."
  readonly version?: string
  readonly readDeclaration: (sourcePath: string) => unknown | Promise<unknown>
}

export interface PreparedMetaPackage {
  readonly address: string
  readonly version: string
  readonly sourceRevision: string
  readonly metaArtifact: "./meta" | "."
  readonly owner: PackageOwner
  readonly result: PackageBuildResult
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Meta declaration must be an object")
  return value as Record<string, unknown>
}
const jsonDeclaration = (value: unknown): Record<string, unknown> => object(JSON.parse(JSON.stringify(value, (_key, item) => {
  if (typeof item === "function" || typeof item === "symbol" || typeof item === "bigint" ||
    (typeof item === "number" && !Number.isFinite(item))) throw new Error("Meta declaration is not serializable")
  return item
})))
const revision = (bytes: string) => `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`

/**
Prepares the public `./meta` declaration without replacing the package product
root or its server exports. Identity is exactly package.json#name. A Meta-only
root requires explicit `metaArtifact: "."`. The evaluator evaluates the original
declaration once; actions are compiled but never executed during preparation.
Explicit public aliases targeting this exact declaration source receive the same
inert data from that evaluation. This exception belongs only to the selected
Meta declaration; ordinary product source aliases retain their rejection.

Local action roots must be exported scripts. Bare action roots must be public
exports of direct runtime dependencies; they become private generated outputs,
not new public aliases or runtime wrappers. Serialized imports bind to immutable
compiled paths relative to the installed package version directory. Installed
resolvers use that directory as action base and select `metaArtifact` as entry.
Plugins, loaders, typecheck, integrity and immutable storage retain their usual
owners. Preparation changes no source manifest or published version.

[Tests](./spec/meta.spec.ts) execute installed product and actions after deleting
sources, including handlers, resources, shared state and immutable conflicts.
*/
export async function prepareMetaPackage(options: PrepareMetaPackageOptions): Promise<PreparedMetaPackage> {
  const scope = metaPackageScope(options.address)
  const root = await realpath(options.root)
  const manifestPath = join(root, "package.json")
  const manifest = object(JSON.parse(await readFile(manifestPath, "utf8"))) as PackageManifest
  const name = options.address
  if (manifest.name !== name) throw new Error("Meta package manifest identity differs from canonical src")
  const version = options.version ?? manifest.version
  if (typeof version !== "string" || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) throw new Error("Invalid Meta package version")
  const exports = object(manifest.exports)
  const metaArtifact = options.metaArtifact ?? "./meta"
  const selected = exports[metaArtifact]
  const metaSource = typeof selected === "string" ? selected : selected && object(selected)[`${scope}:server`]
  if (typeof metaSource !== "string" || !metaSource.startsWith("./")) throw new Error("Meta package must explicitly export its original declaration")
  const product = exports["."]
  const normalized = {...manifest, exports: {...exports, ".": typeof product === "string" ? {[`${scope}:server`]: product} : product}}
  const aliases: PublicPackageArtifactKey[] = []
  for (const [artifact, target] of Object.entries(normalized.exports)) {
    const source = typeof target === "string" ? target : target && typeof target === "object" ? object(target)[`${scope}:server`] : undefined
    if (source !== metaSource) continue
    if (artifact !== "." && !isPackageExportSubpath(artifact)) throw new Error("Meta declaration alias must be an exact public artifact")
    aliases.push(artifact)
  }
  // Ordinary exports forbid one source under multiple public identities. Only
  // explicitly selected declaration aliases share an evaluated inert input.
  const representative = aliases.includes(".") ? "." : metaArtifact
  const distinctExports: Record<string, unknown> = {...normalized.exports}
  for (const artifact of aliases) {
    if (artifact === representative) continue
    const target = distinctExports[artifact]
    if (target && typeof target === "object") {
      const remainder = {...object(target)}
      delete remainder[`${scope}:server`]
      if (Object.keys(remainder).length) {distinctExports[artifact] = remainder; continue}
    }
    delete distinctExports[artifact]
  }
  const graph = (await packageExportGraph(root, {...normalized, exports: distinctExports})).filter(item => item.env === "server")
  const declarationEntry = graph.find(item => item.artifact === representative)
  if (!declarationEntry) throw new Error("Meta declaration has no public server export")
  for (const artifact of aliases) if (artifact !== representative) graph.push({...declarationEntry, artifact})
  const sourcePath = resolve(root, metaSource)
  if (!graph.some(item => item.artifact === metaArtifact && resolve(root, item.source) === sourcePath)) throw new Error("Meta declaration has no public server export")
  const before = await readFile(sourcePath, "utf8")
  const declaration = jsonDeclaration(await options.readDeclaration(sourcePath))
  if (typeof declaration.name !== "string" || !Array.isArray(declaration.fields) || !Array.isArray(declaration.superposition)) throw new Error("Meta evaluator did not return normalized DSL")
  if (await readFile(sourcePath, "utf8") !== before) throw new Error("Meta source changed during declaration evaluation")
  const outdir = resolve(options.outdir)
  if (outdir === root) throw new Error("Meta staging outdir must differ from source root")
  await mkdir(outdir, {recursive: true})
  if ((await readdir(outdir)).length > 0) throw new Error("Meta staging outdir must be empty")
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "metafor-meta-preparation-")))
  try {
    const generated = join(temporary, "declaration.ts")
    await Bun.write(generated, `export default ${JSON.stringify(declaration)}\n`)
    const sources = graph.map(item => ({artifact: item.artifact, source: aliases.includes(item.artifact) ? generated : item.source}))
    const resolvedImports = new Map<string, string>()
    const exportedScripts = new Set(graph.filter(item => !aliases.includes(item.artifact) && packageBuildSourceKind(item.source) === "script").map(item => resolve(root, item.source)))
    const privateEntrypoints = new Set<string>()
    const conditions = new Set([`${scope}:server`])
    for (const specifier of metaExecutableImports(declaration)) {
      let path: string
      if (specifier.startsWith(".")) {
        path = resolve(root, specifier)
        const suffix = relative(root, path)
        if (suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) throw new Error("Serialized Meta import escapes source root")
        if (!exportedScripts.has(path)) throw new Error(`Serialized Meta import is not an exported script: ${specifier}`)
      } else {
        path = await resolveMetaDependency(root, manifest, specifier)
        if (packageBuildSourceKind(path) !== "script") throw new Error(`Serialized Meta dependency is not a script: ${specifier}`)
        if (!exportedScripts.has(path)) privateEntrypoints.add(path)
        conditions.add(`${metaPackageScope(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!)}:server`)
      }
      resolvedImports.set(specifier, path)
    }
    const configuration = (await readPackageBuildConfigurations(root, normalized, ["server"])).get("server")
    const multi = sources.filter(item => packageBuildSourceKind(item.source) !== "copy").length + privateEntrypoints.size > 1
    const build = `bun build ./server/index.ts ${[...conditions].map(condition => `--conditions=${condition}`).join(" ")} --target=bun --format=esm --production --minify ${multi ? "--outdir=dist/server --splitting" : "--outfile=dist/server.js"}`
    const owner: PackageOwner = {
      root, manifest: manifestPath, env: "server", entrypoint: sources.find(source => source.artifact === ".")!.source,
      artifact: join(root, "dist/server.js"), sources, build,
      loaders: configuration?.loaders ?? {}, plugins: configuration?.plugins ?? [],
      typecheck: "typecheck", version,
    }
    if (typeof manifest.scripts?.typecheck === "string") {
      const child = Bun.spawn([process.execPath, "run", "--silent", "typecheck"], {cwd: root, stdout: "pipe", stderr: "pipe"})
      const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      if (exitCode !== 0) return {address: options.address, version, sourceRevision: revision(before), metaArtifact, owner,
        result: {module: name, env: "server", success: false, stage: "typecheck", exitCode, stdout, stderr, outputs: []}}
    }
    const reportPath = join(temporary, "report.json")
    const plan = packageProgrammaticBuildPlan(build, "production", multi ? "multi" : "single")
    // The adapter always receives a graph outdir; single-script Meta still has a root.
    const request = {
      name, env: "server", version, sources, privateEntrypoints: [...privateEntrypoints], loaders: owner.loaders, plugins: owner.plugins, plan,
      report: reportPath, output: {mode: "multi", outdir},
    }
    const child = Bun.spawn([process.execPath, fileURLToPath(import.meta.resolve("@metafor/tech-build/adapter"))], {
      cwd: root, stdin: new Blob([JSON.stringify(request)]), stdout: "pipe", stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    if (exitCode !== 0) return {address: options.address, version, sourceRevision: revision(before), metaArtifact, owner,
      result: {module: name, env: "server", success: false, stage: "compiler", exitCode, stdout, stderr, outputs: []}}
    const report = await Bun.file(reportPath).json() as PackageBuildReport
    const compiled = new Map<string, string>()
    for (const [specifier, path] of resolvedImports) {
      const output = report.outputs.find(output => output.entryPoint !== undefined && resolve(root, output.entryPoint) === path)
      if (!output) throw new Error(`Compiled Meta action root is missing: ${specifier}`)
      const publicSource = sources.find(source => source.artifact !== metaArtifact && resolve(root, source.source) === path)
      compiled.set(specifier, publicSource
        ? `./${packageVersionArtifactPath("server", publicSource.artifact, publicSource.artifact === "." ? undefined : extname(packagePublicArtifactOutput(publicSource.artifact, publicSource.source)))}`
        : `./.cosmos/server/${output.relative}`)
    }
    rewriteMetaExecutableImports(declaration, compiled)
    const metaOutput = report.outputs.find(output => output.entryPoint === generated)
    if (!metaOutput) throw new Error("Compiled Meta declaration is missing")
    // Inert declaration bytes have no compiler imports. Its private alias must
    // not inherit the random temporary evaluator filename in Bun's entry hash.
    const previousMetaRelative = metaOutput.relative
    const metaRelative = "entry/meta-declaration.js"
    if (report.outputs.some(output => output !== metaOutput && output.relative === metaRelative)) throw new Error("Meta declaration output collision")
    const metaPath = join(outdir, metaRelative)
    await mkdir(dirname(metaPath), {recursive: true})
    await rename(metaOutput.path, metaPath)
    metaOutput.path = metaPath
    metaOutput.relative = metaRelative
    report.rootClosure = report.rootClosure.map(path => path === previousMetaRelative ? metaRelative : path)
    await Bun.write(metaOutput.path, `export default ${JSON.stringify(declaration)}\n`)
    const outputs = await validatePackageBuildOutputs(name, owner, {output: {mode: "multi", outdir}, version}, report, "production")
    return {address: options.address, version, sourceRevision: revision(before), metaArtifact, owner,
      result: {module: name, env: "server", success: true, exitCode, stdout, stderr, outputs}}
  } finally { await rm(temporary, {recursive: true, force: true}) }
}

function executableRecords(declaration: Record<string, unknown>) {
  const records: Array<{record: Record<string, unknown>; key: string; direct?: true}> = []
  for (const raw of Array.isArray(declaration.processes) ? declaration.processes : []) {
    const process = object(object(raw).declaration)
    if (process.type === "action") {
      const action = object(process.action)
      records.push({record: action, key: "src", direct: true}, {record: action, key: "wrapperSrc"})
      if (process.success) records.push({record: object(process.success), key: "src"})
      if (process.error) records.push({record: object(process.error), key: "src"})
    } else if (process.type === "finally" && process.before) records.push({record: object(process.before), key: "src"})
  }
  for (const raw of Array.isArray(declaration.reactions) ? declaration.reactions : []) records.push({record: object(raw), key: "src"})
  return records
}
const dynamicImport = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g
function metaExecutableImports(declaration: Record<string, unknown>) {
  const imports = new Set<string>()
  for (const {record, key, direct} of executableRecords(declaration)) {
    const value = record[key]
    if (typeof value !== "string" || !value) continue
    if (direct) imports.add(value)
    else {
      for (const match of value.matchAll(dynamicImport)) imports.add(match[2]!)
      if (/\bimport\s*\(/.test(value.replace(dynamicImport, ""))) throw new Error("Serialized Meta imports must use exact literal public module references")
    }
  }
  return imports
}
function rewriteMetaExecutableImports(declaration: Record<string, unknown>, compiled: ReadonlyMap<string, string>) {
  for (const {record, key, direct} of executableRecords(declaration)) {
    const value = record[key]
    if (typeof value !== "string" || !value) continue
    record[key] = direct ? compiled.get(value)! : value.replace(dynamicImport,
      (_match, _quote, specifier: string) => `import(${JSON.stringify(compiled.get(specifier))})`)
  }
}
