/**
 * EditorPane — редактируемая текстовая pane с подсветкой синтаксиса.
 *
 * Единая code-pane для редактирования и read-only source-view:
 *  • cursor (line, col) с отрисовкой
 *  • Backspace/Delete/Enter with block indent/Arrow-keys/Home/End/PageUp-Down
 *  • Printable chars вставка
 *  • Tab → 2 пробела
 *  • Cmd/Ctrl+A — select-all
 *  • Shift+arrows / mouse drag — text selection
 *  • Cmd/Ctrl+Z / Cmd/Ctrl+Y — undo/redo (linear history)
 *  • Click → курсор по координатам
 *  • Подсветка через pluggable tokenize: (lines) => tokens
 *  • onChange колбэк
 *
 * Стартовая анимация текста — короткий one-shot lifecycle без постоянного render loop.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {UiSurface, Z, div, divScrollTo, palette, radii, type DivScrollContext, type VirtualInputSoftKeyboardMode} from "@ui/elements"
import {Button, IconButton, autoButtonWidth, uiIcons} from "@ui/components"
import {resolveLanguageHighlighter} from "./highlighter.ts"
import {
  createEditorTokenMaterials,
  normalizeEditorTokensForLine,
  renderEditorTextRuns,
  renderEditorTokenizedLine,
  type EditorTokenMaterialMap,
} from "./token-renderer.ts"
import type {EditorToken, EditorTokens, EditorTokenize, LanguageHighlighter} from "./tokens.ts"
import {
  compareTextPosition,
  orderedTextSelection,
  readClipboardText,
  sameTextPosition,
  textFromRange,
  writeClipboardText,
  wordRangeAt,
  type TextPosition,
  type TextSelectionRange,
} from "../text-clipboard.ts"
import {
  PANE_FRAME,
  beginPaneFrameDrag,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
  paneHeaderRuleRect,
  type PaneFrameDrag,
  type PaneFrameInteractionOpts,
  type PaneRect,
} from "../pane-frame.ts"

export type EditorBreakpoint = {
  /** 1-based source line. */
  line: number
  /** False/pending means the backend has not resolved the breakpoint yet. */
  verified?: boolean
  /** Request is currently in flight. */
  pending?: boolean
  /** Current pause came from this breakpoint. */
  hit?: boolean
}

export type EditorSelectionSnapshot = {
  /** 0-based cursor line inside the editor buffer. */
  cursor: TextPosition
  /** Raw anchor/focus positions, if selection exists. 0-based. */
  anchor: TextPosition | null
  focus: TextPosition | null
  /** Ordered range, if selection exists. 0-based, end-exclusive column. */
  range: TextSelectionRange | null
  /** Selected text, if selection exists. */
  text: string
  /** All active selections, including the primary selection above. */
  selections: EditorSelectionEntry[]
}

export type EditorSelectionEntry = {
  /** Raw anchor/focus positions for this selection. 0-based. */
  anchor: TextPosition
  focus: TextPosition
  /** Ordered range. 0-based, end-exclusive column. */
  range: TextSelectionRange
  /** Text inside this selection. */
  text: string
}

type EditorScrollAlign = "nearest" | "center" | "top"

export type EditorOpts = {
  /** Заголовок над редактором. */
  title?: string
  /** Колбэк на любое изменение текста (буфер «грязный»). */
  onChange?: (text: string) => void
  /** Колбэк на явное сохранение (Cmd/Ctrl+S или editor.save()). */
  onSave?: (text: string) => void
  /** Колбэк на отправку редакторского буфера (Cmd/Ctrl+Enter). */
  onSubmit?: (text: string) => void
  /** Колбэк на copy/cut из floating-menu выделения. */
  onSelectionClipboard?: (ok: boolean, action: "copy" | "cut") => void
  /** Колбэк на изменение cursor/selection. Позиции 0-based. */
  onSelectionChange?: (snapshot: EditorSelectionSnapshot) => void
  /** Gutter line-number click for interpreter breakpoint toggles. */
  onBreakpointToggle?: (line: number) => void
  /** Initial interpreter breakpoint markers. */
  breakpoints?: readonly EditorBreakpoint[]
  /** Получает массив строк → возвращает токены той же длины. */
  tokenize?: EditorTokenize
  /** Явный highlighter; используется если `tokenize` не задан. */
  highlighter?: LanguageHighlighter
  /** Language id для built-in resolver (`typescript`, `javascript`, `plaintext`). */
  languageId?: string
  /** Путь/filename для built-in resolver по расширению. */
  path?: string
  /** Размер шрифта кода в px. Default 13. */
  fontPx?: number
  /** Высота строки в px. Default 18. */
  linePx?: number
  /** Размер заголовка в px. Default 13. */
  titleFontPx?: number
  /** Read-only mode keeps navigation, scrolling, selection and copy, but blocks text mutations. */
  readOnly?: boolean
  /** Show the blinking caret. Defaults to false when readOnly=true, otherwise true. */
  showCaret?: boolean
  /** Run the one-shot text intro animation after setText(). Default true. */
  introAnimation?: boolean
  /** Show pane header chrome. Disable when embedding the editor inside another pane. */
  showHeader?: boolean
  /** Disable pane chrome when the host already draws the containing panel. */
  chrome?: "pane" | "none"
  bodyInsetX?: number
  bodyTopGap?: number
  bodyBottomInset?: number
  /** Show vertical indentation guides in code body. Default true. */
  indentGuides?: boolean
  /** Show line numbers in the left gutter. Default true. */
  showLineNumbers?: boolean
  /** Soft-wrap long visual rows instead of using horizontal scroll. Default false. */
  wrapLines?: boolean
  /** Header drag is opt-in. Default false. */
  draggable?: boolean
  /** Edge resize is opt-in. Default false. */
  resizable?: boolean
  /** Emits the final pane frame after header move or edge resize. Persistence belongs to the host app. */
  onFrameRectChange?: (rect: PaneRect) => void
  onFrameDockRequest?: () => void
}

const HEADER_H_PX = PANE_FRAME.headerHeight
const PAD_TOP_PX = HEADER_H_PX + PANE_FRAME.bodyTopGap
const PAD_LEFT_PX = PANE_FRAME.bodyInsetX
const PAD_RIGHT_PX = PANE_FRAME.bodyInsetX
const PAD_BOTTOM_PX = PANE_FRAME.bodyBottomInset
const GUTTER_MIN_PX = 44
const GUTTER_LEFT_PAD_PX = 6
const GUTTER_RIGHT_PAD_PX = 8
const GUTTER_BREAKPOINT_LANE_PX = 18
const CODE_LEFT_PAD_PX = 2
const CODE_LETTER_SPACING_PX = 0
const SCROLLBAR_W = 4
const HISTORY_LIMIT = 200
const INTRO_ANIM_MS = 420
const INTRO_ANIM_MAX_DELAY_MS = 180
const INTRO_ANIM_MAX_OFFSET_PX = 16
const CARET_BLINK_MS = 530
const CARET_W_PX = 2
const CARET_BOTTOM_PAD_PX = 2
const CARET_Z = Z.TEXT + 0.04
const GUTTER_RULE_Z = Z.TEXT + 0.025
const GUTTER_TEXT_Z = Z.TEXT + 0.035
const GUTTER_HALO_Z = Z.TEXT + 0.03
const GUTTER_HALO_OFFSET_PX = 1
const LINE_HIGHLIGHT_TOP_PAD_PX = 3
const LINE_HIGHLIGHT_BOTTOM_PAD_PX = 0
const SCROLL_PAST_END_MIN_LINES = 1
const SELECTION_FILL = new Color(92 / 255, 155 / 255, 255 / 255, 0.34)
const GUTTER_RULE_FILL = new Color(120 / 255, 143 / 255, 166 / 255, 0.12)
const INDENT_GUIDE_FILL = new Color(120 / 255, 143 / 255, 166 / 255, 0.12)
const INDENT_GUIDE_STEP_COLUMNS = 2
const EDITOR_INDENT_UNIT = "  "
const INDENT_GUIDE_TEXT_OFFSET_PX = 2
const BREAKPOINT_FILL = new Color(237 / 255, 83 / 255, 86 / 255, 0.96)
const BREAKPOINT_PENDING_FILL = new Color(237 / 255, 83 / 255, 86 / 255, 0.30)
const BREAKPOINT_BORDER = new Color(255 / 255, 130 / 255, 130 / 255, 0.92)
const BREAKPOINT_HIT_BORDER = new Color(255 / 255, 205 / 255, 110 / 255, 1)
const SELECTION_MENU_BG = new Color(6 / 255, 12 / 255, 21 / 255, 0.96)
const SELECTION_MENU_BORDER = new Color(111 / 255, 211 / 255, 255 / 255, 0.32)
const SELECTION_MENU_Z = Z.ELEMENT_RULE + 0.005
const EDITOR_SCROLL_KEY = "editor-pane:scroll"

type CursorPos = TextPosition
type SelectionRange = TextSelectionRange
type Snapshot = {
  lines: string[]
  cline: number
  ccol: number
  selectionAnchor: CursorPos | null
  selectionFocus: CursorPos | null
  secondarySelections: EditorSelectionSlot[]
}
type EditorSelectionSlot = {anchor: CursorPos; focus: CursorPos}
type ColumnHitBias = "nearest" | "floor" | "ceil"
type LineWidthCache = {scale: number; widths: number[]}
type SelectionMenuAction = "copy" | "cut" | "selectAll"
type SelectionMenuRect = {x: number; y: number; w: number; h: number; anchorX: number}
type EditorVisualRow = {
  rowIndex: number
  lineIndex: number
  startCol: number
  endCol: number
  isFirstForLine: boolean
}
type EditorVisibleLine = {
  rowIndex: number
  lineIndex: number
  startCol: number
  endCol: number
  rowY: number
  textY: number
  lineText: string
  isFirstForLine: boolean
  isCurrent: boolean
  isExecution: boolean
}
type EditorSelectionSegment = {
  startCol: number
  endCol: number
  includesLineBreak: boolean
}
export type EditorIndentGuideRange = {
  column: number
  startLine: number
  endLine: number
  includesEndLine: boolean
}
type EditorIndentGuideStackItem = {
  column: number
  startLine: number
  opener: "{" | "["
}
type EditorIndentOpenerToken = "{" | "[" | "("
type EditorIndentCloserToken = "}" | "]" | ")"
type EditorIndentEditToken = EditorIndentOpenerToken | EditorIndentCloserToken
type EditorGutterMetrics = {
  x: number
  y: number
  w: number
  h: number
  ruleX: number
  numberXMax: number
  numberW: number
}
type EditorViewportLayout = {
  totalRows: number
  visualRows: EditorVisualRow[]
  gutter: number
  startIdx: number
  subPx: number
  visible: number
  contentW: number
  contentH: number
  codeMaxPx: number
  codeClipX: number
  codeClipW: number
  codeStartX: number
}

const SELECTION_MENU_ITEMS: readonly {action: SelectionMenuAction; label: string}[] = [
  {action: "copy", label: "Copy"},
  {action: "cut", label: "Cut"},
  {action: "selectAll", label: "Select all"},
]
const GUTTER_HALO_OFFSETS: readonly [number, number][] = [
  [-GUTTER_HALO_OFFSET_PX, 0],
  [GUTTER_HALO_OFFSET_PX, 0],
  [0, -GUTTER_HALO_OFFSET_PX],
  [0, GUTTER_HALO_OFFSET_PX],
]

export class EditorPane extends UiSurface {
  #lines: string[] = [""]
  #tokens: EditorTokens | null = null
  #cline = 0
  #ccol = 0
  #selectionAnchor: CursorPos | null = null
  #selectionFocus: CursorPos | null = null
  #secondarySelections: EditorSelectionSlot[] = []
  #dragSelecting = false
  #dragExtendsSelection = false
  #dragAddsSelection = false
  #dragAnchorLocalX = 0
  #dragAnchorLocalY = 0
  #selectionMenuOpen = false
  #selectionMenuSticky = false
  #selectionContextMenuEnabled = false
  #title: string
  #fontPx: number
  #linePx: number
  #titleFontPx: number
  #tokenize: EditorTokenize | undefined
  #onChange: ((text: string) => void) | undefined
  #onSave: ((text: string) => void) | undefined
  #onSubmit: ((text: string) => void) | undefined
  #onSelectionClipboard: ((ok: boolean, action: "copy" | "cut") => void) | undefined
  #onSelectionChange: ((snapshot: EditorSelectionSnapshot) => void) | undefined
  #onBreakpointToggle: ((line: number) => void) | undefined
  #onFrameRectChange: ((rect: PaneRect) => void) | undefined
  #onFrameDockRequest: (() => void) | undefined
  #draggable: boolean
  #resizable: boolean
  #breakpoints = new Map<number, EditorBreakpoint>()
  #readOnly: boolean
  #showCaret: boolean
  #introAnimation: boolean
  #showHeader: boolean
  #indentGuides: boolean
  #showLineNumbers: boolean
  #wrapLines: boolean
  #executionLine: number | null = null
  #cursorVisible = true
  #cursorBlinkTimer: ReturnType<typeof setInterval> | null = null
  #cursorBlinkPausedForSelection = false
  #history: Snapshot[] = []
  #future: Snapshot[] = []
  /** Кэшированная ширина одного «эталонного» глифа (M). */
  #charWidth = 0
  #charWidthScale = 0
  #spaceWidth = 0
  #spaceWidthScale = 0
  #maxLineWidthPxCache: number | null = null
  #maxLineWidthPxCacheScale = 0
  readonly #lineWidthCache = new Map<string, LineWidthCache>()
  #scrollLeftPx = 0
  #scrollTopPx = 0
  #viewportW = 1
  #viewportH = 1
  #pendingCursorScrollAlign: EditorScrollAlign | null = null
  #pendingCursorScrollFrames = 0
  #pendingLineScroll: {lineIndex: number; align: EditorScrollAlign} | null = null
  #pendingLineScrollFrames = 0
  #lastViewportLayout: EditorViewportLayout | null = null
  #introAnimStartedAt: number | null = null
  #introAnimRafId: number | null = null
  #introAnimFinishTimer: ReturnType<typeof setTimeout> | null = null
  #frameDrag: PaneFrameDrag | null = null
  #bodyInsetX: number
  #bodyTopGap: number
  #bodyBottomInset: number
  /** Для длинных строк (≥ this porog) считаем позицию курсора через #charWidth — O(1). */
  static readonly #LONG_LINE_THRESHOLD = 500

