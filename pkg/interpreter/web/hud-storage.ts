import type {HudSideTabEdge} from "@ui/hud"
import type {UiSurfaceRect} from "@ui/elements"
import {normalizeStoredPaneRect, parseStoredPaneRect} from "./pane-storage.ts"

export const HOST_TERMINAL_SESSION_STORAGE_KEY = "metafor.interpreter.hostTerminal.sessionId"
export const HOST_TERMINAL_HUD_RECT_STORAGE_KEY = "metafor.interpreter.hostTerminal.hudRect:v1"
export const HOST_TERMINAL_CODEX_COMPOSER_RECT_STORAGE_KEY = "metafor.interpreter.hostTerminal.codexComposerRect:v1"
export const HOST_TERMINAL_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.hostTerminal.hudDocked:v1"
export const HOST_TERMINAL_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.hostTerminal.dockPlacement:v1"
export const NETWORK_TERMINAL_SESSION_STORAGE_KEY = "metafor.interpreter.networkTerminal.sessionId:v1"
export const NETWORK_TERMINAL_HUD_RECT_STORAGE_KEY = "metafor.interpreter.networkTerminal.hudRect:v1"
export const NETWORK_TERMINAL_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.networkTerminal.hudDocked:v1"
export const NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY = "metafor.interpreter.networkStatus.autoRefresh:v1"
export const NETWORK_PRODUCT_INTERPRETER_STORAGE_KEY = "metafor.interpreter.networkProduct.viaInterpreter:v1"
export const DISPLAY_ACTION_AUTO_FOCUS_STORAGE_KEY = "metafor.interpreter.display.actionAutoFocus:v1"
export const ANDROID_HUD_RECT_STORAGE_KEY = "metafor.interpreter.android.hudRect:v1"
export const ANDROID_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.android.hudDocked:v1"
export const ANDROID_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.android.dockPlacement:v1"
export const VOICE_SETTINGS_RECT_STORAGE_KEY = "metafor.interpreter.voice.settingsRect:v1"
export const TODO_HUD_RECT_STORAGE_KEY = "metafor.interpreter.todo.hudRect:v1"
export const TODO_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.todo.hudDocked:v1"
export const TODO_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.todo.dockPlacement:v1"
export const SQLITE_HUD_RECT_STORAGE_KEY = "metafor.interpreter.sqlite.hudRect:v1"
export const SQLITE_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.sqlite.hudDocked:v1"
export const SQLITE_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.sqlite.dockPlacement:v1"

export type HostTerminalDockPlacement = {
  edge: HudSideTabEdge
  offset: number
}

