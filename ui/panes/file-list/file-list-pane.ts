import {Color, TextMaterial} from "@metafor/engine"
import {uiIcons} from "@ui/components"
import {UiSurface, Z, divScrollPosition, divScrollTo, li, palette, radii, span, textMaterial, ul, type LiElementState} from "@ui/elements"
import {HudWindowTitleBar, type HudWindowTitleBarAction} from "@ui/hud"
import {
  PANE_FRAME,
  beginPaneFrameDrag,
  paneBodyRect,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
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
  initialSelection?: "none" | "first"
  expandedIds?: readonly string[]
  theme?: FileListPaneThemeInput
  showHeader?: boolean
  draggable?: boolean
  resizable?: boolean
  onSelectionChange?: (selectedIds: readonly string[], selectedItems: readonly FileListItem[]) => void
  onExpandedChange?: (expandedIds: readonly string[]) => void
  onItemOpen?: (item: FileListItem) => void
  onOpenDirectoryRequest?: () => void
  onDirectoryToggle?: (item: FileListItem, expanded: boolean) => void
  onFrameRectPreview?: (rect: PaneRect) => void
  onFrameRectChange?: (rect: PaneRect) => void
  onFrameDockRequest?: () => void
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
    selectedInactiveFill: Color | null
    selectedInactiveBorder: Color | null
    text: Color
    muted: Color
    selectedText: Color
    selectedInactiveText: Color
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
    selectedInactiveFill: new Color(52 / 255, 56 / 255, 64 / 255, 0.88),
    selectedInactiveBorder: null,
    text: palette.text,
    muted: palette.muted,
    selectedText: palette.text,
    selectedInactiveText: palette.text,
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
    selectedInactiveFill: new Color(255 / 255, 255 / 255, 255 / 255, 0.10),
    selectedInactiveBorder: null,
    text: new Color(238 / 255, 238 / 255, 238 / 255, 1),
    muted: new Color(158 / 255, 158 / 255, 158 / 255, 1),
    selectedText: new Color(245 / 255, 250 / 255, 255 / 255, 1),
    selectedInactiveText: new Color(238 / 255, 238 / 255, 238 / 255, 1),
    disabledText: new Color(117 / 255, 117 / 255, 117 / 255, 1),
  },
  icon: {
    directoryFill: new Color(255 / 255, 202 / 255, 40 / 255, 0.94),
    fileFill: new Color(144 / 255, 164 / 255, 174 / 255, 0.92),
    disabledFill: new Color(117 / 255, 117 / 255, 117 / 255, 0.36),
  },
}

export const FILE_LIST_DEFAULT_THEME: FileListPaneTheme = {
  surface: {
    background: palette.bg,
    border: palette.borderDim,
    borderWidthPx: 1,
    borderRadiusPx: radii.pane,
  },
  header: {
    ...FILE_LIST_INTELLIJ_THEME.header,
    rule: palette.borderDim,
  },
  row: {
    ...FILE_LIST_INTELLIJ_THEME.row,
    height: 22,
    radius: 3,
    indent: 14,
    disclosureWidth: 12,
    iconWidth: 16,
    hoverFill: palette.bgHot,
    activeFill: palette.activeRowFill,
    selectedFill: palette.activeRowFill,
    selectedBorder: palette.border,
    selectedInactiveFill: new Color(52 / 255, 56 / 255, 64 / 255, 0.88),
    selectedInactiveBorder: null,
  },
  icon: {
    ...FILE_LIST_INTELLIJ_THEME.icon,
  },
}

export class FileListPane extends UiSurface {
  #title: string
  #items: readonly FileListItem[]
  #selectionMode: FileListSelectionMode
  #selectedIds: string[]
  #expandedIds: Set<string>
  #visibleRows: FileListVisibleRow[] | null = null
  #activeId: string | null
  #selectionAnchorId: string | null
  #showHeader: boolean
  #draggable: boolean
  #resizable: boolean
  #focused = false
  #theme: FileListPaneTheme
  #frameDrag: PaneFrameDrag | null = null
  #lastViewportH = 1
  #onSelectionChange: ((selectedIds: readonly string[], selectedItems: readonly FileListItem[]) => void) | undefined
  #onExpandedChange: ((expandedIds: readonly string[]) => void) | undefined
  #onItemOpen: ((item: FileListItem) => void) | undefined
  #onOpenDirectoryRequest: (() => void) | undefined
  #onDirectoryToggle: ((item: FileListItem, expanded: boolean) => void) | undefined
  #onFrameRectPreview: ((rect: PaneRect) => void) | undefined
  #onFrameRectChange: ((rect: PaneRect) => void) | undefined
  #onFrameDockRequest: (() => void) | undefined

  #statusMaterial: TextMaterial
  #mutedMaterial: TextMaterial

