import {beforeAll, describe, expect, test} from "bun:test"
import {type BufferGeometry, Object3D, TrueTypeFont} from "@metafor/engine"
import {type UiRuntime, uiShapeMetrics} from "@ui/elements"
import {
  PlaygroundDockSurface,
  PlaygroundInfoSurface,
  PlaygroundNavigationSurface,
  PlaygroundStoryPanelSurface,
  selectPlaygroundNavigationItems,
  type PlaygroundNavigationItem,
  type PlaygroundRetainedDiagnostics,
} from "./surfaces.ts"

type Route = "first" | "second" | "third" | "fourth"
type OwnerSnapshot = Readonly<{
  objects: readonly Object3D[]
  geometries: readonly (BufferGeometry | undefined)[]
}>

const items: readonly PlaygroundNavigationItem<Route>[] = [
  {id: "first", label: "First", route: "first"},
  {id: "second", label: "Second", route: "second"},
  {id: "third", label: "Third", route: "third"},
]

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

const owner = (surface: {node: Object3D}, key: string): Object3D => {
  const retained = surface.node.getObjectByName(`${surface.node.name}.${key}`)
  if (retained === undefined) throw new Error(`Missing retained owner ${key}`)
  return retained
}

const retainedRoot = (surface: {node: Object3D}): Object3D => {
  const retained = surface.node.getObjectByName(`${surface.node.name}.retainedRoot`)
  if (retained === undefined) throw new Error("Missing retained root")
  return retained
}

const snapshot = (parent: Object3D): OwnerSnapshot => {
  const objects: Object3D[] = []
  parent.traverse((object) => {
    if (object !== parent) objects.push(object)
  })
  return {
    objects,
    geometries: objects.map((object) => (object as {geometry?: BufferGeometry}).geometry),
  }
}

const snapshots = (
  surface: {node: Object3D; diagnostics: PlaygroundRetainedDiagnostics},
): ReadonlyMap<string, OwnerSnapshot> => new Map(
  surface.diagnostics.owners.map(({key}) => [key, snapshot(owner(surface, key))] as const),
)

const materializations = (diagnostics: PlaygroundRetainedDiagnostics): Readonly<Record<string, number>> => Object.fromEntries(
  diagnostics.owners.map(({key, materializations}) => [key, materializations]),
)

const expectOwnerOrigin = (
  surface: {node: Object3D},
  key: string,
  x: number,
  y: number,
  pixelScale = 0.001,
): void => {
  expect(owner(surface, key).position.x).toBeCloseTo(x * pixelScale)
  expect(owner(surface, key).position.y).toBeCloseTo(-y * pixelScale)
}

const expectOwnersStable = (
  surface: {node: Object3D; diagnostics: PlaygroundRetainedDiagnostics},
  before: ReadonlyMap<string, OwnerSnapshot>,
  except: ReadonlySet<string> = new Set(),
): void => {
  for (const {key} of surface.diagnostics.owners) {
    if (except.has(key) || !before.has(key)) continue
    expect(snapshot(owner(surface, key))).toEqual(before.get(key)!)
  }
}

const transformRoot = (surface: {node: Object3D}): void => {
  const root = retainedRoot(surface)
  root.position.set(0.08, -0.04, 0)
  root.scale.set(1.25, 1.25, 1)
  root.updateMatrix()
  surface.node.updateWorldMatrix(true)
}

const pressKey = (surface: {onKey(event: KeyboardEvent): void; flushPendingRender(): void}, key: string): number => {
  let prevented = 0
  surface.onKey({
    key,
    preventDefault: () => { prevented += 1 },
  } as KeyboardEvent)
  surface.flushPendingRender()
  return prevented
}