  readonly #titleMaterial = new TextMaterial({color: palette.cyan})
  readonly #lineMaterial = new TextMaterial({color: palette.text})
  readonly #gutterMaterial = new TextMaterial({color: palette.muted})
  readonly #gutterCurMaterial = new TextMaterial({color: palette.cyan})
  readonly #gutterExecutionMaterial = new TextMaterial({color: palette.orange})
  readonly #gutterHaloMaterial = new TextMaterial({color: palette.bgCode})
  readonly #tokenMaterials: EditorTokenMaterialMap

  constructor(opts: EditorOpts = {}) {
    super(opts.chrome === "none"
      ? {bgColor: null, borderColor: null}
      : {bgColor: palette.bgCode, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "EditorPane"
    this.#title = opts.title ?? "Editor"
    this.#fontPx = opts.fontPx ?? 13
    this.#linePx = opts.linePx ?? 18
    this.#titleFontPx = opts.titleFontPx ?? 13
    this.#tokenize = opts.tokenize ?? resolveEditorTokenize(opts)
    this.#onChange = opts.onChange
    this.#onSave = opts.onSave
    this.#onSubmit = opts.onSubmit
    this.#onSelectionClipboard = opts.onSelectionClipboard
    this.#onSelectionChange = opts.onSelectionChange
    this.#onBreakpointToggle = opts.onBreakpointToggle
    this.#onFrameRectChange = opts.onFrameRectChange
    this.#onFrameDockRequest = opts.onFrameDockRequest
    this.#draggable = opts.draggable ?? false
    this.#resizable = opts.resizable ?? false
    this.#breakpoints = normalizeBreakpoints(opts.breakpoints ?? [])
    this.#readOnly = opts.readOnly === true
    this.#showCaret = opts.showCaret ?? !this.#readOnly
    this.#introAnimation = opts.introAnimation ?? true
    this.#showHeader = opts.showHeader ?? true
    this.#bodyInsetX = opts.bodyInsetX ?? PANE_FRAME.bodyInsetX
    this.#bodyTopGap = opts.bodyTopGap ?? PANE_FRAME.bodyTopGap
    this.#bodyBottomInset = opts.bodyBottomInset ?? PANE_FRAME.bodyBottomInset
    this.#indentGuides = opts.indentGuides ?? true
    this.#showLineNumbers = opts.showLineNumbers ?? true
    this.#wrapLines = opts.wrapLines ?? false
    this.#tokenMaterials = createEditorTokenMaterials()
    this.#refreshTokens()
  }

  // ────────── public API ──────────

  setText(text: string): void {
    this.#lines = text.length === 0 ? [""] : text.split("\n")
    this.#invalidateTextMetrics()
    this.#cline = Math.min(this.#cline, this.#lines.length - 1)
    this.#ccol = Math.min(this.#ccol, this.#lines[this.#cline]!.length)
    this.#clearSelectionState()
    this.#setScrollPosition(0, 0)
    this.#history = []
    this.#future = []
    this.#refreshTokens()
    this.#emitSelectionChange()
    if (this.#introAnimation) this.#startIntroAnimation()
    else this.#finishIntroAnimation(false)
    this.requestRender()
  }

  /** Смещение по X (px) для стартового выстраивания текста. */
  #animOffsetFor(lineIndex: number, absCol: number): number {
    if (this.#introAnimStartedAt === null) return 0
    const elapsed = performance.now() - this.#introAnimStartedAt
    const totalMs = INTRO_ANIM_MS + INTRO_ANIM_MAX_DELAY_MS
    if (elapsed >= totalMs) {
      this.#finishIntroAnimation(false)
      return 0
    }
    const seed = introAnimSeed(lineIndex, absCol)
    const delay = Math.min(INTRO_ANIM_MAX_DELAY_MS, lineIndex * 18 + absCol * 2.5)
    const t = clamp01((elapsed - delay) / INTRO_ANIM_MS)
    if (t >= 1) return 0
    const direction = seed > 0.5 ? 1 : -1
    const amplitude = INTRO_ANIM_MAX_OFFSET_PX * (0.35 + seed * 0.65)
    return direction * amplitude * (1 - easeOutCubic(t))
  }

  /** Принудительный сейв (Cmd+S или внешняя кнопка). */
  save(): void {
    this.#onSave?.(this.getText())
  }

  /**
   * Вставка текста в позицию курсора. Используется VirtualInput-прокси
   * для пробрасывания emoji / IME / dictation, которые не приходят через
   * keydown. Многострочный текст разбивается по \n как при paste.
   */
  insertText(text: string): void {
    if (text.length === 0) return
    if (this.#readOnly) return
    this.#insertText(text)
    this.#pingCursor()
  }

  getText(): string {
    return this.#lines.join("\n")
  }

  setTitle(title: string): void {
    this.#title = title
    this.requestRender()
  }

  setTokens(tokens: EditorTokens): void {
    this.#tokens = this.#normalizeTokens(tokens)
    this.requestRender()
  }

  setReadOnly(readOnly: boolean): void {
    if (this.#readOnly === readOnly) return
    this.#readOnly = readOnly
    if (this.#showCaret && readOnly) {
      this.#showCaret = false
      this.#stopCursorBlink()
      this.#cursorVisible = false
    }
    this.requestRender()
  }

  softKeyboardInputMode(): VirtualInputSoftKeyboardMode {
    return this.#readOnly ? "none" : "text"
  }

  setShowCaret(show: boolean): void {
    if (this.#showCaret === show) return
    this.#showCaret = show
    if (show) {
      this.#cursorVisible = true
      this.#startCursorBlink()
    } else {
      this.#stopCursorBlink()
      this.#cursorVisible = false
    }
    this.requestRender()
  }

  setIntroAnimation(enabled: boolean): void {
    if (this.#introAnimation === enabled) return
    this.#introAnimation = enabled
    if (!enabled) this.#finishIntroAnimation(false)
  }

  setWrapLines(enabled: boolean): void {
    if (this.#wrapLines === enabled) return
    this.#wrapLines = enabled
    if (enabled) this.#setScrollPosition(0, this.#scrollTopPx)
    this.requestRender()
  }

  setBreakpoints(breakpoints: readonly EditorBreakpoint[]): void {
    this.#breakpoints = normalizeBreakpoints(breakpoints)
    this.requestRender()
  }

  /**
   * 1-based execution marker for source viewers/interpreters. Pass null to hide.
   */
  setExecutionLine(line: number | null, opts: {scroll?: boolean} = {}): void {
    const next = line === null ? null : Math.max(1, Math.min(this.#lines.length, Math.floor(line)))
    const changed = this.#executionLine !== next
    this.#executionLine = next
    if (next !== null) {
      if (opts.scroll !== false) this.#scrollLineIntoView(next - 1, "center")
    }
    if (changed || opts.scroll !== false) this.requestRender()
  }

  setLanguage(input: LanguageHighlighter | {languageId?: string; path?: string}): void {
    const highlighter = "tokenize" in input ? input : resolveLanguageHighlighter(input)
    this.#tokenize = highlighter.tokenize
    this.#refreshTokens()
    this.requestRender()
  }

  /** Position cursor at (line, col), clamping to bounds. Centers the line by default. */
  setCursor(line: number, col: number, opts: {scroll?: EditorScrollAlign | false} = {}): void {
    this.#setCursorPosition({line, col}, {extendSelection: false, scroll: opts.scroll ?? "center"})
    if ((opts.scroll ?? "center") === "center") this.#queueCursorScroll("center")
    this.#pingCursor()
  }

  setSelection(anchorLine: number, anchorCol: number, focusLine: number, focusCol: number, opts: {scroll?: EditorScrollAlign | false} = {}): void {
    const anchor = this.#clampPosition({line: anchorLine, col: anchorCol})
    const focus = this.#clampPosition({line: focusLine, col: focusCol})
    this.#secondarySelections = []
    this.#selectionAnchor = anchor
    this.#selectionFocus = focus
    this.#cline = focus.line
    this.#ccol = focus.col
    if (opts.scroll !== false) {
      const align = opts.scroll ?? "nearest"
      if (align === "top") {
        const lineIndex = orderedTextSelection(anchor, focus)?.start.line ?? Math.min(anchor.line, focus.line)
        this.#scrollLineIntoView(lineIndex, "top")
        this.#queueLineScroll(lineIndex, "top")
      } else {
        this.#scrollCursorIntoView(align)
        if (align === "center") this.#queueCursorScroll(align)
      }
    }
    this.#pingCursor()
    this.#emitSelectionChange()
    this.requestRender()
  }

  clearSelection(): void {
    this.#clearSelectionState()
    this.#emitSelectionChange()
    this.requestRender()
  }

  setSelectionMenuOpen(open: boolean): void {
    this.#setSelectionMenuOpen(open, open)
  }

  setSelectionContextMenuEnabled(enabled: boolean): void {
    if (this.#selectionContextMenuEnabled === enabled) return
    this.#selectionContextMenuEnabled = enabled
    if (!enabled && this.#selectionMenuOpen && !this.#selectionMenuSticky) this.#setSelectionMenuOpen(false, false)
  }

  hasSelection(): boolean {
    return this.#selectionSlots().length > 0
  }

  getSelectedText(): string {
    return this.#selectedText() ?? ""
  }

  getSelectionSnapshot(): EditorSelectionSnapshot {
    const anchor = this.#selectionAnchor === null ? null : {...this.#selectionAnchor}
    const focus = this.#selectionFocus === null ? null : {...this.#selectionFocus}
    const range = this.#selectionRange()
    const selections = this.#selectionEntries()
    return {
      cursor: this.#currentPos(),
      anchor,
      focus,
      range: range === null ? null : {
        start: {...range.start},
        end: {...range.end},
      },
      text: this.#primarySelectedText() ?? "",
      selections,
    }
  }

  selectAll(): void {
    this.#selectAll()
  }

  async copySelectionToClipboard(): Promise<boolean> {
    return await this.#copySelectionOrCurrentLine()
  }

  async cutSelectionToClipboard(): Promise<boolean> {
    return await this.#cutSelectionOrCurrentLine()
  }

  // ────────── monospace helpers ──────────

  /** Возвращает ширину одного глифа JetBrains Mono. Кэшируется (font фиксирован). */
  #getCharWidth(): number {
    const scale = this.pageScaleFactor
    if (this.#charWidth > 0 && this.#charWidthScale === scale) return this.#charWidth
    if (this.font === null) return this.#fallbackCharWidth()
    // Code editor uses zero tracking; measure with the same spacing as render.
    this.#charWidth = Math.max(this.#fallbackCharWidth(), this.measureText("M", this.#fontPx, CODE_LETTER_SPACING_PX))
    this.#charWidthScale = scale
    return this.#charWidth
  }

  #getSpaceWidth(): number {
    const scale = this.pageScaleFactor
    if (this.#spaceWidth > 0 && this.#spaceWidthScale === scale) return this.#spaceWidth
    this.#spaceWidth = this.#getCharWidth()
    this.#spaceWidthScale = scale
    return this.#spaceWidth
  }

  #fallbackCharWidth(): number {
    return Math.max(1, this.#fontPx * this.pageScaleFactor * 0.62)
  }

  #padTopPx(): number {
    return this.#showHeader ? HEADER_H_PX + this.#bodyTopGap : this.#bodyTopGap
  }

  #bodyRect(): PaneRect {
    const y = this.#padTopPx()
    return {
      x: this.#bodyInsetX,
      y,
      w: Math.max(1, this.rectW - this.#bodyInsetX * 2),
      h: Math.max(1, this.rectH - y - this.#bodyBottomInset),
    }
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: this.#showHeader,
      movable: this.#draggable,
      resizable: this.#resizable,
      minW: Math.max(300, PAD_LEFT_PX + GUTTER_MIN_PX + CODE_LEFT_PAD_PX + this.#getCharWidth() * 24 + PAD_RIGHT_PX + SCROLLBAR_W),
      minH: Math.max(180, this.#padTopPx() + this.#linePx * 6 + PAD_BOTTOM_PX + SCROLLBAR_W),
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
    this.canvas?.setSurfaceRect(this, paneFrameDragRect(drag, event, frame.bounds))
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

  /**
   * X-смещение колонки от начала строки. Короткие строки держат prefix-cache
   * ширин, чтобы drag-selection не гонял measureText(slice) в hot path.
   */
  #colToPx(line: string, col: number): number {
    if (col <= 0) return 0
    const c = Math.min(col, line.length)
    const widths = this.#lineWidths(line)
    if (widths !== null) return widths[c] ?? widths[widths.length - 1] ?? 0
    return c * this.#getCharWidth()
  }

  #lineWidths(line: string): number[] | null {
    if (this.font === null || line.length >= EditorPane.#LONG_LINE_THRESHOLD) return null
    const scaleKey = this.pageScaleFactor
    const cached = this.#lineWidthCache.get(line)
    if (cached !== undefined && cached.scale === scaleKey) return cached.widths

    const fontPxCanvas = this.#fontPx * scaleKey
    const fontScale = fontPxCanvas / this.font.unitsPerEm
    const letterSpacing = CODE_LETTER_SPACING_PX * scaleKey
    const spaceWidth = this.#getSpaceWidth()
    const widths = new Array<number>(line.length + 1)
    widths[0] = 0
    let width = 0
    let visualColumn = 0
    for (let i = 0; i < line.length; i++) {
      const code = line.codePointAt(i) ?? 0
      if (line[i] === " ") {
        width += spaceWidth
        visualColumn += 1
      } else if (line[i] === "\t") {
        const columns = tabAdvanceColumns(visualColumn, INDENT_GUIDE_STEP_COLUMNS)
        width += columns * spaceWidth
        visualColumn += columns
      } else {
        const gid = this.font.mapCharToGlyph(code)
        const metric = this.font.getHMetric(gid)
        width += metric.advanceWidth * fontScale + letterSpacing
        visualColumn += 1
      }
      widths[i + 1] = width
      if (code > 0xffff && i + 1 < line.length) {
        i += 1
        widths[i + 1] = width
      }
    }
    if (this.#lineWidthCache.size > 256) this.#lineWidthCache.clear()
    this.#lineWidthCache.set(line, {scale: scaleKey, widths})
    return widths
  }

  // ────────── selection helpers ──────────

  #currentPos(): CursorPos {
    return {line: this.#cline, col: this.#ccol}
  }

  #clampPosition(pos: CursorPos): CursorPos {
    const line = Math.max(0, Math.min(this.#lines.length - 1, Math.floor(pos.line)))
    const col = Math.max(0, Math.min(this.#lines[line]?.length ?? 0, Math.floor(pos.col)))
    return {line, col}
  }

  #comparePosition(a: CursorPos, b: CursorPos): number {
    return compareTextPosition(a, b)
  }

  #samePosition(a: CursorPos | null, b: CursorPos | null): boolean {
    return sameTextPosition(a, b)
  }

  #clearSelectionState(): void {
    this.#selectionAnchor = null
    this.#selectionFocus = null
    this.#secondarySelections = []
    this.#dragSelecting = false
    this.#dragExtendsSelection = false
    this.#dragAddsSelection = false
    this.#closeTransientSelectionMenu()
  }

  #clearPrimarySelectionState(): void {
    this.#selectionAnchor = null
    this.#selectionFocus = null
    this.#dragSelecting = false
    this.#dragExtendsSelection = false
    this.#dragAddsSelection = false
    if (this.#secondarySelections.length === 0) this.#closeTransientSelectionMenu()
  }

  #setSelectionMenuOpen(open: boolean, sticky: boolean): void {
    if (this.#selectionMenuOpen === open && this.#selectionMenuSticky === sticky) return
    this.#selectionMenuOpen = open
    this.#selectionMenuSticky = open && sticky
    this.requestRender()
  }

  #openTransientSelectionMenu(): void {
    this.#setSelectionMenuOpen(true, false)
  }

  #closeTransientSelectionMenu(): void {
    if (this.#selectionMenuOpen && !this.#selectionMenuSticky) this.#setSelectionMenuOpen(false, false)
  }

  #selectionRange(): SelectionRange | null {
    return orderedTextSelection(this.#selectionAnchor, this.#selectionFocus)
  }

  #selectedText(): string | null {
    const selections = this.#selectionEntries()
    if (selections.length === 0) return null
    return selections.map((selection) => selection.text).join("\n")
  }

  #primarySelectedText(): string | null {
    return textFromRange(this.#lines, this.#selectionRange())
  }

  #selectionSlots(): Array<EditorSelectionSlot & {range: SelectionRange}> {
    const out: Array<EditorSelectionSlot & {range: SelectionRange}> = []
    for (const slot of this.#secondarySelections) {
      const range = orderedTextSelection(slot.anchor, slot.focus)
      if (range !== null) out.push({
        anchor: {...slot.anchor},
        focus: {...slot.focus},
        range: copySelectionRange(range),
      })
    }
    const primaryRange = this.#selectionRange()
    if (primaryRange !== null && this.#selectionAnchor !== null && this.#selectionFocus !== null) {
      if (!out.some((slot) => sameSelectionRange(slot.range, primaryRange))) {
        out.push({
          anchor: {...this.#selectionAnchor},
          focus: {...this.#selectionFocus},
          range: copySelectionRange(primaryRange),
        })
      }
    }
    return out
  }

  #selectionEntries(): EditorSelectionEntry[] {
    return this.#selectionSlots()
      .map((slot) => ({
        anchor: {...slot.anchor},
        focus: {...slot.focus},
        range: copySelectionRange(slot.range),
        text: textFromRange(this.#lines, slot.range) ?? "",
      }))
      .sort((a, b) => this.#comparePosition(a.range.start, b.range.start) || this.#comparePosition(a.range.end, b.range.end))
  }

  #addCurrentSelectionToSecondary(): void {
    const range = this.#selectionRange()
    if (range === null || this.#selectionAnchor === null || this.#selectionFocus === null) return
    this.#addSecondarySelection(this.#selectionAnchor, this.#selectionFocus)
  }

  #addSecondarySelection(anchor: CursorPos, focus: CursorPos): void {
    const range = orderedTextSelection(anchor, focus)
    if (range === null) return
    if (this.#secondarySelections.some((slot) => {
      const secondaryRange = orderedTextSelection(slot.anchor, slot.focus)
      return secondaryRange !== null && sameSelectionRange(secondaryRange, range)
    })) return
    this.#secondarySelections.push({anchor: {...anchor}, focus: {...focus}})
  }

  #emitSelectionChange(): void {
    this.#onSelectionChange?.(this.getSelectionSnapshot())
  }

  #setCursorPosition(pos: CursorPos, opts: {extendSelection: boolean; scroll?: EditorScrollAlign | false}): void {
    const next = this.#clampPosition(pos)
    if (opts.extendSelection) {
      this.#secondarySelections = []
      if (this.#selectionAnchor === null) this.#selectionAnchor = this.#currentPos()
      this.#selectionFocus = next
    } else {
      this.#clearSelectionState()
    }
    this.#cline = next.line
    this.#ccol = next.col
    if (opts.scroll !== false) this.#scrollCursorIntoView(opts.scroll)
    this.#pingCursor()
    this.#emitSelectionChange()
    this.requestRender()
  }

  #replaceSelectionWith(text: string): boolean {
    const range = this.#selectionRange()
    if (range === null) return false
    const {start, end} = range
    const before = (this.#lines[start.line] ?? "").slice(0, start.col)
    const after = (this.#lines[end.line] ?? "").slice(end.col)
    const parts = text.split(/\r?\n/)
    if (parts.length === 1) {
      this.#lines.splice(start.line, end.line - start.line + 1, before + parts[0]! + after)
      this.#cline = start.line
      this.#ccol = before.length + parts[0]!.length
    } else {
      const first = before + parts[0]!
      const lastPart = parts[parts.length - 1]!
      const last = lastPart + after
      const middle = parts.slice(1, -1)
      this.#lines.splice(start.line, end.line - start.line + 1, first, ...middle, last)
      this.#cline = start.line + parts.length - 1
      this.#ccol = lastPart.length
    }
    this.#clearSelectionState()
    return true
  }

  #insertAtCursor(text: string): void {
    this.#clearSelectionState()
    const parts = text.split(/\r?\n/)
    const line = this.#lines[this.#cline]!
    if (parts.length === 1) {
      this.#lines[this.#cline] = line.slice(0, this.#ccol) + parts[0]! + line.slice(this.#ccol)
      this.#ccol += parts[0]!.length
      return
    }
    const head = line.slice(0, this.#ccol) + parts[0]!
    const tail = parts[parts.length - 1]! + line.slice(this.#ccol)
    const middle = parts.slice(1, -1)
    this.#lines.splice(this.#cline, 1, head, ...middle, tail)
    this.#cline += parts.length - 1
    this.#ccol = parts[parts.length - 1]!.length
  }

  #deleteSelection(): boolean {
    const range = this.#selectionRange()
    if (range === null) return false
    this.#pushHistory()
    this.#replaceSelectionWith("")
    this.#afterEdit()
    return true
  }

  #visualRowFromLocalY(localY: number): EditorVisualRow | null {
    const padTop = this.#padTopPx()
    if (localY < padTop) return null
    const rows = this.#visualRowsForCodeMaxPx(this.#codeMaxPx())
    if (rows.length === 0) return null
    const rowFloat = (localY - padTop + this.#scrollTopPx) / this.#linePx
    const rowIndex = Math.max(0, Math.min(rows.length - 1, Math.floor(rowFloat)))
    return rows[rowIndex] ?? null
  }

  #codeStartX(): number {
    return PAD_LEFT_PX + this.#gutterWidthPx(this.#lines.length) + CODE_LEFT_PAD_PX
  }

  #colAtLocalX(line: string, localX: number, bias: ColumnHitBias, row: EditorVisualRow | null = null): number {
    const xInCode = Math.max(0, localX - this.#codeStartX() + this.#effectiveScrollLeftPx())
    if (row !== null) {
      const segment = line.slice(row.startCol, row.endCol)
      return row.startCol + this.#colAtX(segment, xInCode, bias)
    }
    return this.#colAtX(line, xInCode, bias)
  }

  #positionFromLocal(localX: number, localY: number, bias: ColumnHitBias = "nearest"): CursorPos | null {
    const row = this.#visualRowFromLocalY(localY)
    if (row === null) return null
    const line = this.#lines[row.lineIndex] ?? ""
    const col = this.#colAtLocalX(line, localX, bias, row)
    return {line: row.lineIndex, col: Math.max(row.startCol, Math.min(row.endCol, col))}
  }

  // ────────── input ──────────

  onInputText(text: string): void {
    if (this.#readOnly) return
    this.insertText(text)
  }

  onKey(event: KeyboardEvent): void {
    if (this.#readOnly) {
      this.#handleReadOnlyKey(event)
      return
    }
    const isMod = event.metaKey || event.ctrlKey
    const isAlt = event.altKey
    const extendSelection = event.shiftKey
    let handled = true

    if (isMod) {
      const k = event.key.toLowerCase()
      if (k === "z") {
        if (event.shiftKey) this.#redo()
        else this.#undo()
      } else if (k === "y") this.#redo()
      else if (k === "a") this.#selectAll()
      else if (k === "s") this.save()
      else if (event.key === "Enter" && this.#onSubmit !== undefined) this.#onSubmit(this.getText())
      else if (k === "v") void this.#paste()
      else if (k === "c") void this.#copySelectionOrCurrentLine()
      else if (k === "x") void this.#cutSelectionOrCurrentLine()
      else if (event.key === "ArrowLeft")  this.#setCursorPosition({line: this.#cline, col: 0}, {extendSelection})
      else if (event.key === "ArrowRight") this.#setCursorPosition({line: this.#cline, col: this.#lines[this.#cline]!.length}, {extendSelection})
      else if (event.key === "ArrowUp")    this.#setCursorPosition({line: 0, col: 0}, {extendSelection})
      else if (event.key === "ArrowDown")  this.#setCursorPosition({line: this.#lines.length - 1, col: this.#lines[this.#lines.length - 1]!.length}, {extendSelection})
      else if (event.key === "Home")       this.#setCursorPosition({line: 0, col: 0}, {extendSelection})
      else if (event.key === "End")        this.#setCursorPosition({line: this.#lines.length - 1, col: this.#lines[this.#lines.length - 1]!.length}, {extendSelection})
      else handled = false
    } else if (isAlt && event.key === "ArrowLeft")  this.#wordJump(-1, extendSelection)
    else if (isAlt && event.key === "ArrowRight")   this.#wordJump(1, extendSelection)
    else if (event.key === "ArrowLeft") this.#moveCursor(-1, 0, extendSelection)
    else if (event.key === "ArrowRight") this.#moveCursor(1, 0, extendSelection)
    else if (event.key === "ArrowUp") this.#moveCursor(0, -1, extendSelection)
    else if (event.key === "ArrowDown") this.#moveCursor(0, 1, extendSelection)
    else if (event.key === "Home") this.#setCursorPosition({line: this.#cline, col: 0}, {extendSelection})
    else if (event.key === "End") this.#setCursorPosition({line: this.#cline, col: this.#lines[this.#cline]!.length}, {extendSelection})
    else if (event.key === "PageUp") this.#movePage(-1, extendSelection)
    else if (event.key === "PageDown") this.#movePage(1, extendSelection)
    else if (event.key === "Backspace") this.#backspace()
    else if (event.key === "Delete") this.#delete()
    else if (event.key === "Enter") this.#insertNewline()
    else if (event.key === "Tab") this.#insertText("  ")
    else if (event.key.length === 1) this.#insertText(event.key)
    else handled = false

    if (handled) {
      event.preventDefault()
      this.#pingCursor()
    }
  }

  #handleReadOnlyKey(event: KeyboardEvent): void {
    const isMod = event.metaKey || event.ctrlKey
    const isAlt = event.altKey
    const extendSelection = event.shiftKey
    let handled = true

    if (isMod) {
      const k = event.key.toLowerCase()
      if (k === "a") this.#selectAll()
      else if (k === "c" || k === "x") void this.#copySelectionOrCurrentLine()
      else if (event.key === "ArrowLeft")  this.#setCursorPosition({line: this.#cline, col: 0}, {extendSelection})
      else if (event.key === "ArrowRight") this.#setCursorPosition({line: this.#cline, col: this.#lines[this.#cline]!.length}, {extendSelection})
      else if (event.key === "ArrowUp")    this.#setCursorPosition({line: 0, col: 0}, {extendSelection})
      else if (event.key === "ArrowDown")  this.#setCursorPosition({line: this.#lines.length - 1, col: this.#lines[this.#lines.length - 1]!.length}, {extendSelection})
      else if (event.key === "Home")       this.#setCursorPosition({line: 0, col: 0}, {extendSelection})
      else if (event.key === "End")        this.#setCursorPosition({line: this.#lines.length - 1, col: this.#lines[this.#lines.length - 1]!.length}, {extendSelection})
      else handled = false
    } else if (isAlt && event.key === "ArrowLeft")  this.#wordJump(-1, extendSelection)
    else if (isAlt && event.key === "ArrowRight")   this.#wordJump(1, extendSelection)
    else if (event.key === "ArrowLeft") this.#moveCursor(-1, 0, extendSelection)
    else if (event.key === "ArrowRight") this.#moveCursor(1, 0, extendSelection)
    else if (event.key === "ArrowUp") this.#moveCursor(0, -1, extendSelection)
    else if (event.key === "ArrowDown") this.#moveCursor(0, 1, extendSelection)
    else if (event.key === "Home") this.#setCursorPosition({line: this.#cline, col: 0}, {extendSelection})
    else if (event.key === "End") this.#setCursorPosition({line: this.#cline, col: this.#lines[this.#cline]!.length}, {extendSelection})
    else if (event.key === "PageUp") this.#movePage(-1, extendSelection)
    else if (event.key === "PageDown") this.#movePage(1, extendSelection)
    else handled = false

    if (handled) {
      event.preventDefault()
      this.#pingCursor(false)
    }
  }

  // ────────── clipboard ──────────

  async #paste(): Promise<void> {
    const text = await readClipboardText()
    if (text === null || text.length === 0) return
    this.#insertText(text)
  }

  async #copySelectionOrCurrentLine(): Promise<boolean> {
    const selected = this.#selectedText()
    return await writeClipboardText(selected ?? this.#lines[this.#cline] ?? "", "clipboard copy")
  }

  async #cutSelectionOrCurrentLine(): Promise<boolean> {
    if (this.#readOnly) return this.#copySelectionOrCurrentLine()
    const selected = this.#selectedText()
    const text = selected ?? `${this.#lines[this.#cline] ?? ""}\n`
    const copied = await writeClipboardText(text, "clipboard cut")
    if (!copied) return false
    if (selected !== null) {
      this.#deleteSelection()
    } else {
      this.#pushHistory()
      if (this.#lines.length === 1) {
        this.#lines[0] = ""
        this.#ccol = 0
      } else {
        this.#lines.splice(this.#cline, 1)
        if (this.#cline >= this.#lines.length) this.#cline = this.#lines.length - 1
        this.#ccol = Math.min(this.#ccol, this.#lines[this.#cline]!.length)
      }
      this.#clearSelectionState()
      this.#afterEdit()
    }
    return true
  }

  async #copySelectedTextToClipboard(): Promise<boolean> {
    const selected = this.#selectedText()
    if (selected === null) return false
    return await writeClipboardText(selected, "clipboard copy")
  }

  async #cutSelectedTextToClipboard(): Promise<boolean> {
    if (this.#readOnly) return this.#copySelectedTextToClipboard()
    const selected = this.#selectedText()
    if (selected === null) return false
    const copied = await writeClipboardText(selected, "clipboard cut")
    if (!copied) return false
    this.#deleteSelection()
    return true
  }

  // ────────── word jump ──────────

  #wordJump(direction: 1 | -1, extendSelection = false): void {
    const line = this.#lines[this.#cline]!
    let col = this.#ccol
    if (direction === 1) {
      while (col < line.length && !isEditorWordChar(line[col]!)) col++
      while (col < line.length && isEditorWordChar(line[col]!)) col++
      if (col === this.#ccol && this.#cline < this.#lines.length - 1) {
        this.#setCursorPosition({line: this.#cline + 1, col: 0}, {extendSelection})
        return
      }
    } else {
      while (col > 0 && !isEditorWordChar(line[col - 1]!)) col--
      while (col > 0 && isEditorWordChar(line[col - 1]!)) col--
      if (col === this.#ccol && this.#cline > 0) {
        this.#setCursorPosition({line: this.#cline - 1, col: this.#lines[this.#cline - 1]!.length}, {extendSelection})
        return
      }
    }
    this.#setCursorPosition({line: this.#cline, col}, {extendSelection})
  }

  override onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(_event, localX, localY)
    if (this.pressedHit !== null) return
    if (isSecondaryPointer(_event)) {
      _event.preventDefault()
      if (this.#selectionContextMenuEnabled && this.#isPointInSelection(localX, localY)) this.#openTransientSelectionMenu()
      return
    }
    this.#closeTransientSelectionMenu()
    if (this.#beginFrameInteraction(_event, localX, localY)) return
    const pos = this.#positionFromLocal(localX, localY)
    if (pos === null) return
    const additiveSelection = isAdditiveSelectionPointer(_event)
    if (_event.detail >= 2 && !_event.shiftKey) {
      this.#selectWordAt(pos, additiveSelection)
      return
    }
    this.#dragSelecting = true
    this.#dragExtendsSelection = _event.shiftKey
    this.#dragAddsSelection = additiveSelection && !_event.shiftKey
    this.#dragAnchorLocalX = localX
    this.#dragAnchorLocalY = localY
    this.#pauseCursorBlinkForSelection()
    if (_event.shiftKey) {
      this.#setCursorPosition(pos, {extendSelection: true})
    } else {
      if (this.#dragAddsSelection) this.#addCurrentSelectionToSecondary()
      else this.#secondarySelections = []
      const next = this.#clampPosition(pos)
      const prevLeft = this.#scrollLeftPx
      const prevTop = this.#scrollTopPx
      this.#selectionAnchor = next
      this.#selectionFocus = next
      this.#cline = next.line
      this.#ccol = next.col
      this.#scrollCursorIntoView()
      this.#emitSelectionChange()
      this.#requestInteractiveRender(prevLeft, prevTop)
    }
    this.#pingCursor()
  }

  #selectWordAt(pos: CursorPos, additive = false): void {
    const next = this.#clampPosition(pos)
    const line = this.#lines[next.line] ?? ""
    const word = wordRangeAt(line, next.col, isEditorWordChar)
    if (word === null) {
      if (!additive) this.#setCursorPosition(next, {extendSelection: false})
      return
    }
    if (additive) this.#addCurrentSelectionToSecondary()
    else this.#secondarySelections = []
    this.#applyDragSelection({line: next.line, col: word.start}, {line: next.line, col: word.end})
  }

  override onPointerMove(_event: MouseEvent, localX: number, localY: number): void {
    if (this.#frameDrag !== null) {
      this.#updateFrameInteraction(_event)
      return
    }
    if (this.#selectionMenuOpen || this.pressedHit !== null) {
      const menuRect = this.#selectionMenuRect()
      super.onPointerMove(_event, localX, localY)
      if (this.pressedHit !== null || (menuRect !== null && pointInRect(localX, localY, menuRect))) return
    }
    if (!this.#dragSelecting) this.#syncFrameCursor(localX, localY)
    if (!this.#dragSelecting) return
    this.#updateDragSelection(localX, localY)
  }

  #updateDragSelection(localX: number, localY: number): void {
    const dragDistance = Math.abs(localX - this.#dragAnchorLocalX) + Math.abs(localY - this.#dragAnchorLocalY)
    if (dragDistance < 0.5) return
    const anchorRow = this.#visualRowFromLocalY(this.#dragAnchorLocalY)
    const focusRow = this.#visualRowFromLocalY(localY)
    if (!this.#dragExtendsSelection && anchorRow !== null && focusRow !== null && focusRow.rowIndex === anchorRow.rowIndex) {
      const lineText = this.#lines[anchorRow.lineIndex] ?? ""
      const forward = localX >= this.#dragAnchorLocalX
      const anchorCol = this.#colAtLocalX(lineText, this.#dragAnchorLocalX, forward ? "floor" : "ceil", anchorRow)
      let focusCol = this.#colAtLocalX(lineText, localX, "nearest", focusRow)
      if (anchorCol === focusCol && lineText.length > 0) {
        focusCol = forward ? Math.min(anchorRow.endCol, anchorCol + 1) : Math.max(anchorRow.startCol, anchorCol - 1)
      }
      this.#applyDragSelection(
        {line: anchorRow.lineIndex, col: anchorCol},
        {line: anchorRow.lineIndex, col: focusCol},
      )
      return
    }
    const forward = localY > this.#dragAnchorLocalY + this.#linePx / 2
      ? true
      : localY < this.#dragAnchorLocalY - this.#linePx / 2
        ? false
        : localX >= this.#dragAnchorLocalX
    const pos = this.#positionFromLocal(localX, localY, "nearest")
    if (pos === null) return
    let nextAnchor: CursorPos | null = null
    if (this.#dragExtendsSelection) {
      if (this.#selectionAnchor === null) this.#selectionAnchor = this.#currentPos()
      nextAnchor = this.#selectionAnchor
    } else {
      const anchorBias: ColumnHitBias = forward ? "floor" : "ceil"
      const anchor = this.#positionFromLocal(this.#dragAnchorLocalX, this.#dragAnchorLocalY, anchorBias)
      if (anchor !== null) nextAnchor = this.#clampPosition(anchor)
    }
    if (nextAnchor === null) return
    const nextFocus = this.#clampPosition(pos)
    this.#applyDragSelection(nextAnchor, nextFocus)
  }

  #applyDragSelection(anchor: CursorPos, focus: CursorPos): void {
    const nextAnchor = this.#clampPosition(anchor)
    const nextFocus = this.#clampPosition(focus)
    const sameSelection = this.#samePosition(this.#selectionAnchor, nextAnchor)
      && this.#samePosition(this.#selectionFocus, nextFocus)
      && this.#cline === nextFocus.line
      && this.#ccol === nextFocus.col
    const prevLeft = this.#scrollLeftPx
    const prevTop = this.#scrollTopPx
    this.#selectionAnchor = nextAnchor
    this.#selectionFocus = nextFocus
    this.#cline = this.#selectionFocus.line
    this.#ccol = this.#selectionFocus.col
    this.#scrollCursorIntoView()
    if (sameSelection && prevLeft === this.#scrollLeftPx && prevTop === this.#scrollTopPx) return
    this.#pingCursor(false)
    this.#emitSelectionChange()
    this.#requestInteractiveRender(prevLeft, prevTop)
  }

  override onPointerUp(_event: MouseEvent, localX: number, localY: number): void {
    if (this.#endFrameInteraction(_event, localX, localY)) return
    if (this.pressedHit !== null) {
      super.onPointerUp(_event, localX, localY)
      return
    }
    const prevLeft = this.#scrollLeftPx
    const prevTop = this.#scrollTopPx
    const wasDragSelecting = this.#dragSelecting
    if (this.#dragSelecting) this.#updateDragSelection(localX, localY)
    this.#dragSelecting = false
    if (this.#selectionRange() === null) {
      if (this.#secondarySelections.length > 0) this.#clearPrimarySelectionState()
      else this.#clearSelectionState()
    }
    if (wasDragSelecting) this.#resumeCursorBlinkAfterSelection()
    this.#requestInteractiveRender(prevLeft, prevTop)
  }

  override onContextMenu(event: MouseEvent, localX: number, localY: number): void {
    event.preventDefault()
    if (this.#selectionContextMenuEnabled && this.#isPointInSelection(localX, localY)) this.#openTransientSelectionMenu()
  }

  onActivate(): void {
    this.#cursorVisible = this.#showCaret
    if (this.#showCaret) this.#startCursorBlink()
    this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate?.()
    this.#frameDrag = null
    this.#dragSelecting = false
    this.#cursorBlinkPausedForSelection = false
    this.#stopCursorBlink()
    this.#cursorVisible = false
    this.requestRender()
  }

  // ────────── editing ──────────

  #snapshot(): Snapshot {
    return {
      lines: this.#lines.slice(),
      cline: this.#cline,
      ccol: this.#ccol,
      selectionAnchor: this.#selectionAnchor === null ? null : {...this.#selectionAnchor},
      selectionFocus: this.#selectionFocus === null ? null : {...this.#selectionFocus},
      secondarySelections: this.#secondarySelections.map((selection) => ({
        anchor: {...selection.anchor},
        focus: {...selection.focus},
      })),
    }
  }

  #pushHistory(): void {
    this.#history.push(this.#snapshot())
    if (this.#history.length > HISTORY_LIMIT) this.#history.shift()
    this.#future = []
  }

  #applySnap(s: Snapshot): void {
    this.#lines = s.lines.slice()
    this.#cline = s.cline
    this.#ccol = s.ccol
    this.#selectionAnchor = s.selectionAnchor === null ? null : {...s.selectionAnchor}
    this.#selectionFocus = s.selectionFocus === null ? null : {...s.selectionFocus}
    this.#secondarySelections = s.secondarySelections.map((selection) => ({
      anchor: {...selection.anchor},
      focus: {...selection.focus},
    }))
  }

  #undo(): void {
    const prev = this.#history.pop()
    if (prev === undefined) return
    this.#future.push(this.#snapshot())
    this.#applySnap(prev)
    this.#afterEdit()
  }

  #redo(): void {
    const next = this.#future.pop()
    if (next === undefined) return
    this.#history.push(this.#snapshot())
    this.#applySnap(next)
    this.#afterEdit()
  }

  #selectAll(): void {
    const endLine = this.#lines.length - 1
    const endCol = this.#lines[endLine]?.length ?? 0
    this.#secondarySelections = []
    this.#selectionAnchor = {line: 0, col: 0}
    this.#selectionFocus = {line: endLine, col: endCol}
    this.#cline = endLine
    this.#ccol = endCol
    this.#scrollCursorIntoView()
    this.#pingCursor()
    this.#emitSelectionChange()
    this.requestRender()
  }

  #insertText(s: string): void {
    if (s.length === 0) return
    this.#pushHistory()
    if (!this.#replaceSelectionWith(s)) this.#insertAtCursor(s)
    this.#afterEdit()
  }

  #insertNewline(): void {
    this.#insertText(`\n${this.#newlineIndentText()}`)
  }

  #newlineIndentText(): string {
    const line = this.#lines[this.#cline] ?? ""
    const beforeCursor = line.slice(0, this.#ccol)
    if (beforeCursor.trim().length > 0 || line.trim().length > 0) {
      return leadingWhitespace(line) + (lineOpensIndentBlock(beforeCursor) ? EDITOR_INDENT_UNIT : "")
    }

    const existingIndent = leadingWhitespace(beforeCursor)
    if (existingIndent.length > 0) return existingIndent

    const previous = previousNonEmptyLine(this.#lines, this.#cline)
    if (previous === null) return ""
    return leadingWhitespace(previous) + (lineOpensIndentBlock(previous) ? EDITOR_INDENT_UNIT : "")
  }

  #backspace(): void {
    if (this.#deleteSelection()) return
    if (this.#ccol > 0) {
      this.#pushHistory()
      const line = this.#lines[this.#cline]!
      this.#lines[this.#cline] = line.slice(0, this.#ccol - 1) + line.slice(this.#ccol)
      this.#ccol -= 1
      this.#afterEdit()
    } else if (this.#cline > 0) {
      this.#pushHistory()
      const tail = this.#lines.splice(this.#cline, 1)[0]!
      this.#cline -= 1
      this.#ccol = this.#lines[this.#cline]!.length
      this.#lines[this.#cline] = this.#lines[this.#cline]! + tail
      this.#afterEdit()
    }
  }

  #delete(): void {
    if (this.#deleteSelection()) return
    const line = this.#lines[this.#cline]!
    if (this.#ccol < line.length) {
      this.#pushHistory()
      this.#lines[this.#cline] = line.slice(0, this.#ccol) + line.slice(this.#ccol + 1)
      this.#afterEdit()
    } else if (this.#cline < this.#lines.length - 1) {
      this.#pushHistory()
      const next = this.#lines.splice(this.#cline + 1, 1)[0]!
      this.#lines[this.#cline] = line + next
      this.#afterEdit()
    }
  }

  #afterEdit(): void {
    this.#invalidateTextMetrics()
    this.#refreshTokens()
    this.#scrollCursorIntoView()
    this.#emitSelectionChange()
    this.requestRender()
    this.#onChange?.(this.getText())
  }

  #refreshTokens(): void {
    if (this.#tokenize === undefined) {
      this.#tokens = null
      return
    }
    try {
      this.#tokens = this.#normalizeTokens(this.#tokenize(this.#lines))
    } catch {
      this.#tokens = null
    }
  }

  #normalizeTokens(tokens: EditorTokens): EditorTokens {
    return this.#lines.map((line, index) => normalizeEditorTokensForLine(line, tokens[index] ?? []))
  }

  // ────────── cursor positioning ──────────

  #moveCursor(dCol: number, dLine: number, extendSelection = false): void {
    const range = this.#selectionRange()
    if (!extendSelection && range !== null && dLine === 0 && dCol !== 0) {
      this.#setCursorPosition(dCol < 0 ? range.start : range.end, {extendSelection: false})
      return
    }
    let next = this.#currentPos()
    if (dCol !== 0) {
      const newCol = next.col + dCol
      if (newCol < 0 && next.line > 0) {
        next = {line: next.line - 1, col: this.#lines[next.line - 1]!.length}
      } else if (newCol > this.#lines[next.line]!.length && next.line < this.#lines.length - 1) {
        next = {line: next.line + 1, col: 0}
      } else {
        next = {line: next.line, col: Math.max(0, Math.min(this.#lines[next.line]!.length, newCol))}
      }
    }
    if (dLine !== 0) {
      if (this.#wrapLines) {
        next = this.#moveCursorByVisualRows(next, dLine)
      } else {
        const newLine = Math.max(0, Math.min(this.#lines.length - 1, next.line + dLine))
        next = {line: newLine, col: Math.min(next.col, this.#lines[newLine]!.length)}
      }
    }
    this.#setCursorPosition(next, {extendSelection})
  }

  #movePage(direction: 1 | -1, extendSelection = false): void {
    const visible = this.#visibleLineCount()
    if (this.#wrapLines) {
      const next = this.#moveCursorByVisualRows(this.#currentPos(), direction * visible)
      this.#setCursorPosition(next, {extendSelection})
      return
    }
    const newLine = Math.max(0, Math.min(this.#lines.length - 1, this.#cline + direction * visible))
    this.#setCursorPosition({line: newLine, col: Math.min(this.#ccol, this.#lines[newLine]!.length)}, {extendSelection})
  }

  #moveCursorByVisualRows(pos: CursorPos, deltaRows: number): CursorPos {
    const rows = this.#visualRowsForCodeMaxPx(this.#codeMaxPx())
    if (rows.length === 0) return pos
    const currentRow = this.#visualRowForPosition(pos, rows)
    const targetRow = rows[Math.max(0, Math.min(rows.length - 1, currentRow.rowIndex + deltaRows))] ?? currentRow
    const x = this.#cursorXInVisualRow(pos, currentRow)
    const line = this.#lines[targetRow.lineIndex] ?? ""
    const segment = line.slice(targetRow.startCol, targetRow.endCol)
    const relCol = this.#colAtX(segment, x, "nearest")
    return {
      line: targetRow.lineIndex,
      col: Math.max(targetRow.startCol, Math.min(targetRow.endCol, targetRow.startCol + relCol)),
    }
  }

  #scrollCursorIntoView(align: EditorScrollAlign = "nearest"): void {
    let nextTop = this.#scrollTopPx
    const viewportH = this.#viewportContentH()
    const rows = this.#visualRowsForCodeMaxPx(this.#codeMaxPx())
    const cursorRow = this.#visualRowForPosition(this.#currentPos(), rows)
    const cursorTop = cursorRow.rowIndex * this.#linePx
    const cursorBottom = cursorTop + this.#linePx
    if (align === "top") nextTop = cursorTop
    else if (align === "center") nextTop = Math.max(0, cursorTop - Math.max(0, viewportH - this.#linePx) / 2)
    else if (cursorTop < nextTop) nextTop = cursorTop
    else if (cursorBottom > nextTop + viewportH) nextTop = cursorBottom - viewportH

    const cursorPx = this.#cursorXInVisualRow(this.#currentPos(), cursorRow)
    const codeMaxPx = this.#codeMaxPx()
    const margin = 40
    let nextLeft = this.#effectiveScrollLeftPx()
    if (cursorPx - nextLeft < margin) {
      nextLeft = Math.max(0, cursorPx - margin)
    } else if (cursorPx - nextLeft > codeMaxPx - margin) {
      nextLeft = Math.max(0, cursorPx - codeMaxPx + margin)
    }
    this.#setScrollPosition(nextLeft, nextTop)
  }

  #scrollLineIntoView(lineIndex: number, align: EditorScrollAlign = "nearest"): void {
    const viewportH = this.#viewportContentH()
    const rows = this.#visualRowsForCodeMaxPx(this.#codeMaxPx())
    const rowIndex = this.#visualRowIndexForLine(rows, Math.max(0, lineIndex), "start")
    const lineTop = rowIndex * this.#linePx
    let nextTop = this.#scrollTopPx
    if (align === "top") {
      nextTop = lineTop
    } else if (align === "center") {
      nextTop = Math.max(0, lineTop - Math.max(0, viewportH - this.#linePx) / 2)
    } else if (lineTop < nextTop) {
      nextTop = lineTop
    } else if (lineTop + this.#linePx > nextTop + viewportH) {
      nextTop = lineTop + this.#linePx - viewportH
    }
    this.#setScrollPosition(this.#effectiveScrollLeftPx(), nextTop)
  }

  #queueCursorScroll(align: EditorScrollAlign): void {
    this.#pendingCursorScrollAlign = align
    this.#pendingCursorScrollFrames = align === "center" ? 3 : 1
  }

  #queueLineScroll(lineIndex: number, align: EditorScrollAlign): void {
    this.#pendingLineScroll = {lineIndex, align}
    this.#pendingLineScrollFrames = align === "top" ? 4 : 2
  }

  #setScrollPosition(left: number, top: number): void {
    this.#scrollLeftPx = this.#wrapLines ? 0 : Math.max(0, left)
    this.#scrollTopPx = Math.max(0, top)
    divScrollTo(this, EDITOR_SCROLL_KEY, {left: this.#scrollLeftPx, top: this.#scrollTopPx})
  }

  #codeMaxPx(): number {
    const gutter = this.#gutterWidthPx(this.#lines.length)
    const contentW = this.#viewportContentW()
    return this.#codeMaxPxForContentW(contentW, gutter)
  }

  #codeMaxPxForContentW(contentW: number, gutter: number): number {
    return Math.max(1, contentW - gutter - CODE_LEFT_PAD_PX - 8)
  }

  #effectiveScrollLeftPx(): number {
    return this.#wrapLines ? 0 : this.#scrollLeftPx
  }

  #visualRowsForCodeMaxPx(codeMaxPx: number): EditorVisualRow[] {
    const rows: EditorVisualRow[] = []
    const wrapCols = this.#wrapColumnCount(codeMaxPx)
    for (let lineIndex = 0; lineIndex < this.#lines.length; lineIndex++) {
      const line = this.#lines[lineIndex] ?? ""
      if (!this.#wrapLines || line.length === 0) {
        rows.push({
          rowIndex: rows.length,
          lineIndex,
          startCol: 0,
          endCol: line.length,
          isFirstForLine: true,
        })
        continue
      }
      let startCol = 0
      while (startCol < line.length) {
        const endCol = this.#nextWrapEndCol(line, startCol, wrapCols)
        rows.push({
          rowIndex: rows.length,
          lineIndex,
          startCol,
          endCol,
          isFirstForLine: startCol === 0,
        })
        startCol = Math.max(startCol + 1, endCol)
      }
    }
    return rows.length > 0 ? rows : [{rowIndex: 0, lineIndex: 0, startCol: 0, endCol: 0, isFirstForLine: true}]
  }

  #wrapColumnCount(codeMaxPx: number): number {
    if (!this.#wrapLines) return Number.MAX_SAFE_INTEGER
    const cw = this.#getCharWidth()
    if (cw <= 0) return 1
    return Math.max(1, Math.floor(codeMaxPx / cw))
  }

  #nextWrapEndCol(line: string, startCol: number, wrapCols: number): number {
    const hardEnd = Math.min(line.length, startCol + Math.max(1, wrapCols))
    if (hardEnd >= line.length) return line.length
    const minWordBreak = startCol + Math.min(8, Math.max(1, wrapCols - 1))
    for (let i = hardEnd; i > minWordBreak; i--) {
      if (/\s/.test(line[i - 1] ?? "")) return i
    }
    return hardEnd
  }

  #visualRowForPosition(pos: CursorPos, rows: readonly EditorVisualRow[]): EditorVisualRow {
    let fallback = rows[0] ?? {rowIndex: 0, lineIndex: 0, startCol: 0, endCol: 0, isFirstForLine: true}
    for (const row of rows) {
      if (row.lineIndex < pos.line) {
        fallback = row
        continue
      }
      if (row.lineIndex > pos.line) break
      fallback = row
      const lineLength = this.#lines[row.lineIndex]?.length ?? 0
      if (pos.col >= row.startCol && (pos.col < row.endCol || row.endCol >= lineLength)) return row
    }
    return fallback
  }

  #visualRowIndexForLine(rows: readonly EditorVisualRow[], lineIndex: number, edge: "start" | "end"): number {
    let found: number | null = null
    for (const row of rows) {
      if (row.lineIndex < lineIndex) continue
      if (row.lineIndex > lineIndex) break
      if (edge === "start") return row.rowIndex
      found = row.rowIndex
    }
    if (found !== null) return found
    return Math.max(0, Math.min(rows.length - 1, lineIndex))
  }

  #cursorXInVisualRow(pos: CursorPos, row: EditorVisualRow): number {
    const line = this.#lines[row.lineIndex] ?? ""
    const col = Math.max(row.startCol, Math.min(row.endCol, pos.col))
    return this.#colToPx(line, col) - this.#colToPx(line, row.startCol)
  }

  #maxLineWidthPx(): number {
    const scale = this.pageScaleFactor
    if (this.#maxLineWidthPxCache !== null && this.#maxLineWidthPxCacheScale === scale) return this.#maxLineWidthPxCache
    let max = 0
    for (const line of this.#lines) {
      if (line.length === 0) continue
      const widths = this.#lineWidths(line)
      const width = widths === null
        ? line.length * this.#getCharWidth()
        : widths[widths.length - 1] ?? 0
      if (width > max) max = width
    }
    this.#maxLineWidthPxCache = max
    this.#maxLineWidthPxCacheScale = scale
    return max
  }

  #invalidateTextMetrics(): void {
    this.#charWidth = 0
    this.#charWidthScale = 0
    this.#spaceWidth = 0
    this.#spaceWidthScale = 0
    this.#maxLineWidthPxCache = null
    this.#maxLineWidthPxCacheScale = 0
    this.#lineWidthCache.clear()
  }

  /**
   * Определяет диапазон [start, end) символов строки, видимый в текущем
   * горизонтальном скролле. Для коротких строк рендерим целиком; для длинных
   * (≥ 200 символов) — слайс по charWidth-сетке + ~10 столбцов padding'а.
   */
  #visibleSlice(line: string): {start: number; end: number; startPx: number} {
    if (line.length < 200) return {start: 0, end: line.length, startPx: 0}
    const cw = this.#getCharWidth()
    if (cw <= 0) return {start: 0, end: line.length, startPx: 0}
    const codeMaxPx = this.#codeMaxPx()
    const padCols = 10
    const start = Math.max(0, Math.floor(this.#scrollLeftPx / cw) - padCols)
    const end = Math.min(line.length, Math.ceil((this.#scrollLeftPx + codeMaxPx) / cw) + padCols)
    const startPx = start * cw
    return {start, end, startPx}
  }

  #colAtX(line: string, x: number, bias: ColumnHitBias = "nearest"): number {
    if (x <= 0) return 0
    const widths = this.#lineWidths(line)
    if (widths !== null) {
      if (bias === "floor") return this.#colAtXFloor(widths, x)
      if (bias === "ceil") return this.#colAtXCeil(widths, x)
      const floor = this.#colAtXFloor(widths, x)
      const ceil = Math.min(line.length, floor + 1)
      const floorPx = widths[floor] ?? 0
      const ceilPx = widths[ceil] ?? floorPx
      return Math.abs(x - floorPx) <= Math.abs(ceilPx - x) ? floor : ceil
    }
    const cw = this.#getCharWidth()
    const raw = x / cw
    const col = bias === "floor" ? Math.floor(raw) : bias === "ceil" ? Math.ceil(raw) : Math.round(raw)
    return Math.max(0, Math.min(line.length, col))
  }

  #colAtXFloor(widths: readonly number[], x: number): number {
    let lo = 0
    let hi = widths.length - 1
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2)
      if ((widths[mid] ?? 0) <= x) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  #colAtXCeil(widths: readonly number[], x: number): number {
    let lo = 0
    let hi = widths.length - 1
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if ((widths[mid] ?? 0) < x) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  // ────────── rendering ──────────

  #pingCursor(resetBlink = true): void {
    this.#cursorVisible = true
    if (resetBlink && this.#cursorBlinkTimer !== null) this.#startCursorBlink()
  }

  #pauseCursorBlinkForSelection(): void {
    if (this.#cursorBlinkPausedForSelection) return
    this.#cursorBlinkPausedForSelection = this.#cursorBlinkTimer !== null
    this.#cursorVisible = true
    this.#stopCursorBlink()
  }

  #resumeCursorBlinkAfterSelection(): void {
    const shouldResume = this.#cursorBlinkPausedForSelection
    this.#cursorBlinkPausedForSelection = false
    if (!shouldResume) return
    this.#cursorVisible = true
    this.#startCursorBlink()
  }

  #requestInteractiveRender(prevLeft: number, prevTop: number): void {
    const scrollChanged = prevLeft !== this.#scrollLeftPx || prevTop !== this.#scrollTopPx
    if (scrollChanged || !this.#redrawInteractiveLayers()) {
      this.requestRender()
    }
  }

  #redrawInteractiveLayers(): boolean {
    if (this.font === null || this.#lastViewportLayout === null) return false
    if (this.#selectionMenuOpen || this.#introAnimStartedAt !== null) return false
    return this.requestRedrawLayers(["underlay", "selection", "overlay"], () => {
      const layout = this.#lastViewportLayout
      if (layout === null) return
      this.withLayer("underlay", () => {
        this.#renderIndentGuideLayer(layout)
        this.#renderCurrentLineLayer(layout)
      })
      this.withLayer("selection", () => this.#renderSelectionLayer(layout))
      this.withLayer("overlay", () => this.#renderCaretLayer(layout))
    })
  }

  #startCursorBlink(): void {
    this.#stopCursorBlink()
    if (typeof setInterval !== "function") return
    this.#cursorBlinkTimer = setInterval(() => {
      this.#cursorVisible = !this.#cursorVisible
      if (!this.#redrawInteractiveLayers()) this.requestRender()
    }, CARET_BLINK_MS)
  }

  #stopCursorBlink(): void {
    if (this.#cursorBlinkTimer === null || typeof clearInterval !== "function") return
    clearInterval(this.#cursorBlinkTimer)
    this.#cursorBlinkTimer = null
  }

  #startIntroAnimation(): void {
    this.#finishIntroAnimation(false)
    if (typeof requestAnimationFrame !== "function" || typeof setTimeout !== "function") return
    this.#introAnimStartedAt = performance.now()
    this.#introAnimFinishTimer = setTimeout(() => {
      this.#finishIntroAnimation(true)
    }, INTRO_ANIM_MS + INTRO_ANIM_MAX_DELAY_MS + 40)
    this.#scheduleIntroAnimationFrame()
  }

  #scheduleIntroAnimationFrame(): void {
    if (this.#introAnimRafId !== null) return
    if (typeof requestAnimationFrame !== "function") return
    this.#introAnimRafId = requestAnimationFrame(() => {
      this.#introAnimRafId = null
      if (this.#introAnimStartedAt === null) return
      const elapsed = performance.now() - this.#introAnimStartedAt
      if (elapsed >= INTRO_ANIM_MS + INTRO_ANIM_MAX_DELAY_MS) {
        this.#finishIntroAnimation(true)
        return
      }
      this.requestRender()
      this.#scheduleIntroAnimationFrame()
    })
  }

