import {spawnSync} from "node:child_process"
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
} from "node:fs/promises"
import {dirname, relative, resolve, sep} from "node:path"
import type {MetaSourceRevision} from "@metafor/types/metafor/authoring"
import {sourceRevision} from "./source.ts"
import {
  validateMetaPackageTemplate,
  type MetaPackageTemplate,
} from "./template.ts"

export type MetaCreatePatchErrorCode =
  | "invalid_operation"
  | "invalid_cluster"
  | "invalid_owner"
  | "target_conflict"
  | "candidate_conflict"
  | "git_initialization_failed"
  | "git_state_invalid"
  | "publish_failed"

export class MetaCreatePatchError extends Error {
  override readonly name = "MetaCreatePatchError"

  constructor(
    readonly code: MetaCreatePatchErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export interface MetaCreatedRepositoryState {
  readonly initialized: true
  readonly branch: "main"
  readonly head: null
  readonly staged: false
}

export interface MetaCreatePatchReceipt {
  readonly outcome: "created" | "already_created"
  readonly targetPath: string
  readonly sourceRevision: MetaSourceRevision
  readonly files: string[]
  readonly repository: MetaCreatedRepositoryState
}

export interface MaterializeMetaCreatePatchOptions {
  readonly clusterRoot: string
  readonly operationId: string
  readonly template: MetaPackageTemplate
}

const SAFE_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

const errorCode = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as {code?: unknown}).code ?? "")
    : null

const optionalStat = async (path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> => {
  try {
    return await lstat(path)
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null
    throw error
  }
}

const requireDirectory = async (
  path: string,
  code: "invalid_cluster" | "invalid_owner" | "candidate_conflict" | "target_conflict",
  label: string,
): Promise<void> => {
  const stat = await optionalStat(path)
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new MetaCreatePatchError(code, `${label} must be an existing regular directory: ${path}`)
  }
}

const expectedDirectories = (template: MetaPackageTemplate): Set<string> => {
  const result = new Set<string>()
  for (const file of template.files) {
    let parent = dirname(file.path)
    while (parent !== ".") {
      result.add(parent)
      parent = dirname(parent)
    }
  }
  return result
}

const inventory = async (
  root: string,
  conflictCode: "candidate_conflict" | "target_conflict",
  prefix = "",
): Promise<{files: string[]; directories: string[]}> => {
  const files: string[] = []
  const directories: string[] = []
  for (const entry of await readdir(resolve(root, prefix), {withFileTypes: true})) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (prefix === "" && entry.name === ".git") {
      const stat = await lstat(resolve(root, entry.name))
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new MetaCreatePatchError("git_state_invalid", `Git state must be a regular directory: ${root}`)
      }
      continue
    }
    if (entry.isSymbolicLink()) {
      throw new MetaCreatePatchError(conflictCode, `Meta source patch must not contain symlinks: ${path}`)
    }
    if (entry.isDirectory()) {
      directories.push(path)
      const nested = await inventory(root, conflictCode, path)
      files.push(...nested.files)
      directories.push(...nested.directories)
      continue
    }
    if (!entry.isFile()) {
      throw new MetaCreatePatchError(conflictCode, `Meta source patch contains a special file: ${path}`)
    }
    files.push(path)
  }
  return {files: files.sort(), directories: directories.sort()}
}

const validateSourceTree = async (
  root: string,
  template: MetaPackageTemplate,
  complete: boolean,
  conflictCode: "candidate_conflict" | "target_conflict",
): Promise<void> => {
  const expected = new Map(template.files.map((file) => [file.path, file.source] as const))
  const allowedDirectories = expectedDirectories(template)
  const current = await inventory(root, conflictCode)
  if (current.files.some((path) => !expected.has(path))) {
    throw new MetaCreatePatchError(conflictCode, `Meta source patch contains unexpected files: ${root}`)
  }
  if (current.directories.some((path) => !allowedDirectories.has(path))) {
    throw new MetaCreatePatchError(conflictCode, `Meta source patch contains unexpected directories: ${root}`)
  }
  if (complete && current.files.length !== expected.size) {
    throw new MetaCreatePatchError(conflictCode, `Meta source patch is incomplete: ${root}`)
  }
  for (const path of current.files) {
    if (await readFile(resolve(root, path), "utf8") !== expected.get(path)) {
      throw new MetaCreatePatchError(conflictCode, `Meta source patch conflicts at ${path}`)
    }
  }
}

