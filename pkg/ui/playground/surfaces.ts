import {type Object3D} from "@metafor/engine"
import {Button, Pane, Typography, type ButtonProps} from "@ui/components"
import {UiSurface, flexColumn, flexRow, palette, type UiSurfaceRect} from "@ui/elements"
import {playgroundTheme} from "./theme.ts"

export type PlaygroundNavigationGroup = Readonly<{
  id: string
  label: string
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

type NormalizedNavigationItem<Route extends string> = Readonly<{
  id: string
  label: string
  route: Route
  disabled: boolean
  group: PlaygroundNavigationGroup | undefined
  searchText: string
}>

type NormalizedNavigationOptions<Route extends string> = Readonly<{
  title: string
  items: readonly NormalizedNavigationItem<Route>[]
  route: Route
  onNavigate(route: Route): void
  query: string
  window: PlaygroundNavigationWindow | undefined
}>

type NormalizedInfoLine = Readonly<{
  key: string
  label: string
}>

type NormalizedInfoOptions = Readonly<{
  title: string
  lines: readonly NormalizedInfoLine[]
  status: string | undefined
}>

const PANEL_OWNER = "panel"
const TITLE_OWNER = "title"
const STATUS_OWNER = "status"

abstract class RetainedPlaygroundSurface extends UiSurface {
  readonly #retainedRoot: Object3D
  readonly #owners = new Map<string, RetainedOwner>()
  readonly #ownerKeysByParent = new Map<Object3D, string>()
  readonly #dirtyOwners = new Set<string>()
  #layoutPlans = 0
  #materializations = 0

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
  #focusedItemId: string | null
  #focusVisible = false
  readonly #dock: boolean

  protected constructor(options: PlaygroundNavigationOptions<Route>, dock: boolean) {
    const normalized = normalizeNavigationOptions(options)
    super(dock ? "PlaygroundDockSurface" : `PlaygroundNavigationSurface.${normalized.title}`)
    this.#options = normalized
    this.#focusedItemId = preferredNavigationFocus(this.#visibleItems(normalized), normalized.route, null)
    this.#dock = dock
  }

  /** Stable descriptor focus shared by pointer and keyboard navigation. */
  get focusedItemId(): string | null {
    return this.#focusedItemId
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
    const nextFocus = preferredNavigationFocus(this.#visibleItems(next), next.route, this.#focusedItemId)
    if (this.#setFocus(nextFocus, this.#focusVisible)) changed = true
    if (changed) this.requestRender()
  }

  onActivate(): void {
    if (this.#setFocus(this.#focusedItemId, true)) this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (this.#setFocus(this.#focusedItemId, false)) this.requestRender()
  }

  onKey(event: KeyboardEvent): void {
    const direction = navigationDirection(event.key)
    if (direction !== null) {
      event.preventDefault()
      const enabled = this.#visibleItems().filter((item) => !item.disabled)
      let nextFocus: string | null = null
      if (enabled.length > 0) {
        if (direction === "home") nextFocus = enabled[0]!.id
        else if (direction === "end") nextFocus = enabled.at(-1)!.id
        else {
          const currentIndex = enabled.findIndex(({id}) => id === this.#focusedItemId)
          const origin = currentIndex < 0 ? (direction === "next" ? -1 : 0) : currentIndex
          const offset = direction === "next" ? 1 : -1
          nextFocus = enabled[(origin + offset + enabled.length) % enabled.length]!.id
        }
      }
      if (this.#setFocus(nextFocus, true)) this.requestRender()
      return
    }
    if (!isNavigationActivationKey(event.key)) return
    event.preventDefault()
    if (this.#setFocus(preferredNavigationFocus(this.#visibleItems(), this.#options.route, this.#focusedItemId), true)) this.requestRender()
    this.#activateFocusedItem()
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
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: 18,
      paddingTop: 24,
      paddingBottom: 18,
      gap: 9,
      items: [
        {height: 34, draw: (x, y, w, h) => { frames.set(TITLE_OWNER, {x, y, w, h}) }},
        {height: 16, draw: () => {}},
        ...navigationRows(this.#visibleItems(), frames),
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
      paddingX: 24,
      paddingY: 24,
      gap: 10,
      alignItems: "stretch",
      items: this.#visibleItems().map((item) => ({
        width: "1fr" as const,
        height: 42,
        draw: (x: number, y: number, w: number, h: number) => {
          frames.set(itemOwnerKey(item.id), {x, y, w, h})
        },
      })),
    })
    return frames
  }

  #drawOwner(key: string, frame: UiSurfaceRect): void {
    if (key === PANEL_OWNER) {
      drawPanel(this, frame.w, frame.h, this.#dock)
      return
    }
    if (key === TITLE_OWNER) {
      Typography(this, 0, 0, frame.w, frame.h, {
        children: this.#options.title,
        variant: "title",
        sx: {textAlign: "center"},
      })
      return
    }
    if (key.startsWith("group:")) {
      const groupId = groupIdForOwnerKey(key)
      const group = this.#visibleItems().find((item) => item.group?.id === groupId)?.group
      if (group !== undefined) Typography(this, 0, 0, frame.w, frame.h, {children: group.label, variant: "caption", color: "muted"})
      return
    }
    const id = itemIdForOwnerKey(key)
    const item = this.#options.items.find((candidate) => candidate.id === id)
    if (item === undefined) return
    const active = item.route === this.#options.route
    const focused = this.#focusVisible && item.id === this.#focusedItemId
    Button(this, 0, 0, frame.w, frame.h, {
      children: item.label,
      variant: active ? "contained" : "glass",
      color: "neutral",
      ...navigationStyle(active, focused),
      disabled: item.disabled,
      radius: 999,
      fontPx: this.#dock ? 10 : 11,
      onClick: () => {
        const current = this.#options.items.find((candidate) => candidate.id === id)
        if (current === undefined || current.disabled) return
        if (this.#setFocus(current.id, true)) this.requestRender()
        this.#options.onNavigate(current.route)
      },
    })
  }

  #setFocus(id: string | null, visible: boolean): boolean {
    const nextId = id === null || this.#visibleItems().some((item) => item.id === id && !item.disabled) ? id : null
    const previousId = this.#focusedItemId
    const previousVisual = this.#focusVisible ? previousId : null
    const nextVisual = visible ? nextId : null
    if (previousVisual !== nextVisual) {
      if (previousVisual !== null) this.markOwnerDirty(itemOwnerKey(previousVisual))
      if (nextVisual !== null) this.markOwnerDirty(itemOwnerKey(nextVisual))
    }
    this.#focusedItemId = nextId
    this.#focusVisible = visible
    return previousId !== nextId || previousVisual !== nextVisual
  }

  #activateFocusedItem(): void {
    const item = this.#visibleItems().find(({id, disabled}) => id === this.#focusedItemId && !disabled)
    if (item !== undefined) this.#options.onNavigate(item.route)
  }

  #visibleItems(options: NormalizedNavigationOptions<Route> = this.#options): readonly NormalizedNavigationItem<Route>[] {
    return selectNormalizedNavigationItems(options).items
  }
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
      paddingX: 24,
      paddingTop: 28,
      paddingBottom: 24,
      gap: 14,
      items: [
        {height: 30, draw: (x, y, w, h) => { frames.set(TITLE_OWNER, {x, y, w, h}) }},
        {height: 26, draw: () => {}},
        ...this.#options.lines.map((line) => ({
          height: 22,
          draw: (x: number, y: number, w: number, h: number) => { frames.set(line.key, {x, y, w, h}) },
        })),
        {height: "grow" as const, draw: () => {}},
        this.#options.status === undefined ? false : {
          height: 40,
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
      drawPanel(this, frame.w, frame.h)
      return
    }
    if (key === TITLE_OWNER) {
      Typography(this, 0, 0, frame.w, frame.h, {children: this.#options.title, variant: "title"})
      return
    }
    if (key === STATUS_OWNER) {
      if (this.#options.status !== undefined) {
        Typography(this, 0, 0, frame.w, frame.h, {children: this.#options.status, variant: "caption", color: "cyan"})
      }
      return
    }
    const line = this.#options.lines.find((candidate) => candidate.key === key)
    if (line !== undefined) Typography(this, 0, 0, frame.w, frame.h, {children: line.label, variant: "caption", color: "muted"})
  }
}

export class PlaygroundBackdropSurface extends UiSurface {
  constructor() {
    super({bgColor: null, borderColor: null})
    this.node.name = "PlaygroundBackdropSurface"
  }

  protected override render(): void {
    this.drawBackdropGradient({
      base: 0x07101b,
      glowA: {color: "rgba(111,211,255,0.16)", cx: 0.28, cy: 0.18, radius: 0.42},
      glowB: {color: "rgba(82,196,123,0.10)", cx: 0.76, cy: 0.76, radius: 0.42},
      z: -0.18,
    })
  }
}

function normalizeNavigationOptions<Route extends string>(
  options: PlaygroundNavigationOptions<Route>,
): NormalizedNavigationOptions<Route> {
  const ids = new Set<string>()
  const groups = new Map<string, string>()
  const items = options.items.map((item) => {
    if (item.id.length === 0) throw new Error("Playground navigation item id must not be empty")
    if (ids.has(item.id)) throw new Error(`Duplicate playground navigation item id: ${item.id}`)
    ids.add(item.id)
    let group: PlaygroundNavigationGroup | undefined
    if (item.group !== undefined) {
      if (item.group.id.length === 0) throw new Error("Playground navigation group id must not be empty")
      if (item.group.label.trim().length === 0) throw new Error("Playground navigation group label must not be empty")
      const previous = groups.get(item.group.id)
      if (previous !== undefined && previous !== item.group.label) {
        throw new Error(`Playground navigation group label changed for id: ${item.group.id}`)
      }
      groups.set(item.group.id, item.group.label)
      group = Object.freeze({id: item.group.id, label: item.group.label})
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
    ...(item.group === undefined ? {} : {group: item.group}),
    ...(item.searchText.length === 0 ? {} : {searchText: item.searchText}),
  }))
  return Object.freeze({total: view.total, offset: view.offset, items: Object.freeze(items)})
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

function groupOwnerKey(id: string): string {
  return `group:${id}`
}

function groupIdForOwnerKey(key: string): string {
  return key.slice("group:".length)
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

function preferredNavigationFocus<Route extends string>(
  items: readonly NormalizedNavigationItem<Route>[],
  route: Route,
  current: string | null,
): string | null {
  if (current !== null && items.some(({id, disabled}) => id === current && !disabled)) return current
  return items.find((item) => item.route === route && !item.disabled)?.id ??
    items.find(({disabled}) => !disabled)?.id ?? null
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
  const seenGroupIds = new Set<string>()
  for (const item of selectNormalizedNavigationItems(options).items) {
    if (!dock && item.group !== undefined && !seenGroupIds.has(item.group.id)) {
      seenGroupIds.add(item.group.id)
      keys.push(groupOwnerKey(item.group.id))
    }
    keys.push(itemOwnerKey(item.id))
  }
  return keys
}

function navigationRows<Route extends string>(
  items: readonly NormalizedNavigationItem<Route>[],
  frames: Map<string, UiSurfaceRect>,
): Array<{height: number; draw: (x: number, y: number, w: number, h: number) => void}> {
  const rows: Array<{height: number; draw: (x: number, y: number, w: number, h: number) => void}> = []
  const seenGroupIds = new Set<string>()
  for (const item of items) {
    if (item.group !== undefined && !seenGroupIds.has(item.group.id)) {
      seenGroupIds.add(item.group.id)
      const key = groupOwnerKey(item.group.id)
      rows.push({height: 20, draw: (x, y, w, h) => { frames.set(key, {x, y, w, h}) }})
    }
    const key = itemOwnerKey(item.id)
    rows.push({height: 38, draw: (x, y, w, h) => { frames.set(key, {x, y, w, h}) }})
  }
  return rows
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

function drawPanel(surface: UiSurface, width: number, height: number, dock = false): void {
  Pane(surface, 0, 0, width, height, {
    variant: "glass",
    sx: {
      background: playgroundTheme.panelBackground,
      borderColor: dock ? playgroundTheme.dockBorder : playgroundTheme.panelBorder,
      borderRadius: dock ? 34 : playgroundTheme.panelRadius,
      zIndex: -0.12,
    },
  })
}

function navigationStyle(active: boolean, focused: boolean): Pick<ButtonProps, "fill" | "border"> {
  if (active && focused) return {fill: palette.bgHot, border: palette.borderBright}
  if (active) return {fill: palette.bgHot, border: palette.cyan}
  if (focused) return {fill: palette.bgPanelDim, border: palette.borderBright}
  return {}
}
