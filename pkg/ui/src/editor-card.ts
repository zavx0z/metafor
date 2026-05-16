/**
 * EditorCard — редактируемая текстовая карточка с подсветкой синтаксиса.
 *
 * По мотивам SourceCard из @metafor/bun-debug, но c input handling:
 *  • cursor (line, col) с отрисовкой
 *  • Backspace/Delete/Enter/Arrow-keys/Home/End/PageUp-Down
 *  • Printable chars вставка
 *  • Tab → 2 пробела
 *  • Cmd/Ctrl+A — select-all (state хранится, отдельным render-эффектом)
 *  • Cmd/Ctrl+Z / Cmd/Ctrl+Y — undo/redo (linear history)
 *  • Click → курсор по координатам
 *  • Подсветка через pluggable tokenize: (lines) => tokens
 *  • onChange колбэк
 *
 * Anim/glow эффекты — отдельно, в future EditorAnimatedCard.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {Card, Z} from "./card.ts"
import {palette, syntaxTokens} from "./theme.ts"
import {ScrollListState} from "./scroll-list.ts"
import {scrollbar} from "./widgets.ts"

/**
 * Один синтаксический токен в строке.
 *  • `c` — категория (см. syntaxTokens из ./theme): k/s/n/c/t/f/p/d.
 *  • `bg` — необязательный hex-цвет (#RGB / #RGBA / #RRGGBB / #RRGGBBAA).
 *    Если задан, под токеном рисуется тонкая цветная полоска — color-swatch
 *    под hex-литералом в CSS. Невалидный hex молча игнорируется.
 */
export type EditorToken = {s: number; e: number; c: string; bg?: string}
export type EditorTokens = EditorToken[][]
export type EditorTokenize = (lines: string[]) => EditorTokens

