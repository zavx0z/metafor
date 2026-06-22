/**
 * TerminalPane — универсальная терминальная поверхность поверх WebGPU UI.
 *
 * Компонент не знает о PTY, WebSocket или конкретном сервере:
 * внешний адаптер пишет вывод через `write()`, а пользовательский ввод
 * получает через `onInput`.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {UiSurface, Z, div, divScrollPosition, divScrollTo, palette, radii, visionBorder, visionGlass, type DivScrollContext, type Tone, type VirtualInputSoftKeyboardMode} from "@ui/elements"
import {Divider as controlDivider, IconButton as controlIconButton, uiIcons} from "@ui/components"
import {
  copyTextSelectionOrFallback,
  orderedTextSelection,
  readClipboardText,
  sameTextPosition,
  textFromRange,
  wordRangeAt,
  type TextPosition,
  type TextSelectionRange,
} from "../text-clipboard.ts"
import {
  PANE_FRAME,
  beginPaneFrameDrag,
  paneBodyRect,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
  paneHeaderRuleRect,
  type PaneFrameDrag,
  type PaneFrameInteractionOpts,
  type PaneRect,
} from "../pane-frame.ts"

export type TerminalSize = {
  cols: number
  rows: number
}

export type TerminalStatusKind = "idle" | "connected" | "running" | "disconnected" | "error"

export type TerminalInputSource = "keyboard" | "paste" | "api"

export type TerminalSelectionSnapshot = {
  /** 0-based terminal output line. */
  anchor: TextPosition
  /** 0-based terminal output line. */
  focus: TextPosition
  /** 0-based terminal output line. */
  start: TextPosition
  /** 0-based terminal output line. */
  end: TextPosition
  text: string
}

export type TerminalHeaderControl = {
  label: string
  iconSrc: string
  tone?: Tone
  active?: boolean
  disabled?: boolean
  dividerAfter?: boolean
  action(): void
}

export type TerminalHeaderControls = {
  primary?: readonly TerminalHeaderControl[]
  secondary?: readonly TerminalHeaderControl[]
}

type TerminalOutputPaneOpts = {
  title?: string
  status?: string
  statusKind?: TerminalStatusKind
  headerControls?: TerminalHeaderControls
  fontPx?: number
  linePx?: number
  cols?: number
  rows?: number
  minCols?: number
  minRows?: number
  maxScrollback?: number
  fitToRect?: boolean
  showHeader?: boolean
  wrapLines?: boolean
  wrapMode?: "char" | "word"
  contentHeightMode?: "grid" | "text"
  reflowOnResize?: boolean
  scrollX?: boolean
  scrollY?: boolean
  draggable?: boolean
  resizable?: boolean
  cursorBlink?: boolean
  cursorLineHighlight?: boolean
  cursorLineFill?: Color
  showCursor?: boolean
  cursorWhenBlurred?: boolean
  onResize?: (size: TerminalSize) => void
  onFocusChange?: (focused: boolean) => void
  onFrameRectPreview?: (rect: PaneRect) => void
  onFrameRectChange?: (rect: PaneRect) => void
  onFrameDockRequest?: () => void
}

type TerminalOutputPaneInternalOpts = TerminalOutputPaneOpts & {
  contentWidthMode?: "grid" | "text"
}

export type TerminalPaneOpts = TerminalOutputPaneOpts & {
  inputEnabled?: boolean
  respondToTerminalQueries?: boolean
  terminalQueryMode?: "all" | "cursor" | "none"
  onInput?: (data: string, source: TerminalInputSource) => void
}

export type LogViewerPaneOpts = Pick<
  TerminalOutputPaneOpts,
  | "title"
  | "status"
  | "statusKind"
  | "fontPx"
  | "linePx"
  | "cols"
  | "rows"
  | "minCols"
  | "minRows"
  | "maxScrollback"
  | "fitToRect"
  | "showHeader"
  | "wrapLines"
  | "scrollX"
  | "scrollY"
  | "draggable"
  | "resizable"
>

type TerminalColor =
  | {kind: "default"}
  | {kind: "ansi"; index: number}
  | {kind: "rgb"; r: number; g: number; b: number}

export type TerminalStyleColor =
  | {kind: "default"}
  | {kind: "ansi"; index: number}
  | {kind: "rgb"; r: number; g: number; b: number}

export type TerminalStyleCell = {
  ch: string
  width: 0 | 1 | 2
  fg: TerminalStyleColor
  bg: TerminalStyleColor | null
  underlineColor: TerminalStyleColor | null
  bold: boolean
  dim: boolean
  underline: boolean
  inverse: boolean
}

type TerminalAttr = {
  fg: TerminalColor
  bg: TerminalColor | null
  underlineColor: TerminalColor | null
  bold: boolean
  dim: boolean
  underline: boolean
  inverse: boolean
}

type TerminalCell = {
  ch: string
  attr: TerminalAttr
  width: 0 | 1 | 2
}

export type TerminalKeyboardMode = {
  applicationCursorKeys: boolean
  applicationKeypad: boolean
  bracketedPaste: boolean
}

export type TerminalPaneState = TerminalKeyboardMode & {
  alternateScreen: boolean
  cursorVisible: boolean
  localEcho: boolean
}

type TerminalOutputSnapshot = {
  scrollback: TerminalCell[][]
  screen: TerminalCell[][]
  cursorRow: number
  cursorCol: number
  pendingWrap: boolean
  scrollTop: number
  scrollBottom: number
  savedCursor: {row: number; col: number} | null
  autoWrap: boolean
  originMode: boolean
  applicationCursorKeys: boolean
  applicationKeypad: boolean
  bracketedPaste: boolean
  mouseMode: TerminalMouseMode
  sgrMouse: boolean
  alternateScreen: boolean
  selectionAnchor: TextPosition | null
  selectionFocus: TextPosition | null
  dragSelecting: boolean
  attr: TerminalAttr
  wordWrapBuffer: TerminalCell[]
  parserMode: ParserMode
  sequence: string
  oscEsc: boolean
  showCursor: boolean
  rawOutput: string
  scrollPosition: {left: number; top: number}
}

type TouchScrollGesture = {
  startX: number
  startY: number
  lastX: number
  lastY: number
  mode: "pending" | "scrolling" | "selecting"
  selectionMoved: boolean
  longPressTimer: ReturnType<typeof setTimeout> | null
}

type PendingLocalEcho = {
  snapshot: TerminalOutputSnapshot
  pending: string[]
  confirmed: string[]
}

type ParserMode = "text" | "esc" | "csi" | "osc" | "charset"
type TerminalQueryKind = "cursor" | "deviceAttributes" | "color"
type TerminalMouseMode = "none" | "normal" | "button" | "any"

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
const DEFAULT_MIN_COLS = 24
const DEFAULT_MIN_ROWS = 6
const DEFAULT_MAX_SCROLLBACK = 5000
const HEADER_H_PX = PANE_FRAME.headerHeight
const HEADER_CONTROL_PAD_X = PANE_FRAME.headerTextX
const HEADER_CONTROL_H_PX = 24
const HEADER_CONTROL_W_PX = 26
const HEADER_CONTROL_GAP_PX = 3
const HEADER_CONTROL_DIVIDER_GAP_PX = 7
const HEADER_CONTROL_DIVIDER_W_PX = 1
const HEADER_STATUS_RADIUS_PX = 6
const BODY_PAD_X_PX = 0
const BODY_PAD_Y_PX = 0
const STATUS_DOT_PX = 7
const SCROLLBAR_W_PX = 4
const CARET_BLINK_MS = 530
const AUTOSCROLL_TOLERANCE_PX = 20
const TOUCH_SCROLL_THRESHOLD_PX = 6
const TOUCH_LONG_PRESS_MS = 500
const TERMINAL_SCROLL_KEY = "terminal-pane:scroll"
const TERMINAL_BG = withAlpha(visionGlass, 0.64)
const TERMINAL_BORDER = visionBorder
const HEADER_RULE = withAlpha(palette.borderDim, 0.82)
const STATUS_FILL = withAlpha(palette.bgInput, 0.56)
const STATUS_BORDER = withAlpha(palette.borderBright, 0.12)
const CURSOR_FILL = withAlpha(palette.cyan, 0.74)
const CURSOR_LINE_FILL = withAlpha(mixColor(TERMINAL_BG, palette.text, 0.08), 0.64)
const SELECTION_FILL = new Color(92 / 255, 155 / 255, 0.34)
const DEFAULT_FG: TerminalColor = {kind: "default"}
const DEFAULT_ATTR: TerminalAttr = {
  fg: DEFAULT_FG,
  bg: null,
  underlineColor: null,
  bold: false,
  dim: false,
  underline: false,
  inverse: false,
}

const ANSI_COLORS = [
  new Color(0x00, 0x00, 0x00, 1),
  new Color(0xcd, 0x31, 0x31, 1),
  new Color(0x0d, 0xbc, 0x79, 1),
  new Color(0xe5, 0xe5, 0x10, 1),
  new Color(0x24, 0x72, 0xc8, 1),
  new Color(0xbc, 0x3f, 0xbc, 1),
  new Color(0x11, 0xa8, 0xcd, 1),
  new Color(0xe5, 0xe5, 0xe5, 1),
  new Color(0x66, 0x66, 0x66, 1),
  new Color(0xf1, 0x4c, 0x4c, 1),
  new Color(0x23, 0xd1, 0x8b, 1),
  new Color(0xf5, 0xf5, 0x43, 1),
  new Color(0x3b, 0x8e, 0xea, 1),
  new Color(0xd6, 0x70, 0xd6, 1),
  new Color(0x29, 0xb8, 0xdb, 1),
  new Color(0xff, 0xff, 0xff, 1),
] as const

class TerminalOutputPane extends UiSurface {
  #title: string
  #status: string
  #statusKind: TerminalStatusKind
  #headerControls: Required<TerminalHeaderControls>
  #fontPx: number
  #linePx: number
  #minCols: number
  #minRows: number
  #maxScrollback: number
  #fitToRect: boolean
  #showHeader: boolean
  #wrapLines: boolean
  #scrollX: boolean
  #scrollY: boolean
  #draggable: boolean
  #resizable: boolean
  #reflowOnResize: boolean
  #wrapMode: "char" | "word"
  #contentWidthMode: "grid" | "text"
  #contentHeightMode: "grid" | "text"
  #cursorBlink: boolean
  #cursorLineHighlight: boolean
  #cursorLineFill: Color
  #cursorEnabled: boolean
  #cursorWhenBlurred: boolean
  #onResize: ((size: TerminalSize) => void) | undefined
  #onFocusChange: ((focused: boolean) => void) | undefined
  #onFrameRectPreview: ((rect: PaneRect) => void) | undefined
  #onFrameRectChange: ((rect: PaneRect) => void) | undefined
  #onFrameDockRequest: (() => void) | undefined

  #preferredCols: number
  #cols: number
  #rows: number
  #scrollback: TerminalCell[][] = []
  #screen: TerminalCell[][]
  #cursorRow = 0
  #cursorCol = 0
  #pendingWrap = false
  #scrollTop = 0
  #scrollBottom: number
  #savedCursor: {row: number; col: number} | null = null
  #autoWrap = true
  #originMode = false
  #applicationCursorKeys = false
  #applicationKeypad = false
  #bracketedPaste = false
  #mouseMode: TerminalMouseMode = "none"
  #sgrMouse = false
  #mouseButtonDown: number | null = null
  #alternateScreen = false
  #selectionAnchor: TextPosition | null = null
  #selectionFocus: TextPosition | null = null
  #dragSelecting = false
  #dragAnchorLocalX = 0
  #dragAnchorLocalY = 0
  #attr: TerminalAttr = cloneAttr(DEFAULT_ATTR)
  #defaultFg: TerminalColor = DEFAULT_FG
  #defaultBg: TerminalColor | null = null
  #cursorFill = CURSOR_FILL
  #wordWrapBuffer: TerminalCell[] = []
  #parserMode: ParserMode = "text"
  #sequence = ""
  #oscEsc = false
  #showCursor = true
  #focused = false
  #cursorVisible = true
  #autoscrollPinned = false
  #cursorTimer: ReturnType<typeof setInterval> | null = null
  #charWidth = 0
  #charWidthScale = 0
  #lastEmittedSize: TerminalSize | null = null
  #touchScrollGesture: TouchScrollGesture | null = null
  #decoder = new TextDecoder()
  #rawOutput = ""
  #frameDrag: PaneFrameDrag | null = null
  readonly #materials = new Map<string, TextMaterial>()

  constructor(opts: TerminalOutputPaneInternalOpts = {}) {
    super({
      bgColor: TERMINAL_BG,
      borderColor: TERMINAL_BORDER,
      borderWidthPx: 1,
      borderRadiusPx: radii.pane,
    })
    this.node.name = "TerminalOutputPane"
    this.#title = opts.title ?? "Terminal"
    this.#status = opts.status ?? "idle"
    this.#statusKind = opts.statusKind ?? "idle"
    this.#headerControls = normalizeHeaderControls(opts.headerControls)
    this.#fontPx = opts.fontPx ?? 12
    this.#linePx = opts.linePx ?? 17
    this.#preferredCols = clampInt(opts.cols ?? DEFAULT_COLS, 1, 400)
    this.#cols = this.#preferredCols
    this.#rows = clampInt(opts.rows ?? DEFAULT_ROWS, 1, 160)
    this.#scrollBottom = this.#rows - 1
    this.#minCols = clampInt(opts.minCols ?? DEFAULT_MIN_COLS, 1, 400)
    this.#minRows = clampInt(opts.minRows ?? DEFAULT_MIN_ROWS, 1, 160)
    this.#maxScrollback = clampInt(opts.maxScrollback ?? DEFAULT_MAX_SCROLLBACK, 0, 100000)
    this.#fitToRect = opts.fitToRect ?? true
    this.#showHeader = opts.showHeader ?? true
    this.#wrapLines = opts.wrapLines ?? true
    this.#scrollX = opts.scrollX ?? false
    this.#scrollY = opts.scrollY ?? true
    this.#draggable = opts.draggable ?? false
    this.#resizable = opts.resizable ?? false
    this.#reflowOnResize = opts.reflowOnResize ?? false
    this.#wrapMode = opts.wrapMode ?? "char"
    this.#contentWidthMode = opts.contentWidthMode ?? "grid"
    this.#contentHeightMode = opts.contentHeightMode ?? "grid"
    this.#cursorBlink = opts.cursorBlink ?? true
    this.#cursorLineHighlight = opts.cursorLineHighlight ?? false
    this.#cursorLineFill = opts.cursorLineFill ?? CURSOR_LINE_FILL
    this.#cursorEnabled = opts.showCursor ?? true
    this.#cursorWhenBlurred = opts.cursorWhenBlurred ?? false
    this.#showCursor = this.#cursorEnabled
    this.#cursorVisible = this.#cursorEnabled
    this.#onResize = opts.onResize
    this.#onFocusChange = opts.onFocusChange
    this.#onFrameRectPreview = opts.onFrameRectPreview
    this.#onFrameRectChange = opts.onFrameRectChange
    this.#onFrameDockRequest = opts.onFrameDockRequest
    this.#screen = Array.from({length: this.#rows}, () => this.#blankLine())
  }

