import {expect, test} from "bun:test"
import {createDocument, DisplayElement, SpaceElement, ViewPointElement, type Presentation} from "@zavx0z/immersive"
import type {DevelopmentCatalog} from "../../../release/shared/development"
import {createDevelopmentRoomScene} from "./development-room-scene"

const catalog: DevelopmentCatalog = {
  schema: "cosmos:development/v1",
  workspaceId: "fixture",
  rootPackage: "@fixture/root",
  revision: "one",
  packages: [
    {name: "@fixture/root", label: "Root", address: "/cosmos/root", owner: null, ownerName: null, resolution: "source", writable: true},
    {name: "@fixture/child", label: "Child", address: "/cosmos/child", owner: "@fixture/root", ownerName: "@fixture/root", resolution: "source", writable: true},
  ],
  dependencies: [],
}

function fixture(failFirstView = false) {
  const document = createDocument(), space = new SpaceElement(document), viewPoint = new ViewPointElement(document)
  document.append(space)
  space.append(viewPoint)
  viewPoint.z = 2500
  viewPoint.fov = Math.PI / 3
  const hosts = new Map<string, DisplayElement>()
  const visits: string[] = [], navigation: string[] = [], surfaces: string[] = []
  const scene = createDevelopmentRoomScene({
    navigate(name) {navigation.push(name)},
    visit(name) {visits.push(name)},
    createView(_root, id, _title, mount, display, release) {
      surfaces.push(id)
      if (failFirstView && surfaces.length === 1) throw new Error("Первое представление недоступно")
      const content = document.createElement("article")
      content.textContent = id
      mount(content)
      return {display, dispose() {mount(null); release()}}
    },
  })
  let previous = scene.spatial.getSnapshot()
  const stopHosts = scene.spatial.subscribe(() => {
    const snapshot = scene.spatial.getSnapshot(), ids = new Set(snapshot?.nodes.map(node => node.id))
    for (const [id, display] of hosts) if (!ids.has(id)) {
      previous?.onHost(id, null)
      hosts.delete(id)
      display.remove()
    }
    for (const node of snapshot?.nodes ?? []) if (!hosts.has(node.id)) {
      const display = new DisplayElement(document)
      display.setAttribute("data-spatial-node-id", node.id)
      space.append(display)
      hosts.set(node.id, display)
      snapshot!.onHost(node.id, display)
    }
    previous = snapshot
  })
  const presented = new Set<(frame: number) => void>()
  const root = {document, space, viewPoint, canvas: {getBoundingClientRect: () => ({left: 0, top: 0, width: 1200, height: 800})},
    getProjection: () => ({kind: "space", owner: space, frustumPlanes: () => [], projectPoint: (p: {x: number; y: number}) => ({x: p.x, y: p.y}), fly() {}}),
    subscribePresented(listener: (frame: number) => void) {presented.add(listener); return () => {presented.delete(listener)}},
    invalidate() {}, render() {for (const listener of presented) listener(1)},
  } as unknown as Presentation
  return {document, scene, root, hosts, visits, navigation, surfaces, dispose() {scene.dispose(); stopHosts()}}
}

test("failed Package creation reports an error and the same route can be retried", () => {
  const f = fixture(true)
  try {
    f.scene.configure(catalog)
    f.scene.setActive(true)
    f.scene.attach(f.root)
    f.scene.applyRoute("@fixture/root")
    expect(f.scene.getSnapshot().error).toBe("Первое представление недоступно")
    expect(f.scene.spatial.getSnapshot()?.contentById.get("@fixture/root")).toBeUndefined()
    f.scene.applyRoute("@fixture/root")
    expect(f.scene.getSnapshot().error).toBeNull()
    expect(f.surfaces).toEqual(["@fixture/root", "@fixture/root"])
    expect(f.scene.spatial.getSnapshot()?.contentById.get("@fixture/root")).toBeDefined()
  } finally {f.dispose()}
})

test("direct Package URL resolves to its Display when the catalog arrives after the route", async () => {
  const f = fixture()
  try {
    f.scene.applyRoute("@fixture/child")
    f.scene.setActive(true)
    f.scene.attach(f.root)
    expect(f.scene.getSnapshot().selectedPackage).toBeNull()
    f.scene.configure(catalog)
    expect(f.scene.getSnapshot().selectedPackage?.name).toBe("@fixture/child")
    expect(f.scene.getSnapshot().view).toBe("display")
    expect(f.scene.spatial.getSnapshot()?.selectedId).toBe("@fixture/child")
    expect(f.surfaces).toEqual(["@fixture/child"])
    expect(f.hosts.get("@fixture/child")?.hidden).toBe(false)
    await Bun.sleep(350)
    f.root.render()
    const rect = f.scene.getSnapshot().geometryNodes.find(node => node.id === "@fixture/child")!.rect
    expect(f.root.viewPoint.targetX).toBeCloseTo(rect.x + rect.width / 2)
    expect(f.root.viewPoint.targetY).toBeCloseTo(rect.y + rect.height / 2)
  } finally {f.dispose()}
})

