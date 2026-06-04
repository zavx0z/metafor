import {Color, TextMaterial} from "@metafor/engine"
import {UiSurface, Z, divScrollPosition, divScrollTo, li, palette, radii, span, ul, type LiElementState} from "@ui/elements"
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
import {
  fileListAllItemIds,
  fileListSelectionAfterClick,
  fileListSelectionAfterKeyboardRange,
  fileListVisibleRows,
  normalizeFileListSelection,
  type FileListItem,
  type FileListSelectionMode,
  type FileListVisibleRow,
} from "./file-list-model.ts"

export type FileListPaneOpts = {
  title?: string
  items?: readonly FileListItem[]
  selectionMode?: FileListSelectionMode
  selectedIds?: readonly string[]
  expandedIds?: readonly string[]
  theme?: FileListPaneThemeInput
  showHeader?: boolean
  onSelectionChange?: (selectedIds: readonly string[], selectedItems: readonly FileListItem[]) => void
  onExpandedChange?: (expandedIds: readonly string[]) => void
  onItemOpen?: (item: FileListItem) => void
  onDirectoryToggle?: (item: FileListItem, expanded: boolean) => void
  onFrameRectPreview?: (rect: PaneRect) => void
  onFrameRectChange?: (rect: PaneRect) => void
}

export type FileListPaneThemeName = "intellij" | "material"

export type FileListPaneTheme = {
  surface: {
    background: Color | null
    border: Color | null
    borderWidthPx: number
    borderRadiusPx: number
  }
  header: {
    title: Color
    status: Color
    rule: Color
  }
  row: {
    height: number
    radius: number
    paddingX: number
    indent: number
    disclosureWidth: number
    iconWidth: number
    metaWidth: number
    hoverFill: Color | null
    activeFill: Color | null
    selectedFill: Color | null
    selectedBorder: Color | null
    text: Color
    muted: Color
    selectedText: Color
    disabledText: Color
  }
  icon: {
    directoryFill: Color
    fileFill: Color
    disabledFill: Color
  }
}

export type FileListPaneThemeOverrides = {
  preset?: FileListPaneThemeName
  surface?: Partial<FileListPaneTheme["surface"]>
  header?: Partial<FileListPaneTheme["header"]>
  row?: Partial<FileListPaneTheme["row"]>
  icon?: Partial<FileListPaneTheme["icon"]>
}

export type FileListPaneThemeInput = FileListPaneThemeName | FileListPaneThemeOverrides

const FILE_LIST_SCROLL_KEY = "file-list-pane:scroll"
const MIN_PANE_W = 300
const MIN_PANE_H = PANE_FRAME.headerHeight + 160

export const FILE_LIST_INTELLIJ_THEME: FileListPaneTheme = {
  surface: {
    background: new Color(30 / 255, 31 / 255, 34 / 255, 0.98),
    border: new Color(77 / 255, 81 / 255, 89 / 255, 0.94),
    borderWidthPx: 1,
    borderRadiusPx: radii.pane,
  },
  header: {
    title: palette.cyan,
    status: palette.muted,
    rule: new Color(77 / 255, 81 / 255, 89 / 255, 0.72),
  },
  row: {
    height: 28,
    radius: 4,
    paddingX: 8,
    indent: 16,
    disclosureWidth: 14,
    iconWidth: 18,
    metaWidth: 82,
    hoverFill: new Color(43 / 255, 45 / 255, 50 / 255, 0.96),
    activeFill: new Color(52 / 255, 56 / 255, 64 / 255, 0.88),
    selectedFill: new Color(45 / 255, 93 / 255, 147 / 255, 0.92),
    selectedBorder: new Color(74 / 255, 132 / 255, 190 / 255, 0.78),
    text: palette.text,
    muted: palette.muted,
    selectedText: palette.text,
    disabledText: palette.muted,
  },
  icon: {
    directoryFill: new Color(86 / 255, 143 / 255, 214 / 255, 0.94),
    fileFill: new Color(152 / 255, 161 / 255, 177 / 255, 0.86),
    disabledFill: new Color(139 / 255, 150 / 255, 166 / 255, 0.32),
  },
}

