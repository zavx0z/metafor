import {type Object3D} from "@metafor/engine"
import {Button} from "@ui/components/button"
import {Pane} from "@ui/components/pane"
import {TextField} from "@ui/components/text-field"
import {Typography} from "@ui/components/typography"
import {
  UiSurface,
  activeUiTheme,
  blenderRgba8ToColor,
  div,
  flexColumn,
  flexRow,
  li,
  resolveOpaqueRgba8,
  rgba8ToColor,
  span,
  ul,
  uiShapeMetrics,
  Z,
  type UiSurfaceRect,
} from "@ui/elements"
import {playgroundTheme} from "./theme.ts"
import type {PlaygroundStoryArgs, PlaygroundStoryControl} from "./story.ts"

export type PlaygroundNavigationGroup = Readonly<{
  id: string
  label: string
  collapsed?: boolean
}>

export type PlaygroundNavigationItem<Route extends string> = Readonly<{
  id: string
  label: string
  route: Route
  disabled?: boolean
  group?: PlaygroundNavigationGroup
  searchText?: string
}>

export type PlaygroundNavigationWindow = Readonly<{
  offset: number
  limit: number
}>

export type PlaygroundNavigationView<Route extends string> = Readonly<{
  total: number
  offset: number
  items: readonly PlaygroundNavigationItem<Route>[]
}>

export type PlaygroundNavigationOptions<Route extends string> = Readonly<{
  title: string
  items: readonly PlaygroundNavigationItem<Route>[]
  route: Route
  onNavigate(route: Route): void
  query?: string
  window?: PlaygroundNavigationWindow
  searchPlaceholder?: string
  onQueryChange?(query: string): void
  onGroupToggle?(groupId: string, collapsed: boolean): void
}>

export type PlaygroundInfoLine = string | Readonly<{
  id: string
  label: string
}>

export type PlaygroundInfoOptions = Readonly<{
  title: string
  lines: readonly PlaygroundInfoLine[]
  status?: string
}>

export type PlaygroundPreviewChromeOptions = Readonly<{
  title?: string
  description?: string
}>

export type PlaygroundStoryPanelMode = "controls" | "events"

export type PlaygroundStoryEvent = Readonly<{
  id: string
  label: string
  value: string
}>

export type PlaygroundStoryPanelOptions = Readonly<{
  source: string
  args: PlaygroundStoryArgs
  controls: readonly PlaygroundStoryControl[]
  events?: readonly PlaygroundStoryEvent[]
  mode: PlaygroundStoryPanelMode
  onModeChange(mode: PlaygroundStoryPanelMode): void
  onControlChange(key: string, value: unknown): void
  onCopy(source: string): void | Promise<void>
}>

export type PlaygroundRetainedOwnerDiagnostics = Readonly<{
  key: string
  materializations: number
}>

export type PlaygroundRetainedDiagnostics = Readonly<{
  layoutPlans: number
  materializations: number
  owners: readonly PlaygroundRetainedOwnerDiagnostics[]
}>

type RetainedOwner = {
  key: string
  parent: Object3D
  frame: UiSurfaceRect | null
  materializations: number
}

type NormalizedNavigationGroup = Readonly<{
  id: string
  label: string
  collapsed: boolean
}>

type NormalizedNavigationItem<Route extends string> = Readonly<{
  id: string
  label: string
  route: Route
  disabled: boolean
  group: NormalizedNavigationGroup | undefined
  searchText: string
}>

type NormalizedNavigationOptions<Route extends string> = Readonly<{
  title: string
  items: readonly NormalizedNavigationItem<Route>[]
  route: Route
  onNavigate(route: Route): void
  query: string
  window: PlaygroundNavigationWindow | undefined
  searchPlaceholder: string | undefined
  onQueryChange: ((query: string) => void) | undefined
  onGroupToggle: ((groupId: string, collapsed: boolean) => void) | undefined
}>

type NavigationSectionRow<Route extends string> = Readonly<{
  kind: "section"
  id: string
  ownerKey: string
  group: NormalizedNavigationGroup
  leaves: readonly NormalizedNavigationItem<Route>[]
}>

type NavigationLeafRow<Route extends string> = Readonly<{
  kind: "leaf"
  id: string
  ownerKey: string
  item: NormalizedNavigationItem<Route>
  parentId: string | null
}>

type NavigationRow<Route extends string> = NavigationSectionRow<Route> | NavigationLeafRow<Route>

type NormalizedInfoLine = Readonly<{
  key: string
  label: string
}>

type NormalizedInfoOptions = Readonly<{
  title: string
  lines: readonly NormalizedInfoLine[]
  status: string | undefined
}>

type NormalizedStoryControl = Readonly<{
  descriptor: PlaygroundStoryControl
  value: unknown
}>

type NormalizedStoryPanelOptions = Readonly<{
  source: string
  sourceLines: readonly string[]
  controls: readonly NormalizedStoryControl[]
  events: readonly PlaygroundStoryEvent[]
  mode: PlaygroundStoryPanelMode
  onModeChange(mode: PlaygroundStoryPanelMode): void
  onControlChange(key: string, value: unknown): void
  onCopy(source: string): void | Promise<void>
}>

const PANEL_OWNER = "panel"
const TITLE_OWNER = "title"
const STATUS_OWNER = "status"
const SEARCH_OWNER = "search"
const SOURCE_TITLE_OWNER = "source-title"
const SOURCE_COPY_OWNER = "source-copy"
const SOURCE_BOX_OWNER = "source-box"
const SOURCE_CONTROLS_TAB_OWNER = "source-tab:controls"
const SOURCE_EVENTS_TAB_OWNER = "source-tab:events"
const workbenchText = rgba8ToColor(activeUiTheme.widgets.box.text)
const workbenchMuted = rgba8ToColor(activeUiTheme.widgets.menuBack.text)
const workbenchSectionFill = rgba8ToColor(activeUiTheme.spaceNode.panel.back)

abstract class RetainedPlaygroundSurface extends UiSurface {
  readonly #retainedRoot: Object3D
  readonly #owners = new Map<string, RetainedOwner>()
  readonly #ownerKeysByParent = new Map<Object3D, string>()
  readonly #dirtyOwners = new Set<string>()
  #layoutPlans = 0
  #materializations = 0
  #panelActive = false

  protected constructor(name: string) {
    super({bgColor: null, borderColor: null})
    this.node.name = name
    this.#retainedRoot = this.createRetainedParent()
    this.#retainedRoot.name = `${name}.retainedRoot`
  }

  /** Bounded cumulative evidence for the current retained owners of this dev surface. */
  get diagnostics(): PlaygroundRetainedDiagnostics {
    const owners: PlaygroundRetainedOwnerDiagnostics[] = []
    for (const parent of this.#retainedRoot.children) {
      const key = this.#ownerKeysByParent.get(parent)
      const owner = key === undefined ? undefined : this.#owners.get(key)
      if (owner !== undefined) owners.push(Object.freeze({key: owner.key, materializations: owner.materializations}))
    }
    return Object.freeze({
      layoutPlans: this.#layoutPlans,
      materializations: this.#materializations,
      owners: Object.freeze(owners),
    })
  }

  protected noteLayoutPlan(): void {
    this.#layoutPlans += 1
  }

