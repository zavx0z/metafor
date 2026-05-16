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

import {TextMaterial} from "@metafor/engine"
import {Card, Z} from "./card.ts"
import {palette, syntaxTokens} from "./theme.ts"
import {ScrollListState} from "./scroll-list.ts"
import {scrollbar} from "./widgets.ts"

export type EditorToken = {s: number; e: number; c: string}
export type EditorTokens = EditorToken[][]
export type EditorTokenize = (lines: string[]) => EditorTokens

export type EditorOpts = {
  /** Заголовок над редактором. */
  title?: string
  /** Колбэк на любое изменение текста. */
  onChange?: (text: string) => void
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
  readonly #list: ScrollListState
  #cursorVisible = true
  #cursorBlinkAt = 0
  #history: Snapshot[] = []
  #future: Snapshot[] = []
  #blinkTimer: ReturnType<typeof setInterval> | null = null

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
    this.#history = []
    this.#future = []
    this.#refreshTokens()
    this.requestRender()
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

  // ────────── input ──────────

  override onKey(event: KeyboardEvent): void {
    const isMod = event.metaKey || event.ctrlKey
    let handled = true

    if (isMod) {
      if (event.key === "z" || event.key === "Z") {
        if (event.shiftKey) this.#redo()
        else this.#undo()
      } else if (event.key === "y") this.#redo()
      else if (event.key === "a") this.#selectAll()
      else handled = false
    } else if (event.key === "ArrowLeft") this.#moveCursor(-1, 0)
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

  override onWheel(event: WheelEvent): void {
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
    const xInCode = Math.max(0, localX - codeX)
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
    const visible = this.#visibleLineCount()
    const top = Math.floor(this.#list.scroll)
    const bottom = top + visible - 1
    if (this.#cline < top) this.#list.jumpTo(this.#cline)
    else if (this.#cline > bottom) this.#list.jumpTo(this.#cline - visible + 1)
  }

  #colAtX(line: string, x: number): number {
    if (x <= 0) return 0
    let best = 0
    let bestDelta = Math.abs(x)
    for (let i = 1; i <= line.length; i++) {
      const w = this.measureText(line.slice(0, i), this.#fontPx)
      const d = Math.abs(w - x)
      if (d < bestDelta) {
        bestDelta = d
        best = i
      } else {
        return best
      }
    }
    return best
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
        const lineTokens = this.#tokens?.[lineIndex]
        if (lineTokens !== undefined && lineTokens.length > 0) {
          this.#renderTokenized(lineText, lineTokens, codeStartX, textY, codeMaxPx)
        } else {
          this.drawText(lineText, codeStartX, textY, {
            fontPx: this.#fontPx,
            material: this.#lineMaterial,
            maxWidthPx: codeMaxPx,
          })
        }
      }

      // Cursor
      if (isCurrent) {
        const elapsed = performance.now() - this.#cursorBlinkAt
        const blinkOn = Math.floor(elapsed / 530) % 2 === 0
        if (this.#cursorVisible && blinkOn) {
          const preW = this.measureText(lineText.slice(0, this.#ccol), this.#fontPx)
          const curX = codeStartX + preW
          this.drawRect(curX, textY - 1, 1.5, this.#fontPx + 2, palette.cyan, Z.ELEMENT_RULE)
        }
        // Blink — через #blinkTimer, не из render (избегаем рекурсии).
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
    const placeChunk = (chunkText: string, category: string): void => {
      if (chunkText.length === 0) return
      const w = this.measureText(chunkText, this.#fontPx)
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
      placeChunk(span, tok.c)
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
