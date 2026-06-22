import type {FileListItem} from "@ui/panes"

export type WorkspaceFilesLookupState = {
  root: string | null
  workspacePath: string
  items: readonly FileListItem[]
}

export type WorkspaceFilesContextState = WorkspaceFilesLookupState & {
  modulePath: string | null
  rootLabel: string | null
  selectedIds: readonly string[]
}

export type WorkspaceFilesRevealState = WorkspaceFilesLookupState & {
  expandedIds: readonly string[]
}

export type WorkspaceFileContextItem = {
  id: string
  name: string
  kind: FileListItem["kind"]
  path: string
  sourceUrl?: string
}

export type WorkspaceFilesContextSnapshot = {
  root: string | null
  workspacePath: string
  modulePath: string | null
  rootLabel: string | null
  selectedIds: string[]
  selectedItems: WorkspaceFileContextItem[]
  selectedFiles: WorkspaceFileContextItem[]
}

export type WorkspaceSourceOpenRevealOptions = {
  revealInWorkspace?: boolean
}

export function shouldRevealWorkspaceForSourceOpen(options: WorkspaceSourceOpenRevealOptions): boolean {
  return options.revealInWorkspace === true
}

export type WorkspaceFileTreeOptions = {
  mutedFileIds?: readonly string[]
}

export function workspaceFileTree(paths: readonly string[], options: WorkspaceFileTreeOptions = {}): FileListItem[] {
  const root: WorkspaceTreeNode = {id: "", name: "", dirs: new Map(), files: []}
  const mutedFileIds = new Set(options.mutedFileIds ?? [])
  for (const rawPath of paths) {
    const path = normalizeWorkspaceFilePath(rawPath)
    if (path === null) continue
    if (isWorkspaceDirectoryMarker(rawPath)) {
      addWorkspaceDirectory(root, path)
      continue
    }
    const parts = path.split("/")
    const fileName = parts.pop()
    if (fileName === undefined || fileName.length === 0) continue
    let node = root
    let currentPath = ""
    for (const part of parts) {
      currentPath = currentPath.length === 0 ? part : `${currentPath}/${part}`
      let child = node.dirs.get(part)
      if (child === undefined) {
        child = {id: currentPath, name: part, dirs: new Map(), files: []}
        node.dirs.set(part, child)
      }
      node = child
    }
    node.files.push({
      id: path,
      name: fileName,
      kind: "file",
      path,
      ...(mutedFileIds.has(path) ? {muted: true} : {}),
    })
  }
  return workspaceTreeChildren(root)
}

function addWorkspaceDirectory(root: WorkspaceTreeNode, path: string): void {
  const parts = path.split("/")
  let node = root
  let currentPath = ""
  for (const part of parts) {
    currentPath = currentPath.length === 0 ? part : `${currentPath}/${part}`
    let child = node.dirs.get(part)
    if (child === undefined) {
      child = {id: currentPath, name: part, dirs: new Map(), files: []}
      node.dirs.set(part, child)
    }
    node = child
  }
}

function isWorkspaceDirectoryMarker(path: string): boolean {
  return path.trim().replaceAll("\\", "/").endsWith("/")
}

export function workspaceDirectoryIds(items: readonly FileListItem[]): string[] {
  const ids: string[] = []
  for (const item of items) {
    if (item.kind !== "directory") continue
    ids.push(item.id)
    if (item.children !== undefined) ids.push(...workspaceDirectoryIds(item.children))
  }
  return ids
}

export function workspaceFileRevealState(state: WorkspaceFilesRevealState, sources: readonly string[]): {expandedIds: string[]; selectedIds: string[]} | null {
  const fileId = workspaceFileIdForSources(state, sources)
  if (fileId === null) return null
  return {
    expandedIds: [...new Set([...state.expandedIds, ...workspaceParentIds(fileId)])],
    selectedIds: [fileId],
  }
}

