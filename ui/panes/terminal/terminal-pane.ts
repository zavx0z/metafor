/**
 * TerminalPane — универсальная терминальная поверхность поверх WebGPU UI.
 *
 * Компонент не знает о PTY, WebSocket или конкретном сервере:
 * внешний адаптер пишет вывод через `write()`, а пользовательский ввод
 * получает через `onInput`.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {UiSurface, Z, div, divScrollPosition, divScrollTo, palette, radii, type DivScrollContext} from "@ui/elements"
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
import {PANE_FRAME, paneBodyRect, paneHeaderRuleRect} from "../pane-frame.ts"

export type TerminalSize = {
  cols: number
  rows: number
}

export type TerminalStatusKind = "idle" | "connected" | "running" | "disconnected" | "error"

export type TerminalInputSource = "keyboard" | "paste" | "api"

type TerminalOutputPaneOpts = {
  title?: string
  status?: string
  statusKind?: TerminalStatusKind
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
  scrollX?: boolean
  scrollY?: boolean
  cursorBlink?: boolean
  showCursor?: boolean
  onResize?: (size: TerminalSize) => void
}

type TerminalOutputPaneInternalOpts = TerminalOutputPaneOpts & {
  reflowOnResize?: boolean
  wrapMode?: "char" | "word"
  contentWidthMode?: "grid" | "text"
}

export type TerminalPaneOpts = TerminalOutputPaneOpts & {
  inputEnabled?: boolean
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
>

type TerminalColor =
  | {kind: "default"}
  | {kind: "ansi"; index: number}
  | {kind: "rgb"; r: number; g: number; b: number}

type TerminalAttr = {
  fg: TerminalColor
  bg: TerminalColor | null
  bold: boolean
  inverse: boolean
}

type TerminalCell = {
  ch: string
  attr: TerminalAttr
}

type ParserMode = "text" | "esc" | "csi" | "osc"

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
const DEFAULT_MIN_COLS = 24
const DEFAULT_MIN_ROWS = 6
const DEFAULT_MAX_SCROLLBACK = 5000
const HEADER_H_PX = PANE_FRAME.headerHeight
const BODY_PAD_X_PX = 0
const BODY_PAD_Y_PX = 0
const STATUS_DOT_PX = 7
const SCROLLBAR_W_PX = 4
const CARET_BLINK_MS = 530
const AUTOSCROLL_TOLERANCE_PX = 20
const TERMINAL_SCROLL_KEY = "terminal-pane:scroll"
const TERMINAL_BG = palette.bgCode
const HEADER_RULE = withAlpha(palette.borderDim, 0.82)
const STATUS_FILL = withAlpha(palette.bgInput, 0.76)
const STATUS_BORDER = withAlpha(palette.borderBright, 0.12)
const CURSOR_FILL = withAlpha(palette.cyan, 0.74)
const SELECTION_FILL = new Color(92 / 255, 155 / 255, 0.34)
const DEFAULT_FG: TerminalColor = {kind: "default"}
const DEFAULT_ATTR: TerminalAttr = {
  fg: DEFAULT_FG,
  bg: null,
  bold: false,
  inverse: false,
}

const ANSI_COLORS = [
  palette.bgInput,
  palette.red,
  palette.green,
  palette.orange,
  palette.blue,
  palette.violet,
  palette.cyan,
  palette.text,
  palette.muted,
  mixColor(palette.red, palette.text, 0.20),
  mixColor(palette.green, palette.text, 0.18),
  mixColor(palette.orange, palette.text, 0.18),
  mixColor(palette.blue, palette.text, 0.20),
  mixColor(palette.violet, palette.text, 0.18),
  mixColor(palette.cyan, palette.text, 0.16),
  new Color(1, 1, 1, 1),
] as const

class TerminalOutputPane extends UiSurface {
  #title: string
  #status: string
  #statusKind: TerminalStatusKind
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
  #reflowOnResize: boolean
  #wrapMode: "char" | "word"
  #contentWidthMode: "grid" | "text"
  #cursorBlink: boolean
  #cursorEnabled: boolean
  #onResize: ((size: TerminalSize) => void) | undefined

  #preferredCols: number
  #cols: number
  #rows: number
  #scrollback: TerminalCell[][] = []
  #screen: TerminalCell[][]
  #cursorRow = 0
  #cursorCol = 0
  #savedCursor: {row: number; col: number} | null = null
  #selectionAnchor: TextPosition | null = null
  #selectionFocus: TextPosition | null = null
  #dragSelecting = false
  #dragAnchorLocalX = 0
  #dragAnchorLocalY = 0
  #attr: TerminalAttr = cloneAttr(DEFAULT_ATTR)
  #wordWrapBuffer: TerminalCell[] = []
  #parserMode: ParserMode = "text"
  #sequence = ""
  #oscEsc = false
  #showCursor = true
  #focused = false
  #cursorVisible = true
  #cursorTimer: ReturnType<typeof setInterval> | null = null
  #charWidth = 0
  #charWidthScale = 0
  #lastEmittedSize: TerminalSize | null = null
  #decoder = new TextDecoder()
  #rawOutput = ""
  readonly #materials = new Map<string, TextMaterial>()

  constructor(opts: TerminalOutputPaneInternalOpts = {}) {
    super({
      bgColor: TERMINAL_BG,
      borderColor: palette.borderDim,
      borderWidthPx: 1,
      borderRadiusPx: radii.pane,
    })
    this.node.name = "TerminalOutputPane"
    this.#title = opts.title ?? "Terminal"
    this.#status = opts.status ?? "idle"
    this.#statusKind = opts.statusKind ?? "idle"
    this.#fontPx = opts.fontPx ?? 12
    this.#linePx = opts.linePx ?? 17
    this.#preferredCols = clampInt(opts.cols ?? DEFAULT_COLS, 1, 400)
    this.#cols = this.#preferredCols
    this.#rows = clampInt(opts.rows ?? DEFAULT_ROWS, 1, 160)
    this.#minCols = clampInt(opts.minCols ?? DEFAULT_MIN_COLS, 1, 400)
    this.#minRows = clampInt(opts.minRows ?? DEFAULT_MIN_ROWS, 1, 160)
    this.#maxScrollback = clampInt(opts.maxScrollback ?? DEFAULT_MAX_SCROLLBACK, 0, 100000)
    this.#fitToRect = opts.fitToRect ?? true
    this.#showHeader = opts.showHeader ?? true
    this.#wrapLines = opts.wrapLines ?? true
    this.#scrollX = opts.scrollX ?? false
    this.#scrollY = opts.scrollY ?? true
    this.#reflowOnResize = opts.reflowOnResize ?? false
    this.#wrapMode = opts.wrapMode ?? "char"
    this.#contentWidthMode = opts.contentWidthMode ?? "grid"
    this.#cursorBlink = opts.cursorBlink ?? true
    this.#cursorEnabled = opts.showCursor ?? true
    this.#showCursor = this.#cursorEnabled
    this.#cursorVisible = this.#cursorEnabled
    this.#onResize = opts.onResize
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
    if (wasAtBottom) this.#scrollToBottom()
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
    this.#wordWrapBuffer = []
    this.clear()
  }

  focus(): void {
    this.canvas?.setFocused(this)
    this.canvas?.inputProxy?.focus()
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

  setTerminalSize(cols: number, rows: number): void {
    this.#preferredCols = clampInt(cols, 1, 400)
    this.#resizeGrid(this.#preferredCols, clampInt(rows, 1, 160), true)
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
    const headerY = 0
    this.drawText(this.#title, PANE_FRAME.headerTextX, PANE_FRAME.headerTextY, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, this.rectW - PANE_FRAME.headerTextX * 2 - 190),
    })
    const statusW = Math.min(210, Math.max(96, this.measureText(this.#status, 11) + 32))
    const statusX = Math.max(PANE_FRAME.headerTextX, this.rectW - PANE_FRAME.headerTextX - statusW)
    const dot = statusColor(this.#statusKind)
    this.drawRoundedRect(statusX, headerY + 8, statusW, 22, {
      radius: 999,
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
    const rule = paneHeaderRuleRect(this.rectW, HEADER_H_PX)
    this.drawRect(rule.x, rule.y, rule.w, rule.h, HEADER_RULE, Z.SEPARATOR)
  }

  #renderBody(): void {
    const body = this.#bodyRect()
    if (body.w <= 0 || body.h <= 0) return
    const contentW = this.#contentCols() * this.#getCharWidth() + BODY_PAD_X_PX * 2
    const contentH = this.#totalLineCount() * this.#linePx + BODY_PAD_Y_PX * 2
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
    const endIdx = Math.min(this.#totalLineCount(), Math.ceil((ctx.scrollTop + ctx.viewportHeight) / this.#linePx) + 1)
    const cursorGlobalRow = this.#scrollback.length + this.#cursorRow
    for (let idx = startIdx; idx < endIdx; idx++) {
      const line = this.#lineAt(idx)
      if (line === undefined) continue
      const rowY = y + idx * this.#linePx - ctx.scrollTop
      this.#renderLine(idx, line, x, rowY)
      if (idx === cursorGlobalRow) this.#renderCursor(x, rowY)
    }
  }

  #renderLine(lineIndex: number, line: TerminalCell[], x: number, y: number): void {
    const charW = this.#getCharWidth()
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
      if (cell.ch === " ") {
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
      this.drawText(value, x + start * charW, y + 1, {
        fontPx: this.#fontPx,
        material: this.#materialFor(textColor),
        maxWidthPx: Math.max(1, (col - start) * charW + 1),
        fit: false,
      })
    }
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
    if (!this.#focused || !this.#cursorEnabled || !this.#showCursor || !this.#cursorVisible || this.#cursorCol >= this.#cols) return
    const charW = this.#getCharWidth()
    this.drawRoundedRect(x + this.#cursorCol * charW, y + 2, Math.max(2, charW), Math.max(4, this.#linePx - 3), {
      radius: 2,
      fill: CURSOR_FILL,
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

  // ────────── ввод/выделение ──────────

  onKey(event: KeyboardEvent): void {
    this.handleOutputShortcut(event)
  }

  protected handleOutputShortcut(event: KeyboardEvent): boolean {
    const metaOnly = event.metaKey && !event.ctrlKey && !event.altKey
    const key = event.key.toLowerCase()
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
    super.onPointerDown(event, localX, localY)
    if (this.pressedHit !== null) return
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
    super.onPointerMove(event, localX, localY)
    if (!this.#dragSelecting) return
    this.#updateDragSelection(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerUp(event, localX, localY)
    if (this.#dragSelecting) this.#updateDragSelection(localX, localY)
    this.#dragSelecting = false
    if (this.#selectionRange() === null) this.#clearSelectionState()
    this.requestRender()
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
    this.#cursorVisible = this.#cursorEnabled && this.#showCursor
    if (this.#cursorEnabled) this.#startCursorBlink()
    this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate?.()
    this.#focused = false
    this.#stopCursorBlink()
    this.#cursorVisible = false
    this.requestRender()
  }

  override dispose(): void {
    this.#stopCursorBlink()
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
    return {ch: " ", attr: cloneAttr(attr)}
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
    const totalH = this.#totalLineCount() * this.#linePx + BODY_PAD_Y_PX * 2
    if (totalH <= body.h) return true
    const maxScroll = totalH - body.h
    return divScrollPosition(this, TERMINAL_SCROLL_KEY).top >= maxScroll - AUTOSCROLL_TOLERANCE_PX
  }

  #scrollToBottom(): void {
    const body = this.#bodyRect()
    const totalH = this.#totalLineCount() * this.#linePx + BODY_PAD_Y_PX * 2
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
      this.#lineFeed()
      if (!this.#wrapLines || this.#wrapMode === "word") this.#cursorCol = 0
      return
    }
    if (ch === "\r") {
      this.#flushWordWrapBuffer()
      this.#cursorCol = 0
      return
    }
    if (ch === "\b") {
      this.#flushWordWrapBuffer()
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
    if (this.#wrapMode === "word" && this.#wrapLines) {
      if (ch === " ") {
        this.#flushWordWrapBuffer()
        this.#putSpace()
        return
      }
      this.#wordWrapBuffer.push({ch, attr: cloneAttr(this.#attr)})
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
    this.#flushWordWrapBuffer()
    if (ch === "c") {
      this.reset()
      return
    }
    if (ch === "7") {
      this.#savedCursor = {row: this.#cursorRow, col: this.#cursorCol}
      return
    }
    if (ch === "8" && this.#savedCursor !== null) {
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
      this.#parserMode = ch === "\\" ? "text" : "osc"
      this.#oscEsc = false
      return
    }
    if (ch === "\x07") {
      this.#parserMode = "text"
      return
    }
    this.#oscEsc = ch === "\x1b"
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
    if (final === "H" || final === "f") {
      this.#cursorRow = clampInt(csiParam(params, 0, 1) - 1, 0, this.#rows - 1)
      this.#cursorCol = clampInt(csiParam(params, 1, 1) - 1, 0, this.#cols - 1)
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
    else if (final === "P") this.#deleteChars(n())
    else if (final === "@") this.#insertChars(n())
    else if (final === "L") this.#insertLines(n())
    else if (final === "M") this.#deleteLines(n())
    else if (final === "S") for (let i = 0; i < n(); i++) this.#scrollUp()
    else if (final === "T") for (let i = 0; i < n(); i++) this.#scrollDown()
    else if (final === "s") this.#savedCursor = {row: this.#cursorRow, col: this.#cursorCol}
    else if (final === "u" && this.#savedCursor !== null) {
      this.#cursorRow = clampInt(this.#savedCursor.row, 0, this.#rows - 1)
      this.#cursorCol = clampInt(this.#savedCursor.col, 0, this.#cols - 1)
    } else if ((final === "h" || final === "l") && privatePrefix.includes("?")) {
      if (params.includes(25)) this.#showCursor = final === "h"
      if (params.includes(1049)) this.clear()
    }
  }

  #applySgr(params: number[]): void {
    for (let i = 0; i < params.length; i++) {
      const p = params[i] ?? 0
      if (p === 0) this.#attr = cloneAttr(DEFAULT_ATTR)
      else if (p === 1) this.#attr.bold = true
      else if (p === 22) this.#attr.bold = false
      else if (p === 7) this.#attr.inverse = true
      else if (p === 27) this.#attr.inverse = false
      else if (p === 39) this.#attr.fg = DEFAULT_FG
      else if (p === 49) this.#attr.bg = null
      else if (p >= 30 && p <= 37) this.#attr.fg = {kind: "ansi", index: p - 30}
      else if (p >= 90 && p <= 97) this.#attr.fg = {kind: "ansi", index: p - 90 + 8}
      else if (p >= 40 && p <= 47) this.#attr.bg = {kind: "ansi", index: p - 40}
      else if (p >= 100 && p <= 107) this.#attr.bg = {kind: "ansi", index: p - 100 + 8}
      else if (p === 38 || p === 48) {
        const parsed = parseExtendedColor(params, i + 1)
        if (parsed !== null) {
          if (p === 38) this.#attr.fg = parsed.color
          else this.#attr.bg = parsed.color
          i = parsed.nextIndex
        }
      }
    }
  }

  #putChar(ch: string): void {
    this.#putCell({ch, attr: cloneAttr(this.#attr)})
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
    if (this.#wrapLines && this.#cursorCol > 0 && cells.length > remaining) this.#wrapLineFeed()
    for (const cell of cells) this.#putCell(cell)
  }

  #putCell(cell: TerminalCell): void {
    if (this.#cursorCol >= this.#cols) {
      if (!this.#wrapLines) return
      this.#cursorCol = 0
      this.#lineFeed()
    }
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    row[this.#cursorCol] = {ch: cell.ch, attr: cloneAttr(cell.attr)}
    if (this.#cursorCol >= this.#cols - 1) {
      if (!this.#wrapLines) {
        this.#cursorCol = this.#cols
        return
      }
      this.#cursorCol = 0
      this.#lineFeed()
      return
    }
    this.#cursorCol++
  }

  #lineFeed(): void {
    if (this.#cursorRow >= this.#rows - 1) {
      this.#scrollUp()
      return
    }
    this.#cursorRow++
  }

  #wrapLineFeed(): void {
    this.#cursorCol = 0
    this.#lineFeed()
  }

  #scrollUp(): void {
    this.#pushScrollback(this.#screen.shift() ?? this.#blankLine())
    this.#screen.push(this.#blankLine(DEFAULT_ATTR))
  }

  #scrollDown(): void {
    this.#screen.unshift(this.#blankLine(DEFAULT_ATTR))
    const tail = this.#screen.pop()
    if (tail !== undefined) this.#pushScrollback(tail)
  }

  #eraseDisplay(mode: number): void {
    const cursorCol = Math.min(this.#cursorCol, this.#cols)
    const visibleCursorCol = Math.min(cursorCol, this.#cols - 1)
    if (mode === 2) {
      this.#screen = Array.from({length: this.#rows}, () => this.#blankLine(DEFAULT_ATTR))
      this.#cursorRow = 0
      this.#cursorCol = 0
      return
    }
    if (mode === 3) {
      this.#scrollback = []
      divScrollTo(this, TERMINAL_SCROLL_KEY, {top: 0})
      return
    }
    if (mode === 1) {
      for (let row = 0; row < this.#cursorRow; row++) this.#screen[row] = this.#blankLine(DEFAULT_ATTR)
      for (let col = 0; col <= visibleCursorCol; col++) this.#screen[this.#cursorRow]![col] = this.#blankCell(DEFAULT_ATTR)
      return
    }
    for (let col = cursorCol; col < this.#cols; col++) this.#screen[this.#cursorRow]![col] = this.#blankCell(DEFAULT_ATTR)
    for (let row = this.#cursorRow + 1; row < this.#rows; row++) this.#screen[row] = this.#blankLine(DEFAULT_ATTR)
  }

  #eraseLine(mode: number): void {
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    const cursorCol = Math.min(this.#cursorCol, this.#cols)
    const visibleCursorCol = Math.min(cursorCol, this.#cols - 1)
    const start = mode === 1 ? 0 : cursorCol
    const end = mode === 0 ? this.#cols - 1 : visibleCursorCol
    if (mode === 2) {
      this.#screen[this.#cursorRow] = this.#blankLine(DEFAULT_ATTR)
      return
    }
    if (start > end) return
    for (let col = start; col <= end; col++) row[col] = this.#blankCell(DEFAULT_ATTR)
  }

  #deleteChars(count: number): void {
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    const n = clampInt(count, 1, this.#cols)
    row.splice(this.#cursorCol, n)
    while (row.length < this.#cols) row.push(this.#blankCell(DEFAULT_ATTR))
  }

  #insertChars(count: number): void {
    const row = this.#screen[this.#cursorRow]
    if (row === undefined) return
    const n = clampInt(count, 1, this.#cols)
    row.splice(this.#cursorCol, 0, ...Array.from({length: n}, () => this.#blankCell(DEFAULT_ATTR)))
    row.length = this.#cols
  }

  #insertLines(count: number): void {
    const n = clampInt(count, 1, this.#rows)
    this.#screen.splice(this.#cursorRow, 0, ...Array.from({length: n}, () => this.#blankLine(DEFAULT_ATTR)))
    while (this.#screen.length > this.#rows) this.#screen.pop()
  }

  #deleteLines(count: number): void {
    const n = clampInt(count, 1, this.#rows)
    this.#screen.splice(this.#cursorRow, n)
    while (this.#screen.length < this.#rows) this.#screen.push(this.#blankLine(DEFAULT_ATTR))
  }

  #materialFor(color: TerminalColor): TextMaterial {
    if (color.kind === "default") return this.materials.text
    const key = colorKey(color)
    let material = this.#materials.get(key)
    if (material === undefined) {
      material = new TextMaterial({color: colorToColor(color)})
      this.#materials.set(key, material)
    }
    return material
  }
}

export class TerminalPane extends TerminalOutputPane {
  #inputEnabled: boolean
  #onInput: ((data: string, source: TerminalInputSource) => void) | undefined

  constructor(opts: TerminalPaneOpts = {}) {
    super(opts)
    this.node.name = "TerminalPane"
    this.#inputEnabled = opts.inputEnabled ?? true
    this.#onInput = opts.onInput
  }

  setInputEnabled(enabled: boolean): void {
    if (this.#inputEnabled === enabled) return
    this.#inputEnabled = enabled
    this.requestRender()
  }

  onInputText(text: string): void {
    if (!this.#inputEnabled || text.length === 0) return
    this.#emitInput(text, "paste")
  }

  override onKey(event: KeyboardEvent): void {
    if (this.handleOutputShortcut(event)) return
    if (!this.#inputEnabled) return

    const metaOnly = event.metaKey && !event.ctrlKey && !event.altKey
    const key = event.key.toLowerCase()
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

    const data = keyToTerminalInput(event)
    if (data === null) return
    event.preventDefault()
    this.#emitInput(data, "keyboard")
  }

  #emitInput(data: string, source: TerminalInputSource): void {
    this.#onInput?.(data, source)
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

function keyToTerminalInput(event: KeyboardEvent): string | null {
  const key = event.key
  if (event.ctrlKey && !event.altKey && !event.metaKey) {
    const lower = key.toLowerCase()
    if (lower.length === 1 && lower >= "a" && lower <= "z") return String.fromCharCode(lower.charCodeAt(0) - 96)
    if (key === " ") return "\x00"
    if (key === "[") return "\x1b"
    if (key === "\\") return "\x1c"
    if (key === "]") return "\x1d"
    if (key === "^") return "\x1e"
    if (key === "_") return "\x1f"
  }
  if (event.altKey && key.length === 1 && !event.ctrlKey && !event.metaKey) return `\x1b${key}`
  if (event.ctrlKey || event.metaKey) return null
  if (key === "Enter") return "\r"
  if (key === "Backspace") return "\x7f"
  if (key === "Tab") return "\t"
  if (key === "Escape") return "\x1b"
  if (key === "ArrowUp") return "\x1b[A"
  if (key === "ArrowDown") return "\x1b[B"
  if (key === "ArrowRight") return "\x1b[C"
  if (key === "ArrowLeft") return "\x1b[D"
  if (key === "Home") return "\x1b[H"
  if (key === "End") return "\x1b[F"
  if (key === "PageUp") return "\x1b[5~"
  if (key === "PageDown") return "\x1b[6~"
  if (key === "Delete") return "\x1b[3~"
  if (key.length === 1) return key
  return null
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
    return {
      color: {
        kind: "rgb",
        r: clampInt(params[start + 1] ?? 255, 0, 255),
        g: clampInt(params[start + 2] ?? 255, 0, 255),
        b: clampInt(params[start + 3] ?? 255, 0, 255),
      },
      nextIndex: start + 3,
    }
  }
  return null
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
  if (attr.inverse) return attr.bg ?? {kind: "ansi", index: 0}
  if (attr.bold && attr.fg.kind === "ansi" && attr.fg.index < 8) return {kind: "ansi", index: attr.fg.index + 8}
  return attr.fg
}

function displayBg(cell: TerminalCell): TerminalColor | null {
  if (cell.attr.inverse) return cell.attr.fg.kind === "default" ? {kind: "ansi", index: 7} : cell.attr.fg
  return cell.attr.bg
}

function sameAttrForText(a: TerminalAttr, b: TerminalAttr): boolean {
  return a.bold === b.bold &&
    a.inverse === b.inverse &&
    sameColor(displayFg(a), displayFg(b)) &&
    sameColor(a.bg, b.bg)
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
  return new Color(color.r, color.g, color.b, 1)
}

function colorKey(color: TerminalColor): string {
  if (color.kind === "default") return "default"
  if (color.kind === "ansi") return `ansi:${color.index}`
  return `rgb:${color.r}:${color.g}:${color.b}`
}

function cloneAttr(attr: TerminalAttr): TerminalAttr {
  return {
    fg: cloneColor(attr.fg),
    bg: attr.bg === null ? null : cloneColor(attr.bg),
    bold: attr.bold,
    inverse: attr.inverse,
  }
}

function cloneColor(color: TerminalColor): TerminalColor {
  if (color.kind === "default") return DEFAULT_FG
  if (color.kind === "ansi") return {kind: "ansi", index: color.index}
  return {kind: "rgb", r: color.r, g: color.g, b: color.b}
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