  protected markOwnerDirty(key: string): void {
    if (this.#owners.has(key)) this.#dirtyOwners.add(key)
  }

  protected get panelActive(): boolean {
    return this.#panelActive
  }

  onActivate(): void {
    if (this.#panelActive) return
    this.#panelActive = true
    this.markOwnerDirty(PANEL_OWNER)
    this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (!this.#panelActive) return
    this.#panelActive = false
    this.markOwnerDirty(PANEL_OWNER)
    this.requestRender()
  }

  protected reconcileOwner(key: string, name: string, frame: UiSurfaceRect, force = false): RetainedOwner {
    let owner = this.#owners.get(key)
    if (owner === undefined) {
      const parent = this.createRetainedParent(this.#retainedRoot)
      parent.name = name
      owner = {key, parent, frame: null, materializations: 0}
      this.#owners.set(key, owner)
      this.#ownerKeysByParent.set(parent, key)
      this.#dirtyOwners.add(key)
    }

    const previous = owner.frame
    if (force || previous === null || previous.x !== frame.x || previous.y !== frame.y) {
      this.updateRetainedTransform(owner.parent, (parent) => {
        parent.position.set(frame.x * this.pixelScale, -frame.y * this.pixelScale, 0)
      })
    }
    if (force || previous === null || previous.w !== frame.w || previous.h !== frame.h) this.#dirtyOwners.add(key)
    owner.frame = {...frame}
    return owner
  }

  protected removeMissingOwners(retainedKeys: ReadonlySet<string>): void {
    for (const [key, owner] of this.#owners) {
      if (retainedKeys.has(key)) continue
      this.#dirtyOwners.delete(key)
      this.#ownerKeysByParent.delete(owner.parent)
      this.removeRetainedParent(owner.parent)
      this.#owners.delete(key)
    }
  }

  protected setOwnerOrder(keys: readonly string[]): void {
    const parents = keys.map((key) => this.#requireOwner(key).parent)
    if (parents.length === this.#retainedRoot.children.length &&
      parents.every((parent, index) => this.#retainedRoot.children[index] === parent)) return
    for (const parent of parents) {
      this.#retainedRoot.remove(parent)
      this.#retainedRoot.add(parent)
    }
  }

  protected materializeDirtyOwners(draw: (key: string, frame: UiSurfaceRect) => void): void {
    for (const key of [...this.#dirtyOwners]) {
      const owner = this.#owners.get(key)
      this.#dirtyOwners.delete(key)
      if (owner?.frame === null || owner === undefined) continue
      try {
        this.materializeRetainedParent(owner.parent, () => draw(key, owner.frame!))
      } catch (error) {
        if (this.#owners.get(key) === owner) this.#dirtyOwners.add(key)
        throw error
      }
      owner.materializations += 1
      this.#materializations += 1
    }
  }

  protected override onRetainedInteractionChange(parent: Object3D): void {
    const key = this.#ownerKeysByParent.get(parent)
    if (key !== undefined) this.#dirtyOwners.add(key)
  }

  override dispose(): void {
    super.dispose()
    this.#owners.clear()
    this.#ownerKeysByParent.clear()
    this.#dirtyOwners.clear()
  }

  #requireOwner(key: string): RetainedOwner {
    const owner = this.#owners.get(key)
    if (owner === undefined) throw new Error(`Unknown retained playground owner: ${key}`)
    return owner
  }
}

abstract class PlaygroundNavigationBaseSurface<Route extends string> extends RetainedPlaygroundSurface {
  #options: NormalizedNavigationOptions<Route>
  #layout: Readonly<{w: number; h: number; pixelScale: number; font: unknown; ownerKeys: readonly string[]}> | null = null
  #focusedOwnerKey: string | null
  #focusVisible = false
  readonly #dock: boolean

  protected constructor(options: PlaygroundNavigationOptions<Route>, dock: boolean) {
    const normalized = normalizeNavigationOptions(options)
    super(dock ? "PlaygroundDockSurface" : `PlaygroundNavigationSurface.${normalized.title}`)
    this.#options = normalized
    this.#dock = dock
    this.#focusedOwnerKey = preferredNavigationRowFocus(
      this.#focusRows(normalized),
      normalized.route,
      null,
      normalized.onGroupToggle !== undefined,
    )
  }

  /** Stable descriptor focus shared by pointer and keyboard navigation. */
  get focusedItemId(): string | null {
    return navigationRowId(this.#focusRows().find(({ownerKey}) => ownerKey === this.#focusedOwnerKey))
  }

  setOptions(options: PlaygroundNavigationOptions<Route>): void {
    const next = normalizeNavigationOptions(options)
    const previous = this.#options
    let changed = !sameIds(previous.items, next.items) ||
      previous.query !== next.query ||
      !sameNavigationWindow(previous.window, next.window) ||
      !sameStrings(navigationOwnerKeys(previous, this.#dock), navigationOwnerKeys(next, this.#dock))

    if (!this.#dock && previous.title !== next.title) {
      this.markOwnerDirty(TITLE_OWNER)
      changed = true
    }
    if (!this.#dock && (previous.query !== next.query || previous.searchPlaceholder !== next.searchPlaceholder ||
      (previous.onQueryChange === undefined) !== (next.onQueryChange === undefined))) {
      this.markOwnerDirty(SEARCH_OWNER)
      changed = true
    }

    if (!this.#dock) {
      const previousGroups = navigationGroups(previous)
      const nextGroups = navigationGroups(next)
      for (const [id, group] of nextGroups) {
        const before = previousGroups.get(id)
        if (before !== undefined && (before.label !== group.label || before.collapsed !== group.collapsed ||
          (previous.onGroupToggle === undefined) !== (next.onGroupToggle === undefined))) {
          this.markOwnerDirty(groupOwnerKey(id))
          changed = true
        }
      }
    }

    const previousItems = new Map(previous.items.map((item) => [item.id, item] as const))
    for (const item of next.items) {
      const before = previousItems.get(item.id)
      if (before === undefined) continue
      const beforeActive = before.route === previous.route
      const nextActive = item.route === next.route
      if (before.label !== item.label || before.route !== item.route || before.disabled !== item.disabled ||
        before.searchText !== item.searchText || !sameNavigationGroup(before.group, item.group) || beforeActive !== nextActive) {
        this.markOwnerDirty(itemOwnerKey(item.id))
        changed = true
      }
    }

    this.#options = next
    const nextFocus = preferredNavigationRowFocus(
      this.#focusRows(next),
      next.route,
      this.#focusedOwnerKey,
      next.onGroupToggle !== undefined,
    )
    if (this.#setFocus(nextFocus, this.#focusVisible)) changed = true
    if (changed) this.requestRender()
  }

  override onActivate(): void {
    super.onActivate()
    if (this.#setFocus(this.#focusedOwnerKey, true)) this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (this.#setFocus(this.#focusedOwnerKey, false)) this.requestRender()
  }

  onKey(event: KeyboardEvent): void {
    if (this.#usesAccordion() && this.#handleAccordionKey(event)) return
    const direction = navigationDirection(event.key)
    if (direction !== null) {
      event.preventDefault()
      const enabled = this.#focusRows().filter((row) => navigationRowEnabled(row, false))
      let nextFocus: string | null = null
      if (enabled.length > 0) {
        if (direction === "home") nextFocus = enabled[0]!.ownerKey
        else if (direction === "end") nextFocus = enabled.at(-1)!.ownerKey
        else {
          const currentIndex = enabled.findIndex(({ownerKey}) => ownerKey === this.#focusedOwnerKey)
          const origin = currentIndex < 0 ? (direction === "next" ? -1 : 0) : currentIndex
          const offset = direction === "next" ? 1 : -1
          nextFocus = enabled[(origin + offset + enabled.length) % enabled.length]!.ownerKey
        }
      }
      if (this.#setFocus(nextFocus, true)) this.requestRender()
      return
    }
    if (!isNavigationActivationKey(event.key)) return
    event.preventDefault()
    if (this.#setFocus(preferredNavigationRowFocus(
      this.#focusRows(),
      this.#options.route,
      this.#focusedOwnerKey,
      false,
    ), true)) this.requestRender()
    this.#activateFocusedRow()
  }

  protected override render(): void {
    if (this.#layoutChanged()) this.#reconcileLayout()
    this.materializeDirtyOwners((key, frame) => this.#drawOwner(key, frame))
  }

  #layoutChanged(): boolean {
    const ownerKeys = navigationOwnerKeys(this.#options, this.#dock)
    return this.#layout === null || this.#layout.w !== this.rectW || this.#layout.h !== this.rectH ||
      this.#layout.pixelScale !== this.pixelScale || this.#layout.font !== this.font ||
      !sameStrings(this.#layout.ownerKeys, ownerKeys)
  }

  #reconcileLayout(): void {
    this.noteLayoutPlan()
    const forceGeometry = this.#layout !== null &&
      (this.#layout.pixelScale !== this.pixelScale || this.#layout.font !== this.font)
    const frames = this.#dock ? this.#planDock() : this.#planNavigation()
    const retainedKeys = new Set<string>([PANEL_OWNER, ...frames.keys()])
    this.removeMissingOwners(retainedKeys)
    this.reconcileOwner(
      PANEL_OWNER,
      `${this.node.name}.panel`,
      {x: 0, y: 0, w: this.frameWidth, h: this.frameHeight},
      forceGeometry,
    )
    for (const [key, frame] of frames) this.reconcileOwner(key, `${this.node.name}.${key}`, frame, forceGeometry)
    this.setOwnerOrder([PANEL_OWNER, ...frames.keys()])
    this.#layout = {
      w: this.rectW,
      h: this.rectH,
      pixelScale: this.pixelScale,
      font: this.font,
      ownerKeys: [...frames.keys()],
    }
  }

  #planNavigation(): Map<string, UiSurfaceRect> {
    const frames = new Map<string, UiSurfaceRect>()
    const hasAccordionSections = this.#usesAccordion()
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: uiShapeMetrics.tightGap * 2,
      paddingTop: uiShapeMetrics.tightGap,
      paddingBottom: uiShapeMetrics.tightGap,
      gap: hasAccordionSections ? uiShapeMetrics.separatorWidth * 2 : uiShapeMetrics.separatorWidth,
      items: [
        {height: uiShapeMetrics.panelHeaderHeight, draw: (x, y, w, h) => { frames.set(TITLE_OWNER, {x, y, w, h}) }},
        this.#options.onQueryChange === undefined ? false : {
          height: uiShapeMetrics.rowHeight,
          draw: (x: number, y: number, w: number, h: number) => { frames.set(SEARCH_OWNER, {x, y, w, h}) },
        },
        ...navigationAccordionItems(this.#options, frames),
      ],
    })
    return frames
  }

  #planDock(): Map<string, UiSurfaceRect> {
    const frames = new Map<string, UiSurfaceRect>()
    flexRow({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: uiShapeMetrics.tightGap,
      paddingY: 0,
      gap: uiShapeMetrics.separatorWidth,
      alignItems: "stretch",
      items: this.#visibleItems().map((item) => ({
        width: "1fr" as const,
        height: uiShapeMetrics.rowHeight,
        draw: (x: number, y: number, w: number, h: number) => {
          frames.set(itemOwnerKey(item.id), {x, y, w, h})
        },
      })),
    })
    return frames
  }

  #drawOwner(key: string, frame: UiSurfaceRect): void {
    if (key === PANEL_OWNER) {
      drawPanel(this, frame.w, frame.h, this.panelActive)
      return
    }
    if (key === TITLE_OWNER) {
      Typography(this, 0, 0, frame.w, frame.h, {
        children: this.#options.title,
        variant: "title",
        fontPx: uiShapeMetrics.compactFontPx,
        color: workbenchText,
        sx: {textAlign: "center"},
      })
      return
    }
    if (key === SEARCH_OWNER) {
      TextField(this, 0, 0, frame.w, frame.h, {
        key: `${this.node.name}:search`,
        value: this.#options.query,
        placeholder: this.#options.searchPlaceholder ?? "Поиск…",
        fontPx: uiShapeMetrics.compactFontPx,
        onChange: (value) => this.#options.onQueryChange?.(value),
      })
      return
    }
    if (key.startsWith("group:")) {
      const section = this.#focusRows().find((row): row is NavigationSectionRow<Route> =>
        row.kind === "section" && row.ownerKey === key)
      if (section === undefined) return
      const toggle = this.#options.onGroupToggle === undefined ? undefined : () => {
        if (this.#setFocus(key, true)) this.requestRender()
        const current = navigationGroups(this.#options).get(section.id)
        if (current !== undefined) this.#options.onGroupToggle?.(section.id, !current.collapsed)
      }
      drawNavigationSection(this, frame, section, this.#focusVisible && this.#focusedOwnerKey === key, toggle)
      return
    }
    const id = itemIdForOwnerKey(key)
    const item = this.#options.items.find((candidate) => candidate.id === id)
    if (item === undefined) return
    if (this.#dock || !this.#usesAccordion()) {
      const active = item.route === this.#options.route
      const focused = this.#focusVisible && this.#focusedOwnerKey === key
      Button(this, 0, 0, frame.w, frame.h, {
        children: item.label,
        variant: active ? "contained" : "glass",
        color: "neutral",
        appearance: "toolbar-item",
        selected: active,
        focused,
        disabled: item.disabled,
        fontPx: uiShapeMetrics.compactFontPx,
        onClick: () => {
          const current = this.#options.items.find((candidate) => candidate.id === id)
          if (current === undefined || current.disabled) return
          if (this.#setFocus(key, true)) this.requestRender()
          this.#options.onNavigate(current.route)
        },
      })
      return
    }
    const rows = this.#focusRows()
    const rowIndex = rows.findIndex((row) => row.ownerKey === key)
    const row = rows[rowIndex]
    const parentId = row?.kind === "leaf" ? row.parentId : null
    const nested = parentId !== null
    const nextRow = rows[rowIndex + 1]
    const lastInSection = nested && (nextRow?.kind !== "leaf" || nextRow.parentId !== parentId)
    const active = item.route === this.#options.route
    const focused = this.#focusVisible && this.#focusedOwnerKey === key
    drawNavigationLeaf(this, frame, item, active, focused, nested, lastInSection, () => {
      const current = this.#options.items.find((candidate) => candidate.id === id)
      if (current === undefined || current.disabled) return
      if (this.#setFocus(key, true)) this.requestRender()
      this.#options.onNavigate(current.route)
    })
  }

  #setFocus(ownerKey: string | null, visible: boolean): boolean {
    const canToggleSection = !this.#dock && this.#options.onGroupToggle !== undefined
    const nextOwnerKey = ownerKey === null || this.#focusRows().some((row) =>
      row.ownerKey === ownerKey && navigationRowEnabled(row, canToggleSection)) ? ownerKey : null
    const previousOwnerKey = this.#focusedOwnerKey
    const previousVisual = this.#focusVisible ? previousOwnerKey : null
    const nextVisual = visible ? nextOwnerKey : null
    if (previousVisual !== nextVisual) {
      if (previousVisual !== null) this.markOwnerDirty(previousVisual)
      if (nextVisual !== null) this.markOwnerDirty(nextVisual)
    }
    this.#focusedOwnerKey = nextOwnerKey
    this.#focusVisible = visible
    return previousOwnerKey !== nextOwnerKey || previousVisual !== nextVisual
  }

  #activateFocusedRow(): void {
    const row = this.#focusRows().find(({ownerKey}) => ownerKey === this.#focusedOwnerKey)
    if (row?.kind === "section") {
      this.#options.onGroupToggle?.(row.id, !row.group.collapsed)
      return
    }
    if (row?.kind === "leaf" && !row.item.disabled) this.#options.onNavigate(row.item.route)
  }

  #handleAccordionKey(event: KeyboardEvent): boolean {
    const rows = this.#focusRows()
    const enabled = rows.filter((row) => navigationRowEnabled(row, this.#options.onGroupToggle !== undefined))
    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End") {
      event.preventDefault()
      let next: string | null = null
      if (event.key === "Home") next = enabled[0]?.ownerKey ?? null
      else if (event.key === "End") next = enabled.at(-1)?.ownerKey ?? null
      else if (enabled.length > 0) {
        const index = enabled.findIndex(({ownerKey}) => ownerKey === this.#focusedOwnerKey)
        const origin = index < 0 ? (event.key === "ArrowDown" ? -1 : 0) : index
        const offset = event.key === "ArrowDown" ? 1 : -1
        next = enabled[(origin + offset + enabled.length) % enabled.length]!.ownerKey
      }
      if (this.#setFocus(next, true)) this.requestRender()
      return true
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      const row = rows.find(({ownerKey}) => ownerKey === this.#focusedOwnerKey)
      if (row?.kind === "section") {
        if (event.key === "ArrowLeft" && !row.group.collapsed) {
          this.#options.onGroupToggle?.(row.id, true)
        } else if (event.key === "ArrowRight" && row.group.collapsed) {
          this.#options.onGroupToggle?.(row.id, false)
        } else if (event.key === "ArrowRight") {
          const child = enabled.find((candidate) => candidate.kind === "leaf" && candidate.parentId === row.id)
          if (child !== undefined && this.#setFocus(child.ownerKey, true)) this.requestRender()
        }
      } else if (row?.kind === "leaf" && event.key === "ArrowLeft" && row.parentId !== null) {
        if (this.#setFocus(groupOwnerKey(row.parentId), true)) this.requestRender()
      }
      return true
    }
    if (!isNavigationActivationKey(event.key)) return false
    event.preventDefault()
    if (this.#setFocus(preferredNavigationRowFocus(
      rows,
      this.#options.route,
      this.#focusedOwnerKey,
      this.#options.onGroupToggle !== undefined,
    ), true)) this.requestRender()
    this.#activateFocusedRow()
    return true
  }

  #focusRows(options: NormalizedNavigationOptions<Route> = this.#options): readonly NavigationRow<Route>[] {
    if (!this.#dock && this.#usesAccordion(options)) return navigationHierarchyRows(options)
    return Object.freeze(selectNormalizedNavigationItems(options).items.map((item): NavigationLeafRow<Route> =>
      Object.freeze({
        kind: "leaf",
        id: item.id,
        ownerKey: itemOwnerKey(item.id),
        item,
        parentId: null,
      })))
  }

  #usesAccordion(options: NormalizedNavigationOptions<Route> = this.#options): boolean {
    return !this.#dock && options.onGroupToggle !== undefined &&
      navigationHierarchyRows(options).some((row) => row.kind === "section")
  }

  #visibleItems(options: NormalizedNavigationOptions<Route> = this.#options): readonly NormalizedNavigationItem<Route>[] {
    return this.#windowItems(options).filter((item) => item.group?.collapsed !== true)
  }

  #windowItems(options: NormalizedNavigationOptions<Route> = this.#options): readonly NormalizedNavigationItem<Route>[] {
    return selectNormalizedNavigationItems(options).items
  }
}

function drawNavigationSection<Route extends string>(
  surface: UiSurface,
  frame: UiSurfaceRect,
  section: NavigationSectionRow<Route>,
  focused: boolean,
  onToggle: (() => void) | undefined,
): void {
  ul(surface, 0, 0, frame.w, frame.h, {
    key: `navigation-section:${section.id}`,
    disablePadding: true,
    itemHeight: uiShapeMetrics.rowHeight,
    style: {
      background: workbenchSectionFill,
      borderColor: null,
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: 0,
      overflowY: "hidden",
      padding: 0,
    },
  })
  li(surface, 0, 0, frame.w, uiShapeMetrics.rowHeight, {
    key: `navigation-section-header:${section.id}`,
    style: {
      background: null,
      borderColor: null,
      borderRadius: 0,
      borderWidth: 0,
    },
    children: (state) => {
      drawNavigationRowFill(surface, frame.w, uiShapeMetrics.rowHeight, blenderRgba8ToColor(state.colors.inner), {
        topLeft: true,
        topRight: true,
        bottomLeft: frame.h === uiShapeMetrics.rowHeight,
        bottomRight: frame.h === uiShapeMetrics.rowHeight,
      })
      flexRow({
      x: 0,
      y: 0,
      w: frame.w,
      h: uiShapeMetrics.rowHeight,
      gap: 0,
      alignItems: "stretch",
      items: [
        {width: uiShapeMetrics.iconActionSlot, height: uiShapeMetrics.rowHeight, draw: (x, y, w, h) => {
          drawNavigationDisclosure(surface, x, y, w, h, section.group.collapsed, blenderRgba8ToColor(state.colors.text))
        }},
        {width: "grow", height: uiShapeMetrics.rowHeight, draw: (x, y, w, h) => {
          span(surface, x, y, w, h, {
            children: section.group.label,
            style: {
              color: blenderRgba8ToColor(state.colors.text),
              fontSize: uiShapeMetrics.compactFontPx,
              textAlign: "left",
            },
          })
        }},
      ],
      })
    },
    ...(onToggle === undefined ? {} : {onClick: onToggle}),
  })
  drawNavigationFocus(surface, frame.w, uiShapeMetrics.rowHeight, focused)
}

function drawNavigationDisclosure(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  collapsed: boolean,
  color: ReturnType<typeof blenderRgba8ToColor>,
): void {
  const cx = x + width / 2
  const cy = y + height / 2
  const half = Math.min(4, Math.max(2, Math.min(width, height) * 0.18))
  const points = collapsed
    ? [{x: cx - half / 2, y: cy - half}, {x: cx + half / 2, y: cy}, {x: cx - half / 2, y: cy + half}]
    : [{x: cx - half, y: cy - half / 2}, {x: cx, y: cy + half / 2}, {x: cx + half, y: cy - half / 2}]
  surface.drawPolyline(points, color, uiShapeMetrics.separatorWidth, Z.TEXT)
}

function drawNavigationLeaf<Route extends string>(
  surface: UiSurface,
  frame: UiSurfaceRect,
  item: NormalizedNavigationItem<Route>,
  selected: boolean,
  focused: boolean,
  nested: boolean,
  lastInSection: boolean,
  onNavigate: () => void,
): void {
  li(surface, 0, 0, frame.w, frame.h, {
    key: `navigation-leaf:${item.id}`,
    selected,
    disabled: item.disabled,
    style: {
      background: null,
      borderColor: null,
      borderRadius: 0,
      borderWidth: 0,
    },
    children: (state) => {
      drawNavigationRowFill(surface, frame.w, frame.h, blenderRgba8ToColor(state.colors.inner), {
        topLeft: false,
        topRight: false,
        bottomLeft: lastInSection,
        bottomRight: lastInSection,
      })
      flexRow({
      x: 0,
      y: 0,
      w: frame.w,
      h: frame.h,
      gap: 0,
      alignItems: "stretch",
      items: [
        nested ? {width: uiShapeMetrics.iconActionSlot, height: frame.h, draw: () => {}} : false,
        {width: "grow", height: frame.h, draw: (x, y, w, h) => {
          span(surface, x, y, w, h, {
            children: item.label,
            style: {
              color: blenderRgba8ToColor(state.colors.text),
              fontSize: uiShapeMetrics.compactFontPx,
              textAlign: "left",
            },
          })
        }},
      ],
      })
    },
    onClick: onNavigate,
  })
  drawNavigationFocus(surface, frame.w, frame.h, focused)
}

type NavigationRowCorners = Readonly<{
  topLeft: boolean
  topRight: boolean
  bottomLeft: boolean
  bottomRight: boolean
}>

function drawNavigationRowFill(
  surface: UiSurface,
  width: number,
  height: number,
  color: ReturnType<typeof blenderRgba8ToColor>,
  corners: NavigationRowCorners,
): void {
  if (color.a <= 0) return
  if (corners.topLeft && corners.topRight && corners.bottomLeft && corners.bottomRight) {
    drawNavigationFillPart(surface, 0, 0, width, height, uiShapeMetrics.lowRadius, color)
    return
  }
  if (!corners.topLeft && !corners.topRight && !corners.bottomLeft && !corners.bottomRight) {
    drawNavigationFillPart(surface, 0, 0, width, height, 0, color)
    return
  }
  const radius = Math.min(uiShapeMetrics.lowRadius, width / 2, height / 2)
  drawNavigationFillPart(surface, radius, 0, width - radius * 2, height, 0, color)
  drawNavigationFillPart(surface, 0, radius, width, height - radius * 2, 0, color)
  drawNavigationFillCorner(surface, 0, 0, radius, corners.topLeft, color)
  drawNavigationFillCorner(surface, width - radius, 0, radius, corners.topRight, color, "top-right")
  drawNavigationFillCorner(surface, 0, height - radius, radius, corners.bottomLeft, color, "bottom-left")
  drawNavigationFillCorner(surface, width - radius, height - radius, radius, corners.bottomRight, color, "bottom-right")
}

function drawNavigationFillCorner(
  surface: UiSurface,
  x: number,
  y: number,
  radius: number,
  rounded: boolean,
  color: ReturnType<typeof blenderRgba8ToColor>,
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" = "top-left",
): void {
  if (!rounded) {
    drawNavigationFillPart(surface, x, y, radius, radius, 0, color)
    return
  }
  const patchX = corner === "top-right" || corner === "bottom-right" ? x - radius : x
  const patchY = corner === "bottom-left" || corner === "bottom-right" ? y - radius : y
  drawNavigationFillPart(surface, patchX, patchY, radius * 2, radius * 2, radius, color)
}

function drawNavigationFillPart(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: ReturnType<typeof blenderRgba8ToColor>,
): void {
  if (width <= 0 || height <= 0) return
  div(surface, x, y, width, height, {
    style: {
      background: color,
      borderColor: null,
      borderRadius: radius,
      borderWidth: 0,
      zIndex: Z.ELEMENT,
    },
  })
}

function drawNavigationFocus(surface: UiSurface, width: number, height: number, focused: boolean): void {
  if (!focused) return
  div(surface, 0, 0, width, height, {
    style: {
      background: null,
      borderColor: workbenchText,
      borderRadius: 0,
      borderWidth: uiShapeMetrics.borderWidth,
      zIndex: Z.ELEMENT_RULE,
    },
  })
}

export class PlaygroundNavigationSurface<Route extends string> extends PlaygroundNavigationBaseSurface<Route> {
  constructor(options: PlaygroundNavigationOptions<Route>) {
    super(options, false)
  }
}

export class PlaygroundDockSurface<Route extends string> extends PlaygroundNavigationBaseSurface<Route> {
  constructor(options: PlaygroundNavigationOptions<Route>) {
    super(options, true)
  }
}

export class PlaygroundInfoSurface extends RetainedPlaygroundSurface {
  #options: NormalizedInfoOptions
  #layout: Readonly<{
    w: number
    h: number
    pixelScale: number
    font: unknown
    lineKeys: readonly string[]
    status: boolean
  }> | null = null

  constructor(options: PlaygroundInfoOptions) {
    super("PlaygroundInfoSurface")
    this.#options = normalizeInfoOptions(options)
  }

  setOptions(options: PlaygroundInfoOptions): void {
    const next = normalizeInfoOptions(options)
    const previous = this.#options
    let changed = !sameStrings(previous.lines.map(({key}) => key), next.lines.map(({key}) => key)) ||
      (previous.status === undefined) !== (next.status === undefined)

    if (previous.title !== next.title) {
      this.markOwnerDirty(TITLE_OWNER)
      changed = true
    }
    const previousLines = new Map(previous.lines.map((line) => [line.key, line] as const))
    for (const line of next.lines) {
      if (previousLines.get(line.key)?.label !== line.label) {
        this.markOwnerDirty(line.key)
        changed = true
      }
    }
    if (previous.status !== next.status && previous.status !== undefined && next.status !== undefined) {
      this.markOwnerDirty(STATUS_OWNER)
      changed = true
    }

    this.#options = next
    if (changed) this.requestRender()
  }

  protected override render(): void {
    if (this.#layoutChanged()) this.#reconcileLayout()
    this.materializeDirtyOwners((key, frame) => this.#drawOwner(key, frame))
  }

  #layoutChanged(): boolean {
    return this.#layout === null || this.#layout.w !== this.rectW || this.#layout.h !== this.rectH ||
      this.#layout.pixelScale !== this.pixelScale || this.#layout.font !== this.font ||
      this.#layout.status !== (this.#options.status !== undefined) ||
      !sameStrings(this.#layout.lineKeys, this.#options.lines.map(({key}) => key))
  }

  #reconcileLayout(): void {
    this.noteLayoutPlan()
    const forceGeometry = this.#layout !== null &&
      (this.#layout.pixelScale !== this.pixelScale || this.#layout.font !== this.font)
    const frames = new Map<string, UiSurfaceRect>()
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: uiShapeMetrics.tightGap * 2,
      paddingTop: uiShapeMetrics.tightGap,
      paddingBottom: uiShapeMetrics.tightGap,
      gap: uiShapeMetrics.separatorWidth,
      items: [
        {height: uiShapeMetrics.panelHeaderHeight, draw: (x, y, w, h) => { frames.set(TITLE_OWNER, {x, y, w, h}) }},
        ...this.#options.lines.map((line) => ({
          height: uiShapeMetrics.rowHeight,
          draw: (x: number, y: number, w: number, h: number) => { frames.set(line.key, {x, y, w, h}) },
        })),
        {height: "grow" as const, draw: () => {}},
        this.#options.status === undefined ? false : {
          height: uiShapeMetrics.rowHeight,
          draw: (x: number, y: number, w: number, h: number) => { frames.set(STATUS_OWNER, {x, y, w, h}) },
        },
      ],
    })

    const retainedKeys = new Set<string>([PANEL_OWNER, ...frames.keys()])
    this.removeMissingOwners(retainedKeys)
    this.reconcileOwner(
      PANEL_OWNER,
      "PlaygroundInfoSurface.panel",
      {x: 0, y: 0, w: this.frameWidth, h: this.frameHeight},
      forceGeometry,
    )
    for (const [key, frame] of frames) this.reconcileOwner(key, `PlaygroundInfoSurface.${key}`, frame, forceGeometry)
    this.setOwnerOrder([PANEL_OWNER, ...frames.keys()])
    this.#layout = {
      w: this.rectW,
      h: this.rectH,
      pixelScale: this.pixelScale,
      font: this.font,
      lineKeys: this.#options.lines.map(({key}) => key),
      status: this.#options.status !== undefined,
    }
  }