  // ────────── публичный API ──────────

  write(data: string | Uint8Array): void {
    const text = typeof data === "string" ? data : this.#decoder.decode(data, {stream: true})
    if (text.length === 0) return
    if (this.#reflowOnResize) this.#rawOutput += text
    this.#appendOutput(text)
  }

  #appendOutput(text: string): void {
    if (!this.#dragSelecting) this.#clearSelectionState()
    const wasAtBottom = this.#isAtBottom()
    this.#consume(text)
    this.#flushWordWrapBuffer()
    if (this.#autoscrollPinned || wasAtBottom) this.#scrollToBottom()
    this.requestRender()
  }

  writeln(line = ""): void {
    this.write(`${line}\r\n`)
  }

  clear(): void {
    this.#rawOutput = ""
    this.#clearBuffer()
    this.requestRender()
  }

  #clearBuffer(): void {
    this.#scrollback = []
    this.#screen = Array.from({length: this.#rows}, () => this.#blankLine())
    this.#cursorRow = 0
    this.#cursorCol = 0
    this.#pendingWrap = false
    this.#scrollTop = 0
    this.#scrollBottom = this.#rows - 1
    this.#wordWrapBuffer = []
    this.#clearSelectionState()
    divScrollTo(this, TERMINAL_SCROLL_KEY, {left: 0, top: 0})
  }

  reset(): void {
    this.#attr = cloneAttr(DEFAULT_ATTR)
    this.#parserMode = "text"
    this.#sequence = ""
    this.#oscEsc = false
    this.#showCursor = this.#cursorEnabled
    this.#applicationCursorKeys = false
    this.#applicationKeypad = false
    this.#bracketedPaste = false
    this.#autoWrap = true
    this.#originMode = false
    this.#mouseMode = "none"
    this.#sgrMouse = false
    this.#mouseButtonDown = null
    this.#alternateScreen = false
    this.#wordWrapBuffer = []
    this.clear()
  }

  focus(): void {
    if (this.canvas === null) return
    if (!this.#focused) this.canvas.setFocused(null)
    this.canvas.setFocused(this)
    this.canvas.inputProxy?.focus({softKeyboard: this.softKeyboardInputMode() === "text"})
  }

  softKeyboardInputMode(): VirtualInputSoftKeyboardMode {
    return "none"
  }

  isFocused(): boolean {
    return this.#focused
  }

  setTitle(title: string): void {
    if (this.#title === title) return
    this.#title = title
    this.requestRender()
  }

  setStatus(kind: TerminalStatusKind, label: string): void {
    if (this.#statusKind === kind && this.#status === label) return
    this.#statusKind = kind
    this.#status = label
    this.requestRender()
  }

  setHeaderControls(controls: TerminalHeaderControls): void {
    this.#headerControls = normalizeHeaderControls(controls)
    this.requestRender()
  }

  setFitToRect(enabled: boolean): void {
    if (this.#fitToRect === enabled) return
    this.#fitToRect = enabled
    this.requestRender()
  }

  setWrapLines(enabled: boolean): void {
    if (this.#wrapLines === enabled) return
    this.#wrapLines = enabled
    this.requestRender()
  }

  setScrollX(enabled: boolean): void {
    if (this.#scrollX === enabled) return
    this.#scrollX = enabled
    if (!enabled) divScrollTo(this, TERMINAL_SCROLL_KEY, {left: 0})
    this.requestRender()
  }

  setScrollY(enabled: boolean): void {
    if (this.#scrollY === enabled) return
    this.#scrollY = enabled
    if (!enabled) divScrollTo(this, TERMINAL_SCROLL_KEY, {top: 0})
    this.requestRender()
  }

  setDraggable(enabled: boolean): void {
    if (this.#draggable === enabled) return
    this.#draggable = enabled
    this.requestRender()
  }

  setResizable(enabled: boolean): void {
    if (this.#resizable === enabled) return
    this.#resizable = enabled
    this.requestRender()
  }

  setTerminalSize(cols: number, rows: number, opts: {emit?: boolean} = {}): void {
    this.#preferredCols = clampInt(cols, 1, 400)
    this.#resizeGrid(this.#preferredCols, clampInt(rows, 1, 160), opts.emit ?? true)
    this.requestRender()
  }

  getTerminalSize(): TerminalSize {
    return {cols: this.#cols, rows: this.#rows}
  }

  hasSelection(): boolean {
    return this.#selectionRange() !== null
  }

  getSelectedText(): string {
    return this.#selectedText() ?? ""
  }

  selectionSnapshot(): TerminalSelectionSnapshot | null {
    const range = this.#selectionRange()
    if (range === null || this.#selectionAnchor === null || this.#selectionFocus === null) return null
    return {
      anchor: {...this.#selectionAnchor},
      focus: {...this.#selectionFocus},
      start: {...range.start},
      end: {...range.end},
      text: this.#selectedText() ?? "",
    }
  }

  clearSelection(): void {
    this.#clearSelectionState()
    this.requestRender()
  }

  selectAll(): void {
    const lines = this.#terminalTextLines()
    const lastLine = lastNonEmptyLineIndex(lines)
    this.#selectionAnchor = {line: 0, col: 0}
    this.#selectionFocus = {line: lastLine, col: lines[lastLine]?.length ?? 0}
    this.requestRender()
  }

  setSelection(anchorLine: number, anchorCol: number, focusLine: number, focusCol: number): void {
    this.#selectionAnchor = this.#clampPosition({line: anchorLine, col: anchorCol})
    this.#selectionFocus = this.#clampPosition({line: focusLine, col: focusCol})
    this.requestRender()
  }

  async copySelectionToClipboard(): Promise<boolean> {
    return await this.#copySelectionOrCurrentLine()
  }

  toText(): string {
    return [...this.#scrollback, ...this.#screen]
      .map((line) => trimRightCells(line.map((cell) => cell.ch).join("")))
      .join("\n")
      .replace(/\n+$/g, "")
  }

  getStyleSnapshot(): TerminalStyleCell[][] {
    return [...this.#scrollback, ...this.#screen].map((line) => terminalStyleCells(line, this.#defaultBg))
  }

  scrollToBottom(): void {
    this.#scrollToBottom()
    this.requestRender()
  }

  isAutoscrollPinned(): boolean {
    return this.#autoscrollPinned
  }

  setAutoscrollPinned(enabled: boolean): void {
    if (this.#autoscrollPinned === enabled) return
    this.#autoscrollPinned = enabled
    if (enabled) this.#scrollToBottom()
    this.requestRender()
  }

  toggleAutoscrollPinned(): boolean {
    this.setAutoscrollPinned(!this.#autoscrollPinned)
    return this.#autoscrollPinned
  }

  protected outputScrollPosition(): {left: number; top: number} {
    const pos = divScrollPosition(this, TERMINAL_SCROLL_KEY)
    return {left: pos.left, top: pos.top}
  }

  protected outputScrollTo(pos: {left?: number; top?: number}): void {
    divScrollTo(this, TERMINAL_SCROLL_KEY, pos)
  }

  moveCursorToLastTextLineEnd(): void {
    const lines = this.#terminalTextLines()
    const lineIndex = lastNonEmptyLineIndex(lines)
    const screenRow = lineIndex - this.#scrollback.length
    if (screenRow < 0 || screenRow >= this.#screen.length) return
    this.#cursorRow = screenRow
    this.#cursorCol = clampInt((lines[lineIndex] ?? "").length, 0, this.#cols - 1)
    this.#pendingWrap = false
    this.#scrollToBottom()
    this.requestRender()
  }

  // ────────── render ──────────

  protected render(): void {
    this.#syncGridToRect()
    this.#renderHeader()
    this.#renderBody()
  }

  #terminalTextLines(): string[] {
    return [...this.#scrollback, ...this.#screen].map((line) => terminalLineText(line))
  }

  #lineTextAt(index: number): string {
    return terminalLineText(this.#lineAt(index) ?? [])
  }

  #currentLineText(): string {
    return terminalLineText(this.#screen[this.#cursorRow] ?? [])
  }

  #selectionRange(): TextSelectionRange | null {
    return orderedTextSelection(this.#selectionAnchor, this.#selectionFocus)
  }

  #selectedText(): string | null {
    return textFromRange(this.#terminalTextLines(), this.#selectionRange())
  }

  #clearSelectionState(): void {
    this.#selectionAnchor = null
    this.#selectionFocus = null
    this.#dragSelecting = false
  }

  #clampPosition(pos: TextPosition): TextPosition {
    const lines = this.#terminalTextLines()
    const line = clampInt(pos.line, 0, Math.max(0, lines.length - 1))
    const col = clampInt(pos.col, 0, lines[line]?.length ?? 0)
    return {line, col}
  }

  async #copySelectionOrCurrentLine(): Promise<boolean> {
    return await copyTextSelectionOrFallback({
      lines: this.#terminalTextLines(),
      anchor: this.#selectionAnchor,
      focus: this.#selectionFocus,
      fallbackText: this.#currentLineText(),
    })
  }

  #renderHeader(): void {
    if (!this.#showHeader) return
    if (this.#headerControls.primary.length > 0 || this.#headerControls.secondary.length > 0) {
      this.#renderHeaderWithControls()
      return
    }
    const headerY = 0
    const hasStatus = this.#status.length > 0
    const statusW = hasStatus ? Math.min(210, Math.max(96, this.measureText(this.#status, 11) + 32)) : 0
    const statusX = hasStatus ? Math.max(PANE_FRAME.headerTextX, this.rectW - PANE_FRAME.headerTextX - statusW) : this.rectW - PANE_FRAME.headerTextX
    const dockButtonSize = 22
    const hasDock = this.#onFrameDockRequest !== undefined
    const dockButtonX = PANE_FRAME.headerTextX
    const titleX = hasDock ? dockButtonX + dockButtonSize + 8 : PANE_FRAME.headerTextX
    const titleRight = hasStatus ? statusX - 10 : this.rectW - PANE_FRAME.headerTextX
    if (hasDock) this.#renderFrameDockButton(dockButtonX, headerY + 8, dockButtonSize)
    this.drawText(this.#title, titleX, PANE_FRAME.headerTextY, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, titleRight - titleX),
    })
    if (hasStatus) this.#renderHeaderStatus(statusX, headerY, statusW)
    const rule = paneHeaderRuleRect(this.rectW, HEADER_H_PX)
    this.drawRect(rule.x, rule.y, rule.w, rule.h, HEADER_RULE, Z.SEPARATOR)
  }

  #renderHeaderWithControls(): void {
    const headerY = 0
    const buttonY = headerY + Math.max(0, (HEADER_H_PX - HEADER_CONTROL_H_PX) / 2)
    const dockButtonSize = 22
    const hasDock = this.#onFrameDockRequest !== undefined
    const dockButtonX = PANE_FRAME.headerTextX
    const primaryX = hasDock ? dockButtonX + dockButtonSize + 8 : HEADER_CONTROL_PAD_X
    const secondaryW = this.#buttonGroupWidth(this.#headerControls.secondary)
    const secondaryX = this.#headerControls.secondary.length === 0
      ? this.rectW - HEADER_CONTROL_PAD_X
      : Math.max(HEADER_CONTROL_PAD_X, this.rectW - HEADER_CONTROL_PAD_X - secondaryW)
    const primaryMaxRight = Math.max(primaryX, secondaryX - 8)
    const primaryRight = this.#drawButtonGroup(this.#headerControls.primary, primaryX, buttonY, primaryMaxRight)

    const hasStatus = this.#status.length > 0
    const statusW = hasStatus ? Math.min(210, Math.max(96, this.measureText(this.#status, 11) + 32)) : 0
    const statusRight = this.#headerControls.secondary.length === 0 ? this.rectW - HEADER_CONTROL_PAD_X : secondaryX - 8
    const statusX = hasStatus ? Math.max(HEADER_CONTROL_PAD_X, statusRight - statusW) : statusRight
    const canShowStatus = hasStatus && statusRight - statusW >= primaryRight + 8

    const titleX = this.#headerControls.primary.length === 0 ? primaryX : primaryRight + 8
    const titleRight = canShowStatus
        ? statusX - 8
        : this.#headerControls.secondary.length === 0
          ? this.rectW - HEADER_CONTROL_PAD_X
          : secondaryX - 8
    const titleW = titleRight - titleX
    if (hasDock) this.#renderFrameDockButton(dockButtonX, headerY + 8, dockButtonSize)
    if (titleW >= 44) {
      this.drawText(this.#title, titleX, PANE_FRAME.headerTextY, {
        fontPx: 13,
        material: this.materials.cyan,
        maxWidthPx: titleW,
      })
    }
    if (canShowStatus) this.#renderHeaderStatus(statusX, headerY, statusW)
    this.#drawButtonGroup(this.#headerControls.secondary, secondaryX, buttonY)

    const rule = paneHeaderRuleRect(this.rectW, HEADER_H_PX)
    this.drawRect(rule.x, rule.y, rule.w, rule.h, HEADER_RULE, Z.SEPARATOR)
  }

  #renderHeaderStatus(statusX: number, headerY: number, statusW: number): void {
    const dot = statusColor(this.#statusKind)
    this.drawRoundedRect(statusX, headerY + 8, statusW, 22, {
      radius: HEADER_STATUS_RADIUS_PX,
      fill: STATUS_FILL,
      border: STATUS_BORDER,
      borderWidth: 1,
      z: Z.ELEMENT,
    })
    this.drawRoundedRect(statusX + 10, headerY + 15.5, STATUS_DOT_PX, STATUS_DOT_PX, {
      radius: STATUS_DOT_PX / 2,
      fill: dot,
      z: Z.ELEMENT_RULE,
    })
    this.drawText(this.#status, statusX + 24, headerY + 12, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: statusW - 32,
    })
  }

  #drawButtonGroup(buttons: readonly TerminalHeaderControl[], x: number, y: number, maxRight = Number.POSITIVE_INFINITY): number {
    let cursor = x
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]!
      if (cursor + HEADER_CONTROL_W_PX > maxRight) break
      controlIconButton(this, cursor, y, HEADER_CONTROL_W_PX, HEADER_CONTROL_H_PX, {
        label: b.label,
        iconSrc: b.iconSrc,
        tooltip: b.label,
        tone: b.tone ?? "neutral",
        ...(b.active === true ? {variant: "contained" as const} : {}),
        ...(b.disabled === undefined ? {} : {disabled: b.disabled}),
        action: b.action,
        onHover: () => this.requestRender(),
        onLeave: () => this.requestRender(),
      })
      cursor += HEADER_CONTROL_W_PX + HEADER_CONTROL_GAP_PX
      if (b.dividerAfter === true && i < buttons.length - 1) {
        cursor += HEADER_CONTROL_DIVIDER_GAP_PX - HEADER_CONTROL_GAP_PX
        if (cursor + HEADER_CONTROL_DIVIDER_W_PX <= maxRight) {
          controlDivider(this, cursor + HEADER_CONTROL_DIVIDER_W_PX / 2, y + 5, HEADER_CONTROL_H_PX - 10, {
            orientation: "vertical",
            thickness: HEADER_CONTROL_DIVIDER_W_PX,
          })
        }
        cursor += HEADER_CONTROL_DIVIDER_W_PX + HEADER_CONTROL_DIVIDER_GAP_PX
      }
    }
    return cursor
  }

  #buttonGroupWidth(buttons: readonly TerminalHeaderControl[]): number {
    if (buttons.length === 0) return 0
    let width = buttons.length * HEADER_CONTROL_W_PX + (buttons.length - 1) * HEADER_CONTROL_GAP_PX
    for (let i = 0; i < buttons.length - 1; i++) {
      if (buttons[i]?.dividerAfter === true) width += HEADER_CONTROL_DIVIDER_GAP_PX * 2 + HEADER_CONTROL_DIVIDER_W_PX - HEADER_CONTROL_GAP_PX
    }
    return width
  }

  #renderFrameDockButton(x: number, y: number, size: number): void {
    const onDock = this.#onFrameDockRequest
    if (onDock === undefined) return
    controlIconButton(this, x, y, size, size, {
      label: "Dock",
      iconSrc: uiIcons.minus,
      action: onDock,
    })
  }

  #renderBody(): void {
    const body = this.#bodyRect()
    if (body.w <= 0 || body.h <= 0) return
    const contentW = this.#contentCols() * this.#getCharWidth() + BODY_PAD_X_PX * 2
    const contentH = this.#contentLineCount() * this.#linePx + BODY_PAD_Y_PX * 2
    div(this, body.x, body.y, body.w, body.h, {
      key: TERMINAL_SCROLL_KEY,
      scrollContentWidth: Math.max(body.w, contentW),
      scrollContentHeight: Math.max(body.h, contentH),
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowX: this.#scrollX ? "auto" : "hidden",
        overflowY: this.#scrollY ? "auto" : "hidden",
        scrollbarWidth: SCROLLBAR_W_PX,
      },
      children: (ctx) => this.#renderLines(body.x + BODY_PAD_X_PX - ctx.scrollLeft, body.y + BODY_PAD_Y_PX, ctx),
    })
  }

  #renderLines(x: number, y: number, ctx: DivScrollContext): void {
    const startIdx = Math.max(0, Math.floor(ctx.scrollTop / this.#linePx) - 1)
    const endIdx = Math.min(this.#contentLineCount(), Math.ceil((ctx.scrollTop + ctx.viewportHeight) / this.#linePx) + 1)
    const cursorGlobalRow = this.#scrollback.length + this.#cursorRow
    for (let idx = startIdx; idx < endIdx; idx++) {
      const line = this.#lineAt(idx)
      if (line === undefined) continue
      const rowY = y + idx * this.#linePx - ctx.scrollTop
      this.#renderLine(idx, line, x, rowY, idx === cursorGlobalRow)
      if (idx === cursorGlobalRow) this.#renderCursor(x, rowY)
    }
  }

  #renderLine(lineIndex: number, line: TerminalCell[], x: number, y: number, isCursorLine: boolean): void {
    const charW = this.#getCharWidth()
    if (this.#defaultBg !== null) {
      this.drawRect(x, y + 1, this.#cols * charW, this.#linePx, colorToColor(this.#defaultBg), Z.ELEMENT - 0.03)
    }
    if (isCursorLine && this.#focused && this.#cursorLineHighlight && this.#cursorEnabled) {
      this.drawRect(x, y + 1, this.#cols * charW, this.#linePx, this.#cursorLineFill, Z.ELEMENT - 0.02)
    }

    let col = 0
    while (col < this.#cols) {
      const bg = displayBg(line[col] ?? this.#blankCell())
      const start = col
      while (col < this.#cols && sameColor(displayBg(line[col] ?? this.#blankCell()), bg)) col++
      if (bg !== null) {
        this.drawRect(x + start * charW, y + 1, (col - start) * charW, this.#linePx, colorToColor(bg), Z.ELEMENT)
      }
    }

    this.#renderSelectionForLine(lineIndex, x, y)

    col = 0
    while (col < this.#cols) {
      const cell = line[col] ?? this.#blankCell()
      if (cell.width === 0 || cell.ch === " ") {
        col++
        continue
      }

      const attr = cell.attr
      const textColor = displayFg(attr)
      const start = col
      let value = ""
      while (col < this.#cols) {
        const next = line[col] ?? this.#blankCell()
        if (next.ch === " " || !sameAttrForText(next.attr, attr)) break
        value += next.ch
        col++
      }
      this.drawText(this.#displayText(value), x + start * charW, y + 1, {
        fontPx: this.#fontPx,
        material: this.#materialFor(textColor),
        maxWidthPx: Math.max(1, (col - start) * charW + 1),
        fit: false,
      })
      if (attr.underline) {
        const underlineColor = attr.underlineColor ?? textColor
        this.drawRect(
          x + start * charW,
          y + Math.max(1, this.#linePx - 2),
          (col - start) * charW,
          1,
          colorToColor(underlineColor),
          Z.TEXT + 0.01,
        )
      }
    }
  }

  #displayText(value: string): string {
    if (this.font === null) return value
    let out = ""
    for (const ch of value) {
      const code = ch.codePointAt(0) ?? 0
      if (isZeroWidthTerminalCodePoint(code)) continue
      if (isTerminalSpaceCodePoint(code)) {
        out += " "
        continue
      }
      out += this.font.mapCharToGlyph(code) === 0 ? terminalGlyphFallback(ch) : ch
    }
    return out
  }

  #renderSelectionForLine(lineIndex: number, x: number, y: number): void {
    const range = this.#selectionRange()
    if (range === null || lineIndex < range.start.line || lineIndex > range.end.line) return
    const lineText = this.#lineTextAt(lineIndex)
    const startCol = lineIndex === range.start.line ? range.start.col : 0
    const endCol = lineIndex === range.end.line ? range.end.col : lineText.length
    const charW = this.#getCharWidth()
    let x1 = x + startCol * charW
    let x2 = x + endCol * charW
    if (lineIndex < range.end.line && endCol === lineText.length) x2 += Math.max(5, charW * 0.65)
    if (lineText.length === 0 && lineIndex > range.start.line && lineIndex < range.end.line) x2 = x1 + Math.max(5, charW * 0.65)
    const w = x2 - x1
    if (w <= 0) return
    this.drawRoundedRect(x1, y + 1, w, Math.max(1, this.#linePx), {
      radius: 3,
      fill: SELECTION_FILL,
      z: Z.ELEMENT_RULE - 0.001,
    })
  }

  #renderCursor(x: number, y: number): void {
    const active = this.#focused || this.#cursorWhenBlurred
    const blinkVisible = this.#focused ? this.#cursorVisible : true
    const showCursor = this.#showCursor || this.shouldForceCursorVisible()
    if (!active || !this.#cursorEnabled || !showCursor || !blinkVisible || this.#cols <= 0) return
    const charW = this.#getCharWidth()
    const cursorCol = clampInt(this.#cursorCol, 0, this.#cols - 1)
    this.drawRoundedRect(x + cursorCol * charW, y + 2, Math.max(2, charW), Math.max(4, this.#linePx - 3), {
      radius: 2,
      fill: this.#cursorFill,
      z: Z.TEXT + 0.03,
    })
  }

  #bodyRect(): {x: number; y: number; w: number; h: number} {
    return paneBodyRect(this.rectW, this.rectH, {headerHeight: HEADER_H_PX, showHeader: this.#showHeader})
  }

  #contentCols(): number {
    if (this.#contentWidthMode === "grid") return this.#cols
    let max = 0
    for (const line of [...this.#scrollback, ...this.#screen]) {
      max = Math.max(max, terminalLineText(line).length)
    }
    return Math.max(1, max)
  }

  #contentLineCount(): number {
    const total = this.#totalLineCount()
    if (this.#contentHeightMode === "grid") return total
    const lines = this.#terminalTextLines()
    const lastLine = lastNonEmptyLineIndex(lines)
    const cursorGlobalRow = this.#scrollback.length + this.#cursorRow
    return clampInt(Math.max(lastLine + 1, cursorGlobalRow + 1, 1), 1, total)
  }

  #syncGridToRect(): void {
    if (!this.#fitToRect || this.font === null) return
    const body = this.#bodyRect()
    const charW = this.#getCharWidth()
    const verticalGutter = this.#scrollY ? SCROLLBAR_W_PX : 0
    const horizontalGutter = this.#scrollX ? SCROLLBAR_W_PX : 0
    const visibleCols = Math.max(this.#minCols, Math.floor((body.w - BODY_PAD_X_PX * 2 - verticalGutter - 2) / charW))
    const cols = this.#scrollX ? Math.max(this.#preferredCols, visibleCols) : visibleCols
    const rows = Math.max(this.#minRows, Math.floor((body.h - BODY_PAD_Y_PX * 2 - horizontalGutter) / this.#linePx))
    this.#resizeGrid(cols, rows, true)
  }

  #getCharWidth(): number {
    const scale = this.pageScaleFactor
    if (this.#charWidth > 0 && this.#charWidthScale === scale) return this.#charWidth
    this.#charWidth = Math.max(1, this.measureText("M", this.#fontPx))
    this.#charWidthScale = scale
    return this.#charWidth
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    const headerH = this.#showHeader ? HEADER_H_PX + PANE_FRAME.bodyTopGap : 0
    const scrollY = this.#scrollY ? SCROLLBAR_W_PX : 0
    const scrollX = this.#scrollX ? SCROLLBAR_W_PX : 0
    return {
      showHeader: this.#showHeader,
      movable: this.#draggable,
      resizable: this.#resizable,
      minW: Math.max(260, PANE_FRAME.bodyInsetX * 2 + this.#minCols * this.#getCharWidth() + scrollY + 2),
      minH: Math.max(160, headerH + this.#minRows * this.#linePx + scrollX + PANE_FRAME.bodyBottomInset),
    }
  }

  #beginFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
    const opts = this.#frameInteractionOpts()
    const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, opts)
    if (kind === null) return false
    const frame = this.canvas?.surfaceFrame(this)
    if (frame === undefined || frame === null) return false
    this.#frameDrag = beginPaneFrameDrag(kind, event, frame.rect, opts)
    event.preventDefault()
    const cursor = paneFrameCursor(kind, true)
    const canvasElement = this.canvas?.canvas
    if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
    return true
  }

  #updateFrameInteraction(event: MouseEvent): boolean {
    const drag = this.#frameDrag
    const frame = this.canvas?.surfaceFrame(this)
    if (drag === null || frame === undefined || frame === null) return false
    const next = paneFrameDragRect(drag, event, frame.bounds)
    const applied = this.canvas?.setSurfaceRect(this, next)
    if (applied !== undefined && applied !== null) this.#onFrameRectPreview?.(applied)
    const cursor = paneFrameCursor(drag.kind, true)
    const canvasElement = this.canvas?.canvas
    if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
    return true
  }

  #endFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
    if (this.#frameDrag === null) return false
    this.#updateFrameInteraction(event)
    const frame = this.canvas?.surfaceFrame(this)
    this.#frameDrag = null
    this.#syncFrameCursor(localX, localY)
    if (frame !== undefined && frame !== null) this.#onFrameRectChange?.(frame.rect)
    return true
  }

  #syncFrameCursor(localX: number, localY: number): void {
    if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
    const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
    const cursor = paneFrameCursor(kind, false)
    const canvasElement = this.canvas.canvas
    if (canvasElement !== undefined) canvasElement.style.cursor = cursor ?? "default"
  }

  // ────────── ввод/выделение ──────────

  onKey(event: KeyboardEvent): void {
    this.handleOutputShortcut(event)
  }

  protected emitTerminalResponse(_data: string): void {
    // TerminalOutputPane is output-only. TerminalPane overrides this to feed
    // terminal protocol answers back through the same input channel as a PTY.
  }

  protected shouldAnswerTerminalQuery(_kind: TerminalQueryKind): boolean {
    return false
  }

  protected shouldForceCursorVisible(): boolean {
    return false
  }

  protected shouldSendTerminalMouse(): boolean {
    return false
  }

  protected terminalKeyboardMode(): TerminalKeyboardMode {
    return {
      applicationCursorKeys: this.#applicationCursorKeys,
      applicationKeypad: this.#applicationKeypad,
      bracketedPaste: this.#bracketedPaste,
    }
  }

  getTerminalState(): TerminalPaneState {
    return {
      applicationCursorKeys: this.#applicationCursorKeys,
      applicationKeypad: this.#applicationKeypad,
      bracketedPaste: this.#bracketedPaste,
      alternateScreen: this.#alternateScreen,
      cursorVisible: this.#showCursor,
      localEcho: !this.#alternateScreen,
    }
  }

  protected captureOutputState(): TerminalOutputSnapshot {
    const scrollPosition = divScrollPosition(this, TERMINAL_SCROLL_KEY)
    return {
      scrollback: cloneCellLines(this.#scrollback),
      screen: cloneCellLines(this.#screen),
      cursorRow: this.#cursorRow,
      cursorCol: this.#cursorCol,
      pendingWrap: this.#pendingWrap,
      scrollTop: this.#scrollTop,
      scrollBottom: this.#scrollBottom,
      savedCursor: this.#savedCursor === null ? null : {...this.#savedCursor},
      autoWrap: this.#autoWrap,
      originMode: this.#originMode,
      applicationCursorKeys: this.#applicationCursorKeys,
      applicationKeypad: this.#applicationKeypad,
      bracketedPaste: this.#bracketedPaste,
      mouseMode: this.#mouseMode,
      sgrMouse: this.#sgrMouse,
      alternateScreen: this.#alternateScreen,
      selectionAnchor: this.#selectionAnchor === null ? null : {...this.#selectionAnchor},
      selectionFocus: this.#selectionFocus === null ? null : {...this.#selectionFocus},
      dragSelecting: this.#dragSelecting,
      attr: cloneAttr(this.#attr),
      wordWrapBuffer: cloneCells(this.#wordWrapBuffer),
      parserMode: this.#parserMode,
      sequence: this.#sequence,
      oscEsc: this.#oscEsc,
      showCursor: this.#showCursor,
      rawOutput: this.#rawOutput,
      scrollPosition,
    }
  }

  protected restoreOutputState(snapshot: TerminalOutputSnapshot): void {
    this.#scrollback = cloneCellLines(snapshot.scrollback)
    this.#screen = cloneCellLines(snapshot.screen)
    this.#cursorRow = snapshot.cursorRow
    this.#cursorCol = snapshot.cursorCol
    this.#pendingWrap = snapshot.pendingWrap
    this.#scrollTop = snapshot.scrollTop
    this.#scrollBottom = snapshot.scrollBottom
    this.#savedCursor = snapshot.savedCursor === null ? null : {...snapshot.savedCursor}
    this.#autoWrap = snapshot.autoWrap
    this.#originMode = snapshot.originMode
    this.#applicationCursorKeys = snapshot.applicationCursorKeys
    this.#applicationKeypad = snapshot.applicationKeypad
    this.#bracketedPaste = snapshot.bracketedPaste
    this.#mouseMode = snapshot.mouseMode
    this.#sgrMouse = snapshot.sgrMouse
    this.#mouseButtonDown = null
    this.#alternateScreen = snapshot.alternateScreen
    this.#selectionAnchor = snapshot.selectionAnchor === null ? null : {...snapshot.selectionAnchor}
    this.#selectionFocus = snapshot.selectionFocus === null ? null : {...snapshot.selectionFocus}
    this.#dragSelecting = snapshot.dragSelecting
    this.#attr = cloneAttr(snapshot.attr)
    this.#wordWrapBuffer = cloneCells(snapshot.wordWrapBuffer)
    this.#parserMode = snapshot.parserMode
    this.#sequence = snapshot.sequence
    this.#oscEsc = snapshot.oscEsc
    this.#showCursor = snapshot.showCursor
    this.#rawOutput = snapshot.rawOutput
    divScrollTo(this, TERMINAL_SCROLL_KEY, snapshot.scrollPosition)
    this.requestRender()
  }

  protected handleOutputShortcut(event: KeyboardEvent): boolean {
    const metaOnly = event.metaKey && !event.ctrlKey && !event.altKey
    const key = shortcutLetter(event)
    if (metaOnly && key === "c") {
      event.preventDefault()
      void this.#copySelectionOrCurrentLine()
      return true
    }
    if (metaOnly && key === "a") {
      event.preventDefault()
      this.selectAll()
      return true
    }
    return false
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    this.focus()
    this.#clearTouchGesture()
    if (!this.#isBodyPoint(localX, localY)) {
      super.onPointerDown(event, localX, localY)
      if (this.pressedHit !== null) return
      if (this.#beginFrameInteraction(event, localX, localY)) return
      return
    }
    if (isTouchPointerEvent(event) && (this.#scrollY || this.#scrollX)) {
      const gesture: TouchScrollGesture = {
        startX: localX,
        startY: localY,
        lastX: localX,
        lastY: localY,
        mode: "pending",
        selectionMoved: false,
        longPressTimer: null,
      }
      gesture.longPressTimer = setTimeout(() => this.#beginTouchSelection(gesture), TOUCH_LONG_PRESS_MS)
      this.#touchScrollGesture = gesture
      event.preventDefault()
      return
    }
    if (this.#handleTerminalMouseDown(event, localX, localY)) return
    if (isSecondaryPointer(event)) return
    const pos = this.#positionFromLocal(localX, localY)
    if (pos === null) return
    if (event.detail >= 2 && !event.shiftKey) {
      this.#selectWordAt(pos)
      return
    }
    this.#dragSelecting = true
    this.#dragAnchorLocalX = localX
    this.#dragAnchorLocalY = localY
    if (event.shiftKey && this.#selectionAnchor !== null) {
      this.#selectionFocus = pos
    } else {
      this.#selectionAnchor = pos
      this.#selectionFocus = pos
    }
    this.requestRender()
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    if (this.#frameDrag !== null) {
      this.#updateFrameInteraction(event)
      return
    }
    if (this.#touchScrollGesture !== null) {
      this.#updateTouchScroll(event, localX, localY)
      return
    }
    super.onPointerMove(event, localX, localY)
    if (this.#handleTerminalMouseMove(event, localX, localY)) return
    if (!this.#dragSelecting) this.#syncFrameCursor(localX, localY)
    if (!this.#dragSelecting) return
    this.#updateDragSelection(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    if (this.#endFrameInteraction(event, localX, localY)) return
    if (this.#touchScrollGesture !== null) {
      this.#finishTouchScroll(event, localX, localY)
      return
    }
    if (this.#handleTerminalMouseUp(event, localX, localY)) return
    if (this.#dragSelecting) {
      this.#updateDragSelection(localX, localY)
      this.#dragSelecting = false
      if (this.#selectionRange() === null) this.#clearSelectionState()
      this.requestRender()
      return
    }
    super.onPointerUp(event, localX, localY)
  }

  override onWheel(event: WheelEvent, localX: number, localY: number): void {
    if (this.#handleTerminalWheel(event, localX, localY)) return
    super.onWheel(event, localX, localY)
  }

  override onContextMenu(event: MouseEvent, localX: number, localY: number): void {
    if (this.#terminalMouseEnabled() && !event.shiftKey && this.#terminalMousePosition(localX, localY) !== null) {
      event.preventDefault()
      return
    }
    super.onContextMenu(event, localX, localY)
  }

  #updateTouchScroll(event: MouseEvent, localX: number, localY: number): void {
    const gesture = this.#touchScrollGesture
    if (gesture === null) return
    const distanceX = localX - gesture.startX
    const distanceY = localY - gesture.startY
    if (gesture.mode === "selecting") {
      gesture.lastX = localX
      gesture.lastY = localY
      if (Math.hypot(distanceX, distanceY) >= TOUCH_SCROLL_THRESHOLD_PX) gesture.selectionMoved = true
      if (gesture.selectionMoved) this.#updateDragSelection(localX, localY)
      event.preventDefault()
      return
    }
    if (gesture.mode === "pending") {
      if (Math.hypot(distanceX, distanceY) < TOUCH_SCROLL_THRESHOLD_PX) {
        event.preventDefault()
        return
      }
      this.#cancelTouchLongPress(gesture)
      gesture.mode = "scrolling"
      this.#clearSelectionState()
    }
    const deltaLeft = this.#scrollX ? gesture.lastX - localX : 0
    const deltaTop = this.#scrollY ? gesture.lastY - localY : 0
    gesture.lastX = localX
    gesture.lastY = localY
    this.#scrollOutputBy(deltaLeft, deltaTop)
    event.preventDefault()
  }

  #finishTouchScroll(event: MouseEvent, localX: number, localY: number): void {
    const gesture = this.#touchScrollGesture
    if (gesture?.mode === "selecting") {
      if (gesture.selectionMoved || Math.hypot(localX - gesture.startX, localY - gesture.startY) >= TOUCH_SCROLL_THRESHOLD_PX) {
        this.#updateDragSelection(localX, localY)
      }
      this.#dragSelecting = false
      if (this.#selectionRange() === null) this.#clearSelectionState()
      this.requestRender()
    }
    this.#clearTouchGesture()
    event.preventDefault()
  }

  #beginTouchSelection(gesture: TouchScrollGesture): void {
    if (this.#touchScrollGesture !== gesture || gesture.mode !== "pending") return
    gesture.longPressTimer = null
    gesture.mode = "selecting"
    this.#dragSelecting = true
    this.#dragAnchorLocalX = gesture.startX
    this.#dragAnchorLocalY = gesture.startY
    const pos = this.#positionFromLocal(gesture.startX, gesture.startY)
    if (pos === null) return
    this.#selectWordAt(pos)
  }

  #clearTouchGesture(): void {
    const gesture = this.#touchScrollGesture
    if (gesture !== null) this.#cancelTouchLongPress(gesture)
    this.#touchScrollGesture = null
  }

  #cancelTouchLongPress(gesture: TouchScrollGesture): void {
    if (gesture.longPressTimer === null) return
    clearTimeout(gesture.longPressTimer)
    gesture.longPressTimer = null
  }

  #scrollOutputBy(deltaLeft: number, deltaTop: number): void {
    if (deltaLeft === 0 && deltaTop === 0) return
    const body = this.#bodyRect()
    if (body.w <= 0 || body.h <= 0) return
    const position = divScrollPosition(this, TERMINAL_SCROLL_KEY)
    const contentW = this.#contentCols() * this.#getCharWidth() + BODY_PAD_X_PX * 2
    const contentH = this.#contentLineCount() * this.#linePx + BODY_PAD_Y_PX * 2
    const next: {left?: number; top?: number} = {}
    if (deltaLeft !== 0) next.left = clampNumber(position.left + deltaLeft, 0, Math.max(0, contentW - body.w))
    if (deltaTop !== 0) next.top = clampNumber(position.top + deltaTop, 0, Math.max(0, contentH - body.h))
    divScrollTo(this, TERMINAL_SCROLL_KEY, next)
  }

  #handleTerminalMouseDown(event: MouseEvent, localX: number, localY: number): boolean {
    if (!this.#terminalMouseEnabled() || event.shiftKey) return false
    const pos = this.#terminalMousePosition(localX, localY)
    if (pos === null) return false
    const button = terminalMouseButton(event.button)
    if (button === null) return false
    this.#mouseButtonDown = button
    this.#emitTerminalMouse(button, pos, event, "press")
    event.preventDefault()
    return true
  }

  #handleTerminalMouseMove(event: MouseEvent, localX: number, localY: number): boolean {
    if (!this.#terminalMouseEnabled() || event.shiftKey) return false
    if (this.#mouseMode !== "any" && (this.#mouseMode !== "button" || this.#mouseButtonDown === null)) return false
    const pos = this.#terminalMousePosition(localX, localY)
    if (pos === null) return false
    this.#emitTerminalMouse(this.#mouseButtonDown ?? 0, pos, event, "move")
    event.preventDefault()
    return true
  }

  #handleTerminalMouseUp(event: MouseEvent, localX: number, localY: number): boolean {
    const button = this.#mouseButtonDown
    if (!this.#terminalMouseEnabled() || event.shiftKey || button === null) return false
    this.#mouseButtonDown = null
    const pos = this.#terminalMousePosition(localX, localY)
    if (pos === null) return false
    this.#emitTerminalMouse(button, pos, event, "release")
    event.preventDefault()
    return true
  }

  #handleTerminalWheel(event: WheelEvent, localX: number, localY: number): boolean {
    if (!this.#terminalMouseEnabled() || event.shiftKey || event.deltaY === 0) return false
    const pos = this.#terminalMousePosition(localX, localY)
    if (pos === null) return false
    this.#emitTerminalMouse(event.deltaY < 0 ? 64 : 65, pos, event, "wheel")
    event.preventDefault()
    return true
  }

  #terminalMouseEnabled(): boolean {
    return this.shouldSendTerminalMouse() && this.#mouseMode !== "none"
  }

  #terminalMousePosition(localX: number, localY: number): {col: number; row: number} | null {
    const body = this.#bodyRect()
    if (!this.#isBodyPoint(localX, localY)) return null
    const scrollLeft = divScrollPosition(this, TERMINAL_SCROLL_KEY).left
    const charW = this.#getCharWidth()
    const col = clampInt(Math.floor((localX - body.x - BODY_PAD_X_PX + (this.#scrollX ? scrollLeft : 0)) / charW) + 1, 1, this.#cols)
    const row = clampInt(Math.floor((localY - body.y - BODY_PAD_Y_PX) / this.#linePx) + 1, 1, this.#rows)
    return {col, row}
  }

  #isBodyPoint(localX: number, localY: number): boolean {
    const body = this.#bodyRect()
    return localY >= body.y && localY <= body.y + body.h && localX >= body.x && localX <= body.x + body.w
  }

  protected isCursorLinePoint(localX: number, localY: number): boolean {
    const pos = this.#positionFromLocal(localX, localY)
    if (pos === null) return false
    return pos.line === this.#scrollback.length + this.#cursorRow
  }

  #emitTerminalMouse(button: number, pos: {col: number; row: number}, event: MouseEvent | WheelEvent, kind: "press" | "release" | "move" | "wheel"): void {
    const motion = kind === "move"
    let code = button + terminalMouseModifiers(event) + (motion ? 32 : 0)
    if (kind === "release" && !this.#sgrMouse) code = 3 + terminalMouseModifiers(event)
    if (this.#sgrMouse) {
      this.emitTerminalResponse(`\x1b[<${code};${pos.col};${pos.row}${kind === "release" ? "m" : "M"}`)
      return
    }
    if (pos.col > 223 || pos.row > 223) return
    this.emitTerminalResponse(`\x1b[M${String.fromCharCode(code + 32)}${String.fromCharCode(pos.col + 32)}${String.fromCharCode(pos.row + 32)}`)
  }

  #updateDragSelection(localX: number, localY: number): void {
    const dragDistance = Math.abs(localX - this.#dragAnchorLocalX) + Math.abs(localY - this.#dragAnchorLocalY)
    if (dragDistance < 0.5) return
    const anchor = this.#positionFromLocal(this.#dragAnchorLocalX, this.#dragAnchorLocalY, localX >= this.#dragAnchorLocalX ? "floor" : "ceil")
    const focus = this.#positionFromLocal(localX, localY)
    if (anchor === null || focus === null) return
    const nextAnchor = this.#selectionAnchor !== null ? this.#selectionAnchor : anchor
    if (sameTextPosition(this.#selectionAnchor, nextAnchor) && sameTextPosition(this.#selectionFocus, focus)) return
    this.#selectionAnchor = nextAnchor
    this.#selectionFocus = focus
    this.requestRender()
  }

  #positionFromLocal(localX: number, localY: number, bias: "nearest" | "floor" | "ceil" = "nearest"): TextPosition | null {
    const body = this.#bodyRect()
    if (localY < body.y || localY > body.y + body.h) return null
    const lines = this.#terminalTextLines()
    if (lines.length === 0) return null
    const scrollTop = divScrollPosition(this, TERMINAL_SCROLL_KEY).top
    const scrollLeft = divScrollPosition(this, TERMINAL_SCROLL_KEY).left
    const row = clampInt(Math.floor((localY - body.y - BODY_PAD_Y_PX + scrollTop) / this.#linePx), 0, lines.length - 1)
    const charW = this.#getCharWidth()
    const rawCol = (localX - body.x - BODY_PAD_X_PX + (this.#scrollX ? scrollLeft : 0)) / charW
    const col = bias === "floor" ? Math.floor(rawCol) : bias === "ceil" ? Math.ceil(rawCol) : Math.round(rawCol)
    return this.#clampPosition({line: row, col})
  }

  #selectWordAt(pos: TextPosition): void {
    const lineText = this.#lineTextAt(pos.line)
    const word = wordRangeAt(lineText, pos.col)
    if (word === null) {
      this.#selectionAnchor = pos
      this.#selectionFocus = pos
      this.requestRender()
      return
    }
    this.#selectionAnchor = {line: pos.line, col: word.start}
    this.#selectionFocus = {line: pos.line, col: word.end}
    this.requestRender()
  }

  onActivate(): void {
    this.#focused = true
    this.#onFocusChange?.(true)
    this.#cursorVisible = this.#cursorEnabled && this.#showCursor
    if (this.#cursorEnabled) this.#startCursorBlink()
    this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate?.()
    this.#frameDrag = null
    this.#clearTouchGesture()
    this.#focused = false
    this.#onFocusChange?.(false)
    this.#stopCursorBlink()
    this.#cursorVisible = this.#cursorWhenBlurred && this.#cursorEnabled && this.#showCursor
    this.requestRender()
  }

  override dispose(): void {
    this.#stopCursorBlink()
    this.#clearTouchGesture()
    super.dispose()
  }

  #startCursorBlink(): void {
    if (!this.#cursorEnabled || !this.#cursorBlink || this.#cursorTimer !== null) return
    this.#cursorTimer = setInterval(() => {
      if (!this.#focused) return
      this.#cursorVisible = !this.#cursorVisible
      this.requestRender()
    }, CARET_BLINK_MS)
  }

  #stopCursorBlink(): void {
    if (this.#cursorTimer !== null) clearInterval(this.#cursorTimer)
    this.#cursorTimer = null
  }

  // ────────── буфер ──────────

  #resizeGrid(cols: number, rows: number, emit: boolean): void {
    const nextCols = clampInt(cols, 1, 400)
    const nextRows = clampInt(rows, 1, 160)
    if (this.#cols === nextCols && this.#rows === nextRows) {
      if (emit) this.#emitResize()
      return
    }

    const wasAtBottom = this.#isAtBottom()
    const colsChanged = this.#cols !== nextCols
    this.#cols = nextCols
    this.#rows = nextRows
    if (this.#reflowOnResize && colsChanged && this.#rawOutput.length > 0) {
      this.#reflowRawOutput(wasAtBottom)
      if (emit) this.#emitResize()
      return
    }
    while (this.#screen.length < nextRows) this.#screen.push(this.#blankLine())
    while (this.#screen.length > nextRows) this.#pushScrollback(this.#screen.shift() ?? this.#blankLine())
    for (let i = 0; i < this.#screen.length; i++) this.#screen[i] = this.#fitLine(this.#screen[i] ?? [])
    for (let i = 0; i < this.#scrollback.length; i++) this.#scrollback[i] = this.#fitLine(this.#scrollback[i] ?? [])
    this.#cursorRow = clampInt(this.#cursorRow, 0, this.#rows - 1)
    this.#cursorCol = clampInt(this.#cursorCol, 0, this.#cols - 1)
    this.#pendingWrap = false
    this.#scrollTop = 0
    this.#scrollBottom = this.#rows - 1
    if (wasAtBottom) this.#scrollToBottom()
    if (emit) this.#emitResize()
  }

  #reflowRawOutput(wasAtBottom: boolean): void {
    this.#attr = cloneAttr(DEFAULT_ATTR)
    this.#parserMode = "text"
    this.#sequence = ""
    this.#oscEsc = false
    this.#savedCursor = null
    this.#wordWrapBuffer = []
    this.#scrollback = []
    this.#screen = Array.from({length: this.#rows}, () => this.#blankLine())
    this.#cursorRow = 0
    this.#cursorCol = 0
    this.#pendingWrap = false
    this.#scrollTop = 0
    this.#scrollBottom = this.#rows - 1
    this.#clearSelectionState()
    divScrollTo(this, TERMINAL_SCROLL_KEY, {left: 0, top: 0})
    this.#consume(this.#rawOutput)
    this.#flushWordWrapBuffer()
    if (wasAtBottom) this.#scrollToBottom()
  }

  #emitResize(): void {
    if (this.#lastEmittedSize?.cols === this.#cols && this.#lastEmittedSize.rows === this.#rows) return
    this.#lastEmittedSize = {cols: this.#cols, rows: this.#rows}
    this.#onResize?.({...this.#lastEmittedSize})
  }

  #blankCell(attr: TerminalAttr = this.#attr): TerminalCell {
    return {ch: " ", attr: cloneAttr(attr), width: 1}
  }

  #blankLine(attr: TerminalAttr = this.#attr): TerminalCell[] {
    return Array.from({length: this.#cols}, () => this.#blankCell(attr))
  }

  #fitLine(line: TerminalCell[]): TerminalCell[] {
    if (line.length === this.#cols) return line
    if (line.length > this.#cols) return line.slice(0, this.#cols)
    return [...line, ...Array.from({length: this.#cols - line.length}, () => this.#blankCell(DEFAULT_ATTR))]
  }

  #pushScrollback(line: TerminalCell[]): void {
    if (this.#maxScrollback <= 0) return
    this.#scrollback.push(this.#fitLine(line))
    while (this.#scrollback.length > this.#maxScrollback) this.#scrollback.shift()
  }

  #lineAt(index: number): TerminalCell[] | undefined {
    if (index < this.#scrollback.length) return this.#scrollback[index]
    return this.#screen[index - this.#scrollback.length]
  }

  #totalLineCount(): number {
    return this.#scrollback.length + this.#screen.length
  }

  #isAtBottom(): boolean {
    const body = this.#bodyRect()
    const totalH = this.#contentLineCount() * this.#linePx + BODY_PAD_Y_PX * 2
    if (totalH <= body.h) return true
    const maxScroll = totalH - body.h
    return divScrollPosition(this, TERMINAL_SCROLL_KEY).top >= maxScroll - AUTOSCROLL_TOLERANCE_PX
  }

  #scrollToBottom(): void {
    const body = this.#bodyRect()
    const totalH = this.#contentLineCount() * this.#linePx + BODY_PAD_Y_PX * 2
    divScrollTo(this, TERMINAL_SCROLL_KEY, {top: Math.max(0, totalH - body.h)})
  }

  // ────────── поток терминала ──────────

  #consume(text: string): void {
    for (const ch of text) this.#consumeChar(ch)
  }

  #consumeChar(ch: string): void {
    if (this.#parserMode === "esc") {
      this.#consumeEsc(ch)
      return
    }
    if (this.#parserMode === "csi") {
      this.#consumeCsi(ch)
      return
    }
    if (this.#parserMode === "osc") {
      this.#consumeOsc(ch)
      return
    }
    if (this.#parserMode === "charset") {
      this.#parserMode = "text"
      return
    }
    if (ch === "\x1b") {
      this.#parserMode = "esc"
      this.#sequence = ""
      return
    }
    this.#consumeText(ch)
  }

  #consumeText(ch: string): void {
    if (ch === "\n") {
      this.#flushWordWrapBuffer()
      this.#pendingWrap = false
      this.#lineFeed()
      if (!this.#wrapLines || this.#wrapMode === "word") this.#cursorCol = 0
      return
    }
    if (ch === "\r") {
      this.#flushWordWrapBuffer()
      this.#pendingWrap = false
      this.#cursorCol = 0
      return
    }
    if (ch === "\b") {
      this.#flushWordWrapBuffer()
      this.#pendingWrap = false
      this.#cursorCol = Math.max(0, this.#cursorCol - 1)
      return
    }
    if (ch === "\t") {
      this.#flushWordWrapBuffer()
      const spaces = 8 - (this.#cursorCol % 8)
      for (let i = 0; i < spaces; i++) this.#putSpace()
      return
    }
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return
    if (isZeroWidthTerminalCodePoint(code)) return
    if (isTerminalSpaceCodePoint(code)) {
      this.#flushWordWrapBuffer()
      this.#putSpace()
      return
    }
    if (this.#wrapMode === "word" && this.#wrapLines) {
      if (ch === " ") {
        this.#flushWordWrapBuffer()
        this.#putSpace()
        return
      }
      this.#wordWrapBuffer.push({ch, attr: cloneAttr(this.#attr), width: terminalCharWidth(ch)})
      return
    }
    this.#putChar(ch)
  }

  #consumeEsc(ch: string): void {
    this.#parserMode = "text"
    if (ch === "[") {
      this.#parserMode = "csi"
      this.#sequence = ""
      return
    }
    if (ch === "]") {
      this.#parserMode = "osc"
      this.#sequence = ""
      this.#oscEsc = false
      return
    }
    if ("()*+-./".includes(ch)) {
      this.#parserMode = "charset"
      return
    }
    this.#flushWordWrapBuffer()
    if (ch === "c") {
      this.reset()
      return
    }
    if (ch === "D") {
      this.#lineFeed()
      return
    }
    if (ch === "E") {
      this.#lineFeed()
      this.#cursorCol = 0
      return
    }
    if (ch === "M") {
      this.#reverseIndex()
      return
    }
    if (ch === "=") {
      this.#applicationKeypad = true
      return
    }
    if (ch === ">") {
      this.#applicationKeypad = false
      return
    }
    if (ch === "7") {
      this.#savedCursor = {row: this.#cursorRow, col: this.#cursorCol}
      return
    }
    if (ch === "8" && this.#savedCursor !== null) {
      this.#pendingWrap = false
      this.#cursorRow = clampInt(this.#savedCursor.row, 0, this.#rows - 1)
      this.#cursorCol = clampInt(this.#savedCursor.col, 0, this.#cols - 1)
    }
  }

  #consumeCsi(ch: string): void {
    const code = ch.charCodeAt(0)
    if (code >= 0x40 && code <= 0x7e) {
      this.#parserMode = "text"
      this.#dispatchCsi(this.#sequence, ch)
      this.#sequence = ""
      return
    }
    if (this.#sequence.length < 256) this.#sequence += ch
  }

  #consumeOsc(ch: string): void {
    if (this.#oscEsc) {
      if (ch === "\\") {
        this.#parserMode = "text"
        this.#dispatchOsc(this.#sequence)
      } else {
        this.#parserMode = "osc"
        if (this.#sequence.length < 1024) this.#sequence += `\x1b${ch}`
      }
      this.#oscEsc = false
      return
    }
    if (ch === "\x07") {
      this.#parserMode = "text"
      this.#dispatchOsc(this.#sequence)
      return
    }
    if (ch === "\x1b") {
      this.#oscEsc = true
      return
    }
    if (this.#sequence.length < 1024) this.#sequence += ch
  }

  #dispatchOsc(raw: string): void {
    if (this.#applyOscTerminalColor(raw)) {
      this.requestRender()
      return
    }
    if (!this.shouldAnswerTerminalQuery("color")) return
    if (raw === "10;?") this.emitTerminalResponse(`\x1b]10;${oscRgb(colorToColor(this.#defaultFg))}\x1b\\`)
    else if (raw === "11;?") this.emitTerminalResponse(`\x1b]11;${oscRgb(this.#defaultBg === null ? TERMINAL_BG : colorToColor(this.#defaultBg))}\x1b\\`)
    else if (raw === "12;?") this.emitTerminalResponse(`\x1b]12;${oscRgb(this.#cursorFill)}\x1b\\`)
  }

  #applyOscTerminalColor(raw: string): boolean {
    if (raw === "110") {
      this.#defaultFg = DEFAULT_FG
      this.#materials.delete(colorKey(DEFAULT_FG))
      return true
    }
    if (raw === "111") {
      this.#defaultBg = null
      return true
    }
    if (raw === "112") {
      this.#cursorFill = CURSOR_FILL
      return true
    }
    const separator = raw.indexOf(";")
    if (separator < 0) return false
    const code = raw.slice(0, separator)
    if (code !== "10" && code !== "11" && code !== "12") return false
    const color = parseOscTerminalColor(raw.slice(separator + 1))
    if (color === null) return false
    if (code === "10") {
      this.#defaultFg = color
      this.#materials.delete(colorKey(DEFAULT_FG))
    } else if (code === "11") {
      this.#defaultBg = color
    } else {
      this.#cursorFill = colorToColor(color)
    }
    return true
  }

  #dispatchCsi(raw: string, final: string): void {
    const privatePrefix = /^[?><=]+/.exec(raw)?.[0] ?? ""
    const body = privatePrefix.length > 0 ? raw.slice(privatePrefix.length) : raw
    const params = parseCsiParams(body)
    const n = (fallback = 1): number => csiParam(params, 0, fallback)

    if (final === "m") {
      this.#applySgr(params.length === 0 ? [0] : params)
      return
    }
    this.#flushWordWrapBuffer()
    this.#pendingWrap = false
    if (final === "c") {
      if (this.shouldAnswerTerminalQuery("deviceAttributes")) this.emitTerminalResponse("\x1b[?1;2c")
      return
    }
    if (final === "H" || final === "f") {
      this.#moveCursor(csiParam(params, 0, 1) - 1, csiParam(params, 1, 1) - 1)
      return
    }
    if (final === "A") this.#cursorRow = clampInt(this.#cursorRow - n(), 0, this.#rows - 1)
    else if (final === "B") this.#cursorRow = clampInt(this.#cursorRow + n(), 0, this.#rows - 1)
    else if (final === "C") this.#cursorCol = clampInt(this.#cursorCol + n(), 0, this.#cols - 1)
    else if (final === "D") this.#cursorCol = clampInt(this.#cursorCol - n(), 0, this.#cols - 1)
    else if (final === "E") {
      this.#cursorRow = clampInt(this.#cursorRow + n(), 0, this.#rows - 1)
      this.#cursorCol = 0
    } else if (final === "F") {
      this.#cursorRow = clampInt(this.#cursorRow - n(), 0, this.#rows - 1)
      this.#cursorCol = 0
    } else if (final === "G") this.#cursorCol = clampInt(n() - 1, 0, this.#cols - 1)
    else if (final === "d") this.#cursorRow = clampInt(n() - 1, 0, this.#rows - 1)
    else if (final === "J") this.#eraseDisplay(csiParam(params, 0, 0))
    else if (final === "K") this.#eraseLine(csiParam(params, 0, 0))
    else if (final === "n" && csiParam(params, 0, 0) === 6) {
      if (this.shouldAnswerTerminalQuery("cursor")) this.emitTerminalResponse(`\x1b[${this.#cursorRow + 1};${this.#cursorCol + 1}R`)
    }
    else if (final === "P") this.#deleteChars(n())
    else if (final === "@") this.#insertChars(n())
    else if (final === "X") this.#eraseChars(n())
    else if (final === "b") this.#repeatPreviousChar(n())
    else if (final === "L") this.#insertLines(n())
    else if (final === "M") this.#deleteLines(n())
    else if (final === "r") this.#setScrollRegion(csiParam(params, 0, 1) - 1, csiParam(params, 1, this.#rows) - 1)
    else if (final === "S") for (let i = 0; i < n(); i++) this.#scrollUp()
    else if (final === "T") for (let i = 0; i < n(); i++) this.#scrollDown()
    else if (final === "s") this.#savedCursor = {row: this.#cursorRow, col: this.#cursorCol}
    else if (final === "u" && this.#savedCursor !== null) {
      this.#cursorRow = clampInt(this.#savedCursor.row, 0, this.#rows - 1)
      this.#cursorCol = clampInt(this.#savedCursor.col, 0, this.#cols - 1)
    } else if ((final === "h" || final === "l") && privatePrefix.includes("?")) {
      const enabled = final === "h"
      if (params.includes(25)) this.#showCursor = final === "h"
      if (params.includes(1)) this.#applicationCursorKeys = final === "h"
      if (params.includes(6)) {
        this.#originMode = enabled
        this.#moveCursor(0, 0)
      }
      if (params.includes(7)) this.#autoWrap = enabled
      if (params.includes(66)) this.#applicationKeypad = final === "h"
      if (params.includes(2004)) this.#bracketedPaste = final === "h"
      if (params.includes(1006)) this.#sgrMouse = enabled
      if (enabled) {
        if (params.includes(1003)) this.#mouseMode = "any"
        else if (params.includes(1002)) this.#mouseMode = "button"
        else if (params.includes(1000)) this.#mouseMode = "normal"
      } else if (params.some((param) => param === 1000 || param === 1002 || param === 1003)) {
        this.#mouseMode = "none"
        this.#mouseButtonDown = null
      }
      if (params.includes(47) || params.includes(1047) || params.includes(1049)) {
        this.#alternateScreen = final === "h"
        this.clear()
      }
    }
  }

  #moveCursor(row: number, col: number): void {
    if (this.#originMode) {
      this.#cursorRow = clampInt(this.#scrollTop + row, this.#scrollTop, this.#scrollBottom)
    } else {
      this.#cursorRow = clampInt(row, 0, this.#rows - 1)
    }
    this.#cursorCol = clampInt(col, 0, this.#cols - 1)
  }

  #applySgr(params: number[]): void {
    for (let i = 0; i < params.length; i++) {
      const p = params[i] ?? 0
      if (p === 0) this.#attr = cloneAttr(DEFAULT_ATTR)
      else if (p === 1) this.#attr.bold = true
      else if (p === 2) this.#attr.dim = true
      else if (p === 4 || p === 21) this.#attr.underline = true
      else if (p === 22) {
        this.#attr.bold = false
        this.#attr.dim = false
      } else if (p === 24) this.#attr.underline = false
      else if (p === 59) this.#attr.underlineColor = null
      else if (p === 7) this.#attr.inverse = true
      else if (p === 27) this.#attr.inverse = false
      else if (p === 39) this.#attr.fg = DEFAULT_FG
      else if (p === 49) this.#attr.bg = null
      else if (p >= 30 && p <= 37) this.#attr.fg = {kind: "ansi", index: p - 30}
      else if (p >= 90 && p <= 97) this.#attr.fg = {kind: "ansi", index: p - 90 + 8}
      else if (p >= 40 && p <= 47) this.#attr.bg = {kind: "ansi", index: p - 40}
      else if (p >= 100 && p <= 107) this.#attr.bg = {kind: "ansi", index: p - 100 + 8}
      else if (p === 38 || p === 48 || p === 58) {
        const parsed = parseExtendedColor(params, i + 1)
        if (parsed !== null) {
          if (p === 38) this.#attr.fg = parsed.color
          else if (p === 48) this.#attr.bg = parsed.color
          else this.#attr.underlineColor = parsed.color
          i = parsed.nextIndex
        }
      }
    }
  }

  #putChar(ch: string): void {
    this.#putCell({ch, attr: cloneAttr(this.#attr), width: terminalCharWidth(ch)})
  }

  #putSpace(): void {
    if (this.#wrapMode === "word" && this.#wrapLines) {
      if (this.#cursorCol <= 0) return
      if (this.#cursorCol >= this.#cols - 1) return
    }
    this.#putChar(" ")
  }

  #flushWordWrapBuffer(): void {
    if (this.#wordWrapBuffer.length === 0) return
    const cells = this.#wordWrapBuffer
    this.#wordWrapBuffer = []
    const remaining = this.#cols - this.#cursorCol
    if (this.#shouldAutoWrap() && this.#cursorCol > 0 && cells.length > remaining) this.#wrapLineFeed()
    for (const cell of cells) this.#putCell(cell)
  }

  #putCell(cell: TerminalCell): void {
    if (cell.width === 0) return
    if (this.#pendingWrap) {
      if (!this.#shouldAutoWrap()) return
      this.#pendingWrap = false
      this.#cursorCol = 0
      this.#lineFeed()
    }
    if (cell.width === 2 && this.#cursorCol >= this.#cols - 1) {
      if (!this.#shouldAutoWrap()) return
      this.#cursorCol = 0
      this.#lineFeed()
    }
    if (this.#cursorCol >= this.#cols) {
      if (!this.#shouldAutoWrap()) return
      this.#cursorCol = 0
      this.#lineFeed()
    }
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    row[this.#cursorCol] = {ch: cell.ch, attr: cloneAttr(cell.attr), width: cell.width}
    if (cell.width === 2 && this.#cursorCol + 1 < this.#cols) {
      row[this.#cursorCol + 1] = {ch: "", attr: cloneAttr(cell.attr), width: 0}
      if (this.#cursorCol + 1 >= this.#cols - 1) {
        if (!this.#shouldAutoWrap()) {
          this.#cursorCol = this.#cols
          return
        }
        this.#pendingWrap = true
        return
      }
      this.#cursorCol += 2
      return
    }
    if (this.#cursorCol >= this.#cols - 1) {
      if (!this.#shouldAutoWrap()) {
        this.#cursorCol = this.#cols
        return
      }
      this.#pendingWrap = true
      return
    }
    this.#cursorCol++
  }

  #shouldAutoWrap(): boolean {
    return this.#wrapLines && this.#autoWrap
  }

  #repeatPreviousChar(count: number): void {
    const row = this.#screen[this.#cursorRow]
    if (row === undefined || this.#cursorCol <= 0) return
    let prevCol = Math.min(this.#cursorCol - 1, this.#cols - 1)
    while (prevCol >= 0 && row[prevCol]?.width === 0) prevCol--
    const previous = row[prevCol]
    if (previous === undefined || previous.width === 0) return
    const n = clampInt(count, 1, this.#cols)
    for (let i = 0; i < n; i++) this.#putCell(previous)
  }

  #lineFeed(): void {
    this.#pendingWrap = false
    if (this.#cursorRow === this.#scrollBottom) {
      this.#scrollUpRegion(this.#scrollTop, this.#scrollBottom)
      return
    }
    if (this.#cursorRow >= this.#rows - 1) {
      this.#scrollUp()
      return
    }
    this.#cursorRow++
  }

  #reverseIndex(): void {
    this.#pendingWrap = false
    if (this.#cursorRow === this.#scrollTop) {
      this.#scrollDownRegion(this.#scrollTop, this.#scrollBottom)
      return
    }
    this.#cursorRow = Math.max(0, this.#cursorRow - 1)
  }

  #wrapLineFeed(): void {
    this.#pendingWrap = false
    this.#cursorCol = 0
    this.#lineFeed()
  }

  #scrollUp(): void {
    this.#scrollUpRegion(0, this.#rows - 1)
  }

  #scrollDown(): void {
    this.#scrollDownRegion(0, this.#rows - 1)
  }

  #scrollUpRegion(top: number, bottom: number): void {
    const t = clampInt(top, 0, this.#rows - 1)
    const b = clampInt(bottom, t, this.#rows - 1)
    if (t === 0 && b === this.#rows - 1) {
      this.#pushScrollback(this.#screen.shift() ?? this.#blankLine())
      this.#screen.push(this.#blankLine(this.#attr))
      return
    }
    this.#screen.splice(t, 1)
    this.#screen.splice(b, 0, this.#blankLine(this.#attr))
  }

  #scrollDownRegion(top: number, bottom: number): void {
    const t = clampInt(top, 0, this.#rows - 1)
    const b = clampInt(bottom, t, this.#rows - 1)
    this.#screen.splice(b, 1)
    this.#screen.splice(t, 0, this.#blankLine(this.#attr))
  }

  #setScrollRegion(top: number, bottom: number): void {
    if (bottom <= top || top < 0 || bottom >= this.#rows) {
      this.#scrollTop = 0
      this.#scrollBottom = this.#rows - 1
    } else {
      this.#scrollTop = top
      this.#scrollBottom = bottom
    }
    this.#moveCursor(0, 0)
  }

  #eraseDisplay(mode: number): void {
    const cursorCol = Math.min(this.#cursorCol, this.#cols)
    const visibleCursorCol = Math.min(cursorCol, this.#cols - 1)
    if (mode === 2) {
      this.#screen = Array.from({length: this.#rows}, () => this.#blankLine(this.#attr))
      this.#pendingWrap = false
      return
    }
    if (mode === 3) {
      this.#scrollback = []
      divScrollTo(this, TERMINAL_SCROLL_KEY, {top: 0})
      return
    }
    if (mode === 1) {
      for (let row = 0; row < this.#cursorRow; row++) this.#screen[row] = this.#blankLine(this.#attr)
      for (let col = 0; col <= visibleCursorCol; col++) this.#screen[this.#cursorRow]![col] = this.#blankCell()
      return
    }
    for (let col = cursorCol; col < this.#cols; col++) this.#screen[this.#cursorRow]![col] = this.#blankCell()
    for (let row = this.#cursorRow + 1; row < this.#rows; row++) this.#screen[row] = this.#blankLine(this.#attr)
  }

  #eraseLine(mode: number): void {
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    const cursorCol = Math.min(this.#cursorCol, this.#cols)
    const visibleCursorCol = Math.min(cursorCol, this.#cols - 1)
    const start = mode === 1 ? 0 : cursorCol
    const end = mode === 0 ? this.#cols - 1 : visibleCursorCol
    if (mode === 2) {
      this.#screen[this.#cursorRow] = this.#blankLine(this.#attr)
      return
    }
    if (start > end) return
    for (let col = start; col <= end; col++) row[col] = this.#blankCell()
  }

  #eraseChars(count: number): void {
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    const available = Math.max(0, this.#cols - this.#cursorCol)
    if (available === 0) return
    const n = clampInt(count, 1, available)
    for (let i = 0; i < n; i++) row[this.#cursorCol + i] = this.#blankCell()
  }

  #deleteChars(count: number): void {
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    const n = clampInt(count, 1, this.#cols)
    row.splice(this.#cursorCol, n)
    while (row.length < this.#cols) row.push(this.#blankCell())
  }

  #insertChars(count: number): void {
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    const n = clampInt(count, 1, this.#cols)
    row.splice(this.#cursorCol, 0, ...Array.from({length: n}, () => this.#blankCell()))
    row.length = this.#cols
  }

  #insertLines(count: number): void {
    if (this.#cursorRow < this.#scrollTop || this.#cursorRow > this.#scrollBottom) return
    const bottom = this.#scrollBottom
    const available = bottom - this.#cursorRow + 1
    const n = clampInt(count, 1, available)
    this.#screen.splice(this.#cursorRow, 0, ...Array.from({length: n}, () => this.#blankLine(this.#attr)))
    this.#screen.splice(bottom + 1, n)
    while (this.#screen.length < this.#rows) this.#screen.push(this.#blankLine(this.#attr))
    while (this.#screen.length > this.#rows) this.#screen.pop()
  }

  #deleteLines(count: number): void {
    if (this.#cursorRow < this.#scrollTop || this.#cursorRow > this.#scrollBottom) return
    const bottom = this.#scrollBottom
    const available = bottom - this.#cursorRow + 1
    const n = clampInt(count, 1, available)
    this.#screen.splice(this.#cursorRow, n)
    this.#screen.splice(bottom - n + 1, 0, ...Array.from({length: n}, () => this.#blankLine(this.#attr)))
    while (this.#screen.length < this.#rows) this.#screen.push(this.#blankLine(this.#attr))
    while (this.#screen.length > this.#rows) this.#screen.pop()
  }

  #materialFor(color: TerminalColor): TextMaterial {
    const rendered = color.kind === "default" ? this.#defaultFg : color
    if (rendered.kind === "default") return this.materials.text
    const key = color.kind === "default" ? `default:${colorKey(rendered)}` : colorKey(rendered)
    let material = this.#materials.get(key)
    if (material === undefined) {
      material = new TextMaterial({color: colorToColor(rendered)})
      this.#materials.set(key, material)
    }
    return material
  }
}

export class TerminalPane extends TerminalOutputPane {
  #inputEnabled: boolean
  #terminalQueryMode: "all" | "cursor" | "none"
  #onInput: ((data: string, source: TerminalInputSource) => void) | undefined
  #pendingLocalEcho: PendingLocalEcho | null = null
  #inputPreviewSnapshot: TerminalOutputSnapshot | null = null
  #inputPreviewText: string | null = null
  #softKeyboardInputArmed = false
  #softKeyboardInputBuffer = ""

  constructor(opts: TerminalPaneOpts = {}) {
    super(opts)
    this.node.name = "TerminalPane"
    this.#inputEnabled = opts.inputEnabled ?? true
    this.#terminalQueryMode = opts.terminalQueryMode ?? ((opts.respondToTerminalQueries ?? true) ? "all" : "none")
    this.#onInput = opts.onInput
  }

  override clear(): void {
    this.#pendingLocalEcho = null
    this.#inputPreviewSnapshot = null
    this.#inputPreviewText = null
    this.#softKeyboardInputBuffer = ""
    super.clear()
  }

  override reset(): void {
    this.#pendingLocalEcho = null
    this.#inputPreviewSnapshot = null
    this.#inputPreviewText = null
    this.#softKeyboardInputBuffer = ""
    super.reset()
  }

  setInputEnabled(enabled: boolean): void {
    if (this.#inputEnabled === enabled) return
    this.#inputEnabled = enabled
    if (!enabled) {
      this.#softKeyboardInputArmed = false
      this.#clearSoftKeyboardInputBuffer()
    }
    this.requestRender()
  }

  override softKeyboardInputMode(): VirtualInputSoftKeyboardMode {
    return this.#inputEnabled && this.#softKeyboardInputArmed ? "text" : "none"
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    this.#softKeyboardInputArmed = this.#inputEnabled
      && event.button === 0
      && !event.shiftKey
      && !isSecondaryPointer(event)
      && this.isCursorLinePoint(localX, localY)
    super.onPointerDown(event, localX, localY)
  }

  tryLocalEcho(data: string): boolean {
    const echo = localEchoText(data)
    if (!this.#inputEnabled || echo === null || !this.getTerminalState().localEcho) return false
    this.clearInputPreview()
    if (this.#pendingLocalEcho === null) {
      this.#pendingLocalEcho = {
        snapshot: this.captureOutputState(),
        pending: [],
        confirmed: [],
      }
    }
    this.#pendingLocalEcho.pending.push(...[...echo])
    super.write(echo)
    return true
  }

  rejectLocalEcho(): void {
    if (this.#pendingLocalEcho === null) return
    this.clearInputPreview()
    this.restoreOutputState(this.#pendingLocalEcho.snapshot)
    this.#pendingLocalEcho = null
  }

  writeAuthoritative(data: string | Uint8Array): void {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data)
    if (text.length === 0) return
    const previewText = this.#inputPreviewText
    this.clearInputPreview()
    const reconciled = this.#reconcileLocalEcho(text)
    if (reconciled.length > 0) super.write(reconciled)
    if (previewText !== null) this.setInputPreview(previewText)
  }

  setInputPreview(text: string): void {
    if (text.length === 0) {
      this.clearInputPreview()
      return
    }
    const snapshot = this.#inputPreviewSnapshot ?? this.captureOutputState()
    if (this.#inputPreviewSnapshot !== null) this.restoreOutputState(this.#inputPreviewSnapshot)
    this.#inputPreviewSnapshot = snapshot
    this.#inputPreviewText = text
    super.write(terminalInputPreviewText(text))
  }

  clearInputPreview(): void {
    const snapshot = this.#inputPreviewSnapshot
    this.#inputPreviewText = null
    if (snapshot === null) return
    this.#inputPreviewSnapshot = null
    this.restoreOutputState(snapshot)
  }

  onInputText(text: string): void {
    if (!this.#inputEnabled || text.length === 0) return
    if (this.#softKeyboardInputArmed) {
      this.#appendSoftKeyboardInput(text)
      return
    }
    const chars = [...text]
    if (chars.length === 1) {
      this.#emitInput(text, "keyboard")
      return
    }
    const data = this.terminalKeyboardMode().bracketedPaste ? `\x1b[200~${text}\x1b[201~` : text
    this.#emitInput(data, "paste")
  }

  override onKey(event: KeyboardEvent): void {
    if (this.handleOutputShortcut(event)) return
    if (!this.#inputEnabled) return
    if (this.#softKeyboardInputArmed && this.#handleSoftKeyboardInputKey(event)) return

    const metaOnly = event.metaKey && !event.ctrlKey && !event.altKey
    const key = shortcutLetter(event)
    if (metaOnly) {
      if (key === "v") {
        event.preventDefault()
        void readClipboardText().then((text) => {
          if (text !== null && text.length > 0) this.#emitInput(text, "paste")
        })
        return
      }
      if (key === "k") {
        event.preventDefault()
        this.clear()
        return
      }
      return
    }

    const data = keyToTerminalInput(event, this.terminalKeyboardMode())
    if (data === null) return
    event.preventDefault()
    this.#emitInput(data, "keyboard")
  }

  #emitInput(data: string, source: TerminalInputSource): void {
    this.#onInput?.(data, source)
  }

  #appendSoftKeyboardInput(text: string): void {
    this.#softKeyboardInputBuffer += text
    this.setInputPreview(this.#softKeyboardInputBuffer)
  }

  #clearSoftKeyboardInputBuffer(): void {
    this.#softKeyboardInputBuffer = ""
    this.clearInputPreview()
  }

  #submitSoftKeyboardInputBuffer(): void {
    const text = this.#softKeyboardInputBuffer
    this.#clearSoftKeyboardInputBuffer()
    if (text.length > 0) this.#emitInput(text, "keyboard")
    this.#emitInput("\r", "keyboard")
  }

  #handleSoftKeyboardInputKey(event: KeyboardEvent): boolean {
    if (event.metaKey || event.ctrlKey || event.altKey) return false
    if (event.key === "Enter") {
      event.preventDefault()
      this.#submitSoftKeyboardInputBuffer()
      return true
    }
    if (isBackspaceKey(event)) {
      event.preventDefault()
      const chars = [...this.#softKeyboardInputBuffer]
      chars.pop()
      this.#softKeyboardInputBuffer = chars.join("")
      if (this.#softKeyboardInputBuffer.length > 0) this.setInputPreview(this.#softKeyboardInputBuffer)
      else this.clearInputPreview()
      return true
    }
    if (isForwardDeleteKey(event) || event.key === "Escape") {
      event.preventDefault()
      if (event.key === "Escape") this.#clearSoftKeyboardInputBuffer()
      return true
    }
    if (event.key.length === 1) {
      event.preventDefault()
      return true
    }
    return false
  }

  #reconcileLocalEcho(data: string): string {
    const echo = this.#pendingLocalEcho
    if (echo === null) return data

    const incoming = [...data]
    let index = 0
    while (index < incoming.length && echo.pending.length > 0 && incoming[index] === echo.pending[0]) {
      echo.confirmed.push(echo.pending.shift() ?? "")
      index++
    }

    if (echo.pending.length === 0) {
      this.#pendingLocalEcho = null
      return incoming.slice(index).join("")
    }

    if (index === incoming.length) return ""

    const authoritative = [...echo.confirmed, ...incoming.slice(index)].join("")
    this.restoreOutputState(echo.snapshot)
    this.#pendingLocalEcho = null
    return authoritative
  }

  protected override emitTerminalResponse(data: string): void {
    this.#emitInput(data, "api")
  }

  protected override shouldAnswerTerminalQuery(kind: TerminalQueryKind): boolean {
    if (this.#terminalQueryMode === "all") return true
    return this.#terminalQueryMode === "cursor" && kind === "cursor"
  }

  protected override shouldForceCursorVisible(): boolean {
    return this.#inputEnabled && !this.getTerminalState().alternateScreen
  }

  protected override shouldSendTerminalMouse(): boolean {
    return this.#inputEnabled
  }
}

export class LogViewerPane extends TerminalOutputPane {
  constructor(opts: LogViewerPaneOpts = {}) {
    super({
      ...opts,
      title: opts.title ?? "LogViewerPane",
      status: opts.status ?? "logs",
      statusKind: opts.statusKind ?? "idle",
      cursorBlink: false,
      showCursor: false,
      reflowOnResize: true,
      wrapMode: "word",
      contentWidthMode: "text",
    })
    this.node.name = "LogViewerPane"
  }
}

function localEchoText(data: string): string | null {
  const chars = [...data]
  if (chars.length === 0) return null
  for (const char of chars) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f || code === 0x1b) return null
  }
  return data
}

function normalizeHeaderControls(controls: TerminalHeaderControls | undefined): Required<TerminalHeaderControls> {
  return {
    primary: [...(controls?.primary ?? [])],
    secondary: [...(controls?.secondary ?? [])],
  }
}

function keyToTerminalInput(event: KeyboardEvent, mode: TerminalKeyboardMode = defaultTerminalKeyboardMode()): string | null {
  const key = event.key
  const keypad = keypadToTerminalInput(event, mode)
  if (keypad !== null) return keypad
  if (key === "Tab" && event.shiftKey) return "\x1b[Z"
  const backspace = isBackspaceKey(event)
  const forwardDelete = isForwardDeleteKey(event)
  if (event.ctrlKey && !event.altKey && !event.metaKey) {
    if (backspace) return "\x17"
    const control = ctrlShortcutToTerminalInput(event)
    if (control !== null) return control
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && backspace) return "\x1b\x7f"
  if (event.altKey && !event.ctrlKey && !event.metaKey && forwardDelete) return "\x1bd"
  if (event.altKey && key.length === 1 && !event.ctrlKey && !event.metaKey) return `\x1b${key}`
  if (event.metaKey) return null
  if (key === "Enter" && event.shiftKey && !event.ctrlKey && !event.altKey) return "\n"
  if (key === "Enter") return "\r"
  if (backspace) return "\x7f"
  if (key === "Tab") return "\t"
  if (key === "Escape") return "\x1b"
  const special = specialKeyToTerminalInput(event, mode)
  if (special !== null) return special
  if (event.ctrlKey) return null
  if (key.length === 1) return key
  return null
}

function isBackspaceKey(event: KeyboardEvent): boolean {
  return event.key === "Backspace" || event.code === "Backspace"
}

function isForwardDeleteKey(event: KeyboardEvent): boolean {
  return event.key === "Delete" && event.code !== "Backspace"
}

function shortcutLetter(event: KeyboardEvent): string | null {
  const code = event.code
  if (code.length === 4 && code.startsWith("Key")) {
    const letter = code[3]?.toLowerCase() ?? ""
    if (letter >= "a" && letter <= "z") return letter
  }
  const key = event.key.toLowerCase()
  if (key.length === 1 && key >= "a" && key <= "z") return key
  return null
}

function ctrlShortcutToTerminalInput(event: KeyboardEvent): string | null {
  const letter = shortcutLetter(event)
  if (letter !== null) return String.fromCharCode(letter.charCodeAt(0) - 96)
  switch (event.code) {
    case "Space":
      return "\x00"
    case "BracketLeft":
      return "\x1b"
    case "Backslash":
      return "\x1c"
    case "BracketRight":
      return "\x1d"
    case "Digit6":
      return "\x1e"
    case "Minus":
      return "\x1f"
  }
  const key = event.key
  if (key === " ") return "\x00"
  if (key === "[") return "\x1b"
  if (key === "\\") return "\x1c"
  if (key === "]") return "\x1d"
  if (key === "^") return "\x1e"
  if (key === "_") return "\x1f"
  return null
}

function defaultTerminalKeyboardMode(): TerminalKeyboardMode {
  return {applicationCursorKeys: false, applicationKeypad: false, bracketedPaste: false}
}

function specialKeyToTerminalInput(event: KeyboardEvent, mode: TerminalKeyboardMode): string | null {
  const key = event.key
  const mod = terminalModifierParam(event)
  const cursorKey = terminalCursorFinal(key)
  if (cursorKey !== null) {
    if (mod !== null) return `\x1b[1;${mod}${cursorKey}`
    return mode.applicationCursorKeys ? `\x1bO${cursorKey}` : `\x1b[${cursorKey}`
  }

  if (key === "Home") {
    if (mod !== null) return `\x1b[1;${mod}H`
    return mode.applicationCursorKeys ? "\x1bOH" : "\x1b[H"
  }
  if (key === "End") {
    if (mod !== null) return `\x1b[1;${mod}F`
    return mode.applicationCursorKeys ? "\x1bOF" : "\x1b[F"
  }

  const tilde = terminalTildeKeyParam(key)
  if (tilde !== null) return mod === null ? `\x1b[${tilde}~` : `\x1b[${tilde};${mod}~`

  const functionKey = terminalFunctionKey(key)
  if (functionKey === null) return null
  if (functionKey.ss3 !== null && mod === null) return `\x1bO${functionKey.ss3}`
  return mod === null ? `\x1b[${functionKey.param}~` : `\x1b[${functionKey.param};${mod}~`
}

function keypadToTerminalInput(event: KeyboardEvent, mode: TerminalKeyboardMode): string | null {
  if (!event.code.startsWith("Numpad")) return null
  const key = event.key
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (!mode.applicationKeypad) {
    if (event.code === "NumpadEnter" && event.shiftKey) return "\n"
    if (event.code === "NumpadEnter") return "\r"
    return key.length === 1 ? key : null
  }
  const appKey = {
    Numpad0: "p",
    Numpad1: "q",
    Numpad2: "r",
    Numpad3: "s",
    Numpad4: "t",
    Numpad5: "u",
    Numpad6: "v",
    Numpad7: "w",
    Numpad8: "x",
    Numpad9: "y",
    NumpadDecimal: "n",
    NumpadSubtract: "m",
    NumpadAdd: "k",
    NumpadEnter: "M",
    NumpadMultiply: "j",
    NumpadDivide: "o",
  }[event.code]
  return appKey === undefined ? null : `\x1bO${appKey}`
}

function terminalInputPreviewText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n")
}

function terminalCursorFinal(key: string): string | null {
  if (key === "ArrowUp") return "A"
  if (key === "ArrowDown") return "B"
  if (key === "ArrowRight") return "C"
  if (key === "ArrowLeft") return "D"
  return null
}

function terminalTildeKeyParam(key: string): number | null {
  if (key === "Insert") return 2
  if (key === "Delete") return 3
  if (key === "PageUp") return 5
  if (key === "PageDown") return 6
  return null
}

function terminalFunctionKey(key: string): {ss3: string | null; param: number} | null {
  if (!/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return null
  const index = Number.parseInt(key.slice(1), 10)
  const ss3 = ["P", "Q", "R", "S"][index - 1] ?? null
  const params = [
    11, 12, 13, 14,
    15, 17, 18, 19,
    20, 21, 23, 24,
    25, 26, 28, 29,
    31, 32, 33, 34,
    42, 43, 44, 45,
  ]
  return {ss3, param: params[index - 1] ?? 11}
}

function terminalModifierParam(event: KeyboardEvent): number | null {
  const shift = event.shiftKey ? 1 : 0
  const alt = event.altKey ? 2 : 0
  const ctrl = event.ctrlKey ? 4 : 0
  const value = shift + alt + ctrl
  return value === 0 ? null : value + 1
}

function parseCsiParams(raw: string): number[] {
  if (raw.length === 0) return []
  return raw
    .replaceAll(":", ";")
    .split(";")
    .map((part) => part.trim())
    .map((part) => part.length === 0 ? 0 : Number.parseInt(part, 10))
    .map((value) => Number.isFinite(value) ? value : 0)
}

function csiParam(params: readonly number[], index: number, fallback: number): number {
  const value = params[index]
  return value === undefined || value === 0 ? fallback : value
}

function parseExtendedColor(params: readonly number[], start: number): {color: TerminalColor; nextIndex: number} | null {
  const mode = params[start]
  if (mode === 5) {
    const index = clampInt(params[start + 1] ?? 0, 0, 255)
    return {color: color256(index), nextIndex: start + 1}
  }
  if (mode === 2) {
    const offset = params[start + 1] === 0 && params.length > start + 4 ? 2 : 1
    return {
      color: {
        kind: "rgb",
        r: clampInt(params[start + offset] ?? 255, 0, 255),
        g: clampInt(params[start + offset + 1] ?? 255, 0, 255),
        b: clampInt(params[start + offset + 2] ?? 255, 0, 255),
      },
      nextIndex: start + offset + 2,
    }
  }
  return null
}

function isZeroWidthTerminalCodePoint(code: number): boolean {
  return code === 0x200d ||
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe00 && code <= 0xfe0f)
}

function isTerminalSpaceCodePoint(code: number): boolean {
  return code === 0x00a0 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
}

function terminalCharWidth(ch: string): 0 | 1 | 2 {
  const code = ch.codePointAt(0) ?? 0
  if (isZeroWidthTerminalCodePoint(code)) return 0
  return isWideTerminalCodePoint(code) ? 2 : 1
}

function isWideTerminalCodePoint(code: number): boolean {
  return code === 0x2728 ||
    code === 0x2b50 ||
    code === 0x2b55 ||
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f000 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
}

function terminalGlyphFallback(ch: string): string {
  const code = ch.codePointAt(0) ?? 0
  if (ch === "✨") return "✶"
  if (ch === "❯" || ch === "›" || ch === "⟩" || ch === "➜" || ch === "➔" || ch === "▶" || ch === "▸") return ">"
  if (ch === "❮" || ch === "‹" || ch === "⟨" || ch === "◀" || ch === "◂") return "<"
  if (ch === "→" || ch === "⇒" || ch === "⟶") return ">"
  if (ch === "←" || ch === "⇐" || ch === "⟵") return "<"
  if (ch === "✓" || ch === "✔") return "v"
  if (ch === "✗" || ch === "✘") return "x"
  if (ch === "⚠" || ch === "‼") return "!"
  if (ch === "•" || ch === "◦" || ch === "●" || ch === "○" || ch === "◆" || ch === "◇" || ch === "✦" || ch === "✧") return "*"
  if ((code >= 0xe000 && code <= 0xf8ff) || (code >= 0x1f000 && code <= 0x1ffff) || (code >= 0x2600 && code <= 0x27bf) || (code >= 0x2800 && code <= 0x28ff)) return "*"
  return "?"
}

function color256(index: number): TerminalColor {
  if (index < 16) return {kind: "ansi", index}
  if (index >= 232) {
    const v = 8 + (index - 232) * 10
    return {kind: "rgb", r: v, g: v, b: v}
  }
  const n = index - 16
  const r = Math.floor(n / 36)
  const g = Math.floor((n % 36) / 6)
  const b = n % 6
  const channel = (value: number): number => value === 0 ? 0 : 55 + value * 40
  return {kind: "rgb", r: channel(r), g: channel(g), b: channel(b)}
}

function displayFg(attr: TerminalAttr): TerminalColor {
  let color = attr.inverse ? attr.bg ?? {kind: "ansi", index: 0} : attr.fg
  if (!attr.inverse && attr.bold && color.kind === "ansi" && color.index < 8) color = {kind: "ansi", index: color.index + 8}
  return attr.dim ? dimTerminalColor(color) : color
}

function displayBg(cell: TerminalCell): TerminalColor | null {
  if (cell.attr.inverse) return cell.attr.fg.kind === "default" ? {kind: "ansi", index: 7} : cell.attr.fg
  return cell.attr.bg
}

function sameAttrForText(a: TerminalAttr, b: TerminalAttr): boolean {
  return a.bold === b.bold &&
    a.dim === b.dim &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    sameColor(displayFg(a), displayFg(b)) &&
    sameColor(a.bg, b.bg) &&
    sameColor(a.underlineColor, b.underlineColor)
}

function sameColor(a: TerminalColor | null, b: TerminalColor | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === "default") return true
  if (a.kind === "ansi") return a.index === (b as {kind: "ansi"; index: number}).index
  const rb = b as {kind: "rgb"; r: number; g: number; b: number}
  return a.r === rb.r && a.g === rb.g && a.b === rb.b
}

function colorToColor(color: TerminalColor): Color {
  if (color.kind === "default") return palette.text
  if (color.kind === "ansi") return ANSI_COLORS[clampInt(color.index, 0, ANSI_COLORS.length - 1)] ?? palette.text
  return new Color(color.r / 255, color.g / 255, color.b / 255, 1)
}

function dimTerminalColor(color: TerminalColor): TerminalColor {
  const dimmed = mixColor(colorToColor(color), TERMINAL_BG, 0.42)
  return {
    kind: "rgb",
    r: Math.round(dimmed.r * 255),
    g: Math.round(dimmed.g * 255),
    b: Math.round(dimmed.b * 255),
  }
}

function colorKey(color: TerminalColor): string {
  if (color.kind === "default") return "default"
  if (color.kind === "ansi") return `ansi:${color.index}`
  return `rgb:${color.r}:${color.g}:${color.b}`
}

function oscRgb(color: Color): string {
  const part = (value: number): string => {
    const channel = clampInt(Math.round(Math.max(0, Math.min(1, value)) * 65535), 0, 65535)
    return channel.toString(16).padStart(4, "0")
  }
  return `rgb:${part(color.r)}/${part(color.g)}/${part(color.b)}`
}

function parseOscTerminalColor(value: string): TerminalColor | null {
  const trimmed = value.trim()
  const hex = /^#?([0-9a-f]{6})$/i.exec(trimmed)
  if (hex !== null) {
    const raw = hex[1]!
    return {
      kind: "rgb",
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
    }
  }
  const rgb = /^rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i.exec(trimmed)
  if (rgb === null) return null
  const channel = (raw: string): number => {
    const max = (1 << (raw.length * 4)) - 1
    const parsed = Number.parseInt(raw, 16)
    return clampInt(Math.round((parsed / max) * 255), 0, 255)
  }
  return {
    kind: "rgb",
    r: channel(rgb[1]!),
    g: channel(rgb[2]!),
    b: channel(rgb[3]!),
  }
}

function cloneAttr(attr: TerminalAttr): TerminalAttr {
  return {
    fg: cloneColor(attr.fg),
    bg: attr.bg === null ? null : cloneColor(attr.bg),
    underlineColor: attr.underlineColor === null ? null : cloneColor(attr.underlineColor),
    bold: attr.bold,
    dim: attr.dim,
    underline: attr.underline,
    inverse: attr.inverse,
  }
}

function cloneCells(cells: readonly TerminalCell[]): TerminalCell[] {
  return cells.map((cell) => ({ch: cell.ch, attr: cloneAttr(cell.attr), width: cell.width}))
}

function cloneCellLines(lines: readonly TerminalCell[][]): TerminalCell[][] {
  return lines.map((line) => cloneCells(line))
}

function cloneColor(color: TerminalColor): TerminalColor {
  if (color.kind === "default") return DEFAULT_FG
  if (color.kind === "ansi") return {kind: "ansi", index: color.index}
  return {kind: "rgb", r: color.r, g: color.g, b: color.b}
}

function terminalStyleCells(line: readonly TerminalCell[], defaultBg: TerminalColor | null): TerminalStyleCell[] {
  return line.map((cell) => ({
    ch: cell.ch,
    width: cell.width,
    fg: cloneColor(displayFg(cell.attr)),
    bg: cloneNullableColor(displayBg(cell) ?? defaultBg),
    underlineColor: cloneNullableColor(cell.attr.underlineColor),
    bold: cell.attr.bold,
    dim: cell.attr.dim,
    underline: cell.attr.underline,
    inverse: cell.attr.inverse,
  }))
}

function cloneNullableColor(color: TerminalColor | null): TerminalStyleColor | null {
  return color === null ? null : cloneColor(color)
}

function terminalLineText(line: readonly TerminalCell[]): string {
  return trimRightCells(line.map((cell) => cell.ch).join(""))
}

function lastNonEmptyLineIndex(lines: readonly string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if ((lines[i] ?? "").length > 0) return i
  }
  return 0
}

function statusColor(kind: TerminalStatusKind): Color {
  if (kind === "connected" || kind === "running") return palette.green
  if (kind === "error" || kind === "disconnected") return palette.red
  return palette.orange
}

function isSecondaryPointer(event: MouseEvent): boolean {
  return event.button === 2 || event.ctrlKey
}

function isTouchPointerEvent(event: MouseEvent): boolean {
  const pointer = event as MouseEvent & {
    pointerType?: unknown
    metaforPointerType?: unknown
    sourceCapabilities?: {firesTouchEvents?: boolean} | null
  }
  return pointer.pointerType === "touch" || pointer.metaforPointerType === "touch" || pointer.sourceCapabilities?.firesTouchEvents === true
}

function terminalMouseButton(button: number): number | null {
  if (button === 0) return 0
  if (button === 1) return 1
  if (button === 2) return 2
  return null
}

function terminalMouseModifiers(event: MouseEvent | WheelEvent): number {
  return (event.shiftKey ? 4 : 0) + (event.altKey ? 8 : 0) + (event.ctrlKey ? 16 : 0)
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}

function mixColor(a: Color, b: Color, t: number): Color {
  const k = Math.min(1, Math.max(0, t))
  return new Color(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k,
    a.a + (b.a - a.a) * k,
  )
}

function trimRightCells(value: string): string {
  return value.replace(/[ \t]+$/g, "")
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