  #finishIntroAnimation(renderFinalFrame: boolean): void {
    if (this.#introAnimRafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.#introAnimRafId)
    }
    if (this.#introAnimFinishTimer !== null && typeof clearTimeout === "function") {
      clearTimeout(this.#introAnimFinishTimer)
    }
    this.#introAnimRafId = null
    this.#introAnimFinishTimer = null
    const wasRunning = this.#introAnimStartedAt !== null
    this.#introAnimStartedAt = null
    if (renderFinalFrame && wasRunning) this.requestRender()
  }

  override dispose(): void {
    this.#cursorBlinkPausedForSelection = false
    this.#stopCursorBlink()
    this.#finishIntroAnimation(false)
    super.dispose?.()
  }

  protected render(): void {
    if (this.#showHeader) {
      const dockButtonSize = 22
      const dockButtonX = this.rectW - PANE_FRAME.headerTextX - dockButtonSize
      const titleMaxW = this.#onFrameDockRequest === undefined
        ? this.rectW - 32
        : Math.max(1, dockButtonX - PANE_FRAME.headerTextX - 8)
      this.drawText(this.#title, PANE_FRAME.headerTextX, PANE_FRAME.headerTextY, {
        fontPx: this.#titleFontPx,
        material: this.#titleMaterial,
        maxWidthPx: titleMaxW,
      })
      if (this.#onFrameDockRequest !== undefined) {
        IconButton(this, dockButtonX, 7, dockButtonSize, dockButtonSize, {
          label: "Dock",
          iconSrc: uiIcons.minus,
          action: this.#onFrameDockRequest,
        })
      }
      const rule = paneHeaderRuleRect(this.rectW, HEADER_H_PX)
      this.drawRect(rule.x, rule.y, rule.w, rule.h, palette.borderDim, Z.SEPARATOR)
    }