test("catalog arriving while inactive resolves the pending URL without resetting a later visited room", async () => {
  const f = fixture()
  try {
    f.scene.applyRoute("@fixture/child")
    f.scene.attach(f.root)
    f.scene.configure(catalog)
    expect(f.scene.getSnapshot().view).toBe("display")
    const display = f.hosts.get("@fixture/child")!
    expect(display.hidden).toBe(true)
    expect(f.root.viewPoint.z).toBe(2500)
    f.scene.setActive(true)
    expect(display.hidden).toBe(false)
    expect(f.scene.spatial.getSnapshot()?.selectedId).toBe("@fixture/child")
    await Bun.sleep(350)
    f.root.render()
    const rect = f.scene.getSnapshot().geometryNodes.find(node => node.id === "@fixture/child")!.rect
    expect(f.root.viewPoint.targetX).toBeCloseTo(rect.x + rect.width / 2)
    expect(f.root.viewPoint.targetY).toBeCloseTo(rect.y + rect.height / 2)
    expect(f.scene.enterRoom()).toBe(true)
    const camera = [f.root.viewPoint.x, f.root.viewPoint.y, f.root.viewPoint.z]
    f.scene.setActive(false)
    f.scene.configure({...catalog, revision: "two"})
    f.scene.setActive(true)
    f.scene.applyRoute("@fixture/child")
    expect(f.scene.getSnapshot().view).toBe("room")
    expect(f.hosts.get("@fixture/child")).toBe(display)
    expect([f.root.viewPoint.x, f.root.viewPoint.y, f.root.viewPoint.z]).toEqual(camera)
    expect(f.visits).toEqual(["@fixture/child"])
  } finally {f.dispose()}
})

test("nested Package rooms use exact names, one visited Surface and the Quantum room/back camera policy", () => {
  const f = fixture()
  try {
    f.scene.configure(catalog)
    f.scene.applyRoute("@fixture/child")
    f.scene.setActive(true)
    f.scene.attach(f.root)
    const spatial = f.scene.spatial.getSnapshot()!
    expect((spatial.geometryNodes ?? spatial.nodes).map(node => [node.id, node.parentId ?? null])).toEqual([
      ["@fixture/root", null], ["@fixture/child", "@fixture/root"],
    ])
    expect(spatial.nodes.map(node => node.id)).toEqual(["@fixture/child"])
    expect(f.surfaces).toEqual(["@fixture/child"])
    const childContent = spatial.contentById.get("@fixture/child")
    const childDisplay = f.hosts.get("@fixture/child")
    expect(f.scene.getSnapshot().view).toBe("display")
    expect(f.scene.enterRoom()).toBe(true)
    expect(f.scene.getSnapshot().view).toBe("room")
    expect(f.visits).toEqual(["@fixture/child"])
    expect(f.scene.back()).toBe(true)
    expect(f.scene.getSnapshot().view).toBe("display")
    expect(f.scene.back()).toBe(true)
    expect(f.scene.getSnapshot().view).toBe("overview")
    expect(f.scene.back()).toBe(false)
    f.scene.applyRoute("@fixture/root")
    expect(f.surfaces).toEqual(["@fixture/child", "@fixture/root"])
    f.scene.applyRoute("@fixture/child")
    expect(f.surfaces).toEqual(["@fixture/child", "@fixture/root"])
    expect(f.scene.spatial.getSnapshot()!.contentById.get("@fixture/child")).toBe(childContent)
    expect(f.hosts.get("@fixture/child")).toBe(childDisplay)
    expect(f.navigation).toEqual([])
  } finally {f.dispose()}
})

test("mode isolation keeps exact Package Display/content identity and visited Agent scope", () => {
  const f = fixture()
  try {
    f.scene.configure(catalog)
    f.scene.applyRoute("@fixture/root")
    f.scene.setActive(true)
    f.scene.attach(f.root)
    const display = f.hosts.get("@fixture/root")!
    const content = f.scene.spatial.getSnapshot()!.contentById.get("@fixture/root")
    f.scene.enterRoom()
    f.scene.setActive(false)
    expect(display.hidden).toBe(true)
    expect(f.scene.spatial.getSnapshot()!.contentById.get("@fixture/root")).toBe(content)
    f.scene.setActive(true)
    expect(f.hosts.get("@fixture/root")).toBe(display)
    expect(f.scene.getSnapshot().view).toBe("room")
    expect(f.visits).toEqual(["@fixture/root"])
  } finally {f.dispose()}
})

test("external dependency remains metadata and never becomes an Agent room or live Surface", () => {
  const f = fixture()
  try {
    f.scene.configure({...catalog, packages: [...catalog.packages,
      {name: "external-lib", label: "External", address: "/external", owner: null, ownerName: null,
        resolution: "external", writable: false}]})
    f.scene.applyRoute("external-lib")
    f.scene.setActive(true)
    f.scene.attach(f.root)
    expect(f.scene.getSnapshot().selectedPackage?.name).toBe("external-lib")
    expect(f.scene.getSnapshot().view).toBe("overview")
    expect(f.scene.getSnapshot().geometryNodes.map(node => node.id)).not.toContain("external-lib")
    expect(f.scene.enterRoom()).toBe(false)
    expect(f.surfaces).toEqual([])
    expect(f.visits).toEqual([])
  } finally {f.dispose()}
})
