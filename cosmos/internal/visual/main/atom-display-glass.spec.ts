import {expect, test} from "bun:test"
import {createDocument, DisplayElement, SpaceElement, ViewPointElement} from "@zavx0z/immersive"
import {ViewPoint} from "@zavx0z/immersive/engine"
import {createSpatialTreeState, type SpatialTreeSnapshot} from "@zavx0z/immersive/nodes/spatial/tree"
import {bindAtomDisplayGlass} from "./atom-display-glass"
import {createProductRouter} from "../../../release/main/router"
import type {ProductRouteContext} from "../../../release/shared/product-route"

const flush = async () => {for (let index = 0; index < 5; index++) await Promise.resolve()}
const marker = "data-metafor-display-fitted"
function fixture() {
  const document = createDocument(), space = new SpaceElement(document), viewPoint = new ViewPointElement(document)
  document.append(space); space.append(viewPoint)
  const display = new DisplayElement(document), second = new DisplayElement(document)
  space.append(display, second)
  const state = createSpatialTreeState(), viewport = {width: 1200, height: 800}
  const nodes = [
    {id: "atom:first", label: "Первый", depth: 0, color: "#fff", viewport, rect: {x: 100, y: 200, z: 300, width: 500, height: 400}},
    {id: "atom:second", label: "Второй", depth: 1, color: "#fff", viewport, rect: {x: 800, y: 200, z: 300, width: 500, height: 400}},
  ]
  const snapshot = {nodes, selectedId: "atom:first", selectedVolumeId: null, geometryRevision: 1, volumes: [], visibleVolumeIds: new Set<string>(), disabledHitIds: new Set<string>(), contentById: new Map(), floor: null, onHost() {}, onActivate() {}, onVolumeActivate() {}} as unknown as SpatialTreeSnapshot
  state.publish(snapshot)
  const displays = new Map([["atom:first", display], ["atom:second", second]])
  const glass = bindAtomDisplayGlass({root: {document, viewPoint}, source: state, displayFor: id => displays.get(id) ?? null})
  glass.updateViewport(viewport)
  function fit(id = "atom:first") {
    const rect = nodes.find(node => node.id === id)!.rect
    const pose = ViewPoint.fitPoseForBounds({min: {x: rect.x, y: rect.y, z: rect.z - .001}, max: {x: rect.x + rect.width, y: rect.y + rect.height, z: rect.z}},
      {x: 0, y: 0, z: 1}, {fov: viewPoint.fov, aspect: viewport.width / viewport.height})
    document.transaction(() => {viewPoint.x = pose.position.x; viewPoint.y = pose.position.y; viewPoint.z = pose.position.z; viewPoint.targetX = pose.target.x; viewPoint.targetY = pose.target.y; viewPoint.targetZ = pose.target.z})
  }
  return {document, viewPoint, display, second, state, snapshot, viewport, glass, displays, fit}
}

test("own Displays expose AtomRef; exact public fit marks only selected Display", async () => {
  const f = fixture()
  try {
    expect(f.display.getAttribute("data-atom-ref")).toBe("atom:first")
    expect(f.second.getAttribute("data-atom-ref")).toBe("atom:second")
    expect(f.display.hasAttribute(marker)).toBeFalse()
    f.fit(); await flush()
    expect(f.display.getAttribute(marker)).toBe("true")
    expect(f.second.hasAttribute(marker)).toBeFalse()
    f.state.publish({...f.snapshot, selectedId: "atom:second"})
    expect(f.display.hasAttribute(marker)).toBeFalse()
    f.fit("atom:second"); await flush()
    expect(f.second.getAttribute(marker)).toBe("true")
  } finally {f.glass.dispose()}
})

test("fly, zoom/FOV and resize clear fit without changing URI, selection or Document", async () => {
  const f = fixture(), selected = f.state.getSnapshot()!.selectedId
  const location = {pathname: "/verse/first"}, state: unknown = null
  let routeApplications = 0, historyMutations = 0
  const context: ProductRouteContext = {status: "unavailable", verseId: "verse", graph: null}
  const router = createProductRouter({source: {getSnapshot: () => context, subscribe: () => () => {}},
    applyRoute() {routeApplications++}, platform: {location, events: new EventTarget(), history: {state,
      pushState() {historyMutations++}, replaceState() {historyMutations++}}}})
  router.start()
  try {
    f.fit(); await flush(); expect(f.display.hasAttribute(marker)).toBeTrue()
    f.document.transaction(() => {f.viewPoint.x += 100; f.viewPoint.targetX += 100})
    await flush(); expect(f.display.hasAttribute(marker)).toBeFalse()
    f.fit(); await flush()
    f.viewPoint.z += 100
    await flush(); expect(f.display.hasAttribute(marker)).toBeFalse()
    f.fit(); await flush()
    f.viewPoint.fov += .1
    await flush(); expect(f.display.hasAttribute(marker)).toBeFalse()
    f.fit(); await flush(); expect(f.display.hasAttribute(marker)).toBeTrue()
    f.viewport.width = 800; f.glass.updateViewport(f.viewport)
    expect(f.display.hasAttribute(marker)).toBeFalse()
    f.fit(); await flush(); expect(f.display.hasAttribute(marker)).toBeTrue()
    expect(f.state.getSnapshot()!.selectedId).toBe(selected)
    expect(f.display.ownerDocument).toBe(f.document)
    expect(location.pathname).toBe("/verse/first")
    expect(routeApplications).toBe(1)
    expect(historyMutations).toBe(0)
  } finally {f.glass.dispose(); router.dispose()}
})

test("hidden, released and unavailable Displays clear markers; disposal unsubscribes and restores owned attributes", async () => {
  const f = fixture()
  f.fit(); await flush()
  expect(f.display.hasAttribute(marker)).toBeTrue()
  f.display.hidden = true; await flush()
  expect(f.display.hasAttribute(marker)).toBeFalse()
  f.display.hidden = false; await flush()
  expect(f.display.hasAttribute(marker)).toBeTrue()
  const fov = f.viewPoint.fov
  f.viewPoint.fov = 0; await flush()
  expect(f.display.hasAttribute(marker)).toBeFalse()
  f.viewPoint.fov = fov; await flush()
  expect(f.display.hasAttribute(marker)).toBeTrue()
  f.displays.delete("atom:first"); f.glass.update()
  expect(f.display.hasAttribute(marker)).toBeFalse()
  expect(f.display.hasAttribute("data-atom-ref")).toBeFalse()
  f.state.publish(null)
  expect(f.second.hasAttribute("data-atom-ref")).toBeFalse()
  f.state.publish(f.snapshot); f.displays.set("atom:first", f.display); f.glass.update()
  f.glass.dispose(); f.glass.dispose()
  expect(f.display.hasAttribute(marker)).toBeFalse()
  expect(f.display.hasAttribute("data-atom-ref")).toBeFalse()
  f.fit(); f.state.publish(f.snapshot); await flush()
  expect(f.display.hasAttribute(marker)).toBeFalse()
})