  #drawOwner(key: string, frame: UiSurfaceRect): void {
    if (key === PANEL_OWNER) {
      drawPanel(this, frame.w, frame.h, this.panelActive)
      return
    }
    if (key === TITLE_OWNER) {
      Typography(this, 0, 0, frame.w, frame.h, {
        children: this.#options.title,
        variant: "title",
        fontPx: uiShapeMetrics.compactFontPx,
        color: workbenchText,
      })
      return
    }
    if (key === STATUS_OWNER) {
      if (this.#options.status !== undefined) {
        Typography(this, 0, 0, frame.w, frame.h, {
          children: this.#options.status,
          variant: "caption",
          color: rgba8ToColor(activeUiTheme.state.info),
        })
      }
      return
    }
    const line = this.#options.lines.find((candidate) => candidate.key === key)
    if (line !== undefined) Typography(this, 0, 0, frame.w, frame.h, {children: line.label, variant: "caption", color: workbenchMuted})
  }
}

/** Retained source/controls panel for one selected story. Source remains visible in every mode. */
export class PlaygroundStoryPanelSurface extends RetainedPlaygroundSurface {
  #options: NormalizedStoryPanelOptions
  #layout: Readonly<{
    w: number
    h: number
    pixelScale: number
    font: unknown
    ownerKeys: readonly string[]
  }> | null = null

  constructor(options: PlaygroundStoryPanelOptions) {
    super("PlaygroundStoryPanelSurface")
    this.#options = normalizeStoryPanelOptions(options)
  }

  setOptions(options: PlaygroundStoryPanelOptions): void {
    const next = normalizeStoryPanelOptions(options)
    const previous = this.#options
    const structureChanged = previous.mode !== next.mode ||
      previous.sourceLines.length !== next.sourceLines.length ||
      !sameStrings(previous.controls.map(({descriptor}) => descriptor.key), next.controls.map(({descriptor}) => descriptor.key)) ||
      !sameStrings(previous.events.map(({id}) => id), next.events.map(({id}) => id))
    let changed = structureChanged

    for (const [index, line] of next.sourceLines.entries()) {
      if (previous.sourceLines[index] !== line) {
        this.markOwnerDirty(sourceLineOwnerKey(index))
        changed = true
      }
    }
    const previousControls = new Map(previous.controls.map((control) => [control.descriptor.key, control] as const))
    for (const control of next.controls) {
      const before = previousControls.get(control.descriptor.key)
      if (before === undefined || before.descriptor.label !== control.descriptor.label ||
        before.descriptor.group !== control.descriptor.group || before.descriptor.kind !== control.descriptor.kind ||
        !Object.is(before.value, control.value)) {
        this.markOwnerDirty(storyControlOwnerKey(control.descriptor.key))
        changed = true
      }
    }
    const previousEvents = new Map(previous.events.map((event) => [event.id, event] as const))
    for (const event of next.events) {
      const before = previousEvents.get(event.id)
      if (before?.label !== event.label || before?.value !== event.value) {
        this.markOwnerDirty(storyEventOwnerKey(event.id))
        changed = true
      }
    }
    if (previous.mode !== next.mode) {
      this.markOwnerDirty(SOURCE_CONTROLS_TAB_OWNER)
      this.markOwnerDirty(SOURCE_EVENTS_TAB_OWNER)
    }
    this.#options = next
    if (structureChanged) this.#layout = null
    if (changed) this.requestRender()
  }

  protected override render(): void {
    if (this.#layoutChanged()) this.#reconcileLayout()
    this.materializeDirtyOwners((key, frame) => this.#drawOwner(key, frame))
  }

  #layoutChanged(): boolean {
    return this.#layout === null || this.#layout.w !== this.rectW || this.#layout.h !== this.rectH ||
      this.#layout.pixelScale !== this.pixelScale || this.#layout.font !== this.font
  }

  #reconcileLayout(): void {
    this.noteLayoutPlan()
    const forceGeometry = this.#layout !== null &&
      (this.#layout.pixelScale !== this.pixelScale || this.#layout.font !== this.font)
    const frames = new Map<string, UiSurfaceRect>()
    const horizontalPad = uiShapeMetrics.tightGap * 2
    const headerY = uiShapeMetrics.tightGap
    const headerH = uiShapeMetrics.panelHeaderHeight
    flexRow({
      x: horizontalPad,
      y: headerY,
      w: Math.max(0, this.rectW - horizontalPad * 2),
      h: headerH,
      gap: uiShapeMetrics.tightGap,
      alignItems: "stretch",
      items: [
        {width: "grow", height: headerH, draw: (x, y, w, h) => { frames.set(SOURCE_TITLE_OWNER, {x, y, w, h}) }},
        {width: uiShapeMetrics.iconActionSlot * 4, height: headerH, draw: (x, y, w, h) => { frames.set(SOURCE_COPY_OWNER, {x, y, w, h}) }},
      ],
    })

    const codeY = headerY + headerH + uiShapeMetrics.panelSectionGap
    const codeH = Math.max(
      uiShapeMetrics.rowHeight * 6,
      Math.min(uiShapeMetrics.rowHeight * 14, this.rectH * 0.36),
    )
    frames.set(SOURCE_BOX_OWNER, {x: horizontalPad, y: codeY, w: Math.max(0, this.rectW - horizontalPad * 2), h: codeH})
    const sourceInset = uiShapeMetrics.tightGap * 2
    const sourceLineHeight = uiShapeMetrics.compactFontPx + uiShapeMetrics.tightGap + uiShapeMetrics.separatorWidth
    const visibleSourceLines = Math.max(1, Math.floor((codeH - sourceInset * 2) / sourceLineHeight))
    for (const [index] of this.#options.sourceLines.slice(0, visibleSourceLines).entries()) {
      frames.set(sourceLineOwnerKey(index), {
        x: horizontalPad + sourceInset,
        y: codeY + sourceInset + index * sourceLineHeight,
        w: Math.max(0, this.rectW - horizontalPad * 2 - sourceInset * 2),
        h: sourceLineHeight,
      })
    }

    const tabsY = codeY + codeH + uiShapeMetrics.panelSectionGap
    flexRow({
      x: horizontalPad,
      y: tabsY,
      w: Math.max(0, this.rectW - horizontalPad * 2),
      h: uiShapeMetrics.rowHeight,
      gap: uiShapeMetrics.separatorWidth,
      alignItems: "stretch",
      items: [
        {width: "grow", height: uiShapeMetrics.rowHeight, draw: (x, y, w, h) => { frames.set(SOURCE_CONTROLS_TAB_OWNER, {x, y, w, h}) }},
        {width: "grow", height: uiShapeMetrics.rowHeight, draw: (x, y, w, h) => { frames.set(SOURCE_EVENTS_TAB_OWNER, {x, y, w, h}) }},
      ],
    })

    let detailY = tabsY + uiShapeMetrics.rowHeight + uiShapeMetrics.panelSectionGap
    const detailBottom = this.rectH - uiShapeMetrics.tightGap
    if (this.#options.mode === "controls") {
      const seenGroups = new Set<string>()
      for (const control of this.#options.controls) {
        if (!seenGroups.has(control.descriptor.group)) {
          seenGroups.add(control.descriptor.group)
          if (detailY + uiShapeMetrics.rowHeight > detailBottom) break
          frames.set(storyControlGroupOwnerKey(control.descriptor.group), {
            x: horizontalPad,
            y: detailY,
            w: Math.max(0, this.rectW - horizontalPad * 2),
            h: uiShapeMetrics.rowHeight,
          })
          detailY += uiShapeMetrics.rowHeight + uiShapeMetrics.separatorWidth
        }
        if (detailY + uiShapeMetrics.rowHeight > detailBottom) break
        frames.set(storyControlOwnerKey(control.descriptor.key), {
          x: horizontalPad,
          y: detailY,
          w: Math.max(0, this.rectW - horizontalPad * 2),
          h: uiShapeMetrics.rowHeight,
        })
        detailY += uiShapeMetrics.rowHeight + uiShapeMetrics.separatorWidth
      }
    } else {
      for (const event of this.#options.events) {
        if (detailY + uiShapeMetrics.rowHeight > detailBottom) break
        frames.set(storyEventOwnerKey(event.id), {
          x: horizontalPad,
          y: detailY,
          w: Math.max(0, this.rectW - horizontalPad * 2),
          h: uiShapeMetrics.rowHeight,
        })
        detailY += uiShapeMetrics.rowHeight + uiShapeMetrics.separatorWidth
      }
    }

    const retainedKeys = new Set<string>([PANEL_OWNER, ...frames.keys()])
    this.removeMissingOwners(retainedKeys)
    this.reconcileOwner(PANEL_OWNER, "PlaygroundStoryPanelSurface.panel", {
      x: 0,
      y: 0,
      w: this.frameWidth,
      h: this.frameHeight,
    }, forceGeometry)
    for (const [key, frame] of frames) this.reconcileOwner(key, `PlaygroundStoryPanelSurface.${key}`, frame, forceGeometry)
    this.setOwnerOrder([PANEL_OWNER, ...frames.keys()])
    this.#layout = {
      w: this.rectW,
      h: this.rectH,
      pixelScale: this.pixelScale,
      font: this.font,
      ownerKeys: [...frames.keys()],
    }
  }

  #drawOwner(key: string, frame: UiSurfaceRect): void {
    if (key === PANEL_OWNER) {
      drawPanel(this, frame.w, frame.h, this.panelActive)
      return
    }
    if (key === SOURCE_TITLE_OWNER) {
      Typography(this, 0, 0, frame.w, frame.h, {
        children: "TypeScript",
        variant: "title",
        fontPx: uiShapeMetrics.compactFontPx,
        color: workbenchText,
      })
      return
    }
    if (key === SOURCE_COPY_OWNER) {
      Button(this, 0, 0, frame.w, frame.h, {
        children: "Копировать",
        variant: "glass",
        color: "neutral",
        appearance: "tool",
        fontPx: uiShapeMetrics.compactFontPx,
        onClick: () => { void this.#options.onCopy(this.#options.source) },
      })
      return
    }
    if (key === SOURCE_BOX_OWNER) {
      Pane(this, 0, 0, frame.w, frame.h, {
        appearance: "box",
        sx: {
          padding: 0,
        },
      })
      return
    }
    if (key === SOURCE_CONTROLS_TAB_OWNER || key === SOURCE_EVENTS_TAB_OWNER) {
      const mode: PlaygroundStoryPanelMode = key === SOURCE_CONTROLS_TAB_OWNER ? "controls" : "events"
      Button(this, 0, 0, frame.w, frame.h, {
        children: mode === "controls" ? "Параметры" : "События",
        variant: this.#options.mode === mode ? "contained" : "glass",
        color: "neutral",
        appearance: "tab",
        selected: this.#options.mode === mode,
        fontPx: uiShapeMetrics.compactFontPx,
        onClick: () => this.#options.onModeChange(mode),
      })
      return
    }
    if (key.startsWith("source-line:")) {
      const index = Number.parseInt(key.slice("source-line:".length), 10)
      const line = this.#options.sourceLines[index]
      if (line !== undefined) Typography(this, 0, 0, frame.w, frame.h, {
        children: line,
        variant: "caption",
        color: index === 0 ? workbenchText : workbenchMuted,
      })
      return
    }
    if (key.startsWith("source-control-group:")) {
      Typography(this, 0, 0, frame.w, frame.h, {children: controlGroupForOwnerKey(key), variant: "caption", color: workbenchMuted})
      return
    }
    if (key.startsWith("source-control:")) {
      const controlKey = key.slice("source-control:".length)
      const control = this.#options.controls.find(({descriptor}) => descriptor.key === controlKey)
      if (control === undefined) return
      const next = nextStoryControlValue(control.descriptor, control.value)
      Button(this, 0, 0, frame.w, frame.h, {
        children: `${control.descriptor.label}: ${formatStoryValue(control.value)}`,
        variant: "glass",
        color: "neutral",
        appearance: "tool",
        fontPx: uiShapeMetrics.compactFontPx,
        disabled: next === undefined,
        onClick: () => {
          const current = this.#options.controls.find(({descriptor}) => descriptor.key === controlKey)
          if (current === undefined) return
          const nextValue = nextStoryControlValue(current.descriptor, current.value)
          if (nextValue !== undefined) this.#options.onControlChange(controlKey, nextValue)
        },
      })
      return
    }
    if (key.startsWith("source-event:")) {
      const id = key.slice("source-event:".length)
      const event = this.#options.events.find((candidate) => candidate.id === id)
      if (event !== undefined) Typography(this, 0, 0, frame.w, frame.h, {
        children: `${event.label}: ${event.value}`,
        variant: "caption",
        color: workbenchMuted,
      })
    }
  }
}

