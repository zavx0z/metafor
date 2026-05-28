/**
 * interpreter-ui.ts — barrel-модуль с типами и re-export'ами pane.
 *
 * Все pane теперь сидят на UiSurface-системе из @ui/elements:
 * фиксированный rect, bg/border managed by UiSurface, текст обрезается через
 * измерение font-метрик. Ничего не вылазит за пределы pane.
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
  locale: "ru" | "en"
  protocolUrl: string
  verbose: boolean
  engine: string
  canShowExecutionPoint: boolean
}

export type ToolbarActions = {
  onPause(): void
  onResume(): void
  onRestartTarget(): void
  onStopTarget(): void
  onShowExecutionPoint(): void
  onStep(kind: "over" | "into" | "out"): void
  onToggleLocale(): void
  onToggleVerbose(): void
}

export type PropertySnapshot = {
  type?: string
  subtype?: string
  className?: string
  value?: unknown
  unserializableValue?: string
  description?: string
  objectId?: string
  preview?: unknown
  get?: PropertySnapshot
  set?: PropertySnapshot
  wasThrown?: boolean
  enumerable?: boolean
  configurable?: boolean
  writable?: boolean
  isOwn?: boolean
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

export {DisplayHoverOutlinePane} from "./display-hover-outline-pane.ts"
export {FramesPane} from "./frames-pane.ts"
export {VerbosePane} from "./verbose-pane.ts"
export {ToolbarPane} from "./toolbar-pane.ts"
export {ScopesEvalPane} from "./scopes-eval-pane.ts"