export const FILE_LIST_MATERIAL_THEME: FileListPaneTheme = {
  surface: {
    background: new Color(18 / 255, 18 / 255, 18 / 255, 0.98),
    border: new Color(255 / 255, 255 / 255, 255 / 255, 0.14),
    borderWidthPx: 1,
    borderRadiusPx: 8,
  },
  header: {
    title: new Color(144 / 255, 202 / 255, 249 / 255, 1),
    status: new Color(189 / 255, 189 / 255, 189 / 255, 1),
    rule: new Color(255 / 255, 255 / 255, 255 / 255, 0.12),
  },
  row: {
    height: 40,
    radius: 6,
    paddingX: 12,
    indent: 20,
    disclosureWidth: 16,
    iconWidth: 24,
    metaWidth: 96,
    hoverFill: new Color(255 / 255, 255 / 255, 255 / 255, 0.08),
    activeFill: new Color(144 / 255, 202 / 255, 249 / 255, 0.14),
    selectedFill: new Color(25 / 255, 118 / 255, 210 / 255, 0.34),
    selectedBorder: new Color(144 / 255, 202 / 255, 249 / 255, 0.42),
    text: new Color(238 / 255, 238 / 255, 238 / 255, 1),
    muted: new Color(158 / 255, 158 / 255, 158 / 255, 1),
    selectedText: new Color(245 / 255, 250 / 255, 255 / 255, 1),
    disabledText: new Color(117 / 255, 117 / 255, 117 / 255, 1),
  },
  icon: {
    directoryFill: new Color(255 / 255, 202 / 255, 40 / 255, 0.94),
    fileFill: new Color(144 / 255, 164 / 255, 174 / 255, 0.92),
    disabledFill: new Color(117 / 255, 117 / 255, 117 / 255, 0.36),
  },
}

export class FileListPane extends UiSurface {
  #title: string
  #items: readonly FileListItem[]
  #selectionMode: FileListSelectionMode
  #selectedIds: string[]
  #expandedIds: Set<string>
  #activeId: string | null
  #selectionAnchorId: string | null
  #showHeader: boolean
  #theme: FileListPaneTheme
  #frameDrag: PaneFrameDrag | null = null
  #lastViewportH = 1
  #onSelectionChange: ((selectedIds: readonly string[], selectedItems: readonly FileListItem[]) => void) | undefined
  #onExpandedChange: ((expandedIds: readonly string[]) => void) | undefined
  #onItemOpen: ((item: FileListItem) => void) | undefined
  #onDirectoryToggle: ((item: FileListItem, expanded: boolean) => void) | undefined
  #onFrameRectPreview: ((rect: PaneRect) => void) | undefined
  #onFrameRectChange: ((rect: PaneRect) => void) | undefined

  #titleMaterial: TextMaterial
  #statusMaterial: TextMaterial
  #mutedMaterial: TextMaterial

  constructor(opts: FileListPaneOpts = {}) {
    super({bgColor: null, borderColor: null})
    this.#theme = resolveFileListPaneTheme(opts.theme)
    this.#titleMaterial = new TextMaterial({color: this.#theme.header.title})
    this.#statusMaterial = new TextMaterial({color: this.#theme.row.muted})
    this.#mutedMaterial = new TextMaterial({color: this.#theme.row.disabledText})
    this.node.name = "FileListPane"
    this.#title = opts.title ?? "Files"
    this.#items = opts.items ?? []
    this.#selectionMode = opts.selectionMode ?? "single"
    this.#selectedIds = normalizeFileListSelection(opts.selectedIds ?? [], this.#items, this.#selectionMode)
    this.#expandedIds = new Set(opts.expandedIds ?? [])
    this.#activeId = this.#selectedIds[0] ?? firstVisibleSelectableId(this.#items, this.#expandedIds)
    this.#selectionAnchorId = this.#activeId
    this.#showHeader = opts.showHeader ?? true
    this.#onSelectionChange = opts.onSelectionChange
    this.#onExpandedChange = opts.onExpandedChange
    this.#onItemOpen = opts.onItemOpen
    this.#onDirectoryToggle = opts.onDirectoryToggle
    this.#onFrameRectPreview = opts.onFrameRectPreview
    this.#onFrameRectChange = opts.onFrameRectChange
  }

  setTheme(theme: FileListPaneThemeInput): void {
    this.#theme = resolveFileListPaneTheme(theme)
    this.#titleMaterial = new TextMaterial({color: this.#theme.header.title})
    this.#statusMaterial = new TextMaterial({color: this.#theme.row.muted})
    this.#mutedMaterial = new TextMaterial({color: this.#theme.row.disabledText})
    this.requestRender()
  }