/** Shared compact preview panel/header chrome; the selected story remains consumer-owned. */
export function drawPlaygroundPreviewChrome(
  surface: UiSurface,
  width: number,
  height: number,
  options: PlaygroundPreviewChromeOptions = {},
): void {
  Pane(surface, 0, 0, width, height, {
    appearance: "box",
    sx: {
      padding: 0,
    },
  })
  const {title, description} = options
  if (title === undefined && description === undefined) return
  const contentInset = uiShapeMetrics.tightGap * 2
  flexColumn({
    x: contentInset,
    y: uiShapeMetrics.tightGap,
    w: Math.max(0, width - contentInset * 2),
    h: uiShapeMetrics.panelHeaderHeight + uiShapeMetrics.panelSectionGap + uiShapeMetrics.rowHeight,
    gap: uiShapeMetrics.panelSectionGap,
    items: [
      title === undefined ? false : {
        height: uiShapeMetrics.panelHeaderHeight,
        draw: (x, y, w, h) => Typography(surface, x, y, w, h, {
          children: title,
          variant: "title",
          fontPx: uiShapeMetrics.compactFontPx,
          color: workbenchText,
        }),
      },
      description === undefined ? false : {
        height: uiShapeMetrics.rowHeight,
        draw: (x, y, w, h) => Typography(surface, x, y, w, h, {
          children: description,
          variant: "caption",
          color: workbenchMuted,
          fontPx: uiShapeMetrics.compactFontPx,
        }),
      },
    ],
  })
}

