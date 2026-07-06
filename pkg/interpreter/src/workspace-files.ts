import {spawnSync} from "node:child_process"
import {existsSync, readFileSync, readdirSync, statSync, type Dirent} from "node:fs"
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
  files: Array<{path: string; vcsStatus?: WorkspaceFileVcsStatus; addedLines?: number; deletedLines?: number}>
}

export type WorkspaceFileVcsStatus = "added" | "modified" | "deleted"
type WorkspaceFileLineStats = {addedLines: number; deletedLines: number}

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

const WORKSPACE_RESOLVE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
]

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
  const root = workspaceRootForLaunch(options.module, targetPath, cwd)
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase()
  const limit = clampWorkspaceLimit(url.searchParams.get("limit") === null ? 120 : Number(url.searchParams.get("limit")))
  const gitStatuses = workspaceGitStatusMap(root)
  const gitStats = workspaceGitLineStatsMap(root, gitStatuses)
  const paths = mergeWorkspaceCatalogPaths([
    targetPath === undefined ? collectWorkspaceFiles(root, query) : collectImportedWorkspaceFiles(root, targetPath, query),
  ])
    .sort((a, b) => fileRank(a) - fileRank(b) || a.localeCompare(b))
    .slice(0, limit)

  return {
    root,
    workspacePath: workspacePathForRoot(root, cwd),
    ...(options.module === undefined ? {} : {moduleId: options.module.id}),
    ...(targetPath === undefined ? {} : {modulePath: targetPath}),
    files: paths.map((path) => {
      const vcsStatus = gitStatuses.get(path)
      const stats = gitStats.get(path)
      return {
        path,
        ...(vcsStatus === undefined ? {} : {vcsStatus}),
        ...(stats === undefined ? {} : stats),
      }
    }),
  }
}

function workspaceRootForLaunch(module: WorkspaceFilesModuleContext | undefined, targetPath: string | undefined, cwd: string): string {
  const targetCwd = normalizeAbsolutePath(module?.target?.cwd ?? cwd)
  if (targetPath !== undefined && isSameOrInside(targetPath, targetCwd)) return targetCwd
  return cwd
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

function collectImportedWorkspaceFiles(root: string, entrypoint: string, query: string): string[] {
  const packageMap = workspacePackageMap(root)
  const files = new Set<string>()
  const seen = new Set<string>()
  const queue = [normalizeAbsolutePath(entrypoint)]

  while (queue.length > 0) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!isSameOrInside(file, root)) continue
    if (!isWorkspaceCatalogFile(file)) continue

    const rel = relative(root, file).replaceAll("\\", "/")
    if (query.length === 0 || rel.toLowerCase().includes(query)) files.add(rel)

    const source = readTextFile(file)
    if (source === undefined) continue
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveImportSpecifier(specifier, dirname(file), root, packageMap)
      if (resolved !== undefined && !seen.has(resolved)) queue.push(resolved)
    }
  }

  return [...files]
}

function mergeWorkspaceCatalogPaths(groups: readonly string[][]): string[] {
  return [...new Set(groups.flat())]
}

type WorkspacePackage = {
  name: string
  root: string
  manifest: Record<string, unknown>
}

function workspacePackageMap(root: string): Map<string, WorkspacePackage> {
  const packages = new Map<string, WorkspacePackage>()
  const stack = [root]

  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, {withFileTypes: true})
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".storybook") continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!WORKSPACE_SKIP_DIRS.has(entry.name)) stack.push(abs)
        continue
      }
      if (!entry.isFile() || entry.name !== "package.json") continue
      const manifest = readJsonFile(abs)
      if (manifest === undefined) continue
      const name = typeof manifest["name"] === "string" ? manifest["name"] : undefined
      if (name !== undefined && name.length > 0) packages.set(name, {name, root: dir, manifest})
    }
  }

  return packages
}

function resolveImportSpecifier(specifier: string, importerDir: string, root: string, packages: Map<string, WorkspacePackage>): string | undefined {
  if (specifier.startsWith("node:") || specifier.startsWith("bun")) return undefined
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const base = specifier.startsWith("/") ? specifier : resolve(importerDir, specifier)
    return resolveFileCandidate(base)
  }

  const packageRef = packageSpecifier(specifier)
  if (packageRef === undefined) return undefined
  const workspacePackage = packages.get(packageRef.name)
  if (workspacePackage === undefined) return undefined
  const packageEntry = resolvePackageEntry(workspacePackage, packageRef.subpath)
  if (packageEntry === undefined) return undefined
  const resolved = resolveFileCandidate(join(workspacePackage.root, packageEntry))
  if (resolved === undefined || !isSameOrInside(resolved, root)) return undefined
  return resolved
}

function packageSpecifier(specifier: string): {name: string; subpath: string} | undefined {
  const parts = specifier.split("/")
  if (specifier.startsWith("@")) {
    if (parts.length < 2) return undefined
    return {
      name: `${parts[0]}/${parts[1]}`,
      subpath: parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".",
    }
  }
  return {
    name: parts[0] ?? "",
    subpath: parts.length > 1 ? `./${parts.slice(1).join("/")}` : ".",
  }
}

function resolvePackageEntry(pkg: WorkspacePackage, subpath: string): string | undefined {
  const exportsValue = pkg.manifest["exports"]
  const exported = exportedPath(exportsValue, subpath)
  if (exported !== undefined) return exported
  if (subpath !== ".") return subpath.slice(2)
  for (const key of ["module", "main"]) {
    const value = pkg.manifest[key]
    if (typeof value === "string") return value
  }
  return "index"
}