export function workspaceFilesContextSnapshot(state: WorkspaceFilesContextState): WorkspaceFilesContextSnapshot {
  const selectedItems = workspaceSelectedContextItems(state.items, state.selectedIds, state.root)
  return {
    root: state.root,
    workspacePath: state.workspacePath,
    modulePath: state.modulePath,
    rootLabel: state.rootLabel,
    selectedIds: selectedItems.map((item) => item.id),
    selectedItems,
    selectedFiles: selectedItems.filter((item) => item.kind === "file"),
  }
}

export function workspaceFileSourceUrl(root: string | null, item: Pick<FileListItem, "id" | "path">): string {
  const itemPath = typeof item.path === "string" && item.path.length > 0 ? item.path : item.id
  if (root === null || root.trim().length === 0) return itemPath
  return `${root.replaceAll("\\", "/").replace(/\/+$/, "")}/${itemPath.replaceAll("\\", "/").replace(/^\/+/, "")}`
}

export function workspaceFileIdForSources(state: WorkspaceFilesLookupState, sources: readonly string[]): string | null {
  const knownIds = new Set(workspaceFileIds(state.items))
  for (const candidate of sources) {
    const direct = workspaceFileIdCandidates(candidate, state)
    for (const id of direct) {
      if (knownIds.has(id)) return id
    }
  }

  for (const candidate of sources) {
    const normalized = normalizeSourceFilePath(candidate)
    if (normalized.length === 0) continue
    const suffixMatches = [...knownIds].filter((id) => normalized === id || normalized.endsWith(`/${id}`))
    if (suffixMatches.length === 1) return suffixMatches[0]!
  }
  return null
}

export function workspaceFileIdForSourcePath(state: WorkspaceFilesLookupState, source: string): string | null {
  return workspaceFileIdCandidates(source, state)[0] ?? null
}

export function workspaceParentIds(fileId: string): string[] {
  const parts = fileId.split("/")
  const parents: string[] = []
  let current = ""
  for (let idx = 0; idx < parts.length - 1; idx++) {
    current = current.length === 0 ? parts[idx]! : `${current}/${parts[idx]!}`
    parents.push(current)
  }
  return parents
}

export function workspaceFileIds(items: readonly FileListItem[]): string[] {
  const ids: string[] = []
  for (const item of items) {
    if (item.kind === "file") ids.push(item.id)
    if (item.children !== undefined) ids.push(...workspaceFileIds(item.children))
  }
  return ids
}

export function normalizeWorkspaceExpandedIds(ids: readonly string[], items: readonly FileListItem[]): string[] {
  const known = new Set(workspaceDirectoryIds(items))
  const next: string[] = []
  for (const id of ids) {
    if (!known.has(id) || next.includes(id)) continue
    next.push(id)
  }
  return next
}

export function workspaceRootLabel(root: string | undefined): string | null {
  if (root === undefined) return null
  const normalized = root.trim().replaceAll("\\", "/").replace(/\/+$/, "")
  if (normalized.length === 0) return null
  const parts = normalized.split("/").filter((part) => part.length > 0)
  return parts[parts.length - 1] ?? normalized
}

export function normalizeSourceFilePath(path: string): string {
  const clean = stripSourceLine(path).trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  if (clean.startsWith("file:")) {
    try {
      const url = new URL(clean)
      return normalizeWorkspacePath(decodeURIComponent(url.pathname))
    } catch {
      return normalizeWorkspacePath(clean)
    }
  }
  return normalizeWorkspacePath(clean)
}

export function stripSourceLine(path: string): string {
  const match = /^(.*):\d+(?::\d+)?$/.exec(path)
  if (match === null) return path
  if (/^[a-zA-Z]:[\\/]/.test(path)) return path
  return match[1]!
}

export function normalizeWorkspacePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "")
}

