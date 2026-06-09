/**
 * ToDoPane — HUD-поверхность рабочего TODO.md.
 *
 * Pane не знает о сервере интерпретатора. Внешний слой подает Markdown,
 * принимает context-снимок и решает, как сохранять выбор.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {Checkbox, IconButton, uiIcons} from "@ui/components"
import {UiSurface, Z, div, divScrollTo, palette, radii, textMaterial, type DivScrollContext, type UiSurfaceRect} from "@ui/elements"
import {
  todoCompletedSectionStates,
  parseMarkdownTodo,
  todoContextSnapshotForItems,
  todoVisibleItems,
  type ToDoPaneCompletedSection,
  type ToDoPaneContextSnapshot,
  type ToDoPaneItem,
} from "./todo-model.ts"
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
} from "./pane-frame.ts"

export type ToDoPaneOpts = {
  title?: string
  path?: string
  markdown?: string
  highlightedIds?: readonly string[]
  expandedCompletedIds?: readonly string[]
  draggable?: boolean
  resizable?: boolean
  onContextChange?: (context: ToDoPaneContextSnapshot) => void
  onPanelStateChange?: (state: ToDoPanePanelStateSnapshot) => void
  onItemCheckedChange?: (id: string, checked: boolean) => void
  onFrameRectPreview?: (rect: PaneRect) => void
  onFrameRectChange?: (rect: PaneRect) => void
  onFrameDockRequest?: () => void
}

export type ToDoPanePanelStateSnapshot = {
  highlightedIds: string[]
  expandedCompletedIds: string[]
}

const TODO_SCROLL_KEY = "todo-pane:scroll"
const TODO_ROW_MIN_H = 28
const TODO_ROW_PAD_Y = 6
const TODO_TEXT_LINE_HEIGHT = 1.22
const TODO_HEADER_H = PANE_FRAME.headerHeight
const TODO_MIN_W = 320
const TODO_MIN_H = PANE_FRAME.headerHeight + 160
const TODO_EMPTY = "TODO.md не загружен"

type ToDoPaneRowLayout = {
  item: ToDoPaneItem
  top: number
  height: number
  lines: string[]
  fontPx: number
  lineHeightPx: number
  completedSection: ToDoPaneCompletedSection | undefined
  completedSectionExpanded: boolean
}

export class ToDoPane extends UiSurface {
  #title: string
  #path: string
  #markdown: string
  #items: ToDoPaneItem[]
  #highlightedIds: Set<string>
  #expandedCompletedIds: Set<string>
  #draggable: boolean
  #resizable: boolean
  #frameDrag: PaneFrameDrag | null = null
  #highlightPressAdditive = false
  #onContextChange: ((context: ToDoPaneContextSnapshot) => void) | undefined
  #onPanelStateChange: ((state: ToDoPanePanelStateSnapshot) => void) | undefined
  #onItemCheckedChange: ((id: string, checked: boolean) => void) | undefined
  #onFrameRectPreview: ((rect: PaneRect) => void) | undefined
  #onFrameRectChange: ((rect: PaneRect) => void) | undefined
  #onFrameDockRequest: (() => void) | undefined
  #titleMaterial = new TextMaterial({color: palette.cyan})
  #mutedMaterial = new TextMaterial({color: palette.muted})
  #highlightTextMaterial = new TextMaterial({color: palette.text})

  constructor(opts: ToDoPaneOpts = {}) {
    super({bgColor: null, borderColor: null})
    this.node.name = "ToDoPane"
    this.#title = opts.title ?? "TODO.md"
    this.#path = opts.path ?? "TODO.md"
    this.#markdown = opts.markdown ?? ""
    this.#items = parseMarkdownTodo(this.#markdown)
    this.#highlightedIds = new Set(opts.highlightedIds ?? [])
    this.#expandedCompletedIds = new Set(opts.expandedCompletedIds ?? [])
    this.#draggable = opts.draggable ?? false
    this.#resizable = opts.resizable ?? false
    this.#onContextChange = opts.onContextChange
    this.#onPanelStateChange = opts.onPanelStateChange
    this.#onItemCheckedChange = opts.onItemCheckedChange
    this.#onFrameRectPreview = opts.onFrameRectPreview
    this.#onFrameRectChange = opts.onFrameRectChange
    this.#onFrameDockRequest = opts.onFrameDockRequest
    this.#pruneSelection()
  }

  setMarkdown(markdown: string, path = this.#path): void {
    this.#markdown = markdown
    this.#path = path
    this.#items = parseMarkdownTodo(markdown)
    this.#pruneSelection()
    this.#pruneExpandedCompleted()
    this.#emitContextChange()
    this.#emitPanelStateChange()
    this.requestRender()
  }

  setHighlightedIds(ids: readonly string[]): void {
    this.#highlightedIds = new Set(ids)
    this.#pruneSelection()
    this.#expandCompletedSectionsForHighlightedIds()
    this.#scrollFirstHighlightedItemIntoView()
    this.#emitContextChange()
    this.#emitPanelStateChange()
    this.requestRender()
  }

  highlightedIds(): readonly string[] {
    return [...this.#highlightedIds]
  }

  setExpandedCompletedIds(ids: readonly string[]): void {
    this.#expandedCompletedIds = new Set(ids)
    this.#pruneExpandedCompleted()
    this.#emitPanelStateChange()
    this.requestRender()
  }

  expandedCompletedIds(): readonly string[] {
    return [...this.#expandedCompletedIds]
  }

  panelStateSnapshot(): ToDoPanePanelStateSnapshot {
    return {
      highlightedIds: [...this.#highlightedIds],
      expandedCompletedIds: [...this.#expandedCompletedIds],
    }
  }

  contextSnapshot(path = this.#path): ToDoPaneContextSnapshot {
    return todoContextSnapshotForItems(this.#items, path, [...this.#highlightedIds])
  }

  protected render(): void {
    const w = Math.max(TODO_MIN_W, this.rectW)
    const h = Math.max(TODO_HEADER_H + 80, this.rectH)
    this.drawRoundedRect(0, 0, w, h, {
      radius: radii.pane,
      fill: palette.bg,
      border: palette.borderDim,
      borderWidth: 1,
      opacity: 0.98,
      z: Z.CONTAINER,
    })
    this.#renderHeader(w)
    const body = paneBodyRect(w, h, {headerHeight: TODO_HEADER_H, insetX: 8, topGap: 6, bottomInset: 8})
    this.#renderBody(body)
  }

  #renderHeader(w: number): void {
    const pad = PANE_FRAME.headerTextX
    const highlightedCount = this.#highlightedIds.size
    const dockButtonSize = 22
    const dockButtonX = w - pad - dockButtonSize
    const titleW = Math.max(1, dockButtonX - pad - 8)
    this.drawText(this.#title, pad, PANE_FRAME.headerTextY, {
      fontPx: 13,
      material: this.#titleMaterial,
      maxWidthPx: titleW,
    })
    const status = `${highlightedCount} подсвечено`
    this.drawText(status, pad + Math.min(titleW, Math.max(96, this.measureText(this.#title, 13) + 14)), PANE_FRAME.headerTextY + 1, {
      fontPx: 10,
      material: this.#mutedMaterial,
      maxWidthPx: Math.max(1, dockButtonX - pad - 108),
    })
    if (this.#onFrameDockRequest !== undefined) {
      IconButton(this, dockButtonX, 7, dockButtonSize, dockButtonSize, {
        label: "Свернуть TODO",
        iconSrc: uiIcons.minus,
        action: this.#onFrameDockRequest,
      })
    }
    const rule = paneHeaderRuleRect(w, TODO_HEADER_H, PANE_FRAME.bodyInsetX)
    this.drawRect(rule.x, rule.y, rule.w, rule.h, palette.borderDim)
  }

  #renderBody(rect: UiSurfaceRect): void {
    if (this.#items.length === 0) {
      this.drawText(this.#markdown.trim().length === 0 ? TODO_EMPTY : "В TODO.md нет пунктов", rect.x + 8, rect.y + 12, {
        fontPx: 12,
        material: this.#mutedMaterial,
        maxWidthPx: Math.max(1, rect.w - 16),
      })
      return
    }
    const layout = this.#rowLayout(rect.w)
    const contentHeight = Math.max(rect.h, layout.contentHeight)
    div(this, rect.x, rect.y, rect.w, rect.h, {
      key: TODO_SCROLL_KEY,
      scrollContentHeight: contentHeight,
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowY: "auto",
        scrollbarWidth: 4,
      },
      children: (ctx) => this.#renderRows(rect, ctx, layout.rows),
    })
  }

  #renderRows(rect: UiSurfaceRect, ctx: DivScrollContext, rows: readonly ToDoPaneRowLayout[]): void {
    const viewportTop = ctx.scrollTop - TODO_ROW_MIN_H
    const viewportBottom = ctx.scrollTop + ctx.viewportHeight + TODO_ROW_MIN_H
    for (const row of rows) {
      if (row.top + row.height < viewportTop) continue
      if (row.top > viewportBottom) break
      this.#renderRow(row, rect.x, rect.y + row.top - ctx.scrollTop, Math.max(1, ctx.viewportWidth))
    }
  }

  #renderRow(row: ToDoPaneRowLayout, x: number, y: number, w: number): void {
    const item = row.item
    const h = row.height
    const highlighted = this.#highlightedIds.has(item.id)
    const indent = Math.min(80, item.depth * 14)
    const checkX = x + 8 + indent
    const textX = checkX + 28
    const textW = Math.max(1, w - (textX - x) - 10)
    const rowKey = `todo-highlight:${item.id}`
    const rowHit = this.hitState(x + 2, y + 2, Math.max(1, w - 8), h - 4, rowKey)
    const fill = highlighted
      ? palette.activeRowFill
      : rowHit.hovered
        ? withAlpha(palette.bgHot, 0.30)
        : null
    if (fill !== null) {
      this.drawRoundedRect(x + 2, y + 2, Math.max(1, w - 8), h - 4, {
        radius: 5,
        fill,
        border: highlighted ? palette.cyan : null,
        borderWidth: highlighted ? 1 : 0,
        opacity: highlighted ? 1 : 0.74,
        z: Z.ELEMENT,
      })
    }
    if (highlighted) {
      this.drawRect(x + 5, y + 5, 5, Math.max(1, h - 10), palette.cyan, Z.TEXT - 0.02)
    }
    this.hit(x + 2, y + 2, Math.max(1, w - 8), h - 4, () => this.#applyHighlightedItem(item.id), {
      key: rowKey,
      cursor: "pointer",
      onPointerDown: (_localX, _localY, event) => {
        this.#highlightPressAdditive = event?.shiftKey === true || event?.metaKey === true || event?.ctrlKey === true
      },
    })

    const checkboxSize = 18
    if (item.kind === "task") {
      Checkbox(this, checkX, y + Math.max(0, (h - checkboxSize) / 2), checkboxSize, checkboxSize, {
        key: `todo-check:${item.id}`,
        checked: item.checked === true,
        size: "small",
        tooltip: item.checked === true ? "Отметить невыполненным" : "Отметить выполненным",
        onChange: (checked) => this.#onItemCheckedChange?.(item.id, checked),
        sx: {zIndex: Z.TEXT},
      })
    }
    if (row.completedSection !== undefined) {
      const disclosureX = checkX
      const disclosureKey = `todo-completed-section:${item.id}`
      const disclosureHit = this.hitState(disclosureX, y + 3, 18, Math.max(1, h - 6), disclosureKey)
      this.#drawDisclosureChevron(
        disclosureX,
        y,
        18,
        h,
        row.completedSectionExpanded,
        disclosureHit.hovered ? palette.cyan : palette.muted,
      )
      this.hit(disclosureX, y + 3, 18, Math.max(1, h - 6), () => this.#toggleCompletedSection(item.id), {
        key: disclosureKey,
        cursor: "pointer",
      })
    }

    const material = highlighted
      ? this.#highlightTextMaterial
      : item.kind === "heading"
      ? this.#titleMaterial
      : item.checked === true
        ? textMaterial(this, "muted")
        : textMaterial(this, "text")
    const textH = row.lines.length * row.lineHeightPx
    let lineY = y + Math.max(0, (h - textH) / 2)
    for (const line of row.lines) {
      this.drawText(line, textX, lineY, {
        fontPx: row.fontPx,
        material,
        maxWidthPx: textW,
        z: Z.TEXT,
      })
      lineY += row.lineHeightPx
    }
    if (item.checked === true) {
      let strikeY = y + Math.max(0, (h - textH) / 2)
      for (const line of row.lines) {
        const strikeW = Math.min(textW, this.measureText(line, row.fontPx))
        this.drawRect(textX, strikeY + row.fontPx * 0.68, strikeW, 1, withAlpha(palette.muted, 0.72), Z.TEXT + 0.01)
        strikeY += row.lineHeightPx
      }
    }
  }

  #rowLayout(width: number): {rows: ToDoPaneRowLayout[]; contentHeight: number} {
    const rows: ToDoPaneRowLayout[] = []
    let top = 4
    const completedSections = todoCompletedSectionStates(this.#items)
    const visibleItems = todoVisibleItems(this.#items, [...this.#expandedCompletedIds])
    for (const item of visibleItems) {
      const fontPx = item.kind === "heading" ? 12 : 11
      const indent = Math.min(80, item.depth * 14)
      const textX = 8 + indent + 28
      const textW = Math.max(1, width - textX - 10)
      const lines = this.#wrapText(item.text, textW, fontPx)
      const lineHeightPx = Math.max(1, Math.round(fontPx * TODO_TEXT_LINE_HEIGHT * this.pageScale))
      const height = Math.max(TODO_ROW_MIN_H, Math.ceil(lines.length * lineHeightPx + TODO_ROW_PAD_Y * 2))
      const completedSection = completedSections.get(item.id)
      rows.push({
        item,
        top,
        height,
        lines,
        fontPx,
        lineHeightPx,
        completedSection,
        completedSectionExpanded: completedSection !== undefined && this.#expandedCompletedIds.has(item.id),
      })
      top += height
    }
    return {rows, contentHeight: top + 4}
  }

  #wrapText(text: string, maxW: number, fontPx: number): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return [""]
    const lines: string[] = []
    let line = ""
    for (const word of words) {
      if (this.measureText(word, fontPx) > maxW) {
        if (line.length > 0) {
          lines.push(line)
          line = ""
        }
        const parts = this.#splitLongWord(word, maxW, fontPx)
        lines.push(...parts.slice(0, -1))
        line = parts.at(-1) ?? ""
        continue
      }
      const candidate = line.length > 0 ? `${line} ${word}` : word
      if (line.length === 0 || this.measureText(candidate, fontPx) <= maxW) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    if (line.length > 0) lines.push(line)
    return lines.length > 0 ? lines : [""]
  }

  #splitLongWord(word: string, maxW: number, fontPx: number): string[] {
    const lines: string[] = []
    let line = ""
    for (const char of Array.from(word)) {
      const candidate = `${line}${char}`
      if (line.length > 0 && this.measureText(candidate, fontPx) > maxW) {
        lines.push(line)
        line = char
      } else {
        line = candidate
      }
    }
    if (line.length > 0) lines.push(line)
    return lines.length > 0 ? lines : [word]
  }

  #applyHighlightedItem(id: string): void {
    if (this.#highlightPressAdditive) {
      if (this.#highlightedIds.has(id)) this.#highlightedIds.delete(id)
      else this.#highlightedIds.add(id)
    } else {
      this.#highlightedIds = new Set([id])
    }
    this.#highlightPressAdditive = false
    this.#emitContextChange()
    this.#emitPanelStateChange()
    this.requestRender()
  }

  #toggleCompletedSection(id: string): void {
    if (this.#expandedCompletedIds.has(id)) this.#expandedCompletedIds.delete(id)
    else this.#expandedCompletedIds.add(id)
    this.#pruneExpandedCompleted()
    this.#emitPanelStateChange()
    this.requestRender()
  }

  #expandCompletedSectionsForHighlightedIds(): void {
    if (this.#highlightedIds.size === 0) return
    for (const section of todoCompletedSectionStates(this.#items).values()) {
      if (section.descendantIds.some((id) => this.#highlightedIds.has(id))) this.#expandedCompletedIds.add(section.id)
    }
    this.#pruneExpandedCompleted()
  }

  #scrollFirstHighlightedItemIntoView(): void {
    if (this.#highlightedIds.size === 0) return
    const w = Math.max(TODO_MIN_W, this.rectW)
    const h = Math.max(TODO_HEADER_H + 80, this.rectH)
    const body = paneBodyRect(w, h, {headerHeight: TODO_HEADER_H, insetX: 8, topGap: 6, bottomInset: 8})
    const layout = this.#rowLayout(body.w)
    const row = layout.rows.find((candidate) => this.#highlightedIds.has(candidate.item.id))
    if (row === undefined) return
    const top = row.top - Math.max(0, (body.h - row.height) / 2)
    divScrollTo(this, TODO_SCROLL_KEY, {top})
  }

  #emitContextChange(): void {
    this.#onContextChange?.(this.contextSnapshot())
  }

  #emitPanelStateChange(): void {
    this.#onPanelStateChange?.(this.panelStateSnapshot())
  }

  #pruneSelection(): void {
    const known = new Set(this.#items.map((item) => item.id))
    for (const id of [...this.#highlightedIds]) {
      if (!known.has(id)) this.#highlightedIds.delete(id)
    }
  }

  #pruneExpandedCompleted(): void {
    const completed = todoCompletedSectionStates(this.#items)
    for (const id of [...this.#expandedCompletedIds]) {
      if (!completed.has(id)) this.#expandedCompletedIds.delete(id)
    }
  }

  #drawDisclosureChevron(x: number, y: number, w: number, h: number, expanded: boolean, color: Color): void {
    const cx = x + w / 2
    const cy = y + h / 2
    const size = Math.min(6, Math.max(4, h * 0.26))
    const half = size / 2
    const z = Z.TEXT + 0.02
    if (expanded) {
      this.drawLine(cx - half, cy - half / 2, cx, cy + half, color, 1.4, z)
      this.drawLine(cx + half, cy - half / 2, cx, cy + half, color, 1.4, z)
      return
    }
    this.drawLine(cx - half / 2, cy - half, cx + half, cy, color, 1.4, z)
    this.drawLine(cx - half / 2, cy + half, cx + half, cy, color, 1.4, z)
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: true,
      movable: this.#draggable,
      resizable: this.#resizable,
      minW: TODO_MIN_W,
      minH: TODO_MIN_H,
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

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (this.pressedHit !== null) return
    if (this.#beginFrameInteraction(event, localX, localY)) return
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    if (this.#updateFrameInteraction(event)) return
    super.onPointerMove(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    if (this.#endFrameInteraction(event, localX, localY)) return
    super.onPointerUp(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerLeave(): void {
    if (this.#frameDrag !== null) return
    super.onPointerLeave()
  }

  override onDeactivate(): void {
    this.#frameDrag = null
    super.onDeactivate()
  }
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}
