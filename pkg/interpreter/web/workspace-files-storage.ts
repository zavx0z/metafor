import {storedStringArray} from "./array-utils.ts"
import {normalizeWorkspaceOpenedFileIds} from "./workspace-files.ts"

const WORKSPACE_FILES_STATE_STORAGE_PREFIX = "metafor.interpreter.workspaceFiles:v1"

export type WorkspaceFilesStoredState = {
  expandedIds: string[]
  selectedIds: string[]
  openedFileIds: string[]
}

export type WorkspaceFilesStoredSource = {
  storageKey: string
  expandedIds: readonly string[]
  selectedIds: readonly string[]
  openedFileIds: readonly string[]
}

export function workspaceFilesStorageKey(root: string | undefined, moduleId: string): string {
  const normalized = root?.trim().replaceAll("\\", "/").replace(/\/+$/, "")
  const rootKey = normalized === undefined || normalized.length === 0 ? "default" : normalized
  return `${WORKSPACE_FILES_STATE_STORAGE_PREFIX}:${moduleId}:${rootKey}`
}

export function readStoredWorkspaceFilesState(storageKey: string): WorkspaceFilesStoredState {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return emptyWorkspaceFilesStoredState()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      expandedIds: storedStringArray(parsed.expandedIds),
      selectedIds: storedStringArray(parsed.selectedIds),
      openedFileIds: normalizeWorkspaceOpenedFileIds(storedStringArray(parsed.openedFileIds)),
    }
  } catch {
    return emptyWorkspaceFilesStoredState()
  }
}

export function writeStoredWorkspaceFilesState(state: WorkspaceFilesStoredSource): void {
  try {
    localStorage.setItem(state.storageKey, JSON.stringify({
      expandedIds: state.expandedIds,
      selectedIds: state.selectedIds,
      openedFileIds: state.openedFileIds,
    }))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function emptyWorkspaceFilesStoredState(): WorkspaceFilesStoredState {
  return {expandedIds: [], selectedIds: [], openedFileIds: []}
}
