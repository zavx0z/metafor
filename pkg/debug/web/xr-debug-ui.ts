/**
 * xr-debug-ui.ts — barrel-модуль с типами и re-export'ами карточек.
 *
 * Все карточки теперь сидят на единой Card-системе (xr-card.ts):
 * фиксированный rect, bg/border managed by Card, текст обрезается через
 * измерение font-метрик. Ничего не вылазит за пределы карточки.
 */

export type BadgeKind = "neutral" | "live" | "paused" | "warn"

export type ToolbarState = {
  ws: string
  wsKind: BadgeKind
  connection: string
  connectionKind: BadgeKind
  run: string
  runKind: BadgeKind
  inspectorUrl: string
  verbose: boolean
  engine: string
}

export type ToolbarActions = {
  onPause(): void
  onResume(): void
  onStep(kind: "over" | "into" | "out"): void
  onToggleVerbose(): void
}

export type XrPropertySnapshot = {
  type?: string
  subtype?: string
  className?: string
  value?: unknown
  description?: string
  objectId?: string
  preview?: unknown
}

export type XrScopeSnapshot = {
  type: "local" | "closure"
  name?: string
  objectId?: string
  properties: Record<string, XrPropertySnapshot>
  error?: string
}

export type XrFrameSnapshot = {
  index: number
  function: string
  url: string
  line: number
  column: number
  scriptId?: string
  callFrameId?: string
  scopes: {
    local: XrScopeSnapshot[]
    closure: XrScopeSnapshot[]
  }
}

export type WelcomeState = {
  connectionState: "connecting" | "connected" | "disconnected"
  connectionError: string | null
  inspectorUrl: string
  targetStatus: string
  defaultCommand: string
  pauseOnStart: boolean
}

export type WelcomeActions = {
  onRun(command: string, pauseOnStart: boolean): void
  onStop(): void
  onApplyInspector(url: string): void
  onPauseOnStart(pause: boolean): void
}

export {XrFramesCard} from "./xr-frames-card.ts"
export {XrVerboseCard} from "./xr-verbose-card.ts"
export {XrToolbarCard} from "./xr-toolbar-card.ts"
export {XrScopesEvalCard} from "./xr-scopes-eval-card.ts"
export {XrWelcomeCard} from "./xr-welcome-card.ts"