    const total = this.#lines.length
    const gutter = this.#gutterWidthPx(total)
    const viewport = this.#bodyRect()
    const codeMaxPx = this.#codeMaxPxForContentW(viewport.w, gutter)
    const visualRows = this.#visualRowsForCodeMaxPx(codeMaxPx)
    const scrollContentWidth = this.#wrapLines
      ? Math.max(1, viewport.w)
      : Math.max(1, gutter + CODE_LEFT_PAD_PX + this.#maxLineWidthPx() + 8)
    const scrollPastEndPx = Math.max(0, viewport.h - this.#linePx * SCROLL_PAST_END_MIN_LINES)
    div(this, viewport.x, viewport.y, viewport.w, viewport.h, {
      key: EDITOR_SCROLL_KEY,
      scrollContentWidth,
      scrollContentHeight: Math.max(1, visualRows.length * this.#linePx + scrollPastEndPx),
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowX: this.#wrapLines ? "hidden" : "auto",
        overflowY: "auto",
      },
      children: (ctx) => this.#renderCodeViewport(ctx, gutter),
    })

    this.withLayer("overlay", () => this.#renderSelectionMenu())
  }

  #renderCodeViewport(ctx: DivScrollContext, gutter: number): void {
    this.#scrollLeftPx = this.#wrapLines ? 0 : ctx.scrollLeft
    this.#scrollTopPx = ctx.scrollTop
    this.#viewportW = ctx.viewportWidth
    this.#viewportH = ctx.viewportHeight
    const pendingScrollAlign = this.#pendingCursorScrollAlign
    if (pendingScrollAlign !== null) {
      this.#scrollCursorIntoView(pendingScrollAlign)
      this.#pendingCursorScrollFrames -= 1
      if (this.#pendingCursorScrollFrames <= 0) {
        this.#pendingCursorScrollAlign = null
        this.#pendingCursorScrollFrames = 0
      } else {
        this.requestRender()
      }
    }
    const pendingLineScroll = this.#pendingLineScroll
    if (pendingLineScroll !== null) {
      this.#scrollLineIntoView(pendingLineScroll.lineIndex, pendingLineScroll.align)
      this.#pendingLineScrollFrames -= 1
      if (this.#pendingLineScrollFrames <= 0) {
        this.#pendingLineScroll = null
        this.#pendingLineScrollFrames = 0
      } else {
        this.requestRender()
      }
    }

    const layout = this.#viewportLayout(gutter)
    this.#lastViewportLayout = layout

    this.withLayer("underlay", () => {
      this.#renderIndentGuideLayer(layout)
      this.#renderCurrentLineLayer(layout)
    })
    this.withLayer("selection", () => this.#renderSelectionLayer(layout))
    const visibleLines = this.#renderCodeTextLayer(layout)
    this.#renderGutterLayer(this.#gutterMetrics(gutter, layout.contentH), visibleLines)
    this.withLayer("overlay", () => this.#renderCaretLayer(layout))
  }

  #viewportLayout(gutter: number): EditorViewportLayout {
    const scroll = this.#scrollTopPx / this.#linePx
    const startIdx = Math.floor(scroll)
    const subPx = this.#scrollTopPx - startIdx * this.#linePx
    const visible = this.#visibleLineCount()
    const contentW = this.#viewportW
    const contentH = this.#viewportH
    const codeMaxPx = this.#codeMaxPxForContentW(contentW, gutter)
    const codeClipX = PAD_LEFT_PX + gutter
    const codeClipW = Math.max(1, codeMaxPx + CODE_LEFT_PAD_PX)
    const codeStartX = PAD_LEFT_PX + gutter + CODE_LEFT_PAD_PX
    const visualRows = this.#visualRowsForCodeMaxPx(codeMaxPx)
    return {
      totalRows: visualRows.length,
      visualRows,
      gutter,
      startIdx,
      subPx,
      visible,
      contentW,
      contentH,
      codeMaxPx,
      codeClipX,
      codeClipW,
      codeStartX,
    }
  }

  #renderCurrentLineLayer(layout: EditorViewportLayout): void {
    const padTop = this.#padTopPx()
    this.pushClip(PAD_LEFT_PX, padTop, layout.contentW, layout.contentH)
    const executionIndex = this.#executionLine === null ? null : this.#executionLine - 1
    const rows = executionIndex === null
      ? [this.#visualRowForPosition(this.#currentPos(), layout.visualRows)]
      : layout.visualRows.filter((row) => row.lineIndex === executionIndex)
    for (const row of rows) {
      const cRowIdx = row.rowIndex - layout.startIdx
      if (cRowIdx < -1 || cRowIdx > layout.visible) continue
      const hY = padTop + cRowIdx * this.#linePx - layout.subPx
      const highlightY = this.#lineHighlightY(hY)
      const highlightH = this.#lineHighlightH()
      if (executionIndex !== null) {
        this.drawRoundedRect(PAD_LEFT_PX, highlightY, layout.contentW, highlightH, {
          radius: 4,
          fill: palette.pausedFill,
          z: Z.ELEMENT,
        })
      } else {
        this.drawRoundedRect(PAD_LEFT_PX, highlightY, layout.contentW, highlightH, {
          radius: 4,
          fill: palette.bg,
          z: Z.ELEMENT,
        })
      }
    }
    this.popClip()
  }

  #renderIndentGuideLayer(layout: EditorViewportLayout): void {
    if (!this.#indentGuides) return
    const ranges = this.#indentGuideRanges()
    if (ranges.length === 0) return
    const padTop = this.#padTopPx()
    const firstVisibleRow = layout.visualRows[Math.max(0, Math.min(layout.totalRows - 1, layout.startIdx))]
    const lastVisibleRow = layout.visualRows[Math.max(0, Math.min(layout.totalRows - 1, layout.startIdx + layout.visible + 1))]
    const firstVisibleLine = firstVisibleRow?.lineIndex ?? 0
    const lastVisibleLine = lastVisibleRow?.lineIndex ?? this.#lines.length - 1
    this.pushClip(layout.codeClipX, padTop, layout.codeClipW, layout.contentH)
    for (const range of ranges) {
      if (range.column === 0) continue
      if (range.endLine < firstVisibleLine || range.startLine > lastVisibleLine) continue
      const rawX = layout.codeStartX + this.#indentGuideColumnToPx(range.column) - INDENT_GUIDE_TEXT_OFFSET_PX - this.#effectiveScrollLeftPx()
      if (rawX < layout.codeClipX - 1 || rawX > layout.codeClipX + layout.codeClipW + 1) continue
      const x = Math.round(rawX) + 0.5
      const startLine = Math.max(range.startLine, firstVisibleLine)
      const endLine = Math.min(range.endLine, lastVisibleLine)
      const y1 = this.#rowYForLine(layout, startLine, "start")
      const y2 = this.#rowYForLine(layout, endLine, range.includesEndLine ? "end" : "start")
      if (y2 <= y1) continue
      this.drawLine(x, y1, x, y2, INDENT_GUIDE_FILL, 1, Z.SEPARATOR)
    }
    this.popClip()
  }

  #indentGuideRanges(): EditorIndentGuideRange[] {
    return editorIndentGuideRangesForLines(this.#lines)
  }

  #indentGuideColumnToPx(col: number): number {
    return Math.max(0, col) * this.#getSpaceWidth()
  }

  #rowYForLine(layout: EditorViewportLayout, lineIndex: number, edge: "start" | "end" = "start"): number {
    const rowIndex = this.#visualRowIndexForLine(layout.visualRows, lineIndex, edge)
    const y = this.#padTopPx() + (rowIndex - layout.startIdx) * this.#linePx - layout.subPx
    return edge === "end" ? y + this.#linePx : y
  }