export class PlaygroundBackdropSurface extends UiSurface {
  constructor() {
    super({bgColor: null, borderColor: null})
    this.node.name = "PlaygroundBackdropSurface"
  }

  protected override render(): void {
    this.drawRect(0, 0, this.rectW, this.rectH, rgba8ToColor(resolveOpaqueRgba8(
      activeUiTheme.spaceNode.back,
      activeUiTheme.spaceNode.navigationBar,
    )), -0.18)
  }
}

function normalizeNavigationOptions<Route extends string>(
  options: PlaygroundNavigationOptions<Route>,
): NormalizedNavigationOptions<Route> {
  const ids = new Set<string>()
  const groups = new Map<string, Readonly<{label: string; collapsed: boolean}>>()
  const items = options.items.map((item) => {
    if (item.id.length === 0) throw new Error("Playground navigation item id must not be empty")
    if (ids.has(item.id)) throw new Error(`Duplicate playground navigation item id: ${item.id}`)
    ids.add(item.id)
    let group: NormalizedNavigationGroup | undefined
    if (item.group !== undefined) {
      if (item.group.id.length === 0) throw new Error("Playground navigation group id must not be empty")
      if (item.group.label.trim().length === 0) throw new Error("Playground navigation group label must not be empty")
      const collapsed = item.group.collapsed === true
      const previous = groups.get(item.group.id)
      if (previous !== undefined && previous.label !== item.group.label) {
        throw new Error(`Playground navigation group label changed for id: ${item.group.id}`)
      }
      if (previous !== undefined && previous.collapsed !== collapsed) {
        throw new Error(`Playground navigation group collapsed state changed within id: ${item.group.id}`)
      }
      groups.set(item.group.id, Object.freeze({label: item.group.label, collapsed}))
      group = Object.freeze({id: item.group.id, label: item.group.label, collapsed})
    }
    return Object.freeze({
      id: item.id,
      label: item.label,
      route: item.route,
      disabled: item.disabled === true,
      group,
      searchText: item.searchText?.trim() ?? "",
    })
  })
  let window: PlaygroundNavigationWindow | undefined
  if (options.window !== undefined) {
    if (!Number.isInteger(options.window.offset) || options.window.offset < 0) {
      throw new Error("Playground navigation window offset must be a non-negative integer")
    }
    if (!Number.isInteger(options.window.limit) || options.window.limit < 1) {
      throw new Error("Playground navigation window limit must be a positive integer")
    }
    window = Object.freeze({offset: options.window.offset, limit: options.window.limit})
  }
  return Object.freeze({
    title: options.title,
    items: Object.freeze(items),
    route: options.route,
    onNavigate: options.onNavigate,
    query: normalizeNavigationSearch(options.query ?? ""),
    window,
    searchPlaceholder: options.searchPlaceholder,
    onQueryChange: options.onQueryChange,
    onGroupToggle: options.onGroupToggle,
  })
}

