import {realpath} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {packageArtifactPath, packageBuildCommand} from "./command"
import {
  packageEnvironments,
  type BuildablePackage,
  type PackageBuildArtifact,
  type PackageEnvironment,
  type PackageEnvironmentExport,
  type PackageManifest,
  type PackageOwner,
} from "./contracts"
import {hamiltonianRoot} from "./paths"

interface PackageLocation {
  root: string
  manifest: string
}

const repositoryRoot = dirname(hamiltonianRoot)
const packageLocations = new Map<BuildablePackage, Promise<PackageLocation>>()
const browserEnvironments = new Set<PackageEnvironment>(["main", "worker", "service-worker"])

/** Возвращает свежий env-specific package build contract. */
export async function packageOwner(
  name: BuildablePackage,
  requestedEnv?: PackageEnvironment,
): Promise<PackageOwner> {
  const location = await packageLocation(name)
  const manifest = await packageManifest(location.manifest)
  if (manifest.name !== name)
    throw new Error(`Resolved package ${String(manifest.name)} does not match ${name}`)

  const environments = packageEnvironmentExports(manifest)
  const env = requestedEnv ?? singleBrowserEnvironment(name, environments)
  const artifacts = new Map<string, PackageEnvironment>()
  let selected: PackageOwner | null = null

  for (const environment of environments) {
    const contract = await environmentOwner(name, location, manifest, environment)
    const previous = artifacts.get(contract.artifact)
    if (previous !== undefined)
      throw new Error(`${name} env ${previous} and ${environment.env} share build outfile`)
    artifacts.set(contract.artifact, environment.env)
    if (environment.env === env) selected = contract
  }

  if (selected === null) throw new Error(`${name} does not export metafor:${env}`)
  return selected
}

/** Читает непустой JavaScript artifact. */
export async function packageArtifact(path: string): Promise<PackageBuildArtifact | null> {
  const artifact = Bun.file(path, {type: "text/javascript; charset=utf-8"})
  if (!await artifact.exists() || artifact.size === 0) return null
  return {path, size: artifact.size, type: artifact.type}
}

/** Читает package manifest заново, не кешируя изменяемое содержимое. */
export async function packageManifest(path: string): Promise<PackageManifest> {
  return await Bun.file(path).json() as PackageManifest
}

/** Разбирает standard exports в точные MetaFor package environments. */
export function packageEnvironmentExports(manifest: PackageManifest): PackageEnvironmentExport[] {
  const exports = record(manifest.exports, "Package exports must be an object")
  const root = record(exports["."], 'Package exports must define root subpath "."')
  const environments: PackageEnvironmentExport[] = []

  for (const [condition, value] of Object.entries(root)) {
    if (!condition.startsWith("metafor:"))
      throw new Error(`Unsupported root export condition ${condition}`)
    const env = condition.slice("metafor:".length)
    if (!isPackageEnvironment(env)) throw new Error(`Unsupported package environment ${env}`)

    const branch = record(value, `${condition} export must be an object`)
    const target = browserEnvironments.has(env) ? "browser" : "bun"
    const keys = Object.keys(branch)
    if (keys.length !== 2 || keys[0] !== "types" || keys[1] !== target)
      throw new Error(`${condition} export must define ordered types and ${target}`)
    const types = relativeSource(branch.types, `${condition} types`)
    const entrypoint = relativeSource(branch[target], `${condition} ${target}`)
    environments.push({
      env,
      condition: `metafor:${env}`,
      entrypoint,
      types,
      target,
    })
  }

  if (environments.length === 0) throw new Error("Package must export at least one environment")
  return environments
}

async function packageLocation(name: BuildablePackage) {
  let location = packageLocations.get(name)
  if (!location) {
    location = findPackage(name).catch((error: unknown) => {
      packageLocations.delete(name)
      throw error
    })
    packageLocations.set(name, location)
  }
  return await location
}

