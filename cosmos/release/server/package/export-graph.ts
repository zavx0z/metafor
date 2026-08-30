import {lstat, readdir, realpath} from "node:fs/promises"
import {relative, resolve, sep} from "node:path"
import {
  isPackageEnvironment,
  packageEnvironments,
  type PackageEnvironment,
} from "../../../shared/package/environment"
import {
  isPackageExportSubpath,
  rootPackageArtifact,
  type PackageArtifactKey,
  type PublicPackageArtifactKey,
} from "../../shared/artifact"

export interface PackageExportsManifest {
  name?: unknown
  exports?: unknown
}

/** One exact package-owned source selected for one explicit environment. */
export interface PackageExportArtifact {
  artifact: PublicPackageArtifactKey
  env: PackageEnvironment
  condition: `${string}:${PackageEnvironment}` | null
  source: `./${string}`
}

interface ExportDeclaration {
  artifact: string
  condition: `${string}:${PackageEnvironment}` | null
  env: PackageEnvironment | null
  source: string
}

/**
Expands standard package exports into a deterministic environment artifact graph.

Conditional targets select one exact environment. A conditionless target is
shared by every environment declared elsewhere in the same exports object.
File extension never selects an environment: one shared source may be built
separately for browser and Bun. Wildcards are expanded from the package
filesystem without following symbolic links.
*/
export async function packageExportGraph(
  packageRoot: string,
  manifest: PackageExportsManifest,
): Promise<PackageExportArtifact[]> {
  if (typeof manifest.name !== "string") throw new Error("Package name must be a string")
  const scope = packageConditionScope(manifest.name)
  const exports = record(manifest.exports, "Package exports must be an object")
  const declarations: ExportDeclaration[] = []
  const exclusions: string[] = []
  const rootEnvironments = new Set<PackageEnvironment>()

  for (const [artifact, target] of Object.entries(exports)) {
    requireArtifactDeclaration(artifact)
    if (target === null) {
      if (artifact === rootPackageArtifact)
        throw new Error("Root package export must declare exact environments")
      exclusions.push(artifact)
      continue
    }

    if (typeof target === "string") {
      if (artifact === rootPackageArtifact)
        throw new Error("Root package export must declare exact environments")
      requireSourceDeclaration(target, artifact)
      declarations.push({artifact, condition: null, env: null, source: target})
      continue
    }

    const conditions = record(target, `Package export ${artifact} conditions must be an object`)
    if (Object.keys(conditions).length === 0)
      throw new Error(`Package export ${artifact} must declare at least one environment`)
    for (const [condition, source] of Object.entries(conditions)) {
      if (!condition.startsWith(`${scope}:`))
        throw new Error(`Unsupported package export condition ${condition}`)
      const env = condition.slice(scope.length + 1)
      if (!isPackageEnvironment(env)) throw new Error(`Unsupported package environment ${env}`)
      requireSourceDeclaration(source, `${artifact} ${condition}`)
      if (artifact === rootPackageArtifact && source.includes("*"))
        throw new Error(`Root package export ${condition} must target one exact source`)
      if (artifact === rootPackageArtifact) rootEnvironments.add(env)
      declarations.push({
        artifact,
        condition: `${scope}:${env}`,
        env,
        source,
      })
    }
  }

  if (declarations.length === 0) throw new Error("Package must export at least one artifact")
  if (rootEnvironments.size === 0)
    throw new Error('Package exports must define root subpath "." with exact environments')
  for (const declaration of declarations) {
    if (declaration.env !== null && !rootEnvironments.has(declaration.env))
      throw new Error(`Package export ${declaration.artifact} uses undeclared environment ${declaration.env}`)
  }

  const root = await canonicalDirectory(packageRoot)
  const graph: PackageExportArtifact[] = []
  const identities = new Map<string, string>()
  const sources = new Map<string, PackageArtifactKey>()

  for (const declaration of declarations) {
    const environments = declaration.env === null
      ? packageEnvironments.filter((env) => rootEnvironments.has(env))
      : [declaration.env]
    const files = await expandDeclaration(root, declaration.artifact, declaration.source)
    for (const file of files) {
      if (exclusions.some((pattern) => artifactPatternMatches(pattern, file.artifact))) continue
      for (const env of environments) {
        const identity = `${env}\u0000${file.artifact}`
        const previous = identities.get(identity)
        if (previous !== undefined)
          throw new Error(`Package export collision ${file.artifact}:${env}: ${previous} and ${file.source}`)
        const sourceIdentity = `${env}\u0000${file.source}`
        const previousArtifact = sources.get(sourceIdentity)
        if (previousArtifact !== undefined)
          throw new Error(
            `Package source ${file.source}:${env} has multiple artifact identities: ${previousArtifact} and ${file.artifact}`,
          )
        identities.set(identity, file.source)
        sources.set(sourceIdentity, file.artifact)
        graph.push({
          artifact: file.artifact,
          env,
          condition: declaration.condition,
          source: file.source,
        })
      }
    }
  }

  const environmentOrder = new Map(packageEnvironments.map((env, index) => [env, index]))
  return graph.sort((left, right) =>
    left.artifact.localeCompare(right.artifact)
    || environmentOrder.get(left.env)! - environmentOrder.get(right.env)!)
}