/** Pure filtered and bounded navigation view used by large package catalogs. */
export function selectPlaygroundNavigationItems<Route extends string>(
  options: PlaygroundNavigationOptions<Route>,
): PlaygroundNavigationView<Route> {
  const view = selectNormalizedNavigationItems(normalizeNavigationOptions(options))
  const items: PlaygroundNavigationItem<Route>[] = view.items.map((item) => Object.freeze({
    id: item.id,
    label: item.label,
    route: item.route,
    ...(item.disabled ? {disabled: true} : {}),
    ...(item.group === undefined ? {} : {group: Object.freeze({
      id: item.group.id,
      label: item.group.label,
      ...(item.group.collapsed ? {collapsed: true} : {}),
    })}),
    ...(item.searchText.length === 0 ? {} : {searchText: item.searchText}),
  }))
  return Object.freeze({total: view.total, offset: view.offset, items: Object.freeze(items)})
}

function normalizeStoryPanelOptions(options: PlaygroundStoryPanelOptions): NormalizedStoryPanelOptions {
  if (options.source.trim().length === 0) throw new Error("Playground story panel source must not be empty")
  const controlKeys = new Set<string>()
  const controls = options.controls.map((descriptor): NormalizedStoryControl => {
    if (controlKeys.has(descriptor.key)) throw new Error(`Duplicate playground story panel control: ${descriptor.key}`)
    controlKeys.add(descriptor.key)
    if (!(descriptor.key in options.args)) throw new Error(`Playground story panel args missing control: ${descriptor.key}`)
    return Object.freeze({descriptor, value: options.args[descriptor.key]})
  })
  const eventIds = new Set<string>()
  const events = (options.events ?? []).map((event) => {
    if (event.id.length === 0) throw new Error("Playground story event id must not be empty")
    if (eventIds.has(event.id)) throw new Error(`Duplicate playground story event: ${event.id}`)
    eventIds.add(event.id)
    return Object.freeze({...event})
  })
  return Object.freeze({
    source: options.source,
    sourceLines: Object.freeze(options.source.replaceAll("\r\n", "\n").split("\n")),
    controls: Object.freeze(controls),
    events: Object.freeze(events),
    mode: options.mode,
    onModeChange: options.onModeChange,
    onControlChange: options.onControlChange,
    onCopy: options.onCopy,
  })
}