  constructor(opts: FileListPaneOpts = {}) {
    super({bgColor: null, borderColor: null})
    this.#theme = resolveFileListPaneTheme(opts.theme)
    this.#statusMaterial = new TextMaterial({color: this.#theme.row.muted})
    this.#mutedMaterial = new TextMaterial({color: this.#theme.row.disabledText})
    this.node.name = "FileListPane"
    this.#title = opts.title ?? "Files"
    this.#items = opts.items ?? []
    this.#selectionMode = opts.selectionMode ?? "single"
    this.#expandedIds = new Set(opts.expandedIds ?? [])
    this.#selectedIds = this.#initialSelectedIds(opts)
    this.#activeId = this.#selectedIds[0] ?? firstVisibleSelectableId(this.#items, this.#expandedIds)
    this.#selectionAnchorId = this.#activeId
    this.#showHeader = opts.showHeader ?? true
    this.#draggable = opts.draggable ?? false
    this.#resizable = opts.resizable ?? false
    this.#onSelectionChange = opts.onSelectionChange
    this.#onExpandedChange = opts.onExpandedChange
    this.#onItemOpen = opts.onItemOpen
    this.#onOpenDirectoryRequest = opts.onOpenDirectoryRequest
    this.#onDirectoryToggle = opts.onDirectoryToggle
    this.#onFrameRectPreview = opts.onFrameRectPreview
    this.#onFrameRectChange = opts.onFrameRectChange
    this.#onFrameDockRequest = opts.onFrameDockRequest
  }

  setTheme(theme: FileListPaneThemeInput): void {
    this.#theme = resolveFileListPaneTheme(theme)
    this.#statusMaterial = new TextMaterial({color: this.#theme.row.muted})
    this.#mutedMaterial = new TextMaterial({color: this.#theme.row.disabledText})
    this.requestRender()
  }

  getItems(): readonly FileListItem[] {
    return this.#items
  }

