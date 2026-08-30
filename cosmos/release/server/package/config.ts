import {stat, realpath} from "node:fs/promises"
import {dirname, isAbsolute, join, relative, resolve} from "node:path"
import type {PackageEnvironment} from "../../../shared/package/environment"
import type {PackageManifest} from "../shared/contracts"

const buildPluginLimit = 16
const supportedLoaders = new Set<Bun.Loader>([
  "css",
  "file",
  "html",
  "js",
  "json",
  "jsonc",
  "jsx",
  "napi",
  "text",
  "toml",
  "ts",
  "tsx",
  "wasm",
  "xml",
  "yaml",
])

/** Точные loaders и plugin files одного opt-in package environment. */
export interface PackageBuildEnvironmentConfiguration {
  readonly loaders: Readonly<Record<string, Bun.Loader>>
  readonly plugins: readonly string[]
}

/**
Читает только package-owned расширение production build из локального
`bunfig.toml` и разрешает plugin modules до точных файлов.

Отсутствие таблицы сохраняет прямой `bun build` без adapter. Relative plugin
остаётся внутри package root; bare specifier обязан принадлежать прямой
dependency и разрешаться через её public exports. Остальные разделы Bun не
становятся состоянием release и этим parser не переопределяются.

@param root - Real package root, содержащий `package.json` и локальный
  `bunfig.toml`.
@param manifest - Свежепрочитанный package manifest; dependencies используются
  только как разрешённая build-time граница bare plugins.
@param environments - Полный набор environments из conditional exports этого
  же свежего manifest.

@returns Конфигурации только тех environments, которые opt-in к plugin adapter.

@throws Если TOML имеет неизвестную форму, environment отсутствует в exports,
  plugin выходит из package/dependency boundary либо specifier не разрешается.
*/
export async function readPackageBuildConfigurations(
  root: string,
  manifest: PackageManifest,
  environments: readonly PackageEnvironment[],
): Promise<ReadonlyMap<PackageEnvironment, PackageBuildEnvironmentConfiguration>> {
  const path = join(root, "bunfig.toml")
  const source = Bun.file(path)
  if (!await source.exists()) return new Map()

  const parsed = record(Bun.TOML.parse(await source.text()), "bunfig.toml must contain tables")
  const loaders = parseLoaders(parsed.loader)
  const configurations = new Map<PackageEnvironment, PackageBuildEnvironmentConfiguration>(
    environments.map((environment) => [
      environment,
      Object.freeze({loaders, plugins: Object.freeze([])}),
    ]),
  )
  const cosmosValue = parsed.cosmos
  if (cosmosValue === undefined) return configurations

  const cosmos = exactRecord(cosmosValue, ["package-build"], "bunfig.toml cosmos")
  const packageBuild = exactRecord(
    cosmos["package-build"],
    ["environments"],
    "bunfig.toml cosmos.package-build",
  )
  const configuredEnvironments = record(
    packageBuild.environments,
    "bunfig.toml cosmos.package-build.environments must be a table",
  )
  if (Object.keys(configuredEnvironments).length === 0)
    throw new Error("bunfig.toml package build must configure at least one environment")

  const allowedEnvironments = new Set(environments)
  for (const [name, value] of Object.entries(configuredEnvironments)) {
    if (!allowedEnvironments.has(name as PackageEnvironment))
      throw new Error(`bunfig.toml package build configures unsupported environment ${name}`)
    const environment = name as PackageEnvironment
    const table = exactRecord(
      value,
      ["plugins"],
      `bunfig.toml cosmos.package-build.environments.${environment}`,
    )
    const specifiers = stringArray(
      table.plugins,
      `bunfig.toml ${environment} plugins must be a non-empty string array`,
    )
    if (specifiers.length > buildPluginLimit)
      throw new Error(`bunfig.toml ${environment} plugins exceed limit ${buildPluginLimit}`)
    if (new Set(specifiers).size !== specifiers.length)
      throw new Error(`bunfig.toml ${environment} plugins must be unique`)

    const plugins = await Promise.all(specifiers.map((specifier) =>
      resolveBuildPlugin(root, manifest, specifier)))
    if (new Set(plugins).size !== plugins.length)
      throw new Error(`bunfig.toml ${environment} plugins resolve to duplicate modules`)
    configurations.set(environment, Object.freeze({loaders, plugins: Object.freeze(plugins)}))
  }

  return configurations
}

