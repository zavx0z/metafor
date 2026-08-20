import {beforeAll, describe, expect, test} from "bun:test"
import {BufferGeometry, Color, Object3D, TrueTypeFont} from "@metafor/engine"
import {
  createInputEditState,
  divScrollPosition,
  divScrollTo,
  focusInput,
  handleActiveInputKey,
  type UiRuntime,
  UiSurface,
} from "@ui/elements"
import {Button} from "./Button.ts"
import {Field, type FieldDefinition} from "./Field.ts"
import {List} from "./List.ts"
import {Switcher} from "./Switcher.ts"
import {Table, tableScrollTo} from "./Table.ts"

const OWNER_NAMES = [
  "button",
  "regularTextField",
  "regularCheckboxField",
  "compactSwitcherField",
  "switcher",
  "list",
  "table",
  "sibling",
] as const

type OwnerName = typeof OWNER_NAMES[number]
type OwnerCounter = {layoutPlans: number; materializations: number}
type OwnerSnapshot = {
  children: Object3D[]
  geometries: (BufferGeometry | undefined)[]
}

class RetainedComponentsSurface extends UiSurface {
  readonly root: Object3D
  readonly owners = {} as Record<OwnerName, Object3D>
  readonly counters = {} as Record<OwnerName, OwnerCounter>
  surfaceRenderPasses = 0
  buttonClicks = 0
  regularText = "seed"
  regularCheckbox = false
  compactSwitcher = false
  standaloneSwitcher = false

  readonly #ownerByParent = new Map<Object3D, OwnerName>()
  readonly #interactionDirty = new Set<OwnerName>()
  #mounted = false

  constructor() {
    super({bgColor: null, borderColor: null})
    this.root = this.createRetainedParent()
    this.root.name = "RetainedComponents.root"
    for (const name of OWNER_NAMES) {
      const parent = this.createRetainedParent(this.root)
      parent.name = `RetainedComponents.${name}`
      this.owners[name] = parent
      this.counters[name] = {layoutPlans: 0, materializations: 0}
      this.#ownerByParent.set(parent, name)
    }
  }

  transformRoot(update: (parent: Object3D) => void): void {
    this.updateRetainedTransform(this.root, update)
  }

  protected override onRetainedInteractionChange(parent: Object3D): void {
    const owner = this.#ownerByParent.get(parent)
    if (owner !== undefined) this.#interactionDirty.add(owner)
  }

  protected render(): void {
    this.surfaceRenderPasses += 1
    if (!this.#mounted) {
      this.#mounted = true
      for (const name of OWNER_NAMES) this.#materialize(name)
      return
    }
    const dirty = [...this.#interactionDirty]
    this.#interactionDirty.clear()
    for (const name of dirty) this.#materialize(name)
  }

  #materialize(name: OwnerName): void {
    this.materializeRetainedParent(this.owners[name], () => {
      const counter = this.counters[name]
      counter.layoutPlans += 1
      counter.materializations += 1
      this.#draw(name)
    })
  }

  #draw(name: OwnerName): void {
    if (name === "button") {
      Button(this, 20, 20, 140, 32, {
        children: "Retained button",
        onClick: () => { this.buttonClicks += 1 },
      })
      return
    }
    if (name === "regularTextField") {
      const field: FieldDefinition = {
        id: "regular-text",
        key: "regular-text",
        label: "Regular text",
        kind: "text",
        value: this.regularText,
        onChange: (value) => { this.regularText = value },
      }
      Field(this, 20, 72, 220, field)
      return
    }
    if (name === "regularCheckboxField") {
      const field: FieldDefinition = {
        id: "regular-checkbox",
        key: "regular-checkbox",
        label: "Regular checkbox",
        kind: "boolean",
        presentation: "checkbox",
        value: this.regularCheckbox,
        onChange: (value) => { this.regularCheckbox = value },
      }
      Field(this, 20, 140, 220, field)
      return
    }
    if (name === "compactSwitcherField") {
      const field: FieldDefinition = {
        id: "compact-switcher",
        key: "compact-switcher",
        label: "Compact switcher",
        kind: "boolean",
        value: this.compactSwitcher,
        onChange: (value) => { this.compactSwitcher = value },
      }
      Field(this, 20, 190, 220, field, {density: "compact"})
      return
    }
    if (name === "switcher") {
      Switcher(this, 20, 240, 42, 22, {
        key: "standalone-switcher",
        checked: this.standaloneSwitcher,
        onChange: (value) => { this.standaloneSwitcher = value },
      })
      return
    }
    if (name === "list") {
      List(this, 290, 20, 250, 120, {
        key: "components-list",
        dense: true,
        items: Array.from({length: 10}, (_, index) => ({
          key: `list-row:${index}`,
          primary: `List row ${index}`,
        })),
      })
      return
    }
    if (name === "table") {
      Table(this, 290, 170, 330, 140, {
        key: "components-table",
        columns: [
          {key: "name", label: "Name", width: 190},
          {key: "value", label: "Value", width: 190},
        ],
        rows: Array.from({length: 12}, (_, index) => ({name: `Row ${index}`, value: index})),
      })
      return
    }
    this.drawRect(700, 20, 32, 32, new Color(0.8, 0.3, 0.2, 1))
  }
}

