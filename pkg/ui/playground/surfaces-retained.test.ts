import {beforeAll, describe, expect, test} from "bun:test"
import {type BufferGeometry, Object3D, TrueTypeFont} from "@metafor/engine"
import {type UiRuntime} from "@ui/elements"
import {
  PlaygroundDockSurface,
  PlaygroundInfoSurface,
  PlaygroundNavigationSurface,
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

  test("keeps Dock owners and counters stable across a pure retained-root transform", () => {
    const navigate = (): void => {}
    const surface = new PlaygroundDockSurface<Route>({title: "Routes", items, route: "first", onNavigate: navigate})
    surface.attachCanvas(createFakeRuntime())
    surface.setRect({x: 0, y: 0, w: 936, h: 100}, 0.001, font)

    expect(surface.diagnostics).toMatchObject({layoutPlans: 1, materializations: 4})
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