function exportedPath(value: unknown, subpath: string): string | undefined {
  if (typeof value === "string") return subpath === "." ? value : undefined
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const direct = record[subpath]
  if (direct !== undefined) return exportedPathValue(direct)
  if (subpath === ".") return exportedPathValue(record["."])
  return undefined
}

function exportedPathValue(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  return exportedPathValue(record["import"])
    ?? exportedPathValue(record["default"])
    ?? exportedPathValue(record["module"])
    ?? exportedPathValue(record["types"])
}

function resolveFileCandidate(base: string): string | undefined {
  const normalized = normalizeAbsolutePath(base)
  const stat = safeStat(normalized)
  if (stat?.isFile() === true && isWorkspaceCatalogFile(normalized)) return normalized
  if (stat?.isDirectory() === true) {
    const packageEntry = resolveDirectoryPackageEntry(normalized)
    if (packageEntry !== undefined) return packageEntry
    for (const ext of WORKSPACE_RESOLVE_EXTENSIONS) {
      const indexed = join(normalized, `index${ext}`)
      if (safeStat(indexed)?.isFile() === true) return normalizeAbsolutePath(indexed)
    }
    return undefined
  }
  for (const ext of WORKSPACE_RESOLVE_EXTENSIONS) {
    const withExt = `${normalized}${ext}`
    if (safeStat(withExt)?.isFile() === true) return normalizeAbsolutePath(withExt)
  }
  return undefined
}

function resolveDirectoryPackageEntry(dir: string): string | undefined {
  const manifest = readJsonFile(join(dir, "package.json"))
  if (manifest === undefined) return undefined
  const exported = exportedPath(manifest["exports"], ".")
  const entry = exported
    ?? (typeof manifest["module"] === "string" ? manifest["module"] : undefined)
    ?? (typeof manifest["main"] === "string" ? manifest["main"] : undefined)
  return entry === undefined ? undefined : resolveFileCandidate(join(dir, entry))
}

function importSpecifiers(source: string): string[] {
  const specifiers = new Set<string>()
  const patterns = [
    /\bimport\s+(?:type\s+)?[^"'()]*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^"']*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier !== undefined) specifiers.add(specifier)
    }
  }
  return [...specifiers]
}

function readTextFile(path: string): string | undefined {
  if (!isTextImportSource(path)) return undefined
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function readJsonFile(path: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
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

function isWorkspaceCatalogFile(path: string): boolean {
  const name = path.split("/").at(-1) ?? path
  return !name.endsWith(".d.ts") && WORKSPACE_FILE_EXTENSIONS.has(extensionOf(name))
}

function isTextImportSource(path: string): boolean {
  const ext = extensionOf(path)
  return ext === ".ts"
    || ext === ".tsx"
    || ext === ".mts"
    || ext === ".cts"
    || ext === ".js"
    || ext === ".jsx"
    || ext === ".mjs"
    || ext === ".cjs"
}

function workspaceGitStatusMap(root: string): Map<string, WorkspaceFileVcsStatus> {
  const output = gitCommandText(["status", "--porcelain", "--untracked-files=normal"], root)
  const statuses = new Map<string, WorkspaceFileVcsStatus>()
  if (output === undefined || output.length === 0) return statuses

  for (const line of output.split("\n")) {
    if (line.length < 4) continue
    const code = line.slice(0, 2)
    const path = normalizeGitStatusPath(line.slice(3))
    if (path.length === 0) continue
    statuses.set(path, gitStatusKind(code))
  }
  return statuses
}

function workspaceGitLineStatsMap(root: string, statuses: ReadonlyMap<string, WorkspaceFileVcsStatus>): Map<string, WorkspaceFileLineStats> {
  const stats = new Map<string, WorkspaceFileLineStats>()
  const output = gitCommandText(["diff", "--numstat", "HEAD", "--"], root)
  if (output !== undefined) {
    for (const line of output.split("\n")) {
      const [addedRaw, deletedRaw, pathRaw] = line.split("\t")
      if (addedRaw === undefined || deletedRaw === undefined || pathRaw === undefined) continue
      const addedLines = nonNegativeInteger(addedRaw)
      const deletedLines = nonNegativeInteger(deletedRaw)
      if (addedLines === undefined || deletedLines === undefined) continue
      const path = normalizeGitStatusPath(pathRaw)
      if (path.length === 0) continue
      stats.set(path, {addedLines, deletedLines})
    }
  }

  for (const [path, status] of statuses) {
    if (status !== "added" || stats.has(path)) continue
    const source = readTextFile(join(root, path))
    if (source === undefined) continue
    stats.set(path, {addedLines: sourceLineCount(source), deletedLines: 0})
  }
  return stats
}

function normalizeGitStatusPath(path: string): string {
  const renamed = path.includes(" -> ") ? path.slice(path.lastIndexOf(" -> ") + 4) : path
  return renamed.trim().replaceAll("\\", "/").replace(/^"|"$/g, "")
}

function gitStatusKind(code: string): WorkspaceFileVcsStatus {
  if (code.includes("D")) return "deleted"
  if (code === "??" || code.includes("A")) return "added"
  return "modified"
}

function gitCommandText(args: readonly string[], cwd: string): string | undefined {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  return result.status === 0 && typeof result.stdout === "string" ? result.stdout : undefined
}

function nonNegativeInteger(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function sourceLineCount(source: string): number {
  if (source.length === 0) return 0
  const lines = source.split("\n").length
  return source.endsWith("\n") ? lines - 1 : lines
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