export type EditorOpts = {
  /** Заголовок над редактором. */
  title?: string
  /** Колбэк на любое изменение текста (буфер «грязный»). */
  onChange?: (text: string) => void
  /** Колбэк на явное сохранение (Cmd/Ctrl+S или editor.save()). */
  onSave?: (text: string) => void
  /** Получает массив строк → возвращает токены той же длины. */
  tokenize?: EditorTokenize
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

type Snapshot = {lines: string[]; cline: number; ccol: number}

export class EditorCard extends Card {
  #lines: string[] = [""]
  #tokens: EditorTokens | null = null
  #cline = 0
  #ccol = 0
  #title: string
  #fontPx: number
  #linePx: number
  #titleFontPx: number
  #tokenize: EditorTokenize | undefined
  #onChange: ((text: string) => void) | undefined
  #onSave: ((text: string) => void) | undefined
  readonly #list: ScrollListState
  #cursorVisible = true
  #cursorBlinkAt = 0
  #history: Snapshot[] = []
  #future: Snapshot[] = []
  #blinkTimer: ReturnType<typeof setInterval> | null = null
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
  readonly #tokenMaterials: Map<string, TextMaterial> = new Map()

  constructor(opts: EditorOpts = {}) {
    super({bgColor: palette.bgCode, borderColor: palette.borderDim, borderWidthPx: 1})
    this.node.name = "EditorCard"
    this.#title = opts.title ?? "Editor"
    this.#fontPx = opts.fontPx ?? 13
    this.#linePx = opts.linePx ?? 18
    this.#titleFontPx = opts.titleFontPx ?? 13
    this.#tokenize = opts.tokenize
    this.#onChange = opts.onChange
    this.#onSave = opts.onSave
    this.#list = new ScrollListState({onChange: () => this.requestRender()})
    for (const [category, color] of Object.entries(syntaxTokens)) {
      this.#tokenMaterials.set(category, new TextMaterial({color}))
    }
    this.#refreshTokens()
    this.#startBlinkTimer()
  }

  #startBlinkTimer(): void {
    if (this.#blinkTimer !== null) return
    this.#blinkTimer = setInterval(() => {
      if (this.#cursorVisible) this.requestRender()
    }, 530)
  }

  #stopBlinkTimer(): void {
    if (this.#blinkTimer !== null) {
      clearInterval(this.#blinkTimer)
      this.#blinkTimer = null
    }
  }

  // ────────── public API ──────────

  setText(text: string): void {
    this.#lines = text.length === 0 ? [""] : text.split("\n")
    this.#cline = Math.min(this.#cline, this.#lines.length - 1)
    this.#ccol = Math.min(this.#ccol, this.#lines[this.#cline]!.length)
    this.#hScroll = 0
    this.#history = []
    this.#future = []
    this.#refreshTokens()
    this.requestRender()
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
    if (text.includes("\n")) {
      this.#pushHistory()
      const parts = text.split(/\r?\n/)
      const line = this.#lines[this.#cline]!
      const head = line.slice(0, this.#ccol) + parts[0]!
      const tail = parts[parts.length - 1]! + line.slice(this.#ccol)
      const middle = parts.slice(1, -1)
      this.#lines.splice(this.#cline, 1, head, ...middle, tail)
      this.#cline += parts.length - 1
      this.#ccol = parts[parts.length - 1]!.length
      this.#afterEdit()
    } else {
      this.#insertText(text)
    }
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

  /** Position cursor at (line, col), clamping to bounds. Scrolls into view. */
  setCursor(line: number, col: number): void {
    this.#cline = Math.max(0, Math.min(this.#lines.length - 1, line))
    this.#ccol = Math.max(0, Math.min(this.#lines[this.#cline]!.length, col))
    this.#scrollCursorIntoView()
    this.requestRender()
  }

  // ────────── monospace helpers ──────────

  /** Возвращает ширину одного глифа JetBrains Mono. Кэшируется (font фиксирован). */
  #getCharWidth(): number {
    if (this.#charWidth > 0) return this.#charWidth
    if (this.font === null) return 0
    // measureText("M") даёт честную ширину advance + letter-spacing 5%.
    this.#charWidth = this.measureText("M", this.#fontPx)
    return this.#charWidth
  }

  /**
   * X-смещение колонки от начала строки. Для коротких строк — точно (через
   * measureText). Для длинных (base64, минифицированный код) — монохромный
   * approx: charWidth * col (O(1)).
   */
  #colToPx(line: string, col: number): number {
    if (col <= 0) return 0
    const c = Math.min(col, line.length)
    if (line.length >= EditorCard.#LONG_LINE_THRESHOLD) {
      return c * this.#getCharWidth()
    }
    return this.measureText(line.slice(0, c), this.#fontPx)
  }

  // ────────── input ──────────

  override onInputText(text: string): void {
    this.insertText(text)
  }

  override onKey(event: KeyboardEvent): void {
    const isMod = event.metaKey || event.ctrlKey
    const isAlt = event.altKey
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
      else if (k === "c") void this.#copyCurrentLine()
      else if (k === "x") void this.#cutCurrentLine()
      else if (event.key === "ArrowLeft")  this.setCursor(this.#cline, 0)
      else if (event.key === "ArrowRight") this.setCursor(this.#cline, this.#lines[this.#cline]!.length)
      else if (event.key === "ArrowUp")    this.setCursor(0, 0)
      else if (event.key === "ArrowDown")  this.setCursor(this.#lines.length - 1, this.#lines[this.#lines.length - 1]!.length)
      else if (event.key === "Home")       this.setCursor(0, 0)
      else if (event.key === "End")        this.setCursor(this.#lines.length - 1, this.#lines[this.#lines.length - 1]!.length)
      else handled = false
    } else if (isAlt && event.key === "ArrowLeft")  this.#wordJump(-1)
    else if (isAlt && event.key === "ArrowRight")   this.#wordJump(1)
    else if (event.key === "ArrowLeft") this.#moveCursor(-1, 0)
    else if (event.key === "ArrowRight") this.#moveCursor(1, 0)
    else if (event.key === "ArrowUp") this.#moveCursor(0, -1)
    else if (event.key === "ArrowDown") this.#moveCursor(0, 1)
    else if (event.key === "Home") this.setCursor(this.#cline, 0)
    else if (event.key === "End") this.setCursor(this.#cline, this.#lines[this.#cline]!.length)
    else if (event.key === "PageUp") this.#movePage(-1)
    else if (event.key === "PageDown") this.#movePage(1)
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
      this.#pushHistory()
      // Многострочная вставка
      const parts = text.split(/\r?\n/)
      if (parts.length === 1) {
        const line = this.#lines[this.#cline]!
        this.#lines[this.#cline] = line.slice(0, this.#ccol) + parts[0]! + line.slice(this.#ccol)
        this.#ccol += parts[0]!.length
      } else {
        const line = this.#lines[this.#cline]!
        const head = line.slice(0, this.#ccol) + parts[0]!
        const tail = parts[parts.length - 1]! + line.slice(this.#ccol)
        const middle = parts.slice(1, -1)
        const newLines = [head, ...middle, tail]
        this.#lines.splice(this.#cline, 1, ...newLines)
        this.#cline += parts.length - 1
        this.#ccol = parts[parts.length - 1]!.length
      }
      this.#afterEdit()
    } catch (err) {
      console.warn("clipboard paste failed:", err)
    }
  }

  async #copyCurrentLine(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.#lines[this.#cline] ?? "")
    } catch (err) {
      console.warn("clipboard copy failed:", err)
    }
  }

  async #cutCurrentLine(): Promise<void> {
    try {
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
      this.#afterEdit()
    } catch (err) {
      console.warn("clipboard cut failed:", err)
    }
  }

  // ────────── word jump ──────────

  #wordJump(direction: 1 | -1): void {
    const line = this.#lines[this.#cline]!
    const isWord = (ch: string): boolean => /[\w$]/.test(ch)
    let col = this.#ccol
    if (direction === 1) {
      while (col < line.length && !isWord(line[col]!)) col++
      while (col < line.length && isWord(line[col]!)) col++
      if (col === this.#ccol && this.#cline < this.#lines.length - 1) {
        this.setCursor(this.#cline + 1, 0)
        return
      }
    } else {
      while (col > 0 && !isWord(line[col - 1]!)) col--
      while (col > 0 && isWord(line[col - 1]!)) col--
      if (col === this.#ccol && this.#cline > 0) {
        this.setCursor(this.#cline - 1, this.#lines[this.#cline - 1]!.length)
        return
      }
    }
    this.setCursor(this.#cline, col)
  }

  override onWheel(event: WheelEvent): void {
    // Shift + wheel → горизонтальная прокрутка кода
    if (event.shiftKey) {
      event.preventDefault()
      const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX
      this.#hScroll = Math.max(0, this.#hScroll + delta)
      this.requestRender()
      return
    }
    const visible = this.#visibleLineCount()
    this.#list.applyWheel(event, this.#linePx, this.#lines.length, visible)
  }

  override onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    if (localY < PAD_TOP_PX) return
    const visible = this.#visibleLineCount()
    this.#list.clamp(this.#lines.length, visible)
    const scroll = this.#list.scroll
    const startIdx = Math.floor(scroll)
    const subPx = (scroll - startIdx) * this.#linePx
    const rowFloat = (localY - PAD_TOP_PX + subPx) / this.#linePx
    const lineIdx = Math.max(0, Math.min(this.#lines.length - 1, startIdx + Math.floor(rowFloat)))
    const gutter = this.#gutterWidthPx(this.#lines.length)
    const codeX = PAD_LEFT_PX + gutter + CODE_LEFT_PAD_PX
    // hScroll учитываем — клик в видимой области соответствует
    // (visibleX + hScroll) в координатах целой строки.
    const xInCode = Math.max(0, localX - codeX + this.#hScroll)
    const col = this.#colAtX(this.#lines[lineIdx]!, xInCode)
    this.setCursor(lineIdx, col)
  }

  override onActivate(): void {
    super.onActivate?.()
    this.#cursorVisible = true
    this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate?.()
    this.#cursorVisible = false
    this.requestRender()
  }

  // ────────── editing ──────────

  #snapshot(): Snapshot {
    return {lines: this.#lines.slice(), cline: this.#cline, ccol: this.#ccol}
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
    // Простейший вариант: курсор в конец, история не пишется.
    // Полноценный selection — задача расширения.
    this.setCursor(this.#lines.length - 1, this.#lines[this.#lines.length - 1]!.length)
  }

  #insertText(s: string): void {
    if (s.length === 0) return
    this.#pushHistory()
    const line = this.#lines[this.#cline]!
    this.#lines[this.#cline] = line.slice(0, this.#ccol) + s + line.slice(this.#ccol)
    this.#ccol += s.length
    this.#afterEdit()
  }

  #insertNewline(): void {
    this.#pushHistory()
    const line = this.#lines[this.#cline]!
    const head = line.slice(0, this.#ccol)
    const tail = line.slice(this.#ccol)
    this.#lines[this.#cline] = head
    this.#lines.splice(this.#cline + 1, 0, tail)
    this.#cline += 1
    this.#ccol = 0
    this.#afterEdit()
  }

  #backspace(): void {
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

  #moveCursor(dCol: number, dLine: number): void {
    if (dCol !== 0) {
      const newCol = this.#ccol + dCol
      if (newCol < 0 && this.#cline > 0) {
        this.#cline -= 1
        this.#ccol = this.#lines[this.#cline]!.length
      } else if (newCol > this.#lines[this.#cline]!.length && this.#cline < this.#lines.length - 1) {
        this.#cline += 1
        this.#ccol = 0
      } else {
        this.#ccol = Math.max(0, Math.min(this.#lines[this.#cline]!.length, newCol))
      }
    }
    if (dLine !== 0) {
      const newLine = Math.max(0, Math.min(this.#lines.length - 1, this.#cline + dLine))
      this.#cline = newLine
      this.#ccol = Math.min(this.#ccol, this.#lines[this.#cline]!.length)
    }
    this.#scrollCursorIntoView()
    this.requestRender()
  }

  #movePage(direction: 1 | -1): void {
    const visible = this.#visibleLineCount()
    const newLine = Math.max(0, Math.min(this.#lines.length - 1, this.#cline + direction * visible))
    this.#cline = newLine
    this.#ccol = Math.min(this.#ccol, this.#lines[this.#cline]!.length)
    this.#scrollCursorIntoView()
    this.requestRender()
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
    const startPx = line.length >= EditorCard.#LONG_LINE_THRESHOLD
      ? start * cw
      : this.measureText(line.slice(0, start), this.#fontPx)
    return {start, end, startPx}
  }

  #colAtX(line: string, x: number): number {
    if (x <= 0) return 0
    if (line.length >= EditorCard.#LONG_LINE_THRESHOLD) {
      const cw = this.#getCharWidth()
      if (cw <= 0) return 0
      return Math.max(0, Math.min(line.length, Math.round(x / cw)))
    }
    // binary search — O(log N · N) на короткой строке = пшик
    let lo = 0
    let hi = line.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2)
      if (this.measureText(line.slice(0, mid), this.#fontPx) <= x) lo = mid
      else hi = mid - 1
    }
    if (lo < line.length) {
      const wlo = this.measureText(line.slice(0, lo), this.#fontPx)
      const whi = this.measureText(line.slice(0, lo + 1), this.#fontPx)
      if (Math.abs(whi - x) < Math.abs(wlo - x)) return lo + 1
    }
    return lo
  }

  // ────────── rendering ──────────

  #pingCursor(): void {
    this.#cursorBlinkAt = performance.now()
    this.#cursorVisible = true
  }

  override dispose?(): void {
    this.#stopBlinkTimer()
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
      this.drawRect(PAD_LEFT_PX, hY, contentW, this.#linePx, palette.bg, Z.ELEMENT)
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
              visTokens.push({
                s: Math.max(0, t.s - slice.start),
                e: Math.min(slice.end - slice.start, t.e - slice.start),
                c: t.c,
              })
            }
          }
          // maxWidthPx-clamp на drawText не используем — обрезка через pushClip.
          // Передаём заведомо большую ширину, чтобы не было ellipsis "..." внутри слайса.
          const maxW = codeMaxPx + this.#hScroll + 1000
          if (visTokens.length > 0) {
            this.#renderTokenized(visText, visTokens, drawX, textY, maxW)
          } else {
            this.drawText(visText, drawX, textY, {
              fontPx: this.#fontPx,
              material: this.#lineMaterial,
              maxWidthPx: maxW,
            })
          }
        }
      }

      // Cursor
      if (isCurrent) {
        const elapsed = performance.now() - this.#cursorBlinkAt
        const blinkOn = Math.floor(elapsed / 530) % 2 === 0
        if (this.#cursorVisible && blinkOn) {
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
  }

  #renderTokenized(text: string, tokens: EditorToken[], startX: number, y: number, maxPx: number): void {
    let cursor = 0
    let cursorX = startX
    const remaining = (): number => Math.max(0, startX + maxPx - cursorX)
    const placeChunk = (chunkText: string, category: string, bg?: string): void => {
      if (chunkText.length === 0) return
      const w = this.measureText(chunkText, this.#fontPx)
      if (bg !== undefined && w > 0) {
        const color = parseHexColor(bg)
        if (color !== null) {
          // 1) контрастная тёмная подложка — чтобы alpha-hex (#4444 и т.п.)
          //    был визуально различим на фоне строки кода.
          this.drawRect(cursorX, y, w, this.#fontPx + 2, palette.bgInput, Z.CONTAINER)
          // 2) сам цвет swatch'а поверх — alpha смешивается с подложкой.
          this.drawRect(cursorX, y, w, this.#fontPx + 2, color, Z.ELEMENT)
        }
      }
      if (chunkText.trim().length === 0) {
        cursorX += w
        return
      }
      const material = this.#tokenMaterials.get(category) ?? this.#lineMaterial
      this.drawText(chunkText, cursorX, y, {
        fontPx: this.#fontPx,
        material,
        maxWidthPx: remaining(),
      })
      cursorX += w
    }
    const sorted = [...tokens].sort((a, b) => a.s - b.s)
    for (const tok of sorted) {
      if (tok.s > cursor) placeChunk(text.slice(cursor, tok.s), "d")
      const span = text.slice(tok.s, Math.min(tok.e, text.length))
      placeChunk(span, tok.c, tok.bg)
      cursor = Math.max(cursor, tok.e)
    }
    if (cursor < text.length) placeChunk(text.slice(cursor), "d")
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
