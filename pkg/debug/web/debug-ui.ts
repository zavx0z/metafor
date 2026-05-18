/**
 * debug-ui.ts — barrel-модуль с типами и re-export'ами карточек.
 *
 * Все карточки теперь сидят на Card-системе из @metafor/ui:
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
  commandBusy: boolean
  commandCmd: string
  commandLabel: string
  draftVisible: boolean
  draftStatus: string
  draftKind: BadgeKind
  locale: "ru" | "en"
  inspectorUrl: string
  verbose: boolean
  engine: string
}

export type ToolbarActions = {
  onPause(): void
  onResume(): void
  onRestartTarget(): void
  onStep(kind: "over" | "into" | "out"): void
  onToggleDraft(): void
  onSaveDraft(): void
  onToggleLocale(): void
  onToggleVerbose(): void
}

export type PropertySnapshot = {
  type?: string
  subtype?: string
  className?: string
  value?: unknown
  description?: string
  objectId?: string
  preview?: unknown
}

export type ScopeSnapshot = {
  type: "local" | "closure"
  name?: string
  objectId?: string
  properties: Record<string, PropertySnapshot>
  error?: string
}

export type FrameSnapshot = {
  index: number
  function: string
  url: string
  line: number
  column: number
  sourceKind?: "runtime" | "sourcemap"
  scriptId?: string
  callFrameId?: string
  scopes: {
    local: ScopeSnapshot[]
    closure: ScopeSnapshot[]
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

export {FramesCard} from "./frames-card.ts"
export {VerboseCard} from "./verbose-card.ts"
export {ToolbarCard} from "./toolbar-card.ts"
export {ScopesEvalCard} from "./scopes-eval-card.ts"
export {WelcomeCard} from "./welcome-card.ts"