  #renderSelectionLayer(layout: EditorViewportLayout): void {
    const padTop = this.#padTopPx()
    this.pushClip(PAD_LEFT_PX, padTop, layout.contentW, layout.contentH)
    for (const line of this.#visibleLines(layout)) {
      this.pushClip(layout.codeClipX, line.rowY, layout.codeClipW, this.#linePx)
      this.#renderSelectionForLine(line, layout.codeStartX, line.rowY, layout.codeMaxPx)
      this.popClip()
    }
    this.popClip()
  }

  #renderCodeTextLayer(layout: EditorViewportLayout): EditorVisibleLine[] {
    const visibleLines = this.#visibleLines(layout)
    const padTop = this.#padTopPx()

    this.pushClip(PAD_LEFT_PX, padTop, layout.contentW, layout.contentH)
    for (const line of visibleLines) {
      this.pushClip(layout.codeClipX, line.rowY, layout.codeClipW, this.#linePx)
      this.#renderCodeLine(line.lineIndex, line.lineText, layout.codeStartX, line.textY, layout.codeMaxPx, line.startCol, line.endCol)
      this.popClip()
    }
    this.popClip()

    return visibleLines
  }

  #visibleLines(layout: EditorViewportLayout): EditorVisibleLine[] {
    const lines: EditorVisibleLine[] = []
    const renderCount = layout.visible + 1
    const padTop = this.#padTopPx()
    for (let i = 0; i < renderCount; i++) {
      const rowIndex = layout.startIdx + i
      if (rowIndex >= layout.totalRows) break
      if (rowIndex < 0) continue
      const row = layout.visualRows[rowIndex]
      if (row === undefined) continue
      const rowY = padTop + i * this.#linePx - layout.subPx
      if (rowY + this.#linePx < padTop - 1) continue
      if (rowY > padTop + layout.contentH + 1) break
      const lineText = this.#lines[row.lineIndex] ?? ""
      lines.push({
        rowIndex,
        lineIndex: row.lineIndex,
        startCol: row.startCol,
        endCol: row.endCol,
        rowY,
        textY: rowY + (this.#linePx - this.#fontPx) / 2,
        lineText,
        isFirstForLine: row.isFirstForLine,
        isCurrent: row.lineIndex === this.#cline,
        isExecution: this.#executionLine !== null && row.lineIndex === this.#executionLine - 1,
      })
    }
    return lines
  }

  #renderCaretLayer(layout: EditorViewportLayout): void {
    if (!this.#showCaret) return
    if (!this.#cursorVisible) return
    const padTop = this.#padTopPx()
    const cursorRow = this.#visualRowForPosition(this.#currentPos(), layout.visualRows)
    const rowIdx = cursorRow.rowIndex - layout.startIdx
    if (rowIdx < -1 || rowIdx > layout.visible) return
    const rowY = padTop + rowIdx * this.#linePx - layout.subPx
    if (rowY + this.#linePx < padTop - 1 || rowY > padTop + layout.contentH + 1) return
    const cursorAbsX = this.#cursorXInVisualRow(this.#currentPos(), cursorRow)
    const curX = Math.round(layout.codeStartX + cursorAbsX - this.#effectiveScrollLeftPx())
    if (curX < layout.codeStartX - 1 || curX > layout.codeStartX + layout.codeMaxPx + 1) return
    const caretY = Math.round(rowY + (this.#linePx - this.#fontPx) / 2)
    const caretH = Math.max(1, Math.round(this.#fontPx + CARET_BOTTOM_PAD_PX))
    this.pushClip(layout.codeClipX - CARET_W_PX, padTop, layout.codeClipW + CARET_W_PX * 2, layout.contentH)
    this.drawRect(curX + 1, caretY, CARET_W_PX, caretH, palette.cyan, CARET_Z)
    this.popClip()
  }

  #gutterMetrics(gutter: number, contentH: number): EditorGutterMetrics {
    return {
      x: PAD_LEFT_PX,
      y: this.#padTopPx(),
      w: gutter,
      h: contentH,
      ruleX: PAD_LEFT_PX + gutter,
      numberXMax: PAD_LEFT_PX + gutter - GUTTER_RIGHT_PAD_PX,
      numberW: gutter - GUTTER_LEFT_PAD_PX - GUTTER_RIGHT_PAD_PX,
    }
  }

  #renderGutterLayer(metrics: EditorGutterMetrics, lines: readonly EditorVisibleLine[]): void {
    if (metrics.w <= 0) return
    const ruleX = Math.round(metrics.ruleX) + 0.5
    this.drawLine(ruleX, metrics.y, ruleX, metrics.y + metrics.h, GUTTER_RULE_FILL, 1, GUTTER_RULE_Z)
    for (const line of lines) {
      if (!line.isFirstForLine) continue
      const sourceLine = line.lineIndex + 1
      const breakpoint = this.#breakpoints.get(sourceLine)
      if (breakpoint !== undefined) {
        this.#drawBreakpointMarker(this.#breakpointMarkerX(metrics), this.#lineCenterY(line.rowY), breakpoint)
      }
      if (this.#showLineNumbers) {
        const label = String(line.lineIndex + 1)
        const labelW = this.measureText(label, this.#fontPx)
        const labelX = Math.max(
          metrics.x + GUTTER_LEFT_PAD_PX,
          metrics.numberXMax - labelW,
        )
        this.#drawGutterLabel(label, labelX, line.textY, metrics.numberW, line.isCurrent, line.isExecution)
      }
      if (this.#onBreakpointToggle !== undefined) {
        this.hit(metrics.x, line.rowY, metrics.w, this.#linePx, () => this.#onBreakpointToggle?.(sourceLine), {
          key: `editor-breakpoint-gutter:${sourceLine}`,
          cursor: "pointer",
          tooltip: {label: "Toggle breakpoint", delayMs: 350},
        })
      }
    }
  }

  #drawBreakpointMarker(cx: number, cy: number, breakpoint: EditorBreakpoint): void {
    const pending = breakpoint.pending === true || breakpoint.verified === false
    const r = breakpoint.hit === true ? 5 : 4
    const border = breakpoint.hit === true ? BREAKPOINT_HIT_BORDER : BREAKPOINT_BORDER
    this.drawRoundedRect(cx - r, cy - r, r * 2, r * 2, {
      radius: r,
      fill: pending ? BREAKPOINT_PENDING_FILL : BREAKPOINT_FILL,
      border,
      borderWidth: pending ? 1.25 : 1,
      z: Z.ELEMENT_RULE,
    })
  }

  #lineHighlightY(rowY: number): number {
    return rowY + Math.min(LINE_HIGHLIGHT_TOP_PAD_PX, Math.max(0, this.#linePx - 1))
  }

  #lineHighlightH(): number {
    return Math.max(1, this.#linePx - LINE_HIGHLIGHT_TOP_PAD_PX - LINE_HIGHLIGHT_BOTTOM_PAD_PX)
  }

  #lineCenterY(rowY: number): number {
    return this.#lineHighlightY(rowY) + this.#lineHighlightH() / 2
  }

  #breakpointMarkerX(metrics: EditorGutterMetrics): number {
    return metrics.x + GUTTER_LEFT_PAD_PX + 5
  }

  #drawGutterLabel(label: string, x: number, y: number, maxWidthPx: number, isCurrent: boolean, isExecution: boolean): void {
    for (const [dx, dy] of GUTTER_HALO_OFFSETS) {
      this.drawText(label, x + dx, y + dy, {
        fontPx: this.#fontPx,
        material: this.#gutterHaloMaterial,
        maxWidthPx,
        fit: false,
        measure: false,
        z: GUTTER_HALO_Z,
      })
    }
    this.drawText(label, x, y, {
      fontPx: this.#fontPx,
      material: isExecution ? this.#gutterExecutionMaterial : isCurrent ? this.#gutterCurMaterial : this.#gutterMaterial,
      maxWidthPx,
      fit: false,
      measure: false,
      z: GUTTER_TEXT_Z,
    })
  }

  #renderCodeLine(lineIndex: number, lineText: string, codeStartX: number, textY: number, codeMaxPx: number, spanStart = 0, spanEnd = lineText.length): void {
    if (lineText.length === 0) return
    const slice = this.#wrapLines
      ? {start: spanStart, end: spanEnd, startPx: 0}
      : this.#visibleSlice(lineText)
    const visText = slice.end > slice.start ? lineText.slice(slice.start, slice.end) : ""
    if (visText.length === 0) return
    const drawX = codeStartX - this.#effectiveScrollLeftPx() + slice.startPx
    const lineTokens = this.#tokens?.[lineIndex]
    const visTokens: EditorToken[] = []
    if (lineTokens !== undefined) {
      for (const t of lineTokens) {
        if (t.e <= slice.start || t.s >= slice.end) continue
        const token: EditorToken = {
          s: Math.max(0, t.s - slice.start),
          e: Math.min(slice.end - slice.start, t.e - slice.start),
          c: t.c,
        }
        if (t.fg !== undefined) token.fg = t.fg
        if (t.bg !== undefined) token.bg = t.bg
        visTokens.push(token)
      }
    }
    const maxW = codeMaxPx + this.#effectiveScrollLeftPx() + 1000
    if (visTokens.length > 0) {
      this.#renderTokenized(lineIndex, visText, visTokens, drawX, textY, maxW, slice.start)
      return
    }
    const animOffset = this.#animOffsetFor(lineIndex, slice.start)
    if (!isFinite(animOffset)) return
    renderEditorTextRuns({
      pane: this,
      text: visText,
      startX: drawX + animOffset,
      y: textY,
      fontPx: this.#fontPx,
      material: this.#lineMaterial,
      maxPx: maxW,
      letterSpacingPx: CODE_LETTER_SPACING_PX,
      spaceAdvancePx: this.#getSpaceWidth(),
      columnX: (startCol) => this.#colToPx(visText, startCol),
    })
  }

  #renderTokenized(lineIndex: number, text: string, tokens: EditorToken[], startX: number, y: number, maxPx: number, sliceStart: number): void {
    renderEditorTokenizedLine({
      pane: this,
      text,
      tokens,
      startX,
      y,
      fontPx: this.#fontPx,
      letterSpacingPx: CODE_LETTER_SPACING_PX,
      spaceAdvancePx: this.#getSpaceWidth(),
      maxPx,
      materials: this.#tokenMaterials,
      fallbackMaterial: this.#lineMaterial,
      sliceStart,
      tokensNormalized: true,
      chunkWidth: (startCol, endCol, chunkText) => {
        const w = this.#colToPx(text, endCol) - this.#colToPx(text, startCol)
        return w > 0 ? w : this.measureText(chunkText, this.#fontPx, CODE_LETTER_SPACING_PX, this.#getSpaceWidth())
      },
      chunkX: (startCol) => this.#colToPx(text, startCol),
      animOffsetFor: (absoluteColumn) => this.#animOffsetFor(lineIndex, absoluteColumn),
      drawTokenBackground: (_tokenX, bgY, _tokenW, _h, bg, slotX, slotW) => {
        const color = parseCssColor(bg)
        if (color !== null) {
          const swatchW = Math.max(2, Math.floor(slotW - 2))
          if (swatchW < 2) return
          const swatchX = Math.round(slotX + Math.max(1, Math.floor((slotW - swatchW) / 2)))
          const swatchY = Math.round(bgY - (this.#linePx - this.#fontPx) / 2)
          const swatchH = Math.max(1, Math.round(this.#linePx))
          this.withLayer("contentUnderlay", () => {
            this.drawRect(swatchX - 1, swatchY, swatchW + 2, swatchH, palette.borderDim, Z.CONTAINER)
            this.drawRect(swatchX, swatchY + 1, swatchW, Math.max(1, swatchH - 2), palette.bgInput, Z.SEPARATOR)
            this.drawRect(swatchX, swatchY + 1, swatchW, Math.max(1, swatchH - 2), color, Z.ELEMENT)
          })
        }
      },
    })
  }

  #renderSelectionForLine(line: EditorVisibleLine, codeStartX: number, rowY: number, codeMaxPx: number): void {
    for (const selection of this.#selectionSlots()) {
      this.#renderSelectionRangeForLine(selection.range, line, codeStartX, rowY, codeMaxPx)
    }
  }

  #renderSelectionRangeForLine(range: SelectionRange, line: EditorVisibleLine, codeStartX: number, rowY: number, codeMaxPx: number): void {
    const lineIndex = line.lineIndex
    const lineText = line.lineText
    if (lineIndex < range.start.line || lineIndex > range.end.line) return
    const segment = this.#selectionSegmentForLine(range, line)
    if (segment === null) return

    let x1 = this.#xForColumnInLineSegment(lineText, line.startCol, segment.startCol, codeStartX)
    let x2 = this.#xForColumnInLineSegment(lineText, line.startCol, segment.endCol, codeStartX)
    if (segment.includesLineBreak) x2 += Math.max(5, this.#getCharWidth() * 0.65)

    const minX = codeStartX
    const maxX = codeStartX + codeMaxPx
    x1 = Math.max(minX, Math.min(maxX, x1))
    x2 = Math.max(minX, Math.min(maxX, x2))
    const w = x2 - x1
    if (w <= 0) return
    const textY = rowY + (this.#linePx - this.#fontPx) / 2
    const padY = Math.max(2, (this.#linePx - this.#fontPx) / 2)
    const y1 = Math.max(rowY, textY - padY)
    const y2 = Math.min(rowY + this.#linePx, textY + this.#fontPx + padY)
    this.drawRoundedRect(x1, y1, w, Math.max(1, y2 - y1), {
      radius: 3,
      fill: SELECTION_FILL,
      z: Z.ELEMENT_RULE - 0.001,
    })
  }

  #selectionSegmentForLine(range: SelectionRange, line: Pick<EditorVisibleLine, "lineIndex" | "lineText" | "startCol" | "endCol">): EditorSelectionSegment | null {
    const lineIndex = line.lineIndex
    const lineText = line.lineText
    if (lineIndex < range.start.line || lineIndex > range.end.line) return null
    const selectedStartCol = lineIndex === range.start.line ? range.start.col : 0
    const selectedEndCol = lineIndex === range.end.line ? range.end.col : lineText.length
    const startCol = Math.max(line.startCol, selectedStartCol)
    const endCol = Math.min(line.endCol, selectedEndCol)
    const includesLineBreak = lineIndex < range.end.line
      && selectedEndCol >= lineText.length
      && line.endCol >= lineText.length
    if (endCol < startCol) return null
    if (endCol === startCol && !includesLineBreak) return null
    return {startCol, endCol, includesLineBreak}
  }

  #xForColumnInLineSegment(lineText: string, segmentStartCol: number, col: number, codeStartX: number): number {
    return codeStartX
      + this.#colToPx(lineText, col)
      - this.#colToPx(lineText, segmentStartCol)
      - this.#effectiveScrollLeftPx()
  }

  #isPointInSelection(localX: number, localY: number): boolean {
    const row = this.#visualRowFromLocalY(localY)
    if (row === null) return false
    const lineText = this.#lines[row.lineIndex] ?? ""
    const codeStartX = this.#codeStartX()
    const codeMaxPx = this.#codeMaxPx()
    const visibleLine: Pick<EditorVisibleLine, "lineIndex" | "lineText" | "startCol" | "endCol"> = {
      lineIndex: row.lineIndex,
      lineText,
      startCol: row.startCol,
      endCol: row.endCol,
    }
    for (const selection of this.#selectionSlots()) {
      const segment = this.#selectionSegmentForLine(selection.range, visibleLine)
      if (segment === null) continue
      let x1 = this.#xForColumnInLineSegment(lineText, row.startCol, segment.startCol, codeStartX)
      let x2 = this.#xForColumnInLineSegment(lineText, row.startCol, segment.endCol, codeStartX)
      if (segment.includesLineBreak) x2 += Math.max(5, this.#getCharWidth() * 0.65)
      const minX = codeStartX
      const maxX = codeStartX + codeMaxPx
      x1 = Math.max(minX, Math.min(maxX, x1))
      x2 = Math.max(minX, Math.min(maxX, x2))
      if (localX >= Math.min(x1, x2) && localX <= Math.max(x1, x2)) return true
    }
    return false
  }

  #renderSelectionMenu(): void {
    const rect = this.#selectionMenuRect()
    if (rect === null) return
    const notch = 8
    this.drawRoundedRect(rect.anchorX - notch / 2, rect.y + rect.h - 2, notch, notch, {
      radius: 2,
      fill: SELECTION_MENU_BG,
      border: SELECTION_MENU_BORDER,
      borderWidth: 1,
      z: SELECTION_MENU_Z,
    })
    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: 17,
      fill: SELECTION_MENU_BG,
      border: SELECTION_MENU_BORDER,
      borderWidth: 1,
      z: SELECTION_MENU_Z + 0.01,
    })

    const pad = 6
    const gap = 6
    const itemH = rect.h - pad * 2
    const itemWidths = SELECTION_MENU_ITEMS.map((item) => Math.max(58, autoButtonWidth(this, item.label, 10, 18)))
    const itemsW = itemWidths.reduce((sum, w) => sum + w, 0) + gap * (itemWidths.length - 1)
    let itemX = rect.x + (rect.w - itemsW) / 2
    for (const [i, item] of SELECTION_MENU_ITEMS.entries()) {
      const itemW = itemWidths[i]!
      const itemY = rect.y + pad
      Button(this, itemX, itemY, itemW, itemH, {
        children: item.label,
        variant: item.action === "copy" ? "contained" : "glass",
        color: "neutral",
        radius: itemH / 2,
        fontPx: 10,
        sx: {zIndex: SELECTION_MENU_Z + 0.006},
        onClick: () => this.#runSelectionMenuAction(item.action),
      })
      itemX += itemW + gap
    }
  }

  #selectionMenuRect(): SelectionMenuRect | null {
    if (!this.#selectionMenuOpen) return null
    const range = this.#selectionRange()
    if (range === null) return null

    const gutter = this.#gutterWidthPx(this.#lines.length)
    const layout = this.#viewportLayout(gutter)
    const visibleLine = this.#visibleLines(layout).find((line) => this.#selectionSegmentForLine(range, line) !== null)
    if (visibleLine === undefined) return null

    const lineText = visibleLine.lineText
    const codeStartX = this.#codeStartX()
    const codeMaxPx = this.#codeMaxPx()
    const segment = this.#selectionSegmentForLine(range, visibleLine)
    if (segment === null) return null
    let x1 = this.#xForColumnInLineSegment(lineText, visibleLine.startCol, segment.startCol, codeStartX)
    let x2 = this.#xForColumnInLineSegment(lineText, visibleLine.startCol, segment.endCol, codeStartX)
    if (segment.includesLineBreak) x2 += Math.max(5, this.#getCharWidth() * 0.65)
    if (x2 <= x1) x2 = x1 + Math.max(18, this.#getCharWidth() * 1.5)
    const minX = codeStartX
    const maxX = codeStartX + codeMaxPx
    x1 = Math.max(minX, Math.min(maxX, x1))
    x2 = Math.max(minX, Math.min(maxX, x2))
    const anchorX = Math.max(minX, Math.min(maxX, (x1 + x2) / 2))

    const rowY = visibleLine.rowY
    const itemWidths = SELECTION_MENU_ITEMS.map((item) => Math.max(58, autoButtonWidth(this, item.label, 10, 18)))
    const menuContentW = itemWidths.reduce((sum, w) => sum + w, 0) + 6 * (itemWidths.length - 1)
    const maxMenuW = this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX - SCROLLBAR_W - 16
    const menuW = Math.min(maxMenuW, menuContentW + 12)
    const menuH = 34
    const minMenuX = PAD_LEFT_PX + 4
    const maxMenuX = this.rectW - PAD_RIGHT_PX - SCROLLBAR_W - 4 - menuW
    const menuX = Math.max(minMenuX, Math.min(maxMenuX, anchorX - menuW / 2))
    const contentBottom = this.rectH - PAD_BOTTOM_PX
    const aboveY = rowY - menuH - 8
    const minMenuY = this.#showHeader ? HEADER_H_PX + 4 : 4
    const menuY = aboveY >= minMenuY
      ? aboveY
      : Math.min(contentBottom - menuH - 4, rowY + this.#linePx + 8)
    return {x: menuX, y: Math.max(4, menuY), w: menuW, h: menuH, anchorX}
  }

  #runSelectionMenuAction(action: SelectionMenuAction): void {
    if (action === "selectAll") {
      this.#selectAll()
      return
    }
    const task = action === "copy" ? this.#copySelectedTextToClipboard() : this.#cutSelectedTextToClipboard()
    void task.then((ok) => {
      if (ok) this.#setSelectionMenuOpen(false, false)
      this.#onSelectionClipboard?.(ok, action)
    }).catch(() => {
      this.#onSelectionClipboard?.(false, action)
    })
  }

  #visibleLineCount(): number {
    return Math.max(1, Math.floor(this.#viewportContentH() / this.#linePx))
  }

  #viewportContentW(): number {
    if (this.#viewportW > 1) return this.#viewportW
    return Math.max(1, this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX - SCROLLBAR_W - 10)
  }

  #viewportContentH(): number {
    if (this.#viewportH > 1) return this.#viewportH
    return Math.max(1, this.rectH - this.#padTopPx() - PAD_BOTTOM_PX - SCROLLBAR_W - 10)
  }

  #gutterWidthPx(lineCount: number): number {
    if (!this.#showLineNumbers && !this.#hasBreakpointLane()) return 0
    if (this.font === null) return GUTTER_MIN_PX
    if (!this.#showLineNumbers) {
      return Math.ceil(GUTTER_LEFT_PAD_PX + GUTTER_BREAKPOINT_LANE_PX + GUTTER_RIGHT_PAD_PX)
    }
    const digits = Math.max(2, String(Math.max(1, lineCount)).length)
    const digitW = this.measureText("8", this.#fontPx)
    const breakpointLane = this.#hasBreakpointLane() ? GUTTER_BREAKPOINT_LANE_PX : 0
    return Math.ceil(Math.max(GUTTER_MIN_PX, GUTTER_LEFT_PAD_PX + breakpointLane + digitW * digits + GUTTER_RIGHT_PAD_PX))
  }

  #hasBreakpointLane(): boolean {
    return this.#onBreakpointToggle !== undefined || this.#breakpoints.size > 0
  }
}

function resolveEditorTokenize(opts: EditorOpts): EditorTokenize | undefined {
  if (opts.highlighter !== undefined) return opts.highlighter.tokenize
  if (opts.languageId !== undefined || opts.path !== undefined) {
    const input: {languageId?: string; path?: string} = {}
    if (opts.languageId !== undefined) input.languageId = opts.languageId
    if (opts.path !== undefined) input.path = opts.path
    return resolveLanguageHighlighter(input).tokenize
  }
  return undefined
}

function normalizeBreakpoints(breakpoints: readonly EditorBreakpoint[]): Map<number, EditorBreakpoint> {
  const out = new Map<number, EditorBreakpoint>()
  for (const breakpoint of breakpoints) {
    if (!Number.isInteger(breakpoint.line) || breakpoint.line <= 0) continue
    const line = Math.floor(breakpoint.line)
    const next: EditorBreakpoint = {line}
    if (breakpoint.verified !== undefined) next.verified = breakpoint.verified
    if (breakpoint.pending !== undefined) next.pending = breakpoint.pending
    if (breakpoint.hit !== undefined) next.hit = breakpoint.hit
    out.set(line, next)
  }
  return out
}

function leadingWhitespace(line: string): string {
  return line.match(/^[ \t]*/)?.[0] ?? ""
}

function previousNonEmptyLine(lines: readonly string[], beforeLine: number): string | null {
  for (let lineIndex = Math.min(lines.length - 1, Math.floor(beforeLine) - 1); lineIndex >= 0; lineIndex--) {
    const line = lines[lineIndex] ?? ""
    if (line.trim().length > 0) return line
  }
  return null
}

function lineOpensIndentBlock(line: string): boolean {
  const stack: EditorIndentOpenerToken[] = []
  for (const token of structuralEditTokens(line, false).tokens) {
    if (token === "{" || token === "[" || token === "(") {
      stack.push(token)
      continue
    }

    const opener = matchingIndentOpener(token)
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i] !== opener) continue
      stack.splice(i, 1)
      break
    }
  }
  return stack.length > 0
}

function matchingIndentOpener(token: EditorIndentCloserToken): EditorIndentOpenerToken {
  if (token === "}") return "{"
  if (token === "]") return "["
  return "("
}

function leadingIndentColumns(line: string, tabSize: number): number {
  let columns = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === " ") {
      columns += 1
      continue
    }
    if (ch === "\t") {
      columns += tabAdvanceColumns(columns, tabSize)
      continue
    }
    break
  }
  return columns
}

function tabAdvanceColumns(column: number, tabSize: number): number {
  const size = Math.max(1, Math.floor(tabSize))
  return size - column % size
}

function structuralEditTokens(line: string, inBlockComment: boolean): {tokens: EditorIndentEditToken[]; inBlockComment: boolean} {
  const out: EditorIndentEditToken[] = []
  let quote: "\"" | "'" | "`" | null = null
  let escaped = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (quote !== null) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === "\\") {
        escaped = true
        continue
      }
      if (ch === quote) quote = null
      continue
    }

    if (ch === "/" && next === "/") break
    if (ch === "/" && next === "*") {
      const end = line.indexOf("*/", i + 2)
      if (end < 0) {
        inBlockComment = true
        break
      }
      i = end + 1
      continue
    }

    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch
      continue
    }
    if (ch === "{" || ch === "[" || ch === "(" || ch === "}" || ch === "]" || ch === ")") out.push(ch)
  }

  return {tokens: out, inBlockComment}
}

