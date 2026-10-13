import {expect, spyOn, test} from "bun:test"
import {ViewPoint} from "@zavx0z/immersive/engine"
import {createDocument, DisplayElement, SpaceElement, ViewPointElement, type Presentation} from "@zavx0z/immersive"
import type {SpatialTreeSnapshot} from "@zavx0z/immersive/nodes/spatial/tree"
import {parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import type {AgentWorkspaceModel} from "./agent-workspace"
import type {AgentWorkspaceSnapshot} from "./agent-workspace-types"
import {createAtomScene} from "./atom-scene"

const meta = parseMetaAddress("@fixture/environment")!
function atom(id: string, children: RuntimeAtom[] = []): RuntimeAtom {return {kind: "atom", ref: `atom:${id}`, meta, declaration: "#/template", state: "ready", values: {}, mass: [], children}}
function input(): AgentWorkspaceSnapshot {
  const graph: Graph = {schema: "metafor/graph", root: meta, template: {[meta]: {name: "Воплощение", fields: [], superposition: [], processes: [], mass: []}}, runtime: {roots: [atom("root", [atom("child")])], reactions: []}}
  return {status: "ready", verseId: "verse", observedWorld: {root: meta, cutId: "cut"}, graph, offices: [
    {id: "office-root", owner: "atom:root", label: "Корень", bounds: {min: {x: -9000, y: -9000, z: 0}, max: {x: 9000, y: 9000, z: 9000}}, agents: []},
    {id: "office-missing", owner: "atom:missing", label: "Нет Atom", bounds: {min: {x: 0, y: 0, z: 0}, max: {x: 1, y: 1, z: 1}}, agents: []},
  ]}
}
function fixture(initial = input(), initialViewport = {width: 1200, height: 800}) {
  let current = initial
  const document = createDocument(), space = new SpaceElement(document), viewPoint = new ViewPointElement(document)
  document.append(space); space.append(viewPoint)
  const sourceListeners = new Set<() => void>(), contentCalls: string[] = [], navigation: {ref: string; focus: boolean | undefined}[] = []
  const model = createAtomScene({workspace: {getSnapshot: () => ({input: current}) as ReturnType<AgentWorkspaceModel["getSnapshot"]>,
    subscribe(listener) {sourceListeners.add(listener); return () => {sourceListeners.delete(listener)}}},
    contentFor(atom) {contentCalls.push(`${atom.ref}:${atom.state}`); const content = document.createElement("article"); content.textContent = `${atom.ref}:${atom.state}`; return content},
  })
  viewPoint.z = 2500; viewPoint.near = .1; viewPoint.far = 100000
  const viewport = {...initialViewport}, hosts = new Map<string, DisplayElement>(), frames = new Set<(frame: number) => void>()
  let previous: SpatialTreeSnapshot | null = null, rendered = 0
  const stopHosts = model.spatial.subscribe(() => {
    const snapshot = model.spatial.getSnapshot(), ids = new Set(snapshot?.nodes.map(node => node.id))
    for (const [id, display] of hosts) if (!ids.has(id)) {hosts.delete(id); previous?.onHost(id, null); display.remove()}
    for (const node of snapshot?.nodes ?? []) if (!hosts.has(node.id)) {
      const display = new DisplayElement(document)
      display.setAttribute("data-spatial-node-id", node.id); hosts.set(node.id, display); space.append(display); snapshot!.onHost(node.id, display)
    }
    previous = snapshot
  })
  const root = {document, space, viewPoint, canvas: {getBoundingClientRect: () => ({left: 0, top: 0, ...viewport})},
    getProjection: () => ({kind: "space", owner: space, frustumPlanes: () => [], projectPoint: (p: {x: number; y: number}) => ({x: p.x, y: p.y}), fly() {}}),
    subscribePresented(listener: (frame: number) => void) {frames.add(listener); return () => {frames.delete(listener)}},
    invalidate() {}, render() {rendered++; for (const listener of frames) listener(rendered)},
  } as unknown as Presentation
  const networkCalls: string[] = []
  const network = {attach(value: Presentation) {expect(value).toBe(root); networkCalls.push("attach")}, suspend() {networkCalls.push("suspend")}, fit() {networkCalls.push("fit")}, zoom() {networkCalls.push("zoom")}, updateViewport() {networkCalls.push("viewport")}}
  model.setNavigation({atom(ref, focus) {navigation.push({ref, focus})}, networks() {networkCalls.push("navigate")}})
  return {model, root, current, document, viewPoint, viewport, hosts, contentCalls, navigation, networkCalls, network,
    update(next: AgentWorkspaceSnapshot) {current = next; for (const listener of sourceListeners) listener()},
    dispose() {model.dispose(); stopHosts()}, get subscriptions() {return sourceListeners.size},
  }
}

test("actual SpatialTree geometry owns offices, native viewport surfaces and exact body depth", () => {
  const f = fixture(), before = structuredClone(f.current)
  try {
    f.model.applyRoute({kind: "atom", ref: "atom:root"}); f.model.attach(f.root, f.network)
    const snapshot = f.model.getSnapshot()
    expect(snapshot.mode).toBe("atoms")
    expect(snapshot.selectedAtom?.ref).toBe("atom:root")
    expect(snapshot.geometryNodes.map(node => node.id)).toEqual(["atom:root", "atom:child"])
    expect(snapshot.geometryNodes.every(node => node.viewport.width === 1200 && node.viewport.height === 800)).toBeTrue()
    expect(snapshot.offices).toHaveLength(1)
    const r = snapshot.geometryNodes.find(node => node.id === "atom:root")!.rect, projected = snapshot.offices[0]!
    expect(projected.position).toEqual({x: r.x + r.width / 2, y: r.y + r.height / 2, z: r.z - 180})
    expect(projected.office.bounds).toEqual({min: {x: -r.width / 2, y: -r.height / 2, z: 0}, max: {x: r.width / 2, y: r.height / 2, z: 180}})
    expect(f.hosts.get("atom:root")?.getAttribute("data-atom-ref")).toBe("atom:root")
    expect(f.networkCalls.every(call => call === "suspend")).toBeTrue()
    expect(f.current).toEqual(before)
  } finally {f.dispose()}
})

const flush = async () => {for (let index = 0; index < 6; index++) await Promise.resolve()}
function fitSelected(f: ReturnType<typeof fixture>) {
  const r = f.model.getSnapshot().geometryNodes.find(node => node.id === f.model.getSnapshot().selectedAtom?.ref)!.rect
  const vp = f.viewPoint
  const pose = ViewPoint.fitPoseForBounds({min: {x: r.x, y: r.y, z: r.z - .001}, max: {x: r.x + r.width, y: r.y + r.height, z: r.z}},
    {x: 0, y: 0, z: 1}, {fov: vp.fov, aspect: f.viewport.width / f.viewport.height})
  f.document.transaction(() => {vp.x = pose.position.x; vp.y = pose.position.y; vp.z = pose.position.z; vp.targetX = pose.target.x; vp.targetY = pose.target.y; vp.targetZ = pose.target.z})
}

test("portrait viewport and resize update Display/Room geometry while a free camera and selection stay unchanged", async () => {
  const f = fixture(input(), {width: 390, height: 844})
  try {
    f.model.applyRoute({kind: "atom", ref: "atom:root"}); f.model.attach(f.root, f.network)
    expect(f.model.getSnapshot().geometryNodes.every(node => node.viewport.width === 390 && node.viewport.height === 844)).toBeTrue()
    const before = f.model.spatial.getSnapshot()!.geometryRevision
    fitSelected(f)
    f.document.transaction(() => {f.viewPoint.x += 100; f.viewPoint.targetX += 100})
    const pose = [f.viewPoint.x, f.viewPoint.y, f.viewPoint.z, f.viewPoint.targetX, f.viewPoint.targetY, f.viewPoint.targetZ]
    f.viewport.width = 360; f.viewport.height = 740
    f.root.render(); await flush()
    expect(f.model.spatial.getSnapshot()!.geometryRevision).toBeGreaterThan(before)
    const snapshot = f.model.getSnapshot(), r = snapshot.geometryNodes[0]!.rect
    expect(snapshot.geometryNodes.every(node => node.viewport.width === 360 && node.viewport.height === 740)).toBeTrue()
    expect(r.width / r.height).toBeCloseTo(360 / 740, 8)
    expect(snapshot.offices[0]!.office.bounds.max.y - snapshot.offices[0]!.office.bounds.min.y).toBe(r.height)
    expect([f.viewPoint.x, f.viewPoint.y, f.viewPoint.z, f.viewPoint.targetX, f.viewPoint.targetY, f.viewPoint.targetZ]).toEqual(pose)
    expect(snapshot.selectedAtom?.ref).toBe("atom:root")
    expect(f.navigation).toEqual([])
  } finally {f.dispose()}
})

test("a fitted Display follows the resized viewport through the public focus pose", async () => {
  const f = fixture(input(), {width: 390, height: 844})
  let now = performance.now()
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  try {
    f.model.applyRoute({kind: "atom", ref: "atom:root"}); f.model.attach(f.root, f.network)
    fitSelected(f)
    expect(f.hosts.get("atom:root")?.getAttribute("data-metafor-display-fitted")).toBe("true")
    const previous = [f.viewPoint.x, f.viewPoint.y, f.viewPoint.z]
    f.viewport.width = 1000; f.viewport.height = 600
    f.root.render(); await flush()
    now += 400; f.root.render(); await flush()
    expect(f.hosts.get("atom:root")?.getAttribute("data-metafor-display-fitted")).toBe("true")
    expect([f.viewPoint.x, f.viewPoint.y, f.viewPoint.z]).not.toEqual(previous)
    const actual = [f.viewPoint.x, f.viewPoint.y, f.viewPoint.z, f.viewPoint.targetX, f.viewPoint.targetY, f.viewPoint.targetZ]
    fitSelected(f)
    expect([f.viewPoint.x, f.viewPoint.y, f.viewPoint.z, f.viewPoint.targetX, f.viewPoint.targetY, f.viewPoint.targetZ]).toEqual(actual)
    expect(f.navigation).toEqual([])
  } finally {clock.mockRestore(); f.dispose()}
})

test("zero-size initial viewport waits for real dimensions and queued resize stops on disposal", async () => {
  const f = fixture(input(), {width: 0, height: 0})
  f.model.applyRoute({kind: "atom", ref: "atom:root"}); f.model.attach(f.root, f.network)
  expect(f.model.getSnapshot().geometryNodes).toEqual([])
  f.viewport.width = 320; f.viewport.height = 720
  f.root.render(); await flush()
  expect(f.model.getSnapshot().geometryNodes[0]?.viewport).toEqual({width: 320, height: 720})
  f.viewport.width = 330; f.root.render(); f.dispose()
  await flush()
  expect(f.model.spatial.getSnapshot()).toBeNull()
})

test("fractional browser viewport keeps positive integer Display resolution during DevTools resize", async () => {
  const f = fixture(input(), {width: 667.25, height: 1088.75})
  try {
    f.model.applyRoute({kind: "atom", ref: "atom:root"})
    f.model.attach(f.root, f.network)
    expect(f.model.getSnapshot().geometryNodes.every(node => node.viewport.width === 667 && node.viewport.height === 1089)).toBeTrue()
    f.viewport.width = 431.6
    f.viewport.height = 765.2
    f.root.render()
    await flush()
    expect(f.model.getSnapshot().geometryNodes.every(node => node.viewport.width === 432 && node.viewport.height === 765)).toBeTrue()
    expect(f.navigation).toEqual([])
  } finally {f.dispose()}
})

test("State/value refresh retains geometry revision and camera while content sees new Atom", () => {
  const f = fixture()
  try {
    f.model.applyRoute({kind: "atom", ref: "atom:root"}); f.model.attach(f.root, f.network)
    const before = f.model.spatial.getSnapshot()!, nodes = before.geometryNodes
    f.document.transaction(() => {f.viewPoint.x = 17; f.viewPoint.y = 23; f.viewPoint.z = 3000; f.viewPoint.targetX = 8; f.viewPoint.targetY = 9})
    const pose = [f.viewPoint.x, f.viewPoint.y, f.viewPoint.z, f.viewPoint.targetX, f.viewPoint.targetY, f.viewPoint.targetZ]
    const next = structuredClone(f.current)
    const root = next.graph!.runtime.roots[0]!
    if (root.kind !== "atom") throw new Error("Atom fixture")
    root.state = "changed"; root.values["count"] = 42
    f.update(next)
    expect(f.model.spatial.getSnapshot()?.geometryRevision).toBe(before.geometryRevision)
    expect(f.model.spatial.getSnapshot()?.geometryNodes).toBe(nodes)
    expect([f.viewPoint.x, f.viewPoint.y, f.viewPoint.z, f.viewPoint.targetX, f.viewPoint.targetY, f.viewPoint.targetZ]).toEqual(pose)
    expect(f.contentCalls.at(-1)).toBe("atom:root:changed")
    expect(f.model.getSnapshot().selectedAtom).toBe(root)
  } finally {f.dispose()}
})

test("workspace view-only notifications do not re-enter scene content or Root render", () => {
  const f = fixture()
  try {
    f.model.applyRoute({kind: "atom", ref: "atom:root"}); f.model.attach(f.root, f.network)
    const count = f.contentCalls.length, snapshot = f.model.spatial.getSnapshot()
    f.update(f.current)
    expect(f.contentCalls).toHaveLength(count)
    expect(f.model.spatial.getSnapshot()).toBe(snapshot)
  } finally {f.dispose()}
})

test("select requests navigation; only confirmed route changes selected Atom and networks own camera explicitly", () => {
  const f = fixture()
  try {
    f.model.applyRoute({kind: "atom", ref: "atom:root"}); f.model.attach(f.root, f.network)
    f.model.select("atom:child", false)
    expect(f.navigation).toEqual([{ref: "atom:child", focus: false}])
    expect(f.model.getSnapshot().selectedAtom?.ref).toBe("atom:root")
    f.model.applyRoute({kind: "atom", ref: "atom:child"})
    expect(f.model.getSnapshot().selectedAtom?.ref).toBe("atom:child")
    expect(f.networkCalls).not.toContain("attach")
    f.model.applyRoute({kind: "networks"})
    expect(f.model.getSnapshot().mode).toBe("networks")
    expect(f.networkCalls.slice(-2)).toEqual(["attach", "fit"])
    expect(f.model.spatial.getSnapshot()).toBeNull()
    f.model.zoom(.5); expect(f.networkCalls.at(-1)).toBe("zoom")
    f.model.applyRoute({kind: "atom", ref: "atom:root"})
    expect(f.model.getSnapshot().mode).toBe("atoms")
    expect(f.networkCalls.at(-1)).toBe("suspend")
    expect(f.hosts.get("atom:root")?.ownerDocument).toBe(f.document)
  } finally {f.dispose()}
})

test("unknown/unavailable route never selects first Agent; cleanup releases owned subscriptions and controller", () => {
  const f = fixture()
  f.model.attach(f.root, f.network)
  expect(f.networkCalls).not.toContain("attach")
  f.model.applyRoute({kind: "atom", ref: "atom:missing"})
  expect(f.model.getSnapshot().mode).toBe("unavailable")
  expect(f.model.getSnapshot().selectedAtom).toBeNull()
  expect(f.model.select("atom:missing")).toBeFalse()
  f.model.applyRoute({kind: "networks"}); f.model.applyRoute({kind: "unavailable", message: "Нет Verse"})
  expect(f.networkCalls.at(-1)).toBe("suspend")
  expect(f.model.getSnapshot().message).toBe("Нет Verse")
  f.dispose(); f.model.dispose()
  expect(f.subscriptions).toBe(0)
  expect(f.model.spatial.getSnapshot()).toBeNull()
  expect(() => f.model.applyRoute({kind: "networks"})).toThrow("disposed")
})