function normalizeInfoOptions(options: PlaygroundInfoOptions): NormalizedInfoOptions {
  const explicitIds = new Set<string>()
  const stringOccurrences = new Map<string, number>()
  const lines = options.lines.map((line): NormalizedInfoLine => {
    if (typeof line !== "string") {
      if (line.id.length === 0) throw new Error("Playground info line id must not be empty")
      if (explicitIds.has(line.id)) throw new Error(`Duplicate playground info line id: ${line.id}`)
      explicitIds.add(line.id)
      return {key: `line:id:${line.id}`, label: line.label}
    }
    const occurrence = stringOccurrences.get(line) ?? 0
    stringOccurrences.set(line, occurrence + 1)
    return {key: `line:text:${line}:${occurrence}`, label: line}
  })
  return {title: options.title, lines, status: options.status}
}

function itemOwnerKey(id: string): string {
  return `item:${id}`
}

function sourceLineOwnerKey(index: number): string {
  return `source-line:${index}`
}

function storyControlOwnerKey(key: string): string {
  return `source-control:${key}`
}

function storyControlGroupOwnerKey(group: string): string {
  return `source-control-group:${group}`
}

function controlGroupForOwnerKey(key: string): string {
  return key.slice("source-control-group:".length)
}

function storyEventOwnerKey(id: string): string {
  return `source-event:${id}`
}