function structuralIndentTokens(line: string, inBlockComment: boolean): {tokens: Array<"{" | "[" | "}" | "]">; inBlockComment: boolean} {
  const out: Array<"{" | "[" | "}" | "]"> = []
  let quote: "\"" | "'" | "`" | null = null
  let escaped = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (quote !== null) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === "\\") {
        escaped = true
        continue
      }
      if (ch === quote) quote = null
      continue
    }

    if (ch === "/" && next === "/") break
    if (ch === "/" && next === "*") {
      const end = line.indexOf("*/", i + 2)
      if (end < 0) {
        inBlockComment = true
        break
      }
      i = end + 1
      continue
    }

    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch
      continue
    }
    if (ch === "{" || ch === "[" || ch === "}" || ch === "]") out.push(ch)
  }

  return {tokens: out, inBlockComment}
}

export function editorIndentGuideRangesForLines(lines: readonly string[]): EditorIndentGuideRange[] {
  return mergeIndentGuideRanges([
    ...structuralIndentGuideRanges(lines),
    ...leadingWhitespaceIndentGuideRanges(lines),
  ])
}

function structuralIndentGuideRanges(lines: readonly string[]): EditorIndentGuideRange[] {
  const ranges: EditorIndentGuideRange[] = []
  const stack: EditorIndentGuideStackItem[] = []
  let inBlockComment = false

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? ""
    const scan = structuralIndentTokens(line, inBlockComment)
    inBlockComment = scan.inBlockComment
    for (const token of scan.tokens) {
      if (token === "{" || token === "[") {
        const openerIndent = leadingIndentColumns(line, INDENT_GUIDE_STEP_COLUMNS)
        stack.push({
          column: Math.max(0, openerIndent),
          startLine: lineIndex + 1,
          opener: token,
        })
        continue
      }

      const opener = token === "}" ? "{" : "["
      for (let i = stack.length - 1; i >= 0; i--) {
        const item = stack[i]!
        if (item.opener !== opener) continue
        stack.splice(i, 1)
        if (item.startLine <= lineIndex) ranges.push({column: item.column, startLine: item.startLine, endLine: lineIndex, includesEndLine: false})
        break
      }
    }
  }

  const endLine = Math.max(0, lines.length - 1)
  for (const item of stack) {
    if (item.startLine <= endLine) ranges.push({column: item.column, startLine: item.startLine, endLine, includesEndLine: true})
  }
  return ranges
}