  getItems(): readonly FileListItem[] {
    return this.#items
  }

  setItems(items: readonly FileListItem[]): void {
    this.#items = items
    const nextSelection = normalizeFileListSelection(this.#selectedIds, this.#items, this.#selectionMode)
    const selectionChanged = !sameStringArray(nextSelection, this.#selectedIds)
    this.#selectedIds = nextSelection
    const knownIds = new Set(fileListAllItemIds(this.#items))
    this.#expandedIds = new Set([...this.#expandedIds].filter((id) => knownIds.has(id)))
    if (this.#activeId !== null && !knownIds.has(this.#activeId)) this.#activeId = firstVisibleSelectableId(this.#items, this.#expandedIds)
    if (this.#selectionAnchorId !== null && !knownIds.has(this.#selectionAnchorId)) this.#selectionAnchorId = this.#activeId
    if (selectionChanged) this.#emitSelectionChange()
    this.requestRender()
  }

  setTitle(title: string): void {
    if (this.#title === title) return
    this.#title = title
    this.requestRender()
  }

  selectionMode(): FileListSelectionMode {
    return this.#selectionMode
  }

  setSelectionMode(mode: FileListSelectionMode): void {
    if (this.#selectionMode === mode) return
    this.#selectionMode = mode
    const nextSelection = normalizeFileListSelection(this.#selectedIds, this.#items, mode)
    const changed = !sameStringArray(nextSelection, this.#selectedIds)
    this.#selectedIds = nextSelection
    this.#selectionAnchorId = this.#selectedIds[0] ?? this.#activeId
    if (changed) this.#emitSelectionChange()
    this.requestRender()
  }

  selectedIds(): readonly string[] {
    return [...this.#selectedIds]
  }

  setSelectedIds(ids: readonly string[]): void {
    this.#applySelection(normalizeFileListSelection(ids, this.#items, this.#selectionMode), ids[0] ?? null)
  }

  expandedIds(): readonly string[] {
    return [...this.#expandedIds]
  }

  setExpandedIds(ids: readonly string[]): void {
    const knownIds = new Set(fileListAllItemIds(this.#items))
    const next = new Set(ids.filter((id) => knownIds.has(id)))
    if (sameStringArray([...next], [...this.#expandedIds])) return
    this.#expandedIds = next
    this.#emitExpandedChange()
    this.requestRender()
  }

  expandAll(): void {
    this.setExpandedIds(directoryIds(this.#items))
  }

  collapseAll(): void {
    this.setExpandedIds([])
  }

  selectAllVisible(): void {
    if (this.#selectionMode !== "multiple") return
    const ids = this.#rows().filter((row) => row.item.disabled !== true).map((row) => row.id)
    this.#applySelection(ids, ids[0] ?? null)
  }

  clearSelection(): void {
    this.#applySelection([], this.#activeId)
  }

  activeId(): string | null {
    return this.#activeId
  }

  setActiveId(id: string | null): void {
    if (this.#activeId === id) return
    this.#activeId = id
    this.#selectionAnchorId = id
    this.#scrollActiveIntoView()
    this.requestRender()
  }

  toggleDirectory(id: string, expanded?: boolean): void {
    const item = findFileListItem(this.#items, id)
    if (item === null || item.kind !== "directory") return
    this.#setDirectoryExpanded(item, expanded ?? !this.#expandedIds.has(id))
  }

  onKey(event: KeyboardEvent): void {
    const rows = this.#rows()
    if (rows.length === 0) return
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "a") {
      event.preventDefault()
      this.selectAllVisible()
      return
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      this.#moveActive(event.key === "ArrowUp" ? -1 : 1, event.shiftKey)
      return
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      this.#moveActiveToEdge(event.key === "Home" ? "first" : "last", event.shiftKey)
      return
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      this.#expandActiveOrMoveToChild()
      return
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      this.#collapseActiveOrMoveToParent()
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      this.#openActive()
      return
    }
    if (event.key === " ") {
      event.preventDefault()
      this.#toggleActiveSelection()
    }
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (this.pressedHit !== null) return
    if (isSecondaryPointer(event)) return
    this.#beginFrameInteraction(event, localX, localY)
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    if (this.#frameDrag !== null) {
      this.#updateFrameInteraction(event)
      return
    }
    super.onPointerMove(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    if (this.#endFrameInteraction(event, localX, localY)) return
    super.onPointerUp(event, localX, localY)
  }

  protected render(): void {
    this.#renderSurfaceChrome()
    this.#syncActiveToVisibleRows()
    if (this.#showHeader) this.#renderHeader()
    const body = paneBodyRect(this.rectW, this.rectH, {showHeader: this.#showHeader})
    const rows = this.#rows()
    if (rows.length === 0) {
      span(this, body.x + 12, body.y + 12, Math.max(1, body.w - 24), 24, {
        children: "No files",
        style: {fontSize: 12, color: "muted"},
      })
      return
    }
    const rowH = this.#theme.row.height
    const contentHeight = Math.max(body.h, rows.length * rowH)
    ul(this, body.x, body.y, body.w, body.h, {
      key: FILE_LIST_SCROLL_KEY,
      dense: true,
      disablePadding: true,
      itemHeight: rowH,
      scrollContentHeight: contentHeight,
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowY: "auto",
        scrollbarWidth: 4,
      },
      children: (ctx) => {
        this.#lastViewportH = ctx.viewportHeight
        const rowW = ctx.itemWidth
        this.#renderSelectionGroups(rows, body.x, body.y, rowW, rowH, ctx.scrollTop)
        for (const row of rows) {
          const rowY = body.y + row.index * rowH - ctx.scrollTop
          if (rowY + rowH < body.y || rowY > body.y + ctx.viewportHeight) continue
          this.#renderRow(row, body.x, rowY, rowW, rowH)
        }
      },
    })
  }

  #renderSelectionGroups(rows: readonly FileListVisibleRow[], x: number, y: number, w: number, rowH: number, scrollTop: number): void {
    const theme = this.#theme
    if (theme.row.selectedFill === null && theme.row.selectedBorder === null) return
    const selectedIds = new Set(this.#selectedIds)
    let index = 0
    while (index < rows.length) {
      if (!selectedIds.has(rows[index]!.id)) {
        index += 1
        continue
      }
      const start = index
      while (index + 1 < rows.length && selectedIds.has(rows[index + 1]!.id)) index += 1
      const groupY = y + start * rowH - scrollTop
      const groupH = (index - start + 1) * rowH
      this.drawRoundedRect(x, groupY, w, groupH, {
        radius: theme.row.radius,
        fill: theme.row.selectedFill,
        border: theme.row.selectedBorder,
        borderWidth: theme.row.selectedBorder === null ? 0 : 1,
        z: Z.ELEMENT,
      })
      index += 1
    }
  }

  #renderSurfaceChrome(): void {
    const surface = this.#theme.surface
    if (surface.background === null && surface.border === null) return
    this.drawRoundedRect(0, 0, this.rectW, this.rectH, {
      radius: Math.min(surface.borderRadiusPx, Math.min(this.rectW, this.rectH) / 2),
      fill: surface.background,
      border: surface.border,
      borderWidth: surface.borderWidthPx,
      z: -0.16,
    })
  }

  #renderHeader(): void {
    span(this, PANE_FRAME.headerTextX, PANE_FRAME.headerTextY - 3, Math.max(1, this.rectW * 0.58), 22, {
      children: this.#title,
      style: {fontSize: 13, color: this.#theme.header.title},
    })
    const status = this.#headerStatus()
    const statusW = Math.max(72, Math.min(180, this.rectW * 0.34))
    span(this, this.rectW - PANE_FRAME.headerTextX - statusW, PANE_FRAME.headerTextY - 3, statusW, 22, {
      children: status,
      style: {fontSize: 10, color: this.#theme.header.status, textAlign: "right"},
    })
    const rule = paneHeaderRuleRect(this.rectW)
    this.drawRect(rule.x, rule.y, rule.w, rule.h, this.#theme.header.rule, Z.SEPARATOR)
  }

  #renderRow(row: FileListVisibleRow, x: number, y: number, w: number, h: number): void {
    const selected = this.#selectedIds.includes(row.id)
    const active = this.#activeId === row.id
    li(this, x, y, w, h, {
      key: `file-list-row:${row.id}`,
      style: (state) => ({
        background: rowFill(this.#theme, state, selected, active, row.item.disabled === true),
        borderColor: null,
        borderRadius: this.#theme.row.radius,
        borderWidth: 1,
      }),
      onPointerDown: (localX, _localY, event) => {
        if (event === undefined) return
        this.#handleRowPointerDown(row, x, localX ?? x, event)
      },
      children: (state) => {
        this.#drawRowContent(row, x, y, w, h, state, selected, active)
      },
    })
  }

  #drawRowContent(
    row: FileListVisibleRow,
    x: number,
    y: number,
    w: number,
    h: number,
    state: LiElementState,
    selected: boolean,
    active: boolean,
  ): void {
    const disabled = row.item.disabled === true
    const theme = this.#theme
    const indent = theme.row.paddingX + row.depth * theme.row.indent
    const disclosureX = x + indent
    const iconX = disclosureX + theme.row.disclosureWidth + 4
    const iconY = y + (h - 18) / 2
    const nameX = iconX + theme.row.iconWidth + 4
    const metaW = Math.min(theme.row.metaWidth, Math.max(0, w * 0.30))
    const nameW = Math.max(24, x + w - nameX - metaW - 10)
    const textColor = disabled ? theme.row.disabledText : selected || active ? theme.row.selectedText : theme.row.text
    const mutedColor = disabled ? theme.row.disabledText : selected ? theme.row.selectedText : theme.row.muted

    if (row.expandable) {
      span(this, disclosureX, y, theme.row.disclosureWidth, h, {
        children: row.expanded ? "v" : ">",
        style: {fontSize: 11, color: state.hovered || active ? theme.header.title : theme.row.muted, textAlign: "center"},
      })
    }

    this.#drawKindIcon(row.item, iconX, iconY, disabled)
    span(this, nameX, y, nameW, h, {
      children: row.item.name,
      style: {fontSize: 11, color: textColor},
    })

    const metaX = x + w - metaW - 8
    const meta = rowMeta(row.item)
    if (meta !== null) {
      span(this, metaX, y, metaW, h, {
        children: meta,
        style: {fontSize: 9, color: mutedColor, textAlign: "right"},
      })
    }
  }

  #drawKindIcon(item: FileListItem, x: number, y: number, disabled: boolean): void {
    const directory = item.kind === "directory"
    const fill = disabled ? this.#theme.icon.disabledFill : directory ? this.#theme.icon.directoryFill : this.#theme.icon.fileFill
    if (directory) {
      this.drawRoundedRect(x + 3, y + 5, 13, 11, {
        radius: 2,
        fill,
        border: null,
        borderWidth: 0,
        z: Z.ELEMENT_RULE,
      })
      return
    }
    this.drawRoundedRect(x + 5, y + 2, 10, 14, {
      radius: 2,
      fill,
      border: null,
      borderWidth: 0,
      z: Z.ELEMENT_RULE,
    })
    this.drawTextCentered(iconLabel(item), x + 10, y + 9, {
      fontPx: 5,
      material: disabled ? this.#mutedMaterial : this.#statusMaterial,
      maxWidthPx: 9,
      z: Z.TEXT + 0.02,
    })
  }

  #handleRowPointerDown(row: FileListVisibleRow, rowX: number, localX: number, event: MouseEvent): void {
    if (row.item.disabled === true) return
    event.preventDefault()
    this.#activeId = row.id
    const disclosureLeft = rowX + this.#theme.row.paddingX + row.depth * this.#theme.row.indent
    const inDisclosure = row.expandable && localX >= disclosureLeft && localX <= disclosureLeft + this.#theme.row.disclosureWidth + 6
    if (inDisclosure) {
      this.#setDirectoryExpanded(row.item, !row.expanded)
      return
    }
    const update = fileListSelectionAfterClick(rowsWithoutDisabled(this.#rows()), this.#selectedIds, row.id, this.#selectionMode, this.#selectionAnchorId, event)
    this.#applySelection(update.selectedIds, update.anchorId)
    if (event.detail >= 2) this.#openRow(row)
  }

  #openRow(row: FileListVisibleRow): void {
    if (row.item.kind === "directory") {
      this.#setDirectoryExpanded(row.item, !this.#expandedIds.has(row.id))
      return
    }
    this.#onItemOpen?.(row.item)
  }

  #openActive(): void {
    const row = this.#activeRow()
    if (row === null || row.item.disabled === true) return
    this.#openRow(row)
  }

  #toggleActiveSelection(): void {
    const row = this.#activeRow()
    if (row === null || row.item.disabled === true) return
    const update = fileListSelectionAfterClick(rowsWithoutDisabled(this.#rows()), this.#selectedIds, row.id, this.#selectionMode, this.#selectionAnchorId, {metaKey: this.#selectionMode === "multiple"})
    this.#applySelection(update.selectedIds, update.anchorId)
  }

  #moveActive(delta: -1 | 1, extendSelection: boolean): void {
    const rows = rowsWithoutDisabled(this.#rows())
    if (rows.length === 0) return
    const current = Math.max(0, rows.findIndex((row) => row.id === this.#activeId))
    const next = rows[clampInt(current + delta, 0, rows.length - 1)] ?? rows[0]!
    this.#setActiveFromKeyboard(next, extendSelection)
  }

  #moveActiveToEdge(edge: "first" | "last", extendSelection: boolean): void {
    const rows = rowsWithoutDisabled(this.#rows())
    if (rows.length === 0) return
    this.#setActiveFromKeyboard(edge === "first" ? rows[0]! : rows[rows.length - 1]!, extendSelection)
  }

  #setActiveFromKeyboard(row: FileListVisibleRow, extendSelection: boolean): void {
    this.#activeId = row.id
    this.#scrollActiveIntoView()
    if (extendSelection) {
      const update = fileListSelectionAfterKeyboardRange(rowsWithoutDisabled(this.#rows()), this.#selectedIds, row.id, this.#selectionMode, this.#selectionAnchorId)
      this.#applySelection(update.selectedIds, update.anchorId)
      return
    }
    this.#applySelection([row.id], row.id)
  }

  #expandActiveOrMoveToChild(): void {
    const row = this.#activeRow()
    if (row === null) return
    if (row.expandable && !row.expanded) {
      this.#setDirectoryExpanded(row.item, true)
      return
    }
    const rows = rowsWithoutDisabled(this.#rows())
    const index = rows.findIndex((item) => item.id === row.id)
    if (index >= 0 && index + 1 < rows.length && rows[index + 1]!.parentIds.includes(row.id)) {
      this.#setActiveFromKeyboard(rows[index + 1]!, false)
    }
  }

  #collapseActiveOrMoveToParent(): void {
    const row = this.#activeRow()
    if (row === null) return
    if (row.expandable && row.expanded) {
      this.#setDirectoryExpanded(row.item, false)
      return
    }
    const parentId = row.parentIds[row.parentIds.length - 1]
    if (parentId === undefined) return
    const parent = this.#rows().find((item) => item.id === parentId)
    if (parent !== undefined) this.#setActiveFromKeyboard(parent, false)
  }

  #setDirectoryExpanded(item: FileListItem, expanded: boolean): void {
    if (item.kind !== "directory") return
    const wasExpanded = this.#expandedIds.has(item.id)
    if (expanded) this.#expandedIds.add(item.id)
    else this.#expandedIds.delete(item.id)
    if (wasExpanded === expanded) return
    this.#onDirectoryToggle?.(item, expanded)
    this.#emitExpandedChange()
    this.requestRender()
  }

  #applySelection(ids: readonly string[], anchorId: string | null): void {
    const next = normalizeFileListSelection(ids, this.#items, this.#selectionMode)
    if (sameStringArray(next, this.#selectedIds) && this.#selectionAnchorId === anchorId) {
      this.requestRender()
      return
    }
    this.#selectedIds = next
    this.#selectionAnchorId = anchorId
    this.#emitSelectionChange()
    this.requestRender()
  }

  #emitSelectionChange(): void {
    this.#onSelectionChange?.([...this.#selectedIds], selectedItems(this.#items, this.#selectedIds))
  }

  #emitExpandedChange(): void {
    this.#onExpandedChange?.([...this.#expandedIds])
  }

  #rows(): FileListVisibleRow[] {
    return fileListVisibleRows(this.#items, this.#expandedIds)
  }

  #activeRow(): FileListVisibleRow | null {
    const rows = this.#rows()
    return rows.find((row) => row.id === this.#activeId) ?? rows.find((row) => row.item.disabled !== true) ?? null
  }

  #syncActiveToVisibleRows(): void {
    const rows = this.#rows()
    if (rows.length === 0) {
      this.#activeId = null
      return
    }
    if (this.#activeId !== null && rows.some((row) => row.id === this.#activeId)) return
    this.#activeId = rows.find((row) => row.item.disabled !== true)?.id ?? rows[0]!.id
  }

  #scrollActiveIntoView(): void {
    if (this.#activeId === null) return
    const row = this.#rows().find((item) => item.id === this.#activeId)
    if (row === undefined) return
    const scroll = divScrollPosition(this, FILE_LIST_SCROLL_KEY)
    const rowH = this.#theme.row.height
    const rowTop = row.index * rowH
    const rowBottom = rowTop + rowH
    if (rowTop < scroll.top) divScrollTo(this, FILE_LIST_SCROLL_KEY, {top: rowTop})
    else if (rowBottom > scroll.top + this.#lastViewportH) divScrollTo(this, FILE_LIST_SCROLL_KEY, {top: rowBottom - this.#lastViewportH})
  }

  #headerStatus(): string {
    const visible = this.#rows().length
    if (this.#selectedIds.length > 0) return `${this.#selectedIds.length} selected`
    return `${visible} visible`
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {showHeader: this.#showHeader, minW: MIN_PANE_W, minH: MIN_PANE_H}
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
}

function rowFill(theme: FileListPaneTheme, state: LiElementState, selected: boolean, active: boolean, disabled: boolean): Color | null {
  if (disabled) return null
  if (selected) return null
  if (active) return theme.row.activeFill
  if (state.hovered) return theme.row.hoverFill
  return null
}

function rowMeta(item: FileListItem): string | null {
  if (item.kind === "directory") return item.sizeLabel ?? "folder"
  return item.sizeLabel ?? null
}

function resolveFileListPaneTheme(input: FileListPaneThemeInput | undefined): FileListPaneTheme {
  if (input === undefined) return cloneTheme(FILE_LIST_INTELLIJ_THEME)
  if (typeof input === "string") return cloneTheme(themePreset(input))
  const base = cloneTheme(themePreset(input.preset ?? "intellij"))
  return {
    surface: {...base.surface, ...input.surface},
    header: {...base.header, ...input.header},
    row: {...base.row, ...input.row},
    icon: {...base.icon, ...input.icon},
  }
}

function themePreset(name: FileListPaneThemeName): FileListPaneTheme {
  return name === "material" ? FILE_LIST_MATERIAL_THEME : FILE_LIST_INTELLIJ_THEME
}

function cloneTheme(theme: FileListPaneTheme): FileListPaneTheme {
  return {
    surface: {...theme.surface},
    header: {...theme.header},
    row: {...theme.row},
    icon: {...theme.icon},
  }
}

function iconLabel(item: FileListItem): string {
  if (item.iconLabel !== undefined) return item.iconLabel.slice(0, 3).toUpperCase()
  if (item.kind === "directory") return "D"
  const dot = item.name.lastIndexOf(".")
  if (dot >= 0 && dot + 1 < item.name.length) return item.name.slice(dot + 1, dot + 4).toUpperCase()
  return "F"
}

function rowsWithoutDisabled(rows: readonly FileListVisibleRow[]): FileListVisibleRow[] {
  return rows.filter((row) => row.item.disabled !== true)
}

function firstVisibleSelectableId(items: readonly FileListItem[], expandedIds: ReadonlySet<string>): string | null {
  return fileListVisibleRows(items, expandedIds).find((row) => row.item.disabled !== true)?.id ?? null
}

function directoryIds(items: readonly FileListItem[]): string[] {
  const ids: string[] = []
  for (const item of items) {
    if (item.kind === "directory") ids.push(item.id)
    if (item.children !== undefined) ids.push(...directoryIds(item.children))
  }
  return ids
}

function selectedItems(items: readonly FileListItem[], selectedIds: readonly string[]): FileListItem[] {
  const selected = new Set(selectedIds)
  const result: FileListItem[] = []
  appendSelectedItems(result, items, selected)
  return result
}

function appendSelectedItems(result: FileListItem[], items: readonly FileListItem[], selectedIds: ReadonlySet<string>): void {
  for (const item of items) {
    if (selectedIds.has(item.id)) result.push(item)
    if (item.children !== undefined) appendSelectedItems(result, item.children, selectedIds)
  }
}

function findFileListItem(items: readonly FileListItem[], id: string): FileListItem | null {
  for (const item of items) {
    if (item.id === id) return item
    const child = item.children === undefined ? null : findFileListItem(item.children, id)
    if (child !== null) return child
  }
  return null
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isSecondaryPointer(event: MouseEvent): boolean {
  return event.button === 2
}
