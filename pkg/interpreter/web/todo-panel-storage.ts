import type {ToDoPanePanelStateSnapshot} from "@ui/panes"
import {storedStringArray} from "./array-utils.ts"
import {objectParamMaybe} from "./command-params.ts"

const TODO_PANEL_STATE_STORAGE_KEY = "metafor.interpreter.todo.panelState:v1"

export function readStoredTodoPanelState(): ToDoPanePanelStateSnapshot {
  try {
    const raw = localStorage.getItem(TODO_PANEL_STATE_STORAGE_KEY)
    if (raw === null) return emptyTodoPanelState()
    const object = objectParamMaybe(JSON.parse(raw))
    if (object === undefined) return emptyTodoPanelState()
    return {
      highlightedIds: storedStringArray(object["highlightedIds"]),
      expandedCompletedIds: storedStringArray(object["expandedCompletedIds"]),
    }
  } catch {
    return emptyTodoPanelState()
  }
}

export function emptyTodoPanelState(): ToDoPanePanelStateSnapshot {
  return {highlightedIds: [], expandedCompletedIds: []}
}

export function storeTodoPanelState(state: ToDoPanePanelStateSnapshot): void {
  try {
    localStorage.setItem(TODO_PANEL_STATE_STORAGE_KEY, JSON.stringify({
      highlightedIds: state.highlightedIds,
      expandedCompletedIds: state.expandedCompletedIds,
    }))
  } catch {
    // Storage can be unavailable in private contexts.
  }
}