async function expandDeclaration(root: string, artifact: string, source: string) {
  const artifactWildcards = occurrences(artifact, "*")
  const sourceWildcards = occurrences(source, "*")
  if (artifactWildcards === 0 && sourceWildcards === 0) {
    await requireOwnedRegularFile(root, source)
    return [{artifact: artifact as PublicPackageArtifactKey, source: source as `./${string}`}]
  }
  if (artifactWildcards !== 1 || sourceWildcards !== 1)
    throw new Error(`Package export pattern ${artifact} must use one matching wildcard`)

  const [prefix, suffix] = source.split("*") as [string, string]
  const base = prefix.slice(0, prefix.lastIndexOf("/") + 1)
  await requireOwnedDirectory(root, base)
  const files = await listOwnedFiles(root, base)
  const matcher = new RegExp(`^${escapeRegExp(prefix)}(.+)${escapeRegExp(suffix)}$`)
  const expanded: Array<{artifact: PublicPackageArtifactKey, source: `./${string}`}> = []

  for (const candidate of files) {
    const match = matcher.exec(candidate)
    const replacement = match?.[1]
    if (!replacement) continue
    const exactArtifact = artifact.replace("*", replacement)
    if (!isPackageExportSubpath(exactArtifact))
      throw new Error(`Package export pattern produced invalid artifact ${exactArtifact}`)
    expanded.push({artifact: exactArtifact, source: candidate as `./${string}`})
  }

  return expanded.sort((left, right) => left.artifact.localeCompare(right.artifact))
}

async function canonicalDirectory(path: string) {
  const canonical = await realpath(path)
  const stats = await lstat(canonical)
  if (!stats.isDirectory()) throw new Error(`Package root is not a directory: ${path}`)
  return canonical
}

async function requireOwnedRegularFile(root: string, source: string) {
  const path = await requireOwnedPath(root, source)
  const stats = await lstat(path)
  if (!stats.isFile()) throw new Error(`Package export source is not a regular file: ${source}`)
}

async function requireOwnedDirectory(root: string, source: string) {
  if (source === "./") return
  const path = await requireOwnedPath(root, source.slice(0, -1))
  const stats = await lstat(path)
  if (!stats.isDirectory()) throw new Error(`Package export pattern root is not a directory: ${source}`)
}

async function requireOwnedPath(root: string, source: string) {
  const segments = source.slice(2).split("/").filter(Boolean)
  let current = root
  for (const segment of segments) {
    current = resolve(current, segment)
    const stats = await lstat(current)
    if (stats.isSymbolicLink()) throw new Error(`Package export source must not cross a symbolic link: ${source}`)
  }
  const canonical = await realpath(current)
  if (canonical !== root && !canonical.startsWith(`${root}${sep}`))
    throw new Error(`Package export source escapes package root: ${source}`)
  return canonical
}

async function listOwnedFiles(root: string, sourceDirectory: string) {
  const directory = sourceDirectory === "./"
    ? root
    : resolve(root, sourceDirectory.slice(2))
  const files: string[] = []
  await visit(directory)
  return files.sort()

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, {withFileTypes: true})
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === "node_modules" || entry.name === ".cosmos") continue
      const path = resolve(current, entry.name)
      if (entry.isSymbolicLink())
        throw new Error(`Package export pattern must not cross a symbolic link: ${relative(root, path)}`)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(`./${relative(root, path).split(sep).join("/")}`)
    }
  }
}

function requireArtifactDeclaration(value: string) {
  if (value === rootPackageArtifact) return
  if (!value.startsWith("./") || occurrences(value, "*") > 1)
    throw new Error(`Invalid package export subpath ${value}`)
  const example = value.replace("*", "artifact")
  if (!isPackageExportSubpath(example)) throw new Error(`Invalid package export subpath ${value}`)
}

function requireSourceDeclaration(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.startsWith("./") || occurrences(value, "*") > 1)
    throw new Error(`${label} source must be one relative package path`)
  const example = value.replace("*", "artifact")
  const segments = example.slice(2).split("/")
  if (
    example.includes("\\")
    || example.includes("%")
    || example.includes("?")
    || example.includes("#")
    || segments.some((segment) =>
      segment.length === 0
      || segment === "."
      || segment === ".."
      || segment === "node_modules"
      || segment === ".cosmos")
  ) throw new Error(`${label} source must stay inside package root`)
}

function artifactPatternMatches(pattern: string, artifact: PublicPackageArtifactKey) {
  if (!pattern.includes("*")) return pattern === artifact
  const [prefix, suffix] = pattern.split("*") as [string, string]
  return new RegExp(`^${escapeRegExp(prefix)}.+${escapeRegExp(suffix)}$`).test(artifact)
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

function occurrences(source: string, value: string) {
  return source.split(value).length - 1
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
