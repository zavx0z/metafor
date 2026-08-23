import {realpath} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {
  browserPackageEnvironments,
  isPackageEnvironment,
  type PackageEnvironment,
} from "../../../shared/package/environment"
import {artifactIntegrity} from "../../../shared/package/integrity"
import {packageArtifactPath, packageBuildCommand} from "./command"
import {
  type BuildablePackage,
  type PackageBuildArtifact,
  type PackageEnvironmentExport,
  type PackageManifest,
  type PackageOwner,
} from "../shared/contracts"
import {cosmosRoot} from "../shared/paths"

interface PackageLocation {
  root: string
  manifest: string
}

const repositoryRoot = dirname(cosmosRoot)
const packageLocations = new Map<BuildablePackage, Promise<PackageLocation>>()
const browserEnvironments = new Set<PackageEnvironment>(browserPackageEnvironments)

/** Возвращает свежий env-specific package build contract. */
export async function packageOwner(
  name: BuildablePackage,
  requestedEnv?: PackageEnvironment,
): Promise<PackageOwner> {
  const owners = await packageOwners(name)
  const env = requestedEnv ?? singleBrowserEnvironment(name, owners)
  const selected = owners.find((owner) => owner.env === env)
  if (selected === undefined) throw new Error(`${name} does not export env ${env}`)
  return selected
}

/** Возвращает свежие проверенные build contracts всех объявленных env. */
export async function packageOwners(name: BuildablePackage): Promise<PackageOwner[]> {
  const location = await packageLocation(name)
  const manifest = await packageManifest(location.manifest)
  if (manifest.name !== name)
    throw new Error(`Resolved package ${String(manifest.name)} does not match ${name}`)

  const environments = packageEnvironmentExports(manifest)
  const artifacts = new Map<string, PackageEnvironment>()
  const owners: PackageOwner[] = []

  for (const environment of environments) {
    const contract = await environmentOwner(name, location, manifest, environment)
    const previous = artifacts.get(contract.artifact)
    if (previous !== undefined)
      throw new Error(`${name} env ${previous} and ${environment.env} share build outfile`)
    artifacts.set(contract.artifact, environment.env)
    owners.push(contract)
  }

  return owners
}

/** Читает непустой JavaScript artifact. */
export async function packageArtifact(path: string): Promise<PackageBuildArtifact | null> {
  const artifact = Bun.file(path, {type: "text/javascript; charset=utf-8"})
  if (!await artifact.exists() || artifact.size === 0) return null
  const integrity = await artifactIntegrity(await artifact.arrayBuffer())
  return {path, ...integrity, type: artifact.type}
}

/** Читает package manifest заново, не кешируя изменяемое содержимое. */
export async function packageManifest(path: string): Promise<PackageManifest> {
  return await Bun.file(path).json() as PackageManifest
}

/** Разбирает standard exports в точные MetaFor package environments. */
export function packageEnvironmentExports(manifest: PackageManifest): PackageEnvironmentExport[] {
  if (typeof manifest.name !== "string") throw new Error("Package name must be a string")
  const scope = packageConditionScope(manifest.name)
  const exports = record(manifest.exports, "Package exports must be an object")
  const root = record(exports["."], 'Package exports must define root subpath "."')
  const environments: PackageEnvironmentExport[] = []

  for (const [condition, value] of Object.entries(root)) {
    if (!condition.startsWith(`${scope}:`))
      throw new Error(`Unsupported root export condition ${condition}`)
    const env = condition.slice(scope.length + 1)
    if (!isPackageEnvironment(env)) throw new Error(`Unsupported package environment ${env}`)

    const target = browserEnvironments.has(env) ? "browser" : "bun"
    const entrypoint = relativeSource(value, `${condition} entrypoint`)
    const expected = `./${env}/index.ts`
    if (entrypoint !== expected) throw new Error(`${condition} export must target ${expected}`)
    environments.push({
      env,
      condition: `${scope}:${env}`,
      entrypoint,
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
    throw new Error(`Invalid Cosmos package name ${name}`)

  const linkedRoot = join(repositoryRoot, "node_modules", ...name.split("/"))
  const root = await realpath(linkedRoot)
  if (root !== cosmosRoot && !root.startsWith(`${cosmosRoot}/`))
    throw new Error(`Package ${name} is outside Cosmos`)

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
  const buildName = `build:${environment.env}`
  if (typeof scripts.typecheck !== "string") throw new Error(`${name} typecheck script is missing`)
  if (scripts.prebuild !== undefined || scripts.build !== undefined)
    throw new Error(`${name} must not define generic prebuild or build scripts`)
  for (const script of Object.keys(scripts)) {
    if (script.startsWith("prebuild:") || script.startsWith("typecheck:"))
      throw new Error(`${name} must use one package-wide typecheck script`)
  }
  if (typeof scripts[buildName] !== "string")
    throw new Error(`${name} ${buildName} script is missing`)

  const build = scripts[buildName]
  const command = packageBuildCommand(build, "production")
  if (command[2] !== environment.entrypoint)
    throw new Error(`${name} ${buildName} entrypoint must match ${environment.condition}`)
  const conditions = command.filter((argument) => argument.startsWith("--conditions="))
  if (!conditions.includes(`--conditions=${environment.condition}`))
    throw new Error(`${name} ${buildName} must select ${environment.condition}`)
  if (conditions.some((condition) => !condition.endsWith(`:${environment.env}`)))
    throw new Error(`${name} ${buildName} conditions must select only env ${environment.env}`)
  if (command.filter((argument) => argument.startsWith("--target=")).length !== 1
    || !command.includes(`--target=${environment.target}`))
    throw new Error(`${name} ${buildName} must target ${environment.target}`)

  await requirePackageSource(
    location.root,
    environment.entrypoint,
    `${name} ${environment.env} entrypoint`,
  )

  const headers = environment.env === "service" ? {
    "Content-Security-Policy": "script-src 'unsafe-eval'",
    "Service-Worker-Allowed": "/",
  } : {}

  return {
    root: location.root,
    manifest: location.manifest,
    env: environment.env,
    entrypoint: environment.entrypoint,
    artifact: packageArtifactPath(location.root, build),
    build,
    typecheck: "typecheck",
    headers,
  }
}

function singleBrowserEnvironment(name: string, owners: PackageOwner[]) {
  const browser = owners.filter(({env}) => browserEnvironments.has(env))
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

function packageConditionScope(name: string) {
  const match = /^@([a-z0-9][a-z0-9._-]*)\/[a-z0-9][a-z0-9._-]*$/i.exec(name)
  if (!match) throw new Error(`Invalid Cosmos package name ${name}`)
  return match[1]!
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}
