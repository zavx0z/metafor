/**
 * EditorPane — редактируемая текстовая pane с подсветкой синтаксиса.
 *
 * По мотивам SourcePane из @metafor/bun-debug, но c input handling:
 *  • cursor (line, col) с отрисовкой
 *  • Backspace/Delete/Enter/Arrow-keys/Home/End/PageUp-Down
 *  • Printable chars вставка
 *  • Tab → 2 пробела
 *  • Cmd/Ctrl+A — select-all
 *  • Shift+arrows / mouse drag — text selection
 *  • Cmd/Ctrl+Z / Cmd/Ctrl+Y — undo/redo (linear history)
 *  • Click → курсор по координатам
 *  • Подсветка через pluggable tokenize: (lines) => tokens
 *  • onChange колбэк
 *
 * Anim/glow эффекты — отдельно, в future EditorAnimatedPane.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {UiSurface, Z, palette, radii} from "@metafor/elements"
import {Button, autoButtonWidth} from "../Button.ts"
import {ScrollListState} from "../scroll-list.ts"
import {Scrollbar as scrollbar} from "../Scrollbar.ts"
import {resolveLanguageHighlighter} from "./highlighter.ts"
import {
  createEditorTokenMaterials,
  renderEditorTokenizedLine,
  type EditorTokenMaterialMap,
} from "./token-renderer.ts"
import type {EditorToken, EditorTokens, EditorTokenize, LanguageHighlighter} from "./tokens.ts"

export type EditorOpts = {
  /** Заголовок над редактором. */
  title?: string
  /** Колбэк на любое изменение текста (буфер «грязный»). */
  onChange?: (text: string) => void
  /** Колбэк на явное сохранение (Cmd/Ctrl+S или editor.save()). */
  onSave?: (text: string) => void
  /** Колбэк на copy/cut из floating-menu выделения. */
  onSelectionClipboard?: (ok: boolean, action: "copy" | "cut") => void
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
}

const HEADER_H_PX = 28
const PAD_TOP_PX = 34
const PAD_LEFT_PX = 8
const PAD_RIGHT_PX = 8
const PAD_BOTTOM_PX = 6
const GUTTER_MIN_PX = 44
const GUTTER_LEFT_PAD_PX = 6
const GUTTER_RIGHT_PAD_PX = 8
const CODE_LEFT_PAD_PX = 8
const SCROLLBAR_W = 4
const HISTORY_LIMIT = 200
const WHEEL_SPEED = 1.55
const WHEEL_START_BOOST_PX = 18
const SELECTION_FILL = new Color(92 / 255, 155 / 255, 255 / 255, 0.34)
const SELECTION_MENU_BG = new Color(6 / 255, 12 / 255, 21 / 255, 0.96)
const SELECTION_MENU_BORDER = new Color(111 / 255, 211 / 255, 255 / 255, 0.32)
const SELECTION_MENU_Z = Z.ELEMENT_RULE + 0.005

type CursorPos = {line: number; col: number}
type SelectionRange = {start: CursorPos; end: CursorPos}
type Snapshot = {lines: string[]; cline: number; ccol: number; selectionAnchor: CursorPos | null; selectionFocus: CursorPos | null}
type ColumnHitBias = "nearest" | "floor" | "ceil"
type SelectionMenuAction = "copy" | "cut" | "selectAll"
type SelectionMenuRect = {x: number; y: number; w: number; h: number; anchorX: number}

const SELECTION_MENU_ITEMS: readonly {action: SelectionMenuAction; label: string}[] = [
  {action: "copy", label: "Copy"},
  {action: "cut", label: "Cut"},
  {action: "selectAll", label: "Select all"},
]

export class EditorPane extends UiSurface {
  #lines: string[] = [""]
  #tokens: EditorTokens | null = null
  #cline = 0
  #ccol = 0
  #selectionAnchor: CursorPos | null = null
  #selectionFocus: CursorPos | null = null
  #dragSelecting = false
  #dragExtendsSelection = false
  #dragAnchorLocalX = 0
  #dragAnchorLocalY = 0
  #selectionMenuOpen = false
  #title: string
  #fontPx: number
  #linePx: number
  #titleFontPx: number
  #tokenize: EditorTokenize | undefined
  #onChange: ((text: string) => void) | undefined
  #onSave: ((text: string) => void) | undefined
  #onSelectionClipboard: ((ok: boolean, action: "copy" | "cut") => void) | undefined
  readonly #list: ScrollListState
  #cursorVisible = true
  #history: Snapshot[] = []
  #future: Snapshot[] = []
  /** Кэшированная ширина одного «эталонного» глифа (M). Сбрасывается при resize/setText. */
  #charWidth = 0
  /** Горизонтальный скролл кода в px (для длинных строк / base64). */
  #hScroll = 0
  /** Для длинных строк (≥ this porog) считаем позицию курсора через #charWidth — O(1). */
  static readonly #LONG_LINE_THRESHOLD = 500