export function readStoredHostTerminalSessionId(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

export function writeStoredHostTerminalSessionId(storageKey: string, value: string): void {
  try {
    localStorage.setItem(storageKey, value)
  } catch {
    // Storage can be disabled in private contexts.
  }
}

export function readStoredHostTerminalHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(HOST_TERMINAL_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeHostTerminalHudRect(rect: UiSurfaceRect): void {
  storePaneRect(HOST_TERMINAL_HUD_RECT_STORAGE_KEY, rect)
}

export function readStoredHostCodexComposerRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(HOST_TERMINAL_CODEX_COMPOSER_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeHostCodexComposerRect(rect: UiSurfaceRect): void {
  storePaneRect(HOST_TERMINAL_CODEX_COMPOSER_RECT_STORAGE_KEY, rect)
}

export function readStoredVoiceSettingsRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(VOICE_SETTINGS_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeVoiceSettingsRect(rect: UiSurfaceRect): void {
  storePaneRect(VOICE_SETTINGS_RECT_STORAGE_KEY, rect)
}

export function readStoredNetworkTerminalHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(NETWORK_TERMINAL_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeNetworkTerminalHudRect(rect: UiSurfaceRect): void {
  storePaneRect(NETWORK_TERMINAL_HUD_RECT_STORAGE_KEY, rect)
}

export function readStoredAndroidHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(ANDROID_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeAndroidHudRect(rect: UiSurfaceRect): void {
  storePaneRect(ANDROID_HUD_RECT_STORAGE_KEY, rect)
}

export function readStoredTodoHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(TODO_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeTodoHudRect(rect: UiSurfaceRect): void {
  storePaneRect(TODO_HUD_RECT_STORAGE_KEY, rect)
}

export function readStoredSqliteHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(SQLITE_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeSqliteHudRect(rect: UiSurfaceRect): void {
  storePaneRect(SQLITE_HUD_RECT_STORAGE_KEY, rect)
}

function storePaneRect(storageKey: string, rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(storageKey, JSON.stringify(normalized))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

export function readStoredHostTerminalHudDocked(): boolean {
  try {
    return localStorage.getItem(HOST_TERMINAL_HUD_DOCKED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function writeStoredHostTerminalHudDocked(docked: boolean): void {
  writeStoredBoolean(HOST_TERMINAL_HUD_DOCKED_STORAGE_KEY, docked)
}

export function readStoredNetworkTerminalHudDocked(): boolean {
  try {
    return localStorage.getItem(NETWORK_TERMINAL_HUD_DOCKED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function writeStoredNetworkTerminalHudDocked(docked: boolean): void {
  writeStoredBoolean(NETWORK_TERMINAL_HUD_DOCKED_STORAGE_KEY, docked)
}

export function readStoredNetworkStatusAutoRefreshEnabled(): boolean {
  try {
    const stored = localStorage.getItem(NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY)
    return stored === null ? true : stored === "1"
  } catch {
    return true
  }
}

export function writeStoredNetworkStatusAutoRefreshEnabled(enabled: boolean): void {
  writeStoredBoolean(NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY, enabled)
}

export function readStoredNetworkProductViaInterpreter(): boolean {
  try {
    const stored = localStorage.getItem(NETWORK_PRODUCT_INTERPRETER_STORAGE_KEY)
    return stored === null ? true : stored === "1"
  } catch {
    return true
  }
}

export function writeStoredNetworkProductViaInterpreter(enabled: boolean): void {
  writeStoredBoolean(NETWORK_PRODUCT_INTERPRETER_STORAGE_KEY, enabled)
}

export function readStoredDisplayActionAutoFocusEnabled(): boolean {
  try {
    return localStorage.getItem(DISPLAY_ACTION_AUTO_FOCUS_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function writeStoredDisplayActionAutoFocusEnabled(enabled: boolean): void {
  writeStoredBoolean(DISPLAY_ACTION_AUTO_FOCUS_STORAGE_KEY, enabled)
}

export function readStoredAndroidHudDocked(): boolean {
  try {
    const value = localStorage.getItem(ANDROID_HUD_DOCKED_STORAGE_KEY)
    return value === null ? true : value === "1"
  } catch {
    return true
  }
}

export function writeStoredAndroidHudDocked(docked: boolean): void {
  writeStoredBoolean(ANDROID_HUD_DOCKED_STORAGE_KEY, docked)
}

export function readStoredTodoHudDocked(): boolean {
  try {
    return localStorage.getItem(TODO_HUD_DOCKED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function writeStoredTodoHudDocked(docked: boolean): void {
  writeStoredBoolean(TODO_HUD_DOCKED_STORAGE_KEY, docked)
}

export function readStoredSqliteHudDocked(): boolean {
  try {
    return localStorage.getItem(SQLITE_HUD_DOCKED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function writeStoredSqliteHudDocked(docked: boolean): void {
  writeStoredBoolean(SQLITE_HUD_DOCKED_STORAGE_KEY, docked)
}

function writeStoredBoolean(storageKey: string, value: boolean): void {
  try {
    localStorage.setItem(storageKey, value ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

export function readStoredAndroidDockPlacement(): HostTerminalDockPlacement | null {
  return readStoredDockPlacement(ANDROID_DOCK_PLACEMENT_STORAGE_KEY)
}

export function writeStoredAndroidDockPlacement(placement: HostTerminalDockPlacement): void {
  writeStoredDockPlacement(ANDROID_DOCK_PLACEMENT_STORAGE_KEY, placement)
}

export function readStoredHostTerminalDockPlacement(): HostTerminalDockPlacement | null {
  return readStoredDockPlacement(HOST_TERMINAL_DOCK_PLACEMENT_STORAGE_KEY)
}

export function readStoredTodoDockPlacement(): HostTerminalDockPlacement | null {
  return readStoredDockPlacement(TODO_DOCK_PLACEMENT_STORAGE_KEY)
}

export function readStoredSqliteDockPlacement(): HostTerminalDockPlacement | null {
  return readStoredDockPlacement(SQLITE_DOCK_PLACEMENT_STORAGE_KEY)
}

export function writeStoredHostTerminalDockPlacement(placement: HostTerminalDockPlacement): void {
  writeStoredDockPlacement(HOST_TERMINAL_DOCK_PLACEMENT_STORAGE_KEY, placement)
}

export function writeStoredTodoDockPlacement(placement: HostTerminalDockPlacement): void {
  writeStoredDockPlacement(TODO_DOCK_PLACEMENT_STORAGE_KEY, placement)
}

export function writeStoredSqliteDockPlacement(placement: HostTerminalDockPlacement): void {
  writeStoredDockPlacement(SQLITE_DOCK_PLACEMENT_STORAGE_KEY, placement)
}

function readStoredDockPlacement(storageKey: string): HostTerminalDockPlacement | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return null
    const value = JSON.parse(raw) as Partial<HostTerminalDockPlacement>
    if (!isHostTerminalDockEdge(value.edge) || typeof value.offset !== "number" || !Number.isFinite(value.offset)) return null
    return {edge: value.edge, offset: value.offset}
  } catch {
    return null
  }
}

function writeStoredDockPlacement(storageKey: string, placement: HostTerminalDockPlacement): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(placement))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function isHostTerminalDockEdge(value: unknown): value is HudSideTabEdge {
  return value === "left" || value === "right" || value === "top" || value === "bottom"
}