function leadingWhitespaceIndentGuideRanges(lines: readonly string[]): EditorIndentGuideRange[] {
  const ranges: EditorIndentGuideRange[] = []
  const active = new Map<number, EditorIndentGuideRange>()

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? ""
    if (line.trim().length === 0) {
      for (const range of active.values()) range.endLine = lineIndex
      continue
    }

    const indent = leadingIndentColumns(line, INDENT_GUIDE_STEP_COLUMNS)
    const columns = new Set<number>()
    for (let column = INDENT_GUIDE_STEP_COLUMNS; column <= indent; column += INDENT_GUIDE_STEP_COLUMNS) {
      columns.add(column)
    }

    for (const [column, range] of [...active]) {
      if (columns.has(column)) {
        range.endLine = lineIndex
        continue
      }
      if (range.startLine <= range.endLine) ranges.push({...range})
      active.delete(column)
    }

    for (const column of columns) {
      if (active.has(column)) continue
      active.set(column, {column, startLine: lineIndex, endLine: lineIndex, includesEndLine: true})
    }
  }

  for (const range of active.values()) {
    if (range.startLine <= range.endLine) ranges.push({...range})
  }
  return ranges
}

function mergeIndentGuideRanges(ranges: readonly EditorIndentGuideRange[]): EditorIndentGuideRange[] {
  const sorted = [...ranges].sort((a, b) => a.column - b.column || a.startLine - b.startLine || a.endLine - b.endLine)
  const out: EditorIndentGuideRange[] = []
  for (const range of sorted) {
    const prev = out[out.length - 1]
    if (prev !== undefined && prev.column === range.column && range.startLine <= prev.endLine + 1) {
      prev.endLine = Math.max(prev.endLine, range.endLine)
      prev.includesEndLine = prev.includesEndLine || range.includesEndLine
      continue
    }
    out.push({...range})
  }
  return out
}