function workspaceFileIdCandidates(source: string, state: WorkspaceFilesLookupState): string[] {
  const candidates = new Set<string>()
  const add = (value: string): void => {
    const normalized = normalizeWorkspaceFilePath(value)
    if (normalized === null) return
    candidates.add(normalized)
  }

  if (hasUnsupportedSourceScheme(source)) return []
  const normalized = normalizeSourceFilePath(source)
  if (normalized.length === 0) return []

  if (normalized.startsWith("r/")) {
    const relative = normalized.slice(2)
    const withoutPrefix = stripWorkspacePathPrefix(relative, state.workspacePath)
    if (withoutPrefix !== relative) add(withoutPrefix)
    add(relative)
  }

  const root = normalizeSourceFilePath(state.root ?? "")
  if (root.length > 0 && sourcePathSameOrInside(normalized, root) && normalized !== root) {
    add(normalized.slice(root.length + 1))
  }

  if (!isAbsoluteSourcePath(normalized)) {
    const withoutPrefix = stripWorkspacePathPrefix(normalized, state.workspacePath)
    if (withoutPrefix !== normalized) add(withoutPrefix)
    add(normalized)
  }

  return [...candidates]
}

function hasUnsupportedSourceScheme(path: string): boolean {
  const clean = stripSourceLine(path).trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  if (clean.startsWith("file:")) return false
  if (/^[a-zA-Z]:\//.test(clean)) return false
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(clean)
}

function isAbsoluteSourcePath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:\//.test(path)
}

function sourcePathSameOrInside(path: string, parent: string): boolean {
  if (parent === "/") return path.startsWith("/")
  return path === parent || path.startsWith(`${parent}/`)
}

type WorkspaceTreeNode = {
  id: string
  name: string
  dirs: Map<string, WorkspaceTreeNode>
  files: FileListItem[]
}

function workspaceTreeChildren(node: WorkspaceTreeNode): FileListItem[] {
  const dirs = [...node.dirs.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((dir): FileListItem => ({
      id: dir.id,
      name: dir.name,
      kind: "directory",
      path: dir.id,
      children: workspaceTreeChildren(dir),
    }))
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
}

function workspaceSelectedContextItems(items: readonly FileListItem[], selectedIds: readonly string[], root: string | null): WorkspaceFileContextItem[] {
  const wanted = new Set(selectedIds)
  const found = new Map<string, FileListItem>()
  collectSelectedItems(items, wanted, found)
  const emitted = new Set<string>()
  const result: WorkspaceFileContextItem[] = []
  for (const id of selectedIds) {
    if (emitted.has(id)) continue
    emitted.add(id)
    const item = found.get(id)
    if (item === undefined) continue
    result.push(workspaceFileContextItem(root, item))
  }
  return result
}

function collectSelectedItems(items: readonly FileListItem[], wanted: ReadonlySet<string>, found: Map<string, FileListItem>): void {
  if (found.size >= wanted.size) return
  for (const item of items) {
    if (wanted.has(item.id)) found.set(item.id, item)
    if (item.children !== undefined) collectSelectedItems(item.children, wanted, found)
    if (found.size >= wanted.size) return
  }
}

function workspaceFileContextItem(root: string | null, item: FileListItem): WorkspaceFileContextItem {
  const path = typeof item.path === "string" && item.path.length > 0 ? item.path : item.id
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    path,
    ...(item.kind === "file" ? {sourceUrl: workspaceFileSourceUrl(root, item)} : {}),
  }
}

function normalizeWorkspaceFilePath(path: string): string | null {
  const normalized = path.trim().replaceAll("\\", "/")
  if (normalized.length === 0) return null
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".")
  if (parts.length === 0 || parts.some((part) => part === "..")) return null
  return parts.join("/")
}

function stripWorkspacePathPrefix(path: string, workspacePath: string): string {
  const prefix = normalizeWorkspacePath(workspacePath)
  if (prefix.length === 0) return path
  if (path === prefix) return ""
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path
}
