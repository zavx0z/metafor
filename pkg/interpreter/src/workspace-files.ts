import {existsSync, readdirSync, statSync, type Dirent} from "node:fs"
import {dirname, isAbsolute, join, relative, resolve} from "node:path"
import {fileURLToPath} from "node:url"

export type WorkspaceFilesModuleContext = {
  id: string
  label: string
  modulePath?: string | null
  target?: {
    command?: readonly string[]
    cwd?: string | null
  }
}

export type WorkspaceFilesPayload = {
  root: string
  workspacePath: string
  moduleId?: string
  modulePath?: string
  files: Array<{path: string}>
}

export type WorkspaceFilesPayloadOptions = {
  cwd?: string
  module?: WorkspaceFilesModuleContext
}

const WORKSPACE_FILE_EXTENSIONS = new Set([
  ".css",
  ".cts",
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".sql",
  ".ts",
  ".tsx",
  ".toml",
  ".wgsl",
  ".yaml",
  ".yml",
])

const WORKSPACE_SKIP_DIRS = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "tmp",
])

export function workspaceFilesPayload(url: URL, options: WorkspaceFilesPayloadOptions = {}): WorkspaceFilesPayload {
  const cwd = normalizeAbsolutePath(options.cwd ?? process.cwd())
  const targetPath = resolveModuleTargetPath(options.module, cwd)
  const root = targetPath === undefined ? cwd : workspaceRootForTarget(targetPath, cwd)
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase()
  const limit = clampWorkspaceLimit(url.searchParams.get("limit") === null ? 120 : Number(url.searchParams.get("limit")))
  const paths = collectWorkspaceFiles(root, query)
    .sort((a, b) => fileRank(a) - fileRank(b) || a.localeCompare(b))
    .slice(0, limit)

  return {
    root,
    workspacePath: workspacePathForRoot(root, cwd),
    ...(options.module === undefined ? {} : {moduleId: options.module.id}),
    ...(targetPath === undefined ? {} : {modulePath: targetPath}),
    files: paths.map((path) => ({path})),
  }
}

export function resolveModuleTargetPath(module: WorkspaceFilesModuleContext | undefined, cwd = process.cwd()): string | undefined {
  if (module === undefined) return undefined
  const targetCwd = normalizeAbsolutePath(module.target?.cwd ?? cwd)
  const candidates: string[] = []
  if (module.modulePath !== undefined && module.modulePath !== null) candidates.push(module.modulePath)
  if (module.target?.command !== undefined) candidates.push(...[...module.target.command].reverse())
  candidates.push(module.label)

  for (const candidate of candidates) {
    const resolved = resolveExistingPathCandidate(candidate, targetCwd)
    if (resolved !== undefined) return resolved
  }
  return undefined
}

export function workspaceRootForTarget(targetPath: string, cwd = process.cwd()): string {
  const normalizedCwd = normalizeAbsolutePath(cwd)
  const target = normalizeAbsolutePath(targetPath)
  const stat = safeStat(target)
  let dir = stat?.isDirectory() === true ? target : dirname(target)

  while (isSameOrInside(dir, normalizedCwd)) {
    if (isWorkspaceRoot(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return isSameOrInside(dirname(target), normalizedCwd) ? dirname(target) : normalizedCwd
}

function collectWorkspaceFiles(root: string, query: string): string[] {
  const files: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, {withFileTypes: true})
    } catch {
      continue
    }

    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? 1 : -1
      return b.name.localeCompare(a.name)
    })

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".storybook") continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!WORKSPACE_SKIP_DIRS.has(entry.name)) stack.push(abs)
        continue
      }
      if (!entry.isFile()) continue
      if (entry.name.endsWith(".d.ts")) continue
      if (!WORKSPACE_FILE_EXTENSIONS.has(extensionOf(entry.name))) continue
      const rel = relative(root, abs).replaceAll("\\", "/")
      if (query.length > 0 && !rel.toLowerCase().includes(query)) continue
      files.push(rel)
    }
  }

  return files
}

function resolveExistingPathCandidate(candidate: string, cwd: string): string | undefined {
  const clean = cleanPathCandidate(candidate)
  if (clean === undefined) return undefined
  const resolved = normalizeAbsolutePath(isAbsolute(clean) ? clean : resolve(cwd, clean))
  return safeStat(resolved) === undefined ? undefined : resolved
}

function cleanPathCandidate(candidate: string): string | undefined {
  const raw = candidate.trim()
  if (raw.length === 0 || raw.startsWith("-")) return undefined
  if (raw === "bun" || raw === "test" || raw.startsWith("ws://") || raw.startsWith("wss://")) return undefined
  const withoutQuery = raw.replaceAll("\\", "/").replace(/[?#].*$/, "")
  if (withoutQuery.startsWith("file:")) {
    try {
      return fileURLToPath(withoutQuery)
    } catch {
      return undefined
    }
  }
  return withoutQuery
}

function workspacePathForRoot(root: string, cwd: string): string {
  const rel = relative(cwd, root).replaceAll("\\", "/")
  if (rel.length === 0) return ""
  if (!rel.startsWith("../") && rel !== "..") return rel
  return root.replaceAll("\\", "/")
}

function isWorkspaceRoot(dir: string): boolean {
  return existsSync(join(dir, "package.json")) || existsSync(join(dir, "tsconfig.json"))
}

function safeStat(path: string): ReturnType<typeof statSync> | undefined {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}

function isSameOrInside(path: string, parent: string): boolean {
  const rel = relative(parent, path)
  return rel.length === 0 || (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel))
}

function normalizeAbsolutePath(path: string): string {
  return resolve(path).replaceAll("\\", "/")
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot < 0 ? "" : path.slice(dot).toLowerCase()
}

function fileRank(path: string): number {
  if (path.endsWith(".spec.ts") || path.endsWith(".test.ts")) return 0
  if (path.endsWith(".spec.tsx") || path.endsWith(".test.tsx")) return 1
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return 2
  return 3
}

function clampWorkspaceLimit(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return 120
  return Math.min(value, 500)
}