function pointInRect(x: number, y: number, rect: {x: number; y: number; w: number; h: number}): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

function isSecondaryPointer(event: MouseEvent): boolean {
  return event.button === 2 || (event.ctrlKey && event.button === 0)
}

function isAdditiveSelectionPointer(event: MouseEvent): boolean {
  return event.altKey || event.metaKey
}

function copySelectionRange(range: TextSelectionRange): TextSelectionRange {
  return {
    start: {...range.start},
    end: {...range.end},
  }
}

function sameSelectionRange(a: TextSelectionRange, b: TextSelectionRange): boolean {
  return sameTextPosition(a.start, b.start) && sameTextPosition(a.end, b.end)
}

function isEditorWordChar(ch: string): boolean {
  return /[\p{L}\p{N}_$]/u.test(ch)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function easeOutCubic(value: number): number {
  const t = clamp01(value)
  return 1 - Math.pow(1 - t, 3)
}

function introAnimSeed(lineIndex: number, absCol: number): number {
  const raw = Math.sin((lineIndex + 1) * 127.1 + (absCol + 1) * 311.7) * 43758.5453
  return raw - Math.floor(raw)
}

/**
 * Парсит CSS color literal для swatch. Невалидный цвет → null.
 * Не выбрасывает — вызывается на каждом render-кадре.
 */
function parseCssColor(text: string): Color | null {
  return parseHexColor(text) ?? parseRgbColor(text)
}

function parseHexColor(text: string): Color | null {
  const raw = text.trim()
  if (raw.length === 0 || raw[0] !== "#") return null
  const hex = raw.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null
  const n = hex.length
  const dup = (c: string): number => parseInt(c + c, 16) / 255
  const hh = (a: string, b: string): number => parseInt(a + b, 16) / 255
  if (n === 3) return new Color(dup(hex[0]!), dup(hex[1]!), dup(hex[2]!), 1)
  if (n === 4) return new Color(dup(hex[0]!), dup(hex[1]!), dup(hex[2]!), dup(hex[3]!))
  if (n === 6) return new Color(hh(hex[0]!, hex[1]!), hh(hex[2]!, hex[3]!), hh(hex[4]!, hex[5]!), 1)
  if (n === 8) return new Color(hh(hex[0]!, hex[1]!), hh(hex[2]!, hex[3]!), hh(hex[4]!, hex[5]!), hh(hex[6]!, hex[7]!))
  return null
}

function parseRgbColor(text: string): Color | null {
  const match = /^rgba?\((.*)\)$/i.exec(text.trim())
  if (match === null) return null
  const parts = parseRgbColorParts(match[1] ?? "")
  if (parts.length < 3 || parts.length > 4) return null
  const r = parseRgbChannel(parts[0]!)
  const g = parseRgbChannel(parts[1]!)
  const b = parseRgbChannel(parts[2]!)
  const a = parts[3] === undefined ? 1 : parseAlphaChannel(parts[3])
  if (r === null || g === null || b === null || a === null) return null
  return new Color(r, g, b, a)
}

function parseRgbColorParts(body: string): string[] {
  const raw = body.trim()
  if (raw.length === 0) return []
  if (raw.includes(",")) return raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0)
  const [channels, alpha] = raw.split("/", 2).map((part) => part.trim())
  const parts = (channels ?? "").split(/\s+/).filter((part) => part.length > 0)
  if (alpha !== undefined && alpha.length > 0) parts.push(alpha)
  return parts
}

function parseRgbChannel(text: string): number | null {
  const value = parseCssNumber(text)
  if (value === null) return null
  return value.percent ? clamp01(value.value / 100) : clamp01(value.value / 255)
}

function parseAlphaChannel(text: string): number | null {
  const value = parseCssNumber(text)
  if (value === null) return null
  return value.percent ? clamp01(value.value / 100) : clamp01(value.value)
}

function parseCssNumber(text: string): {value: number; percent: boolean} | null {
  const raw = text.trim()
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(%?)$/.exec(raw)
  if (match === null) return null
  const value = Number.parseFloat(match[1]!)
  if (!Number.isFinite(value)) return null
  return {value, percent: match[2] === "%"}
}
