import {createHash} from "node:crypto"
import {lstat, readdir, realpath, stat} from "node:fs/promises"
import {isAbsolute, join, relative, resolve, sep} from "node:path"
import type {PackageBuildProvenance, PackageBuildProvenanceAssignment} from "./contracts"

export interface PackageSourceInventory {
  roots: readonly string[]
  excludedDirectoryNames: readonly string[]
  excludedDirectoryNamePrefixes: readonly string[]
  directories: ReadonlySet<string>
  files: ReadonlyMap<string, string>
  digest: string
}

export interface PackageBuildToolchain {
  path: string
  sha256: string
  version: string
}

/** Точные байты executable, который будет собирать артефакты. */
export async function readBuildToolchain(command: string): Promise<PackageBuildToolchain> {
  const path = await realpath(isAbsolute(command) ? command : Bun.which(command) ?? command)
  if (!(await lstat(path)).isFile())
    throw new Error(`Build compiler executable is not a file: ${command}`)
  const sha256 = createHash("sha256")
    .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
    .digest("hex")
  return {path, sha256, version: Bun.version}
}

/**
 * Снимок назначенной хостом области до чтения контракта пакета и после сборки.
 * Изменяемые выходы и состояние исключены; вход компилятора в них вызывает отказ.
 */
export async function snapshotBuildInventory(
  assignment: PackageBuildProvenanceAssignment,
): Promise<PackageSourceInventory> {
  if (assignment.roots.length === 0) throw new Error("Build source inventory has no assigned roots")
  const excludedDirectoryNames = [...new Set(assignment.excludedDirectoryNames)].sort()
  const excludedDirectoryNamePrefixes = [...new Set(assignment.excludedDirectoryNamePrefixes ?? [])].sort()
  for (const name of [...excludedDirectoryNames, ...excludedDirectoryNamePrefixes]) {
    if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\"))
      throw new Error(`Build source inventory exclusion is invalid: ${name}`)
  }
  const roots = [...new Set(await Promise.all(assignment.roots.map(async (root) => {
    if (!isAbsolute(root)) throw new Error(`Build source root is not absolute: ${root}`)
    const path = await realpath(root)
    if (!(await lstat(path)).isDirectory()) throw new Error(`Build source root is not a directory: ${root}`)
    return path
  })))].sort()
  const rootContains = (path: string) => roots.some((root) => {
    const fromRoot = relative(root, path)
    return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  })
  const files = new Map<string, string>()
  const directories = new Set<string>()
  const visited = new Set<string>()
  for (const root of roots) await visit(root)
  const digest = createHash("sha256")
  for (const root of roots) digest.update("root\0").update(root).update("\n")
  for (const name of excludedDirectoryNames) digest.update("exclude\0").update(name).update("\n")
  for (const prefix of excludedDirectoryNamePrefixes) digest.update("prefix\0").update(prefix).update("\n")
  for (const path of [...directories].sort()) digest.update("directory\0").update(path).update("\n")
  for (const [path, hash] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    digest.update(path).update("\0").update(hash).update("\n")
  }
  return {roots, excludedDirectoryNames, excludedDirectoryNamePrefixes, directories, files, digest: digest.digest("hex")}

  async function visit(directory: string): Promise<void> {
    if (visited.has(directory)) return
    visited.add(directory)
    directories.add(directory)
    const entries = await readdir(directory, {withFileTypes: true})
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name)
      if (excludedDirectoryNames.includes(entry.name) ||
        excludedDirectoryNamePrefixes.some((prefix) => entry.name.startsWith(prefix))) continue
      const canonical = entry.isSymbolicLink() ? await realpath(path) : path
      if (!rootContains(canonical))
        throw new Error(`Build source inventory symlink escapes assigned roots: ${path}`)
      const kind = entry.isSymbolicLink() ? await stat(canonical) : entry
      if (kind.isDirectory()) {
        await visit(canonical)
      } else if (kind.isFile()) {
        const bytes = await Bun.file(canonical).arrayBuffer()
        files.set(canonical, createHash("sha256").update(new Uint8Array(bytes)).digest("hex"))
      }
    }
  }
}

export async function verifyBuildInventory(
  before: PackageSourceInventory,
  after: PackageSourceInventory,
  ownerRoot: string,
  compilerInputs: readonly string[],
  requiredFiles: readonly string[],
  profile: "development" | "production",
  compilerToolchain: PackageBuildToolchain,
  adapterArtifact: {path: string; sha256: string} | undefined,
  prepared: readonly {path: string; sha256: string}[],
  targetVersion: string,
  buildPlanSha256: string,
): Promise<PackageBuildProvenance> {
  if (before.digest !== after.digest || !sameFiles(before.files, after.files) ||
    before.directories.size !== after.directories.size ||
    [...before.directories].some((path) => !after.directories.has(path)))
    throw new Error("Build source inventory changed during preparation")

  const attested = new Map<string, string>()
  for (const input of compilerInputs) {
    if (!input || input.includes("\0") || input.includes("://"))
      throw new Error(`Build compiler input is not a confirmed file: ${input}`)
    await requireInput(isAbsolute(input) ? input : resolve(ownerRoot, input))
  }
  for (const path of requiredFiles) await requireInput(path)

  const currentToolchain = await readBuildToolchain(compilerToolchain.path)
  if (currentToolchain.sha256 !== compilerToolchain.sha256)
    throw new Error("Build compiler executable changed during preparation")
  return {
    kind: "bounded-source-inventory",
    roots: before.roots,
    excludedDirectoryNames: before.excludedDirectoryNames,
    excludedDirectoryNamePrefixes: before.excludedDirectoryNamePrefixes,
    inventorySha256: before.digest,
    compilerInputs: [...attested].sort(([left], [right]) => left.localeCompare(right))
      .map(([path, sha256]) => ({path, sha256})),
    prepared: [...prepared].sort((left, right) => left.path.localeCompare(right.path)),
    bun: compilerToolchain,
    ...(adapterArtifact === undefined ? {} : {adapter: adapterArtifact}),
    profile,
    targetVersion,
    buildPlanSha256,
  }

  async function requireInput(path: string) {
    let canonical: string
    try {
      canonical = await realpath(path)
    } catch {
      throw new Error(`Build input cannot be resolved from assigned source inventory: ${path}`)
    }
    const digest = before.files.get(canonical)
    if (!digest || !(await lstat(canonical)).isFile())
      throw new Error(`Build input is outside assigned source inventory: ${canonical}`)
    attested.set(canonical, digest)
  }
}

function sameFiles(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>) {
  if (left.size !== right.size) return false
  for (const [path, hash] of left) if (right.get(path) !== hash) return false
  return true
}