const syncDirectory = async (path: string): Promise<void> => {
  const handle = await open(path, "r")
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

const writeTemplate = async (
  candidatePath: string,
  template: MetaPackageTemplate,
): Promise<void> => {
  const current = await optionalStat(candidatePath)
  if (current) {
    await requireDirectory(candidatePath, "candidate_conflict", "Create candidate")
  } else {
    await mkdir(candidatePath, {mode: 0o755})
  }
  await validateSourceTree(candidatePath, template, false, "candidate_conflict")
  for (const file of template.files) {
    const path = resolve(candidatePath, file.path)
    await mkdir(dirname(path), {recursive: true, mode: 0o755})
    const stat = await optionalStat(path)
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink() || await readFile(path, "utf8") !== file.source) {
        throw new MetaCreatePatchError("candidate_conflict", `Create candidate conflicts at ${file.path}`)
      }
      continue
    }
    const handle = await open(path, "wx", 0o644)
    try {
      await handle.writeFile(file.source, "utf8")
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
  for (const directory of [...expectedDirectories(template)].sort().reverse()) {
    await syncDirectory(resolve(candidatePath, directory))
  }
  await syncDirectory(candidatePath)
  await validateSourceTree(candidatePath, template, true, "candidate_conflict")
}

const runGit = (repository: string, args: readonly string[]) =>
  spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })

const initializeGit = (repository: string): void => {
  const result = runGit(repository, ["init", "--quiet", "--initial-branch=main"])
  if (result.status !== 0) {
    throw new MetaCreatePatchError(
      "git_initialization_failed",
      result.stderr.trim() || `Git repository initialization failed: ${repository}`,
      result.error ? {cause: result.error} : undefined,
    )
  }
}

const inspectGit = async (repository: string): Promise<MetaCreatedRepositoryState> => {
  const gitPath = resolve(repository, ".git")
  const gitStat = await optionalStat(gitPath)
  if (!gitStat || !gitStat.isDirectory() || gitStat.isSymbolicLink()) {
    throw new MetaCreatePatchError("git_state_invalid", `Created peer has no regular Git repository: ${repository}`)
  }
  const top = runGit(repository, ["rev-parse", "--show-toplevel"])
  const branch = runGit(repository, ["symbolic-ref", "--short", "HEAD"])
  const head = runGit(repository, ["rev-parse", "--verify", "HEAD"])
  const staged = runGit(repository, ["status", "--porcelain", "--untracked-files=no"])
  const exactTop = top.status === 0 && await realpath(top.stdout.trim()) === await realpath(repository)
  if (
    !exactTop ||
    branch.status !== 0 || branch.stdout.trim() !== "main" ||
    head.status === 0 ||
    staged.status !== 0 || staged.stdout.trim() !== ""
  ) {
    throw new MetaCreatePatchError("git_state_invalid", `Created peer Git state is not empty and unstaged: ${repository}`)
  }
  return {initialized: true, branch: "main", head: null, staged: false}
}

const receipt = async (
  targetPath: string,
  template: MetaPackageTemplate,
  outcome: MetaCreatePatchReceipt["outcome"],
): Promise<MetaCreatePatchReceipt> => {
  await requireDirectory(targetPath, "target_conflict", "Create target")
  await validateSourceTree(targetPath, template, true, "target_conflict")
  const repository = await inspectGit(targetPath)
  const metaSource = template.files.find(({path}) => path === "meta.ts")!.source
  return {
    outcome,
    targetPath,
    sourceRevision: sourceRevision(metaSource),
    files: template.files.map(({path}) => path),
    repository,
  }
}

export const materializeMetaCreatePatch = async (
  options: MaterializeMetaCreatePatchOptions,
): Promise<MetaCreatePatchReceipt> => {
  if (!SAFE_OPERATION_ID.test(options.operationId)) {
    throw new MetaCreatePatchError("invalid_operation", "Create operationId is invalid")
  }
  const template = validateMetaPackageTemplate(options.template)
  const clusterRoot = resolve(options.clusterRoot)
  await requireDirectory(clusterRoot, "invalid_cluster", "Cluster root")
  const ownerPath = resolve(clusterRoot, template.identity.owner)
  if (relative(clusterRoot, ownerPath).startsWith(`..${sep}`)) {
    throw new MetaCreatePatchError("invalid_owner", "Create owner escapes the Cluster root")
  }
  await requireDirectory(ownerPath, "invalid_owner", "Create owner")
  if (await optionalStat(resolve(ownerPath, ".git")) && await optionalStat(resolve(ownerPath, "meta.ts"))) {
    throw new MetaCreatePatchError("invalid_owner", `Create owner is itself a Meta repository: ${ownerPath}`)
  }
  const targetPath = resolve(ownerPath, template.identity.repository)
  const existing = await optionalStat(targetPath)
  if (existing) return await receipt(targetPath, template, "already_created")

  const candidatePath = resolve(ownerPath, `.${template.identity.repository}.${options.operationId}.candidate`)
  await writeTemplate(candidatePath, template)
  initializeGit(candidatePath)
  await inspectGit(candidatePath)
  await syncDirectory(candidatePath)

  if (await optionalStat(targetPath)) return await receipt(targetPath, template, "already_created")
  try {
    await rename(candidatePath, targetPath)
  } catch (error) {
    if (await optionalStat(targetPath)) return await receipt(targetPath, template, "already_created")
    throw new MetaCreatePatchError("publish_failed", `Create target publication failed: ${targetPath}`, {cause: error})
  }
  await syncDirectory(ownerPath)
  return await receipt(targetPath, template, "created")
}