const createFakeRuntime = (): UiRuntime => ({
  canvas: {style: {}},
  renderer: {
    pixelRatio: 1,
    invalidateGeometry() {},
  },
  requestRender() {},
  uiRectToFramebufferClipBounds: (
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
  ): [number, number, number, number] => [xMin, yMin, xMax, yMax],
} as unknown as UiRuntime)

const snapshotOwners = (surface: RetainedComponentsSurface): Record<OwnerName, OwnerSnapshot> => {
  const snapshots = {} as Record<OwnerName, OwnerSnapshot>
  for (const name of OWNER_NAMES) {
    const children = [...surface.owners[name].children]
    snapshots[name] = {
      children,
      geometries: children.map((child) => (child as {geometry?: BufferGeometry}).geometry),
    }
  }
  return snapshots
}

const expectOwnersStable = (
  surface: RetainedComponentsSurface,
  snapshots: Record<OwnerName, OwnerSnapshot>,
  except: OwnerName | null = null,
): void => {
  for (const name of OWNER_NAMES) {
    if (name === except) continue
    expect(surface.owners[name].children).toEqual(snapshots[name].children)
    expect(surface.owners[name].children.map((child) => (child as {geometry?: BufferGeometry}).geometry)).toEqual(snapshots[name].geometries)
  }
}

const expectOnlyOwnerAdvanced = (
  surface: RetainedComponentsSurface,
  before: Record<OwnerName, OwnerCounter>,
  owner: OwnerName,
  delta = 1,
): void => {
  for (const name of OWNER_NAMES) {
    const expected = name === owner
      ? {layoutPlans: before[name].layoutPlans + delta, materializations: before[name].materializations + delta}
      : before[name]
    expect(surface.counters[name]).toEqual(expected)
  }
}

const copyCounters = (surface: RetainedComponentsSurface): Record<OwnerName, OwnerCounter> => {
  const counters = {} as Record<OwnerName, OwnerCounter>
  for (const name of OWNER_NAMES) counters[name] = {...surface.counters[name]}
  return counters
}