function groupOwnerKey(id: string): string {
  return `group:${id}`
}

function itemIdForOwnerKey(key: string): string {
  return key.slice("item:".length)
}

function sameIds<Route extends string>(
  left: readonly NormalizedNavigationItem<Route>[],
  right: readonly NormalizedNavigationItem<Route>[],
): boolean {
  return sameStrings(left.map(({id}) => id), right.map(({id}) => id))
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function navigationHierarchyRows<Route extends string>(
  options: NormalizedNavigationOptions<Route>,
): readonly NavigationRow<Route>[] {
  const selected = selectNormalizedNavigationItems(options).items
  const ordered: Array<NavigationSectionRow<Route> | NavigationLeafRow<Route>> = []
  const sections = new Map<string, {row: NavigationSectionRow<Route>; leaves: NormalizedNavigationItem<Route>[]}>()

  for (const item of selected) {
    if (item.group === undefined) {
      ordered.push(Object.freeze({
        kind: "leaf",
        id: item.id,
        ownerKey: itemOwnerKey(item.id),
        item,
        parentId: null,
      }))
      continue
    }
    let section = sections.get(item.group.id)
    if (section === undefined) {
      const leaves: NormalizedNavigationItem<Route>[] = []
      const row: NavigationSectionRow<Route> = {
        kind: "section",
        id: item.group.id,
        ownerKey: groupOwnerKey(item.group.id),
        group: item.group,
        leaves,
      }
      section = {row, leaves}
      sections.set(item.group.id, section)
      ordered.push(row)
    }
    section.leaves.push(item)
  }

  const rows: NavigationRow<Route>[] = []
  for (const row of ordered) {
    if (row.kind === "leaf") {
      rows.push(row)
      continue
    }
    rows.push(Object.freeze({...row, leaves: Object.freeze([...row.leaves])}))
    if (row.group.collapsed) continue
    for (const item of row.leaves) {
      rows.push(Object.freeze({
        kind: "leaf",
        id: item.id,
        ownerKey: itemOwnerKey(item.id),
        item,
        parentId: row.id,
      }))
    }
  }
  return Object.freeze(rows)
}

function preferredNavigationRowFocus<Route extends string>(
  rows: readonly NavigationRow<Route>[],
  route: Route,
  currentOwnerKey: string | null,
  canToggleSection: boolean,
): string | null {
  const enabled = rows.filter((row) => navigationRowEnabled(row, canToggleSection))
  if (currentOwnerKey !== null && enabled.some(({ownerKey}) => ownerKey === currentOwnerKey)) return currentOwnerKey
  return enabled.find((row) => row.kind === "leaf" && row.item.route === route)?.ownerKey ??
    enabled[0]?.ownerKey ?? null
}

function navigationRowEnabled<Route extends string>(
  row: NavigationRow<Route>,
  canToggleSection: boolean,
): boolean {
  return row.kind === "section" ? canToggleSection : !row.item.disabled
}

function navigationRowId<Route extends string>(row: NavigationRow<Route> | undefined): string | null {
  return row?.id ?? null
}

function selectNormalizedNavigationItems<Route extends string>(
  options: NormalizedNavigationOptions<Route>,
): Readonly<{total: number; offset: number; items: readonly NormalizedNavigationItem<Route>[]}> {
  const filtered = options.query.length === 0
    ? options.items
    : options.items.filter((item) => normalizeNavigationSearch([
      item.label,
      item.searchText,
      item.group?.label ?? "",
    ].join(" ")).includes(options.query))
  const offset = Math.min(options.window?.offset ?? 0, filtered.length)
  const limit = options.window?.limit ?? filtered.length
  return Object.freeze({total: filtered.length, offset, items: Object.freeze(filtered.slice(offset, offset + limit))})
}

function navigationOwnerKeys<Route extends string>(
  options: NormalizedNavigationOptions<Route>,
  dock: boolean,
): string[] {
  const keys: string[] = dock ? [] : [TITLE_OWNER]
  if (!dock && options.onQueryChange !== undefined) keys.push(SEARCH_OWNER)
  if (dock) {
    for (const item of selectNormalizedNavigationItems(options).items) keys.push(itemOwnerKey(item.id))
  } else if (options.onGroupToggle === undefined) {
    for (const item of selectNormalizedNavigationItems(options).items) keys.push(itemOwnerKey(item.id))
  } else {
    for (const row of navigationHierarchyRows(options)) keys.push(row.ownerKey)
  }
  return keys
}

function navigationAccordionItems<Route extends string>(
  options: NormalizedNavigationOptions<Route>,
  frames: Map<string, UiSurfaceRect>,
): Array<{height: number; draw: (x: number, y: number, w: number, h: number) => void}> {
  if (options.onGroupToggle === undefined) {
    return selectNormalizedNavigationItems(options).items.map((item) => ({
      height: uiShapeMetrics.rowHeight,
      draw: (x, y, w, h) => { frames.set(itemOwnerKey(item.id), {x, y, w, h}) },
    }))
  }
  const hierarchy = navigationHierarchyRows(options)
  const topLevel = hierarchy.filter((row) => row.kind === "section" || row.parentId === null)
  const items: Array<{height: number; draw: (x: number, y: number, w: number, h: number) => void}> = []
  for (const row of topLevel) {
    if (row.kind === "leaf") {
      items.push({
        height: uiShapeMetrics.rowHeight,
        draw: (x, y, w, h) => { frames.set(row.ownerKey, {x, y, w, h}) },
      })
      continue
    }
    const leaves = hierarchy.filter((candidate) => candidate.kind === "leaf" && candidate.parentId === row.id)
    const height = uiShapeMetrics.rowHeight * (1 + leaves.length)
    items.push({
      height,
      draw: (x, y, w, h) => {
        frames.set(row.ownerKey, {x, y, w, h})
        flexColumn({
          x,
          y: y + uiShapeMetrics.rowHeight,
          w,
          h: Math.max(0, h - uiShapeMetrics.rowHeight),
          gap: 0,
          items: leaves.map((leaf) => ({
            height: uiShapeMetrics.rowHeight,
            draw: (leafX: number, leafY: number, leafW: number, leafH: number) => {
              frames.set(leaf.ownerKey, {x: leafX, y: leafY, w: leafW, h: leafH})
            },
          })),
        })
      },
    })
  }
  return items
}

function normalizeNavigationSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU")
}

function sameNavigationWindow(left: PlaygroundNavigationWindow | undefined, right: PlaygroundNavigationWindow | undefined): boolean {
  return left?.offset === right?.offset && left?.limit === right?.limit
}

function sameNavigationGroup(left: PlaygroundNavigationGroup | undefined, right: PlaygroundNavigationGroup | undefined): boolean {
  return left?.id === right?.id && left?.label === right?.label
}

function navigationGroups<Route extends string>(
  options: NormalizedNavigationOptions<Route>,
): ReadonlyMap<string, NormalizedNavigationGroup> {
  const groups = new Map<string, NormalizedNavigationGroup>()
  for (const item of selectNormalizedNavigationItems(options).items) {
    if (item.group !== undefined && !groups.has(item.group.id)) groups.set(item.group.id, item.group)
  }
  return groups
}

function nextStoryControlValue(control: PlaygroundStoryControl, value: unknown): unknown {
  if (control.kind === "boolean" && typeof value === "boolean") return !value
  if (control.kind === "select" && control.options !== undefined && control.options.length > 0) {
    const currentIndex = control.options.findIndex((option) => option.value === value)
    return control.options[(currentIndex + 1 + control.options.length) % control.options.length]!.value
  }
  return undefined
}

function formatStoryValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value)
  if (value === null) return "null"
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function navigationDirection(key: string): "previous" | "next" | "home" | "end" | null {
  if (key === "ArrowUp" || key === "ArrowLeft") return "previous"
  if (key === "ArrowDown" || key === "ArrowRight") return "next"
  if (key === "Home") return "home"
  if (key === "End") return "end"
  return null
}

function isNavigationActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Space" || key === "Spacebar"
}

function drawPanel(surface: UiSurface, width: number, height: number, active: boolean): void {
  Pane(surface, 0, 0, width, height, {
    appearance: "panel",
    active,
    sx: {
      padding: 0,
      zIndex: -0.12,
    },
  })
}