function parseLoaders(value: unknown): Readonly<Record<string, Bun.Loader>> {
  if (value === undefined) return Object.freeze({})
  const source = record(value, "bunfig.toml loader must be a table")
  const loaders: Record<string, Bun.Loader> = {}
  for (const [extension, loader] of Object.entries(source)) {
    if (!/^\.[a-z0-9][a-z0-9._+-]*$/i.test(extension))
      throw new Error(`bunfig.toml loader extension is invalid: ${extension}`)
    if (typeof loader !== "string" || !supportedLoaders.has(loader as Bun.Loader))
      throw new Error(`bunfig.toml loader is unsupported for ${extension}: ${String(loader)}`)
    loaders[extension] = loader as Bun.Loader
  }
  return Object.freeze(loaders)
}

async function resolveBuildPlugin(
  root: string,
  manifest: PackageManifest,
  specifier: string,
) {
  const canonicalRoot = await realpath(root)
  if (specifier.startsWith("./")) {
    if (specifier.split("/").includes("node_modules"))
      throw new Error(`Relative build plugin must not enter node_modules: ${specifier}`)
    const plugin = await canonicalFile(resolve(canonicalRoot, specifier), specifier)
    if (!inside(canonicalRoot, plugin))
      throw new Error(`Relative build plugin escapes package root: ${specifier}`)
    return plugin
  }

  const dependency = packageName(specifier)
  if (dependency === null) throw new Error(`Build plugin specifier is unsupported: ${specifier}`)
  const dependencies = {
    ...dependencyRecord(manifest.dependencies),
    ...dependencyRecord(manifest.devDependencies),
  }
  if (!Object.hasOwn(dependencies, dependency))
    throw new Error(`Build plugin package must be a direct dependency: ${dependency}`)

  let resolved: string
  try {
    resolved = Bun.resolveSync(specifier, canonicalRoot)
  } catch (error) {
    throw new Error(`Build plugin cannot be resolved: ${specifier}`, {cause: error})
  }
  const plugin = await canonicalFile(resolved, specifier)
  const dependencyRoot = await owningPackageRoot(plugin, dependency)
  if (!inside(dependencyRoot, plugin))
    throw new Error(`Build plugin escapes dependency package: ${specifier}`)
  return plugin
}

async function canonicalFile(path: string, label: string) {
  let canonical: string
  try {
    canonical = await realpath(path)
  } catch (error) {
    throw new Error(`Build plugin is missing: ${label}`, {cause: error})
  }
  if (!(await stat(canonical)).isFile()) throw new Error(`Build plugin is not a file: ${label}`)
  return canonical
}

async function owningPackageRoot(path: string, name: string) {
  let directory = dirname(path)
  while (true) {
    const manifest = Bun.file(join(directory, "package.json"))
    if (await manifest.exists()) {
      const value = await manifest.json() as {name?: unknown}
      if (value.name === name) return await realpath(directory)
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error(`Build plugin resolved outside direct dependency ${name}`)
}

function packageName(specifier: string) {
  if (
    specifier.startsWith("/")
    || specifier.startsWith("../")
    || specifier.includes(":")
    || specifier.startsWith("#")
  ) return null
  const parts = specifier.split("/")
  if (specifier.startsWith("@")) {
    if (parts.length < 2 || !parts[0] || !parts[1]) return null
    return `${parts[0]}/${parts[1]}`
  }
  return parts[0] || null
}

function dependencyRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringArray(value: unknown, message: string) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) =>
    typeof item !== "string" || item.trim() !== item || item === "")) throw new Error(message)
  return value as string[]
}

function exactRecord(value: unknown, keys: readonly string[], label: string) {
  const result = record(value, `${label} must be a table`)
  const allowed = new Set(keys)
  const unknown = Object.keys(result).filter((key) => !allowed.has(key))
  if (unknown.length > 0) throw new Error(`${label} has unsupported key ${unknown[0]}`)
  for (const key of keys) {
    if (!Object.hasOwn(result, key)) throw new Error(`${label} must define ${key}`)
  }
  return result
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function inside(root: string, path: string) {
  const pathFromRoot = relative(root, path)
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
}