let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("retained UI Components boundary", () => {
  test("keeps consumer parents stable and rematerializes only the exact dirty Component", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    const timeoutCallbacks = new Map<number, () => void>()
    let nextHandle = 1
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const handle = nextHandle++
      frameCallbacks.set(handle, callback)
      return handle
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((handle: number): void => {
      frameCallbacks.delete(handle)
    }) as typeof cancelAnimationFrame
    globalThis.setTimeout = ((callback: TimerHandler): number => {
      const handle = nextHandle++
      if (typeof callback === "function") timeoutCallbacks.set(handle, callback as () => void)
      return handle
    }) as unknown as typeof setTimeout
    globalThis.clearTimeout = ((handle: number): void => {
      timeoutCallbacks.delete(handle)
    }) as unknown as typeof clearTimeout
    globalThis.setInterval = (() => nextHandle++) as unknown as typeof setInterval
    globalThis.clearInterval = (() => {}) as typeof clearInterval

    const surface = new RetainedComponentsSurface()
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setRect({x: 0, y: 0, w: 800, h: 420}, 0.001, font)

      for (const name of OWNER_NAMES) {
        expect(surface.counters[name]).toEqual({layoutPlans: 1, materializations: 1})
        expect(surface.owners[name].children.length).toBeGreaterThan(0)
      }
      const initial = snapshotOwners(surface)

      surface.transformRoot((parent) => {
        parent.position.set(0.05, -0.03, 0)
        parent.scale.set(1.2, 1.2, 1)
      })
      for (const name of OWNER_NAMES) {
        expect(surface.counters[name]).toEqual({layoutPlans: 1, materializations: 1})
      }
      expectOwnersStable(surface, initial)

      surface.transformRoot((parent) => {
        parent.position.set(0, 0, 0)
        parent.scale.set(1, 1, 1)
      })
      expectOwnersStable(surface, initial)

      const pointer = {button: 0, preventDefault() {}} as MouseEvent
      let beforeCounters = copyCounters(surface)
      let beforeOwners = snapshotOwners(surface)
      surface.onPointerMove(pointer, 80, 36)
      surface.flushPendingRender()
      expectOnlyOwnerAdvanced(surface, beforeCounters, "button")
      expectOwnersStable(surface, beforeOwners, "button")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      surface.onPointerDown(pointer, 80, 36)
      surface.flushPendingRender()
      expectOnlyOwnerAdvanced(surface, beforeCounters, "button")
      expectOwnersStable(surface, beforeOwners, "button")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      surface.onPointerUp(pointer, 80, 36)
      surface.flushPendingRender()
      expect(surface.buttonClicks).toBe(1)
      expectOnlyOwnerAdvanced(surface, beforeCounters, "button")
      expectOwnersStable(surface, beforeOwners, "button")

      expect(timeoutCallbacks.size).toBe(0)

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      surface.onPointerDown(pointer, 80, 36)
      surface.flushPendingRender()
      surface.onPointerUp(pointer, 80, 36)
      surface.flushPendingRender()
      expect(surface.buttonClicks).toBe(2)
      expectOnlyOwnerAdvanced(surface, beforeCounters, "button", 2)
      expectOwnersStable(surface, beforeOwners, "button")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      surface.onPointerDown(pointer, 228, 151)
      surface.flushPendingRender()
      surface.onPointerUp(pointer, 228, 151)
      surface.flushPendingRender()
      expect(surface.regularCheckbox).toBe(true)
      expectOnlyOwnerAdvanced(surface, beforeCounters, "regularCheckboxField", 2)
      expectOwnersStable(surface, beforeOwners, "regularCheckboxField")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      surface.onPointerDown(pointer, 222, 201)
      surface.flushPendingRender()
      surface.onPointerUp(pointer, 222, 201)
      surface.flushPendingRender()
      expect(surface.compactSwitcher).toBe(true)
      expectOnlyOwnerAdvanced(surface, beforeCounters, "compactSwitcherField", 2)
      expectOwnersStable(surface, beforeOwners, "compactSwitcherField")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      surface.onPointerDown(pointer, 42, 251)
      surface.flushPendingRender()
      surface.onPointerUp(pointer, 42, 251)
      surface.flushPendingRender()
      expect(surface.standaloneSwitcher).toBe(true)
      expectOnlyOwnerAdvanced(surface, beforeCounters, "switcher", 2)
      expectOwnersStable(surface, beforeOwners, "switcher")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      focusInput(surface, "field:regular-text", createInputEditState(surface.regularText, surface.regularText.length))
      surface.flushPendingRender()
      expectOnlyOwnerAdvanced(surface, beforeCounters, "regularTextField")
      expectOwnersStable(surface, beforeOwners, "regularTextField")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      expect(handleActiveInputKey(surface, {
        key: "!",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault() {},
      } as KeyboardEvent)).toBe(true)
      surface.flushPendingRender()
      expect(surface.regularText).toBe("seed!")
      expectOnlyOwnerAdvanced(surface, beforeCounters, "regularTextField")
      expectOwnersStable(surface, beforeOwners, "regularTextField")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      divScrollTo(surface, "components-list", {top: 54})
      surface.flushPendingRender()
      expect(divScrollPosition(surface, "components-list").top).toBe(54)
      expectOnlyOwnerAdvanced(surface, beforeCounters, "list")
      expectOwnersStable(surface, beforeOwners, "list")

      beforeCounters = copyCounters(surface)
      beforeOwners = snapshotOwners(surface)
      tableScrollTo(surface, "components-table", {left: 36, top: 48})
      surface.flushPendingRender()
      expect(divScrollPosition(surface, "components-table")).toEqual({left: 36, top: 48})
      expectOnlyOwnerAdvanced(surface, beforeCounters, "table")
      expectOwnersStable(surface, beforeOwners, "table")

      expect(surface.surfaceRenderPasses).toBe(12)
      expect(surface.counters).toEqual({
        button: {layoutPlans: 6, materializations: 6},
        regularTextField: {layoutPlans: 3, materializations: 3},
        regularCheckboxField: {layoutPlans: 3, materializations: 3},
        compactSwitcherField: {layoutPlans: 3, materializations: 3},
        switcher: {layoutPlans: 3, materializations: 3},
        list: {layoutPlans: 2, materializations: 2},
        table: {layoutPlans: 2, materializations: 2},
        sibling: {layoutPlans: 1, materializations: 1},
      })
    } finally {
      surface.dispose()
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      globalThis.setInterval = originalSetInterval
      globalThis.clearInterval = originalClearInterval
    }
  })
})