let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("retained @ui/playground surfaces", () => {
  test("keeps Navigation owners stable and rematerializes only active or disabled items", () => {
    const navigate = (): void => {}
    const surface = new PlaygroundNavigationSurface<Route>({title: "Catalog", items, route: "first", onNavigate: navigate})
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 210, h: 640}, 0.001, font)

    expect(surface.diagnostics.layoutPlans).toBe(1)
    expect(surface.diagnostics.materializations).toBe(5)
    expect(materializations(surface.diagnostics)).toEqual({panel: 1, title: 1, "item:first": 1, "item:second": 1, "item:third": 1})
    const navigationInset = uiShapeMetrics.tightGap * 2
    const firstRowY = uiShapeMetrics.tightGap + uiShapeMetrics.panelHeaderHeight + uiShapeMetrics.separatorWidth
    expectOwnerOrigin(surface, "title", navigationInset, uiShapeMetrics.tightGap)
    expectOwnerOrigin(surface, "item:first", navigationInset, firstRowY)
    expectOwnerOrigin(surface, "item:second", navigationInset, firstRowY + uiShapeMetrics.rowHeight + uiShapeMetrics.separatorWidth)
    expectOwnerOrigin(surface, "item:third", navigationInset, firstRowY + (uiShapeMetrics.rowHeight + uiShapeMetrics.separatorWidth) * 2)
    const initial = snapshots(surface)
    const beforeTransform = surface.diagnostics

    transformRoot(surface)
    expect(surface.diagnostics).toEqual(beforeTransform)
    expectOwnersStable(surface, initial)

    surface.setOptions({title: "Catalog", items, route: "second", onNavigate: navigate})
    surface.flushPendingRender()
    expect(surface.diagnostics.layoutPlans).toBe(1)
    expect(surface.diagnostics.materializations).toBe(7)
    expect(materializations(surface.diagnostics)).toEqual({panel: 1, title: 1, "item:first": 2, "item:second": 2, "item:third": 1})
    expectOwnersStable(surface, initial, new Set(["item:first", "item:second"]))

    const beforeDisabled = snapshots(surface)
    const disabledItems = items.map((item) => item.id === "third" ? {...item, disabled: true} : item)
    surface.setOptions({title: "Catalog", items: disabledItems, route: "second", onNavigate: navigate})
    surface.flushPendingRender()
    expect(surface.diagnostics.layoutPlans).toBe(1)
    expect(surface.diagnostics.materializations).toBe(8)
    expect(materializations(surface.diagnostics)["item:third"]).toBe(2)
    expectOwnersStable(surface, beforeDisabled, new Set(["item:third"]))

    const firstParent = owner(surface, "item:first")
    const beforeList = snapshots(surface)
    const reconciledItems: readonly PlaygroundNavigationItem<Route>[] = [
      disabledItems[2]!,
      disabledItems[1]!,
      {id: "fourth", label: "Fourth", route: "fourth"},
    ]
    surface.setOptions({title: "Catalog", items: reconciledItems, route: "second", onNavigate: navigate})
    surface.flushPendingRender()
    expect(surface.diagnostics.layoutPlans).toBe(2)
    expect(surface.diagnostics.materializations).toBe(9)
    expect(surface.diagnostics.owners.map(({key}) => key)).toEqual(["panel", "title", "item:third", "item:second", "item:fourth"])
    expectOwnersStable(surface, beforeList)
    expect(firstParent.parent).toBeNull()
    expect(firstParent.children).toEqual([])

    surface.setRect({x: 0, y: 0, w: 210, h: 640}, 0.002, font)
    expect(surface.diagnostics.layoutPlans).toBe(3)
    expect(surface.diagnostics.materializations).toBe(14)
    expect(materializations(surface.diagnostics)).toEqual({
      panel: 2,
      title: 2,
      "item:second": 3,
      "item:third": 3,
      "item:fourth": 2,
    })

    expect(() => surface.setOptions({
      title: "Invalid",
      items: [reconciledItems[0]!, {...reconciledItems[0]!}],
      route: "second",
      onNavigate: navigate,
    })).toThrow("Duplicate playground navigation item id")
    expect(surface.diagnostics.materializations).toBe(14)
    surface.dispose()
  })

  test("filters and bounds a large grouped navigation without materializing the whole catalog", () => {
    const largeItems: readonly PlaygroundNavigationItem<Route>[] = Array.from({length: 1000}, (_, index) => ({
      id: `item-${index}`,
      label: index === 777 ? "Needle component" : `Component ${index}`,
      route: index % 2 === 0 ? "first" : "second",
      group: {id: "values", label: "Поля значений"},
      searchText: index === 777 ? "needle search alias" : "common",
    }))
    const view = selectPlaygroundNavigationItems({
      title: "Каталог",
      items: largeItems,
      route: "first",
      query: "needle",
      window: {offset: 0, limit: 20},
      onNavigate() {},
    })
    expect(view.total).toBe(1)
    expect(view.items.map(({id}) => id)).toEqual(["item-777"])

    const searchSurface = new PlaygroundNavigationSurface<Route>({
      title: "Каталог",
      items: largeItems,
      route: "first",
      query: "needle",
      window: {offset: 0, limit: 20},
      searchPlaceholder: "Поиск…",
      onQueryChange() {},
      onGroupToggle() {},
      onNavigate() {},
    })
    searchSurface.attachCanvas(createFakeRuntime())
    searchSurface.setRect({x: 0, y: 0, w: 260, h: 700}, 0.001, font)
    expect(searchSurface.diagnostics.owners.map(({key}) => key)).toEqual([
      "panel",
      "title",
      "search",
      "group:values",
      "item:item-777",
    ])
    searchSurface.dispose()

    const toggles: Array<readonly [string, boolean]> = []
    const expandedItems = largeItems.map((item) => ({...item, group: {...item.group!, collapsed: false}}))
    const surface = new PlaygroundNavigationSurface<Route>({
      title: "Каталог",
      items: expandedItems,
      route: "first",
      window: {offset: 490, limit: 10},
      searchPlaceholder: "Поиск…",
      onQueryChange() {},
      onGroupToggle: (id, collapsed) => { toggles.push([id, collapsed]) },
      onNavigate() {},
    })
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 260, h: 700}, 0.001, font)
    expect(surface.diagnostics.owners.map(({key}) => key)).toEqual([
      "panel",
      "title",
      "search",
      "group:values",
      ...Array.from({length: 10}, (_, index) => `item:item-${490 + index}`),
    ])
    expect(surface.diagnostics.materializations).toBe(14)
    const accordionGap = uiShapeMetrics.separatorWidth * 2
    const sectionY = uiShapeMetrics.tightGap + uiShapeMetrics.panelHeaderHeight +
      accordionGap + uiShapeMetrics.rowHeight + accordionGap
    expectOwnerOrigin(surface, "group:values", uiShapeMetrics.tightGap * 2, sectionY)
    expectOwnerOrigin(surface, "item:item-490", uiShapeMetrics.tightGap * 2, sectionY + uiShapeMetrics.rowHeight)
    expectOwnerOrigin(surface, "item:item-491", uiShapeMetrics.tightGap * 2, sectionY + uiShapeMetrics.rowHeight * 2)

    const pointer = {button: 0, preventDefault() {}} as MouseEvent
    surface.onPointerDown(pointer, 100, 65)
    surface.onPointerUp(pointer, 100, 65)
    expect(toggles).toEqual([["values", true]])
    expect(surface.focusedItemId).toBe("item-490")

    const collapsedItems = largeItems.map((item) => ({...item, group: {...item.group!, collapsed: true}}))
    surface.setOptions({
      title: "Каталог",
      items: collapsedItems,
      route: "first",
      window: {offset: 490, limit: 10},
      searchPlaceholder: "Поиск…",
      onQueryChange() {},
      onGroupToggle: (id, collapsed) => { toggles.push([id, collapsed]) },
      onNavigate() {},
    })
    surface.flushPendingRender()
    expect(surface.diagnostics.owners.map(({key}) => key)).toEqual(["panel", "title", "search", "group:values"])
    expect(surface.focusedItemId).toBe("values")
    expect(surface.diagnostics.materializations).toBe(15)

    surface.onPointerDown(pointer, 100, 65)
    surface.onPointerUp(pointer, 100, 65)
    expect(toggles).toEqual([["values", true], ["values", false]])

    surface.setOptions({
      title: "Каталог",
      items: expandedItems,
      route: "first",
      window: {offset: 490, limit: 10},
      searchPlaceholder: "Поиск…",
      onQueryChange() {},
      onGroupToggle: (id, collapsed) => { toggles.push([id, collapsed]) },
      onNavigate() {},
    })
    surface.flushPendingRender()
    expect(surface.diagnostics.owners.map(({key}) => key)).toEqual([
      "panel",
      "title",
      "search",
      "group:values",
      ...Array.from({length: 10}, (_, index) => `item:item-${490 + index}`),
    ])
    expect(surface.focusedItemId).toBe("values")
    surface.onActivate()
    expect(pressKey(surface, "ArrowRight")).toBe(1)
    expect(surface.focusedItemId).toBe("item-490")
    expect(surface.diagnostics.materializations).toBe(29)
    surface.dispose()
  })

  test("keeps Dock owners and counters stable across a pure retained-root transform", () => {
    const navigate = (): void => {}
    const surface = new PlaygroundDockSurface<Route>({title: "Routes", items, route: "first", onNavigate: navigate})
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 936, h: uiShapeMetrics.rowHeight}, 0.001, font)

    expect(surface.diagnostics).toMatchObject({layoutPlans: 1, materializations: 4})
    expectOwnerOrigin(surface, "item:first", uiShapeMetrics.tightGap, 0)
    expectOwnerOrigin(surface, "item:second", 313 + 1 / 3, 0)
    expectOwnerOrigin(surface, "item:third", 623 + 2 / 3, 0)
    const initial = snapshots(surface)
    const beforeTransform = surface.diagnostics
    transformRoot(surface)
    expect(surface.diagnostics).toEqual(beforeTransform)
    expectOwnersStable(surface, initial)

    surface.setOptions({title: "Routes", items, route: "third", onNavigate: navigate})
    surface.flushPendingRender()
    expect(surface.diagnostics.layoutPlans).toBe(1)
    expect(surface.diagnostics.materializations).toBe(6)
    expect(materializations(surface.diagnostics)).toEqual({panel: 1, "item:first": 2, "item:second": 1, "item:third": 2})
    expectOwnersStable(surface, initial, new Set(["item:first", "item:third"]))
    surface.dispose()
  })

  test("keeps one enabled keyboard focus, activates the live route callback, and shares it with pointer clicks", async () => {
    const firstCalls: Route[] = []
    const liveCalls: Route[] = []
    const disabledItems: readonly PlaygroundNavigationItem<Route>[] = [
      items[0]!,
      {...items[1]!, disabled: true},
      items[2]!,
    ]
    const surface = new PlaygroundNavigationSurface<Route>({
      title: "Catalog",
      items: disabledItems,
      route: "first",
      onNavigate: (route) => { firstCalls.push(route) },
    })
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 210, h: 640}, 0.001, font)

    expect(surface.focusedItemId).toBe("first")
    surface.onActivate()
    surface.flushPendingRender()
    const beforeMove = snapshots(surface)
    const beforeMoveCounters = materializations(surface.diagnostics)
    const beforeMoveLayoutPlans = surface.diagnostics.layoutPlans

    expect(pressKey(surface, "ArrowDown")).toBe(1)
    expect(surface.focusedItemId).toBe("third")
    expect(surface.diagnostics.layoutPlans).toBe(beforeMoveLayoutPlans)
    expect(materializations(surface.diagnostics)).toEqual({
      ...beforeMoveCounters,
      "item:first": beforeMoveCounters["item:first"]! + 1,
      "item:third": beforeMoveCounters["item:third"]! + 1,
    })
    expectOwnersStable(surface, beforeMove, new Set(["item:first", "item:third"]))
    expect(snapshot(owner(surface, "item:first"))).not.toEqual(beforeMove.get("item:first"))
    expect(snapshot(owner(surface, "item:third"))).not.toEqual(beforeMove.get("item:third"))

    expect(pressKey(surface, "ArrowRight")).toBe(1)
    expect(surface.focusedItemId).toBe("first")
    expect(pressKey(surface, "ArrowUp")).toBe(1)
    expect(surface.focusedItemId).toBe("third")
    expect(pressKey(surface, "ArrowLeft")).toBe(1)
    expect(surface.focusedItemId).toBe("first")
    expect(pressKey(surface, "End")).toBe(1)
    expect(surface.focusedItemId).toBe("third")
    expect(pressKey(surface, "Home")).toBe(1)
    expect(surface.focusedItemId).toBe("first")
    expect(pressKey(surface, "End")).toBe(1)
    expect(surface.focusedItemId).toBe("third")

    surface.setOptions({
      title: "Catalog",
      items: disabledItems,
      route: "first",
      onNavigate: (route) => { liveCalls.push(route) },
    })
    expect(pressKey(surface, "Enter")).toBe(1)
    expect(pressKey(surface, " ")).toBe(1)
    expect(firstCalls).toEqual([])
    expect(liveCalls).toEqual(["third", "third"])

    const beforePointer = snapshots(surface)
    const beforePointerCounters = materializations(surface.diagnostics)
    const pointer = {button: 0, preventDefault() {}} as MouseEvent
    surface.onPointerDown(pointer, 50, 40)
    surface.onPointerUp(pointer, 50, 40)
    surface.flushPendingRender()
    expect(surface.focusedItemId).toBe("first")
    expect(liveCalls).toEqual(["third", "third", "first"])
    expect(materializations(surface.diagnostics)).toEqual({
      ...beforePointerCounters,
      "item:first": beforePointerCounters["item:first"]! + 1,
      "item:third": beforePointerCounters["item:third"]! + 1,
    })
    expectOwnersStable(surface, beforePointer, new Set(["item:first", "item:third"]))

    await Bun.sleep(140)
    surface.flushPendingRender()
    const beforeTransform = surface.diagnostics
    const beforeTransformOwners = snapshots(surface)
    transformRoot(surface)
    expect(surface.diagnostics).toEqual(beforeTransform)
    expectOwnersStable(surface, beforeTransformOwners)
    surface.dispose()
  })

  test("keeps accordion section disclosure independent from leaf route and keyboard focus", () => {
    const toggles: Array<readonly [string, boolean]> = []
    const routes: Route[] = []
    const grouped: readonly PlaygroundNavigationItem<Route>[] = [
      {id: "first", label: "First", route: "first", group: {id: "alpha", label: "Alpha"}},
      {id: "second", label: "Second", route: "second", disabled: true, group: {id: "alpha", label: "Alpha"}},
      {id: "third", label: "Third", route: "third", group: {id: "beta", label: "Beta", collapsed: true}},
    ]
    const options = (items: readonly PlaygroundNavigationItem<Route>[]) => ({
      title: "Catalog",
      items,
      route: "first" as const,
      onGroupToggle: (id: string, collapsed: boolean) => { toggles.push([id, collapsed]) },
      onNavigate: (route: Route) => { routes.push(route) },
    })
    const surface = new PlaygroundNavigationSurface<Route>(options(grouped))
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 210, h: 640}, 0.001, font)
    surface.onActivate()

    expect(surface.focusedItemId).toBe("first")
    expect(pressKey(surface, "ArrowLeft")).toBe(1)
    expect(surface.focusedItemId).toBe("alpha")
    expect(routes).toEqual([])
    expect(pressKey(surface, "ArrowLeft")).toBe(1)
    expect(toggles).toEqual([["alpha", true]])
    expect(routes).toEqual([])

    const collapsed = grouped.map((item) => item.group?.id === "alpha"
      ? {...item, group: {...item.group, collapsed: true}}
      : item)
    surface.setOptions(options(collapsed))
    surface.flushPendingRender()
    expect(surface.focusedItemId).toBe("alpha")
    expect(pressKey(surface, "ArrowRight")).toBe(1)
    expect(toggles).toEqual([["alpha", true], ["alpha", false]])

    surface.setOptions(options(grouped))
    surface.flushPendingRender()
    expect(pressKey(surface, "ArrowRight")).toBe(1)
    expect(surface.focusedItemId).toBe("first")
    expect(pressKey(surface, "ArrowDown")).toBe(1)
    expect(surface.focusedItemId).toBe("beta")
    expect(pressKey(surface, "Enter")).toBe(1)
    expect(toggles).toEqual([["alpha", true], ["alpha", false], ["beta", false]])
    expect(routes).toEqual([])
    surface.dispose()
  })

  test("applies the same enabled keyboard order to Dock", () => {
    const calls: Route[] = []
    const dockItems: readonly PlaygroundNavigationItem<Route>[] = [
      items[0]!,
      {...items[1]!, disabled: true},
      items[2]!,
    ]
    const surface = new PlaygroundDockSurface<Route>({
      title: "Routes",
      items: dockItems,
      route: "first",
      onNavigate: (route) => { calls.push(route) },
    })
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 936, h: uiShapeMetrics.rowHeight}, 0.001, font)
    surface.onActivate()
    surface.flushPendingRender()
    const beforeMove = snapshots(surface)

    expect(pressKey(surface, "ArrowRight")).toBe(1)
    expect(surface.focusedItemId).toBe("third")
    expect(pressKey(surface, "Enter")).toBe(1)
    expect(calls).toEqual(["third"])
    expectOwnersStable(surface, beforeMove, new Set(["item:first", "item:third"]))
    surface.dispose()
  })

  test("keeps source visible while copy, controls and events use exact retained owners", () => {
    const copied: string[] = []
    const modes: string[] = []
    const changes: Array<readonly [string, unknown]> = []
    const source = [
      'import {Button} from "@ui/components/button"',
      "",
      "Button(surface, x, y, w, h, {",
      '  variant: "contained",',
      "  disabled: false,",
      "})",
    ].join("\n")
    const surface = new PlaygroundStoryPanelSurface({
      source,
      args: {variant: "contained", disabled: false},
      controls: [
        {
          key: "variant",
          label: "Вариант",
          group: "Основные",
          kind: "select",
          options: [{value: "contained", label: "Заполненная"}, {value: "outlined", label: "Контурная"}],
        },
        {key: "disabled", label: "Недоступна", group: "Состояние", kind: "boolean"},
      ],
      events: [{id: "click", label: "Клики", value: "0"}],
      mode: "controls",
      onModeChange: (mode) => { modes.push(mode) },
      onControlChange: (key, value) => { changes.push([key, value]) },
      onCopy: (value) => { copied.push(value) },
    })
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 300, h: 900}, 0.001, font)
    expect(surface.diagnostics.owners.map(({key}) => key)).toEqual([
      "panel",
      "source-title",
      "source-copy",
      "source-box",
      "source-line:0",
      "source-line:1",
      "source-line:2",
      "source-line:3",
      "source-line:4",
      "source-line:5",
      "source-tab:controls",
      "source-tab:events",
      "source-control-group:Основные",
      "source-control:variant",
      "source-control-group:Состояние",
      "source-control:disabled",
    ])
    expectOwnerOrigin(surface, "source-title", 6, 3)
    expectOwnerOrigin(surface, "source-copy", 206, 3)
    expectOwnerOrigin(surface, "source-box", 6, 30)
    expectOwnerOrigin(surface, "source-tab:controls", 6, 357)
    expectOwnerOrigin(surface, "source-tab:events", 150.5, 357)
    expectOwnerOrigin(surface, "source-control:variant", 6, 409)

    const pointer = {button: 0, preventDefault() {}} as MouseEvent
    surface.onPointerDown(pointer, 220, 15)
    surface.onPointerUp(pointer, 220, 15)
    surface.onPointerDown(pointer, 150, 421)
    surface.onPointerUp(pointer, 150, 421)
    surface.onPointerDown(pointer, 220, 369)
    surface.onPointerUp(pointer, 220, 369)
    surface.flushPendingRender()
    expect(copied).toEqual([source])
    expect(changes).toEqual([["variant", "outlined"]])
    expect(modes).toEqual(["events"])
    surface.dispose()
  })

  test("reconciles Info descriptors while status dirties only its exact owner and dispose cleans all parents", () => {
    const surface = new PlaygroundInfoSurface({
      title: "Contract",
      lines: [{id: "generic", label: "Generic shell"}, {id: "preview", label: "Consumer preview"}],
      status: "first",
    })
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 300, h: 640}, 0.001, font)

    expect(surface.diagnostics.layoutPlans).toBe(1)
    expect(surface.diagnostics.materializations).toBe(5)
    expectOwnerOrigin(surface, "title", 6, 3)
    expectOwnerOrigin(surface, "line:id:generic", 6, 28)
    expectOwnerOrigin(surface, "line:id:preview", 6, 53)
    expectOwnerOrigin(surface, "status", 6, 613)
    const initial = snapshots(surface)
    const beforeTransform = surface.diagnostics
    transformRoot(surface)
    expect(surface.diagnostics).toEqual(beforeTransform)
    expectOwnersStable(surface, initial)

    surface.setOptions({
      title: "Contract",
      lines: [{id: "generic", label: "Generic shell"}, {id: "preview", label: "Consumer preview"}],
      status: "second",
    })
    surface.flushPendingRender()
    expect(surface.diagnostics.layoutPlans).toBe(1)
    expect(surface.diagnostics.materializations).toBe(6)
    expect(materializations(surface.diagnostics)).toEqual({panel: 1, title: 1, "line:id:generic": 1, "line:id:preview": 1, status: 2})
    expectOwnersStable(surface, initial, new Set(["status"]))

    const beforeContent = snapshots(surface)
    surface.setOptions({
      title: "Updated contract",
      lines: [{id: "generic", label: "Shared shell"}, {id: "preview", label: "Consumer preview"}],
      status: "second",
    })
    surface.flushPendingRender()
    expect(surface.diagnostics.layoutPlans).toBe(1)
    expect(surface.diagnostics.materializations).toBe(8)
    expect(materializations(surface.diagnostics)).toEqual({panel: 1, title: 2, "line:id:generic": 2, "line:id:preview": 1, status: 2})
    expectOwnersStable(surface, beforeContent, new Set(["title", "line:id:generic"]))

    const genericParent = owner(surface, "line:id:generic")
    const previewParent = owner(surface, "line:id:preview")
    const previewSnapshot = snapshot(previewParent)
    surface.setOptions({
      title: "Updated contract",
      lines: [{id: "preview", label: "Consumer preview"}, {id: "bounded", label: "Bounded diagnostics"}],
      status: "second",
    })
    surface.flushPendingRender()
    expect(surface.diagnostics.layoutPlans).toBe(2)
    expect(surface.diagnostics.materializations).toBe(9)
    expect(owner(surface, "line:id:preview")).toBe(previewParent)
    expect(snapshot(previewParent)).toEqual(previewSnapshot)
    expect(genericParent.parent).toBeNull()
    expect(genericParent.children).toEqual([])

    expect(() => surface.setOptions({
      title: "Invalid",
      lines: [{id: "same", label: "One"}, {id: "same", label: "Two"}],
      status: "second",
    })).toThrow("Duplicate playground info line id")
    expect(surface.diagnostics.materializations).toBe(9)

    const retainedParents = surface.diagnostics.owners.map(({key}) => owner(surface, key))
    surface.dispose()
    surface.dispose()
    expect(surface.diagnostics.owners).toEqual([])
    for (const parent of retainedParents) {
      expect(parent.parent).toBeNull()
      expect(parent.children).toEqual([])
    }
  })
})