  setItems(items: readonly FileListItem[]): void {
    this.#items = items
    this.#visibleRows = null
    const nextSelection = normalizeFileListSelection(this.#selectedIds, this.#items, this.#selectionMode)
    const selectionChanged = !sameStringArray(nextSelection, this.#selectedIds)
    this.#selectedIds = nextSelection
    const knownIds = new Set(fileListAllItemIds(this.#items))
    this.#expandedIds = new Set([...this.#expandedIds].filter((id) => knownIds.has(id)))
    if (this.#activeId !== null && !knownIds.has(this.#activeId)) this.#activeId = null
    if (this.#selectionAnchorId !== null && !knownIds.has(this.#selectionAnchorId)) this.#selectionAnchorId = this.#activeId
    this.#syncActiveToVisibleRows()
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

  focus(): void {
    this.canvas?.setFocused(this)
    this.canvas?.inputProxy?.focus()
  }

  setSelectedIds(ids: readonly string[]): void {
    this.#applySelection(normalizeFileListSelection(ids, this.#items, this.#selectionMode), ids[0] ?? null)
  }

  ensureSelection(): void {
    if (this.#selectedIds.length > 0) return
    const row = this.#activeRow()
    if (row === null || row.item.disabled === true) return
    this.#applySelection([row.id], row.id)
  }

  expandedIds(): readonly string[] {
    return [...this.#expandedIds]
  }

  setExpandedIds(ids: readonly string[]): void {
    const knownIds = new Set(fileListAllItemIds(this.#items))
    const next = new Set(ids.filter((id) => knownIds.has(id)))
    if (sameStringArray([...next], [...this.#expandedIds])) return
    this.#expandedIds = next
    this.#visibleRows = null
    this.#syncActiveToVisibleRows()
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

  onActivate(): void {
    this.#focused = true
    this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate?.()
    this.#frameDrag = null
    this.#focused = false
    this.requestRender()
  }

  protected render(): void {
    this.#renderSurfaceChrome()
    const rows = this.#rows()
    if (this.#showHeader) this.#renderHeader()
    const body = paneBodyRect(this.rectW, this.rectH, {showHeader: this.#showHeader})
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
    const {fill: selectedFill, border: selectedBorder} = fileListSelectionGroupStyle(theme, this.#focused)
    if (selectedFill === null && selectedBorder === null) return
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
        fill: selectedFill,
        border: selectedBorder,
        borderWidth: selectedBorder === null ? 0 : 1,
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
      border: this.active && surface.border !== null ? palette.windowActiveBorder : surface.border,
      borderWidth: surface.borderWidthPx,
      z: -0.16,
    })
  }

  #renderHeader(): void {
    const buttonSize = 22
    const status = this.#headerStatus(this.#rows())
    const rightActions: HudWindowTitleBarAction[] = []
    if (this.#onOpenDirectoryRequest !== undefined) {
      rightActions.push({
        label: "Open directory",
        iconSrc: uiIcons.plus,
        action: () => this.#onOpenDirectoryRequest?.(),
        width: buttonSize,
      })
    }
    HudWindowTitleBar(this, 0, 0, this.rectW, {
      title: this.#title,
      subtitle: status,
      ...(this.#onFrameDockRequest === undefined ? {} : {onMinimize: () => this.#onFrameDockRequest?.()}),
      minimizeLabel: "Dock",
      rightActions,
      height: PANE_FRAME.headerHeight,
      titleFontPx: 13,
      subtitleFontPx: 10,
      ruleColor: this.#theme.header.rule,
    })
  }

  #renderRow(row: FileListVisibleRow, x: number, y: number, w: number, h: number): void {
    const selected = this.#selectedIds.includes(row.id)
    const active = this.#activeId === row.id
    li(this, x, y, w, h, {
      key: `file-list-row:${row.id}`,
      style: (state) => ({
        background: fileListRowFill(this.#theme, state, selected, row.item.disabled === true),
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
    const muted = disabled || row.item.muted === true
    const theme = this.#theme
    const indent = theme.row.paddingX + row.depth * theme.row.indent
    const disclosureX = x + indent
    const iconX = disclosureX + theme.row.disclosureWidth + 4
    const iconSize = Math.min(theme.row.iconWidth, Math.max(14, h - 4))
    const iconY = y + (h - iconSize) / 2
    const nameX = iconX + theme.row.iconWidth + 4
    const meta = rowMeta(row.item)
    const metaW = meta === null ? 0 : Math.min(theme.row.metaWidth, Math.max(0, w * 0.30), Math.ceil(this.measureText(meta, 9)) + 12)
    const nameRightGap = meta === null ? 8 : metaW + 10
    const nameW = Math.max(24, x + w - nameX - nameRightGap)
    const selectedText = this.#focused ? theme.row.selectedText : theme.row.selectedInactiveText
    const textColor = muted ? theme.row.disabledText : selected ? selectedText : theme.row.text
    const mutedColor = muted ? theme.row.disabledText : selected ? selectedText : theme.row.muted

    if (row.expandable) {
      this.#drawDisclosureChevron(
        disclosureX,
        y,
        theme.row.disclosureWidth,
        h,
        row.expanded,
        state.hovered ? theme.header.title : selected ? selectedText : theme.row.muted,
      )
    }

    this.#drawKindIcon(row.item, iconX, iconY, iconSize, muted)
    this.#drawFileName(row.item.name, nameX, y, nameW, h, textColor)

    const metaX = x + w - metaW - 8
    if (meta !== null) {
      span(this, metaX, y, metaW, h, {
        children: meta,
        style: {fontSize: 9, color: mutedColor, textAlign: "right"},
      })
    }
  }

  #drawFileName(name: string, x: number, y: number, w: number, h: number, color: Color): void {
    const fontPx = 11
    this.pushClip(x, y, w, h)
    try {
      this.drawText(name, x, y + Math.max(0, (h - fontPx) / 2), {
        fontPx,
        material: textMaterial(this, color),
        fit: false,
        measure: false,
        z: Z.TEXT,
      })
    } finally {
      this.popClip()
    }
  }

  #drawDisclosureChevron(x: number, y: number, w: number, h: number, expanded: boolean, color: Color): void {
    const cx = x + w / 2
    const cy = y + h / 2
    const size = Math.min(6, Math.max(4, h * 0.28))
    const half = size / 2
    const z = Z.TEXT + 0.01

    if (expanded) {
      this.drawLine(cx - half, cy - half / 2, cx, cy + half, color, 1.4, z)
      this.drawLine(cx + half, cy - half / 2, cx, cy + half, color, 1.4, z)
      return
    }

    this.drawLine(cx - half / 2, cy - half, cx + half, cy, color, 1.4, z)
    this.drawLine(cx - half / 2, cy + half, cx + half, cy, color, 1.4, z)
  }

  #drawKindIcon(item: FileListItem, x: number, y: number, size: number, muted: boolean): void {
    const directory = item.kind === "directory"
    const fill = muted ? this.#theme.icon.disabledFill : directory ? this.#theme.icon.directoryFill : this.#theme.icon.fileFill
    if (directory) {
      const tabX = x + size * 0.14
      const tabY = y + size * 0.20
      const tabW = size * 0.42
      const tabH = size * 0.26
      const bodyX = x + size * 0.07
      const bodyY = y + size * 0.36
      const bodyW = size * 0.86
      const bodyH = size * 0.52
      const border = muted ? null : withAlpha(palette.borderBright, 0.24)

      this.drawRoundedRect(tabX, tabY, tabW, tabH, {
        radius: {tl: 1.8, tr: 1.8, br: 0.8, bl: 0.8},
        fill: mixColor(fill, palette.text, muted ? 0 : 0.12),
        border,
        borderWidth: 0.8,
        z: Z.ELEMENT_RULE,
      })
      this.drawRoundedRect(bodyX, bodyY, bodyW, bodyH, {
        radius: 2.2,
        fill,
        border,
        borderWidth: 0.8,
        z: Z.ELEMENT_RULE + 0.02,
      })
      return
    }

    const fileW = size * 0.58
    const fileH = size * 0.76
    const fileX = x + (size - fileW) / 2
    const fileY = y + (size - fileH) / 2
    this.drawRoundedRect(fileX, fileY, fileW, fileH, {
      radius: 2,
      fill,
      border: null,
      borderWidth: 0,
      z: Z.ELEMENT_RULE,
    })
    this.drawTextCentered(iconLabel(item), x + size / 2, y + size / 2 + 0.5, {
      fontPx: Math.max(4, size * 0.30),
      material: muted ? this.#mutedMaterial : this.#statusMaterial,
      maxWidthPx: Math.max(8, fileW - 1),
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
    this.#visibleRows = null
    this.#syncActiveToVisibleRows()
    this.#onDirectoryToggle?.(item, expanded)
    this.#emitExpandedChange()
    this.requestRender()
  }

  #applySelection(ids: readonly string[], anchorId: string | null): void {
    const next = normalizeFileListSelection(ids, this.#items, this.#selectionMode)
    const nextActiveId = next[0] ?? anchorId
    if (sameStringArray(next, this.#selectedIds) && this.#selectionAnchorId === anchorId) {
      this.#activeId = nextActiveId
      this.requestRender()
      return
    }
    this.#selectedIds = next
    this.#activeId = nextActiveId
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
    this.#visibleRows ??= fileListVisibleRows(this.#items, this.#expandedIds)
    return this.#visibleRows
  }

  #activeRow(): FileListVisibleRow | null {
    const rows = this.#rows()
    return rows.find((row) => row.id === this.#activeId) ?? rows.find((row) => row.item.disabled !== true) ?? null
  }

  #syncActiveToVisibleRows(rows: readonly FileListVisibleRow[] = this.#rows()): void {
    if (rows.length === 0) {
      this.#activeId = null
      return
    }
    if (this.#activeId !== null && rows.some((row) => row.id === this.#activeId && row.item.disabled !== true)) return
    const selected = this.#selectedIds.find((id) => rows.some((row) => row.id === id && row.item.disabled !== true))
    this.#activeId = selected ?? rows.find((row) => row.item.disabled !== true)?.id ?? rows[0]!.id
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

  #headerStatus(rows: readonly FileListVisibleRow[] = this.#rows()): string {
    const visible = rows.length
    if (this.#selectedIds.length > 0) return `${this.#selectedIds.length} selected`
    return `${visible} visible`
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: this.#showHeader,
      movable: this.#draggable,
      resizable: this.#resizable,
      minW: MIN_PANE_W,
      minH: MIN_PANE_H,
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

  #initialSelectedIds(opts: FileListPaneOpts): string[] {
    const explicit = normalizeFileListSelection(opts.selectedIds ?? [], this.#items, this.#selectionMode)
    if (explicit.length > 0 || opts.initialSelection !== "first") return explicit
    const first = firstVisibleSelectableId(this.#items, this.#expandedIds)
    return first === null ? [] : [first]
  }
}

export function fileListRowFill(theme: FileListPaneTheme, state: LiElementState, selected: boolean, disabled: boolean): Color | null {
  if (disabled) return null
  if (selected) return null
  if (state.hovered) return theme.row.hoverFill
  return null
}

export function fileListSelectionGroupStyle(theme: FileListPaneTheme, focused: boolean): {fill: Color | null; border: Color | null} {
  return focused
    ? {fill: theme.row.selectedFill, border: theme.row.selectedBorder}
    : {fill: theme.row.selectedInactiveFill, border: theme.row.selectedInactiveBorder}
}

function rowMeta(item: FileListItem): string | null {
  return item.sizeLabel ?? null
}

function resolveFileListPaneTheme(input: FileListPaneThemeInput | undefined): FileListPaneTheme {
  if (input === undefined) return cloneTheme(FILE_LIST_DEFAULT_THEME)
  if (typeof input === "string") return cloneTheme(themePreset(input))
  const base = cloneTheme(input.preset === undefined ? FILE_LIST_DEFAULT_THEME : themePreset(input.preset))
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

function mixColor(a: Color, b: Color, t: number): Color {
  const k = Math.min(1, Math.max(0, t))
  return new Color(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k,
    a.a + (b.a - a.a) * k,
  )
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, Math.min(1, Math.max(0, alpha)))
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isSecondaryPointer(event: MouseEvent): boolean {
  return event.button === 2
}