async function findPackage(name: BuildablePackage): Promise<PackageLocation> {
  if (!/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(name))
    throw new Error(`Invalid Hamiltonian package name ${name}`)

  const linkedRoot = join(repositoryRoot, "node_modules", ...name.split("/"))
  const root = await realpath(linkedRoot)
  if (root !== hamiltonianRoot && !root.startsWith(`${hamiltonianRoot}/`))
    throw new Error(`Package ${name} is outside Hamiltonian`)

  const manifest = join(root, "package.json")
  if (!await Bun.file(manifest).exists()) throw new Error(`Package manifest is missing for ${name}`)
  return {root, manifest}
}

async function environmentOwner(
  name: BuildablePackage,
  location: PackageLocation,
  manifest: PackageManifest,
  environment: PackageEnvironmentExport,
): Promise<PackageOwner> {
  const scripts = record(manifest.scripts, `${name} scripts must be an object`)
  const typecheckName = `typecheck:${environment.env}`
  const prebuildName = `prebuild:${environment.env}`
  const buildName = `build:${environment.env}`
  if (typeof scripts[typecheckName] !== "string")
    throw new Error(`${name} ${typecheckName} script is missing`)
  if (scripts[prebuildName] !== `bun run ${typecheckName}`)
    throw new Error(`${name} ${prebuildName} must run \`bun run ${typecheckName}\``)
  if (typeof scripts[buildName] !== "string")
    throw new Error(`${name} ${buildName} script is missing`)

  const build = scripts[buildName]
  const command = packageBuildCommand(build, "production")
  if (command[2] !== environment.entrypoint)
    throw new Error(`${name} ${buildName} entrypoint must match ${environment.condition}`)
  if (command.filter((argument) => argument.startsWith("--conditions=")).length !== 1
    || !command.includes(`--conditions=${environment.condition}`))
    throw new Error(`${name} ${buildName} must select ${environment.condition}`)
  if (command.filter((argument) => argument.startsWith("--target=")).length !== 1
    || !command.includes(`--target=${environment.target}`))
    throw new Error(`${name} ${buildName} must target ${environment.target}`)

  await Promise.all([
    requirePackageSource(location.root, environment.entrypoint, `${name} ${environment.env} entrypoint`),
    requirePackageSource(location.root, environment.types, `${name} ${environment.env} types`),
  ])

  const headers: Record<string, string> = {}
  const artifact = record(manifest.artifact ?? {}, `${name} artifact must be an object`)
  const artifactHeaders = record(artifact.headers ?? {}, `${name} artifact headers must be an object`)
  for (const [header, value] of Object.entries(artifactHeaders)) {
    if (typeof value !== "string")
      throw new Error(`${name} artifact header ${header} must be a string`)
    headers[header] = value
  }

  const cache = artifact.cache
  if (cache !== undefined && typeof cache !== "string")
    throw new Error(`${name} artifact cache must be a string`)

  return {
    root: location.root,
    manifest: location.manifest,
    env: environment.env,
    entrypoint: environment.entrypoint,
    artifact: packageArtifactPath(location.root, build),
    build,
    prebuild: prebuildName,
    cache: cache ?? null,
    headers,
  }
}

function singleBrowserEnvironment(name: string, environments: PackageEnvironmentExport[]) {
  const browser = environments.filter(({env}) => browserEnvironments.has(env))
  if (browser.length !== 1)
    throw new Error(`${name} requires an explicit browser environment`)
  return browser[0]!.env
}

async function requirePackageSource(root: string, path: string, label: string) {
  const source = resolve(root, path)
  if (source !== root && !source.startsWith(`${root}/`))
    throw new Error(`${label} must stay inside package root`)
  if (!await Bun.file(source).exists()) throw new Error(`${label} is missing`)
}

function relativeSource(value: unknown, label: string) {
  if (typeof value !== "string" || !value.startsWith("./"))
    throw new Error(`${label} must be a relative package path`)
  return value
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function isPackageEnvironment(value: string): value is PackageEnvironment {
  return packageEnvironments.some((environment) => environment === value)
}