  readonly #titleMaterial = new TextMaterial({color: palette.cyan})
  readonly #lineMaterial = new TextMaterial({color: palette.text})
  readonly #gutterMaterial = new TextMaterial({color: palette.muted})
  readonly #gutterCurMaterial = new TextMaterial({color: palette.cyan})
  readonly #tokenMaterials: EditorTokenMaterialMap

  constructor(opts: EditorOpts = {}) {
    super({bgColor: palette.bgCode, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "EditorPane"
    this.#title = opts.title ?? "Editor"
    this.#fontPx = opts.fontPx ?? 13
    this.#linePx = opts.linePx ?? 18
    this.#titleFontPx = opts.titleFontPx ?? 13
    this.#tokenize = opts.tokenize ?? resolveEditorTokenize(opts)
    this.#onChange = opts.onChange
    this.#onSave = opts.onSave
    this.#onSelectionClipboard = opts.onSelectionClipboard
    this.#list = new ScrollListState({onChange: () => this.requestRender()})
    this.#tokenMaterials = createEditorTokenMaterials()
    this.#refreshTokens()
  }

  // ────────── public API ──────────

  setText(text: string): void {
    this.#lines = text.length === 0 ? [""] : text.split("\n")
    this.#cline = Math.min(this.#cline, this.#lines.length - 1)
    this.#ccol = Math.min(this.#ccol, this.#lines[this.#cline]!.length)
    this.#clearSelectionState()
    this.#hScroll = 0
    this.#history = []
    this.#future = []
    this.#refreshTokens()
    this.requestRender()
  }

  /** Смещение по X (px) для символа. Редактор не запускает render-loop, поэтому без анимации. */
  #animOffsetFor(absCol: number): number {
    void absCol
    return 0
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
    this.#tokens = tokens
    this.requestRender()
  }

  setLanguage(input: LanguageHighlighter | {languageId?: string; path?: string}): void {
    const highlighter = "tokenize" in input ? input : resolveLanguageHighlighter(input)
    this.#tokenize = highlighter.tokenize
    this.#refreshTokens()
    this.requestRender()
  }

  /** Position cursor at (line, col), clamping to bounds. Scrolls into view. */
  setCursor(line: number, col: number): void {
    this.#setCursorPosition({line, col}, {extendSelection: false})
  }

  setSelection(anchorLine: number, anchorCol: number, focusLine: number, focusCol: number): void {
    const anchor = this.#clampPosition({line: anchorLine, col: anchorCol})
    const focus = this.#clampPosition({line: focusLine, col: focusCol})
    this.#selectionAnchor = anchor
    this.#selectionFocus = focus
    this.#cline = focus.line
    this.#ccol = focus.col
    this.#scrollCursorIntoView()
    this.requestRender()
  }

  clearSelection(): void {
    this.#clearSelectionState()
    this.requestRender()
  }

  setSelectionMenuOpen(open: boolean): void {
    this.#setSelectionMenuOpen(open)
  }

  hasSelection(): boolean {
    return this.#selectionRange() !== null
  }

  getSelectedText(): string {
    return this.#selectedText() ?? ""
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
    if (this.#charWidth > 0) return this.#charWidth
    if (this.font === null) return this.#fallbackCharWidth()
    // measureText("M") даёт честную ширину advance + letter-spacing 5%.
    this.#charWidth = Math.max(this.#fallbackCharWidth(), this.measureText("M", this.#fontPx))
    return this.#charWidth
  }

  #fallbackCharWidth(): number {
    return Math.max(1, this.#fontPx * this.pageScaleFactor * 0.62)
  }

  /**
   * X-смещение колонки от начала строки. Для коротких строк — точно (через
   * measureText). Для длинных (base64, минифицированный код) — монохромный
   * approx: charWidth * col (O(1)).
   */
  #colToPx(line: string, col: number): number {
    if (col <= 0) return 0
    const c = Math.min(col, line.length)
    if (this.font !== null && line.length < EditorPane.#LONG_LINE_THRESHOLD) {
      return this.measureText(line.slice(0, c), this.#fontPx)
    }
    return c * this.#getCharWidth()
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
    if (a.line !== b.line) return a.line - b.line
    return a.col - b.col
  }

  #clearSelectionState(): void {
    this.#selectionAnchor = null
    this.#selectionFocus = null
    this.#dragSelecting = false
    this.#dragExtendsSelection = false
  }

  #setSelectionMenuOpen(open: boolean): void {
    if (this.#selectionMenuOpen === open) return
    this.#selectionMenuOpen = open
    this.requestRender()
  }

  #selectionRange(): SelectionRange | null {
    if (this.#selectionAnchor === null || this.#selectionFocus === null) return null
    if (this.#comparePosition(this.#selectionAnchor, this.#selectionFocus) === 0) return null
    if (this.#comparePosition(this.#selectionAnchor, this.#selectionFocus) < 0) {
      return {start: this.#selectionAnchor, end: this.#selectionFocus}
    }
    return {start: this.#selectionFocus, end: this.#selectionAnchor}
  }

  #selectedText(): string | null {
    const range = this.#selectionRange()
    if (range === null) return null
    const {start, end} = range
    if (start.line === end.line) {
      return (this.#lines[start.line] ?? "").slice(start.col, end.col)
    }
    const parts: string[] = []
    parts.push((this.#lines[start.line] ?? "").slice(start.col))
    for (let line = start.line + 1; line < end.line; line++) {
      parts.push(this.#lines[line] ?? "")
    }
    parts.push((this.#lines[end.line] ?? "").slice(0, end.col))
    return parts.join("\n")
  }

  #setCursorPosition(pos: CursorPos, opts: {extendSelection: boolean}): void {
    const next = this.#clampPosition(pos)
    if (opts.extendSelection) {
      if (this.#selectionAnchor === null) this.#selectionAnchor = this.#currentPos()
      this.#selectionFocus = next
    } else {
      this.#clearSelectionState()
    }
    this.#cline = next.line
    this.#ccol = next.col
    this.#scrollCursorIntoView()
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

  #lineFromLocalY(localY: number): number | null {
    if (localY < PAD_TOP_PX) return null
    const visible = this.#visibleLineCount()
    this.#list.clamp(this.#lines.length, visible)
    const scroll = this.#list.scroll
    const startIdx = Math.floor(scroll)
    const subPx = (scroll - startIdx) * this.#linePx
    const rowFloat = (localY - PAD_TOP_PX + subPx) / this.#linePx
    return Math.max(0, Math.min(this.#lines.length - 1, startIdx + Math.floor(rowFloat)))
  }

  #codeStartX(): number {
    return PAD_LEFT_PX + this.#gutterWidthPx(this.#lines.length) + CODE_LEFT_PAD_PX
  }

  #colAtLocalX(line: string, localX: number, bias: ColumnHitBias): number {
    const xInCode = Math.max(0, localX - this.#codeStartX() + this.#hScroll)
    return this.#colAtX(line, xInCode, bias)
  }

  #positionFromLocal(localX: number, localY: number, bias: ColumnHitBias = "nearest"): CursorPos | null {
    const lineIdx = this.#lineFromLocalY(localY)
    if (lineIdx === null) return null
    const col = this.#colAtLocalX(this.#lines[lineIdx]!, localX, bias)
    return {line: lineIdx, col}
  }

  // ────────── input ──────────

  onInputText(text: string): void {
    this.insertText(text)
  }

  onKey(event: KeyboardEvent): void {
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

  // ────────── clipboard ──────────

  async #paste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText()
      if (text.length === 0) return
      this.#insertText(text)
    } catch (err) {
      console.warn("clipboard paste failed:", err)
    }
  }

  async #copySelectionOrCurrentLine(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(this.#selectedText() ?? (this.#lines[this.#cline] ?? ""))
      return true
    } catch (err) {
      console.warn("clipboard copy failed:", err)
      return false
    }
  }

  async #cutSelectionOrCurrentLine(): Promise<boolean> {
    try {
      const selected = this.#selectedText()
      if (selected !== null) {
        await navigator.clipboard.writeText(selected)
        this.#deleteSelection()
      } else {
        await navigator.clipboard.writeText((this.#lines[this.#cline] ?? "") + "\n")
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
    } catch (err) {
      console.warn("clipboard cut failed:", err)
      return false
    }
  }

  async #copySelectedTextToClipboard(): Promise<boolean> {
    try {
      const selected = this.#selectedText()
      if (selected === null) return false
      await navigator.clipboard.writeText(selected)
      return true
    } catch (err) {
      console.warn("clipboard copy failed:", err)
      return false
    }
  }

  async #cutSelectedTextToClipboard(): Promise<boolean> {
    try {
      const selected = this.#selectedText()
      if (selected === null) return false
      await navigator.clipboard.writeText(selected)
      this.#deleteSelection()
      return true
    } catch (err) {
      console.warn("clipboard cut failed:", err)
      return false
    }
  }

  // ────────── word jump ──────────

  #wordJump(direction: 1 | -1, extendSelection = false): void {
    const line = this.#lines[this.#cline]!
    const isWord = (ch: string): boolean => /[\w$]/.test(ch)
    let col = this.#ccol
    if (direction === 1) {
      while (col < line.length && !isWord(line[col]!)) col++
      while (col < line.length && isWord(line[col]!)) col++
      if (col === this.#ccol && this.#cline < this.#lines.length - 1) {
        this.#setCursorPosition({line: this.#cline + 1, col: 0}, {extendSelection})
        return
      }
    } else {
      while (col > 0 && !isWord(line[col - 1]!)) col--
      while (col > 0 && isWord(line[col - 1]!)) col--
      if (col === this.#ccol && this.#cline > 0) {
        this.#setCursorPosition({line: this.#cline - 1, col: this.#lines[this.#cline - 1]!.length}, {extendSelection})
        return
      }
    }
    this.#setCursorPosition({line: this.#cline, col}, {extendSelection})
  }

  override onWheel(event: WheelEvent): void {
    // Shift + wheel → горизонтальная прокрутка кода
    if (event.shiftKey) {
      event.preventDefault()
      const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX
      this.#hScroll = Math.max(0, this.#hScroll + delta * WHEEL_SPEED)
      this.requestRender()
      return
    }
    const visible = this.#visibleLineCount()
    this.#list.applyWheel(event, this.#linePx, this.#lines.length, visible, {
      speed: WHEEL_SPEED,
      startBoostPx: WHEEL_START_BOOST_PX,
    })
  }

  override onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    const menuRect = this.#selectionMenuRect()
    if (menuRect !== null && pointInRect(localX, localY, menuRect)) {
      super.onPointerDown(_event, localX, localY)
      return
    }
    const pos = this.#positionFromLocal(localX, localY)
    if (pos === null) return
    this.#dragSelecting = true
    this.#dragExtendsSelection = _event.shiftKey
    this.#dragAnchorLocalX = localX
    this.#dragAnchorLocalY = localY
    if (_event.shiftKey) {
      this.#setCursorPosition(pos, {extendSelection: true})
    } else {
      const next = this.#clampPosition(pos)
      this.#selectionAnchor = next
      this.#selectionFocus = next
      this.#cline = next.line
      this.#ccol = next.col
      this.#scrollCursorIntoView()
      this.requestRender()
    }
    this.#pingCursor()
  }

  override onPointerMove(_event: MouseEvent, localX: number, localY: number): void {
    if (this.#selectionMenuOpen || this.pressedHit !== null) {
      const menuRect = this.#selectionMenuRect()
      super.onPointerMove(_event, localX, localY)
      if (this.pressedHit !== null || (menuRect !== null && pointInRect(localX, localY, menuRect))) return
    }
    if (!this.#dragSelecting) return
    this.#updateDragSelection(localX, localY)
  }

  #updateDragSelection(localX: number, localY: number): void {
    const dragDistance = Math.abs(localX - this.#dragAnchorLocalX) + Math.abs(localY - this.#dragAnchorLocalY)
    if (dragDistance < 0.5) return
    const anchorLine = this.#lineFromLocalY(this.#dragAnchorLocalY)
    const focusLine = this.#lineFromLocalY(localY)
    if (!this.#dragExtendsSelection && anchorLine !== null && focusLine === anchorLine) {
      const lineText = this.#lines[anchorLine] ?? ""
      const forward = localX >= this.#dragAnchorLocalX
      let startCol = this.#colAtLocalX(lineText, Math.min(this.#dragAnchorLocalX, localX), "floor")
      let endCol = this.#colAtLocalX(lineText, Math.max(this.#dragAnchorLocalX, localX), "ceil")
      if (startCol === endCol && lineText.length > 0) {
        if (forward) endCol = Math.min(lineText.length, startCol + 1)
        else startCol = Math.max(0, endCol - 1)
      }
      this.#selectionAnchor = {line: anchorLine, col: forward ? startCol : endCol}
      this.#selectionFocus = {line: anchorLine, col: forward ? endCol : startCol}
      this.#cline = this.#selectionFocus.line
      this.#ccol = this.#selectionFocus.col
      this.#scrollCursorIntoView()
      this.#pingCursor()
      this.requestRender()
      return
    }
    const forward = localY > this.#dragAnchorLocalY + this.#linePx / 2
      ? true
      : localY < this.#dragAnchorLocalY - this.#linePx / 2
        ? false
        : localX >= this.#dragAnchorLocalX
    const focusBias: ColumnHitBias = forward ? "ceil" : "floor"
    const pos = this.#positionFromLocal(localX, localY, focusBias)
    if (pos === null) return
    if (this.#dragExtendsSelection) {
      if (this.#selectionAnchor === null) this.#selectionAnchor = this.#currentPos()
    } else {
      const anchorBias: ColumnHitBias = forward ? "floor" : "ceil"
      const anchor = this.#positionFromLocal(this.#dragAnchorLocalX, this.#dragAnchorLocalY, anchorBias)
      if (anchor !== null) this.#selectionAnchor = this.#clampPosition(anchor)
    }
    if (!this.#dragExtendsSelection && this.#selectionAnchor !== null && pos.line === this.#selectionAnchor.line) {
      const deltaCols = Math.max(1, Math.ceil(Math.abs(localX - this.#dragAnchorLocalX) / this.#getCharWidth()))
      const lineLen = this.#lines[this.#selectionAnchor.line]?.length ?? 0
      this.#selectionFocus = {
        line: this.#selectionAnchor.line,
        col: forward
          ? Math.min(lineLen, this.#selectionAnchor.col + deltaCols)
          : Math.max(0, this.#selectionAnchor.col - deltaCols),
      }
    } else {
      this.#selectionFocus = this.#clampPosition(pos)
    }
    this.#cline = this.#selectionFocus.line
    this.#ccol = this.#selectionFocus.col
    this.#scrollCursorIntoView()
    this.#pingCursor()
    this.requestRender()
  }

  override onPointerUp(_event: MouseEvent, localX: number, localY: number): void {
    if (this.pressedHit !== null) {
      super.onPointerUp(_event, localX, localY)
      return
    }
    if (this.#dragSelecting) this.#updateDragSelection(localX, localY)
    this.#dragSelecting = false
    if (this.#selectionRange() === null) this.#clearSelectionState()
    this.requestRender()
  }

  onActivate(): void {
    this.#cursorVisible = true
    this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate?.()
    this.#dragSelecting = false
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
    this.#selectionAnchor = {line: 0, col: 0}
    this.#selectionFocus = {line: endLine, col: endCol}
    this.#cline = endLine
    this.#ccol = endCol
    this.#scrollCursorIntoView()
    this.requestRender()
  }

  #insertText(s: string): void {
    if (s.length === 0) return
    this.#pushHistory()
    if (!this.#replaceSelectionWith(s)) this.#insertAtCursor(s)
    this.#afterEdit()
  }

  #insertNewline(): void {
    this.#insertText("\n")
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
    this.#refreshTokens()
    this.#scrollCursorIntoView()
    this.requestRender()
    this.#onChange?.(this.getText())
  }

  #refreshTokens(): void {
    if (this.#tokenize === undefined) {
      this.#tokens = null
      return
    }
    try {
      this.#tokens = this.#tokenize(this.#lines)
    } catch {
      this.#tokens = null
    }
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
      const newLine = Math.max(0, Math.min(this.#lines.length - 1, next.line + dLine))
      next = {line: newLine, col: Math.min(next.col, this.#lines[newLine]!.length)}
    }
    this.#setCursorPosition(next, {extendSelection})
  }

  #movePage(direction: 1 | -1, extendSelection = false): void {
    const visible = this.#visibleLineCount()
    const newLine = Math.max(0, Math.min(this.#lines.length - 1, this.#cline + direction * visible))
    this.#setCursorPosition({line: newLine, col: Math.min(this.#ccol, this.#lines[newLine]!.length)}, {extendSelection})
  }

  #scrollCursorIntoView(): void {
    // Вертикальный скролл
    const visible = this.#visibleLineCount()
    const top = Math.floor(this.#list.scroll)
    const bottom = top + visible - 1
    if (this.#cline < top) this.#list.jumpTo(this.#cline)
    else if (this.#cline > bottom) this.#list.jumpTo(this.#cline - visible + 1)
    // Горизонтальный
    const lineText = this.#lines[this.#cline] ?? ""
    const cursorPx = this.#colToPx(lineText, this.#ccol)
    const codeMaxPx = this.#codeMaxPx()
    const margin = 40
    if (cursorPx - this.#hScroll < margin) {
      this.#hScroll = Math.max(0, cursorPx - margin)
    } else if (cursorPx - this.#hScroll > codeMaxPx - margin) {
      this.#hScroll = Math.max(0, cursorPx - codeMaxPx + margin)
    }
  }

  #codeMaxPx(): number {
    const gutter = this.#gutterWidthPx(this.#lines.length)
    const contentW = Math.max(1, this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX - SCROLLBAR_W - 4)
    return Math.max(1, contentW - gutter - CODE_LEFT_PAD_PX - 8)
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
    const start = Math.max(0, Math.floor(this.#hScroll / cw) - padCols)
    const end = Math.min(line.length, Math.ceil((this.#hScroll + codeMaxPx) / cw) + padCols)
    const startPx = start * cw
    return {start, end, startPx}
  }

  #colAtX(line: string, x: number, bias: ColumnHitBias = "nearest"): number {
    if (x <= 0) return 0
    if (this.font !== null && line.length < EditorPane.#LONG_LINE_THRESHOLD) {
      if (bias === "floor") return this.#colAtXFloor(line, x)
      if (bias === "ceil") return this.#colAtXCeil(line, x)
      const floor = this.#colAtXFloor(line, x)
      const ceil = Math.min(line.length, floor + 1)
      const floorPx = this.#colToPx(line, floor)
      const ceilPx = this.#colToPx(line, ceil)
      return Math.abs(x - floorPx) <= Math.abs(ceilPx - x) ? floor : ceil
    }
    const cw = this.#getCharWidth()
    const raw = x / cw
    const col = bias === "floor" ? Math.floor(raw) : bias === "ceil" ? Math.ceil(raw) : Math.round(raw)
    return Math.max(0, Math.min(line.length, col))
  }

  #colAtXFloor(line: string, x: number): number {
    let lo = 0
    let hi = line.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2)
      if (this.#colToPx(line, mid) <= x) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  #colAtXCeil(line: string, x: number): number {
    let lo = 0
    let hi = line.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (this.#colToPx(line, mid) < x) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  // ────────── rendering ──────────

  #pingCursor(): void {
    this.#cursorVisible = true
  }

  override dispose(): void {
    super.dispose?.()
  }

  protected render(): void {
    // Header
    this.drawText(this.#title, 16, 8, {
      fontPx: this.#titleFontPx,
      material: this.#titleMaterial,
      maxWidthPx: this.rectW - 32,
    })
    this.drawRect(8, HEADER_H_PX, Math.max(1, this.rectW - 16), 1, palette.borderDim, Z.SEPARATOR)

    const total = this.#lines.length
    const visible = this.#visibleLineCount()
    this.#list.clamp(total, visible)
    const scroll = this.#list.scroll
    const startIdx = Math.floor(scroll)
    const subPx = (scroll - startIdx) * this.#linePx

    const gutter = this.#gutterWidthPx(total)
    const contentW = Math.max(1, this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX - SCROLLBAR_W - 4)
    const contentH = Math.max(1, this.rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    const codeMaxPx = Math.max(1, contentW - gutter - CODE_LEFT_PAD_PX - 8)

    // Vertical rule после gutter
    this.drawRect(PAD_LEFT_PX + gutter, PAD_TOP_PX, 1, contentH, palette.borderDim, Z.SEPARATOR)

    this.pushClip(PAD_LEFT_PX, PAD_TOP_PX, contentW, contentH)

    // Cursor row highlight (бледный)
    const cRowIdx = this.#cline - startIdx
    if (cRowIdx >= -1 && cRowIdx <= visible) {
      const hY = PAD_TOP_PX + cRowIdx * this.#linePx - subPx
      this.drawRoundedRect(PAD_LEFT_PX, hY, contentW, this.#linePx, {
        radius: 4,
        fill: palette.bg,
        z: Z.ELEMENT,
      })
    }

    // Видимые строки
    const renderCount = visible + 1
    for (let i = 0; i < renderCount; i++) {
      const lineIndex = startIdx + i
      if (lineIndex >= total) break
      if (lineIndex < 0) continue
      const rowY = PAD_TOP_PX + i * this.#linePx - subPx
      if (rowY + this.#linePx < PAD_TOP_PX - 1) continue
      if (rowY > PAD_TOP_PX + contentH + 1) break

      const lineNo = lineIndex + 1
      const isCurrent = lineIndex === this.#cline
      const numStr = String(lineNo)
      const numW = this.measureText(numStr, this.#fontPx)
      const numX = Math.max(
        PAD_LEFT_PX + GUTTER_LEFT_PAD_PX,
        PAD_LEFT_PX + gutter - GUTTER_RIGHT_PAD_PX - numW,
      )
      this.drawText(numStr, numX, rowY + (this.#linePx - this.#fontPx) / 2, {
        fontPx: this.#fontPx,
        material: isCurrent ? this.#gutterCurMaterial : this.#gutterMaterial,
        maxWidthPx: gutter - GUTTER_LEFT_PAD_PX - GUTTER_RIGHT_PAD_PX,
      })

      const lineText = this.#lines[lineIndex] ?? ""
      const codeStartX = PAD_LEFT_PX + gutter + CODE_LEFT_PAD_PX
      const textY = rowY + (this.#linePx - this.#fontPx) / 2
      this.#renderSelectionForLine(lineIndex, lineText, codeStartX, rowY, codeMaxPx)
      if (lineText.length > 0) {
        const slice = this.#visibleSlice(lineText)
        const visText = slice.end > slice.start ? lineText.slice(slice.start, slice.end) : ""
        if (visText.length > 0) {
          const drawX = codeStartX - this.#hScroll + slice.startPx
          const lineTokens = this.#tokens?.[lineIndex]
          // Фильтруем токены в видимом диапазоне и сдвигаем индексы.
          const visTokens: EditorToken[] = []
          if (lineTokens !== undefined) {
            for (const t of lineTokens) {
              if (t.e <= slice.start || t.s >= slice.end) continue
              const token: EditorToken = {
                s: Math.max(0, t.s - slice.start),
                e: Math.min(slice.end - slice.start, t.e - slice.start),
                c: t.c,
              }
              if (t.bg !== undefined) token.bg = t.bg
              visTokens.push(token)
            }
          }
          // maxWidthPx-clamp на drawText не используем — обрезка через pushClip.
          // Передаём заведомо большую ширину, чтобы не было ellipsis "..." внутри слайса.
          const maxW = codeMaxPx + this.#hScroll + 1000
          if (visTokens.length > 0) {
            this.#renderTokenized(visText, visTokens, drawX, textY, maxW, slice.start)
          } else {
            const animOffset = this.#animOffsetFor(slice.start)
            if (isFinite(animOffset)) {
              this.drawText(visText, drawX + animOffset, textY, {
                fontPx: this.#fontPx,
                material: this.#lineMaterial,
                maxWidthPx: maxW,
              })
            }
          }
        }
      }

      // Cursor
      if (isCurrent) {
        if (this.#cursorVisible) {
          const cursorAbsX = this.#colToPx(lineText, this.#ccol)
          const curX = codeStartX + cursorAbsX - this.#hScroll
          if (curX >= codeStartX - 1 && curX <= codeStartX + codeMaxPx + 1) {
            this.drawRect(curX, textY - 1, 1.5, this.#fontPx + 2, palette.cyan, Z.ELEMENT_RULE)
          }
        }
      }
    }

    this.popClip()

    if (total > visible) {
      scrollbar(this, this.rectW - PAD_RIGHT_PX - SCROLLBAR_W, PAD_TOP_PX, contentH, {
        offset: scroll,
        visible,
        total,
        trackWidth: SCROLLBAR_W,
      })
    }

    this.#renderSelectionMenu()
  }

  #renderTokenized(text: string, tokens: EditorToken[], startX: number, y: number, maxPx: number, sliceStart: number): void {
    renderEditorTokenizedLine({
      pane: this,
      text,
      tokens,
      startX,
      y,
      fontPx: this.#fontPx,
      maxPx,
      materials: this.#tokenMaterials,
      fallbackMaterial: this.#lineMaterial,
      sliceStart,
      animOffsetFor: (absoluteColumn) => this.#animOffsetFor(absoluteColumn),
      drawTokenBackground: (x, bgY, w, h, bg) => {
        const color = parseHexColor(bg)
        if (color !== null) {
          this.drawRect(x, bgY, w, h, palette.bgInput, Z.CONTAINER)
          this.drawRect(x, bgY, w, h, color, Z.ELEMENT)
        }
      },
    })
  }

  #renderSelectionForLine(lineIndex: number, lineText: string, codeStartX: number, rowY: number, codeMaxPx: number): void {
    const range = this.#selectionRange()
    if (range === null) return
    if (lineIndex < range.start.line || lineIndex > range.end.line) return

    const startCol = lineIndex === range.start.line ? range.start.col : 0
    const endCol = lineIndex === range.end.line ? range.end.col : lineText.length
    let x1 = codeStartX + this.#colToPx(lineText, startCol) - this.#hScroll
    let x2 = codeStartX + this.#colToPx(lineText, endCol) - this.#hScroll
    if (lineIndex < range.end.line && endCol === lineText.length) x2 += Math.max(5, this.#getCharWidth() * 0.65)
    if (lineText.length === 0 && lineIndex > range.start.line && lineIndex < range.end.line) x2 = x1 + Math.max(5, this.#getCharWidth() * 0.65)

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

    const total = this.#lines.length
    const visible = this.#visibleLineCount()
    this.#list.clamp(total, visible)
    const scroll = this.#list.scroll
    const startIdx = Math.floor(scroll)
    const subPx = (scroll - startIdx) * this.#linePx
    const visibleStart = Math.max(0, startIdx)
    const visibleEnd = Math.min(total - 1, startIdx + visible)
    const lineIndex = Math.max(range.start.line, visibleStart)
    if (lineIndex > range.end.line || lineIndex > visibleEnd) return null

    const lineText = this.#lines[lineIndex] ?? ""
    const codeStartX = this.#codeStartX()
    const codeMaxPx = this.#codeMaxPx()
    const startCol = lineIndex === range.start.line ? range.start.col : 0
    const endCol = lineIndex === range.end.line ? range.end.col : lineText.length
    let x1 = codeStartX + this.#colToPx(lineText, startCol) - this.#hScroll
    let x2 = codeStartX + this.#colToPx(lineText, endCol) - this.#hScroll
    if (x2 <= x1) x2 = x1 + Math.max(18, this.#getCharWidth() * 1.5)
    const minX = codeStartX
    const maxX = codeStartX + codeMaxPx
    x1 = Math.max(minX, Math.min(maxX, x1))
    x2 = Math.max(minX, Math.min(maxX, x2))
    const anchorX = Math.max(minX, Math.min(maxX, (x1 + x2) / 2))

    const rowY = PAD_TOP_PX + (lineIndex - startIdx) * this.#linePx - subPx
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
    const menuY = aboveY >= HEADER_H_PX + 4
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
      if (ok) this.#setSelectionMenuOpen(false)
      this.#onSelectionClipboard?.(ok, action)
    }).catch(() => {
      this.#onSelectionClipboard?.(false, action)
    })
  }

  #visibleLineCount(): number {
    const contentH = Math.max(1, this.rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    return Math.max(1, Math.floor(contentH / this.#linePx))
  }

  #gutterWidthPx(lineCount: number): number {
    if (this.font === null) return GUTTER_MIN_PX
    const digits = Math.max(2, String(Math.max(1, lineCount)).length)
    const digitW = this.measureText("8", this.#fontPx)
    return Math.ceil(Math.max(GUTTER_MIN_PX, GUTTER_LEFT_PAD_PX + digitW * digits + GUTTER_RIGHT_PAD_PX))
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

function pointInRect(x: number, y: number, rect: {x: number; y: number; w: number; h: number}): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

/**
 * Парсит CSS-hex (#RGB / #RGBA / #RRGGBB / #RRGGBBAA). Невалидный hex → null.
 * Не выбрасывает — вызывается на каждом render-кадре.
 */
function parseHexColor(text: string): Color | null {
  if (text.length === 0 || text[0] !== "#") return null
  const hex = text.slice(1)
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
