import {expect, test} from "bun:test"
import {createNetworkSpace, projectNetworkSpace, projectNetworkConnections, projectNetworkLabels} from "./network-space.tsx"
import {tessellateSpatialEdge} from "@zavx0z/immersive/space"
import type {InfrastructureProjection} from "./infrastructure-model.ts"

const projection: InfrastructureProjection = {
  frames: [{id: "browser", label: "Браузер"}, {id: "server", label: "Сеть"}],
  nodes: [
    {id: "window", frameId: "browser", label: "Window", details: "Страница"},
    {id: "runtime", frameId: "browser", label: "Release", details: "Cache: 1"},
    {id: "endpoint", frameId: "server", label: "WebSocket", details: "wss://example.invalid"},
  ],
  connections: [
    {id: "rpc", from: "runtime", to: "endpoint", label: "RPC", state: "open"},
    {id: "return", from: "endpoint", to: "runtime", label: "Обратная связь", state: "open"},
  ],
}

test("пространственная иерархия сохраняет области, а реальные циклические связи остаются extra edges", () => {
  const view = projectNetworkSpace(projection)
  expect(view.nodes).toHaveLength(6)
  const byId = new Map(view.nodes.map(node => [node.id, node]))
  expect(byId.get("network:entity:runtime")?.parentId).toBe("network:frame:browser")
  expect(byId.get("network:entity:endpoint")?.parentId).toBe("network:frame:server")
  expect(byId.get("network:frame:browser")?.parentId).toBe("network:root")
  expect(view.extraSpatialEdges.map(edge => [edge.from, edge.to])).toEqual([
    ["network:entity:runtime", "network:entity:endpoint"],
    ["network:entity:endpoint", "network:entity:runtime"],
  ])
})

test("обновление состояний и сведений не меняет configuration SpatialTree", () => {
  const first = projectNetworkSpace(projection)
  const next = projectNetworkSpace({...projection,
    nodes: projection.nodes.map(node => ({...node, details: `${node.details}\nОбновлено`})),
    connections: projection.connections.map(connection => ({...connection, state: "unknown"})),
  })
  expect(next.configurationKey).toBe(first.configurationKey)
  expect(next.extraSpatialEdges[0]?.state).toBe("unknown")
  expect(projectNetworkSpace({...projection, connections: []}).configurationKey).toBe(first.configurationKey)
})

test("модель владеет данными до attach и отклоняет невалидный снимок без частичного изменения", () => {
  const model = createNetworkSpace()
  const value = {...projection, connections: projection.connections.map(connection => ({...connection}))}
  model.present(value)
  expect(model.state.getSnapshot()).toBeNull()
  const retained = model.extraSpatialEdges
  value.connections[0]!.state = "mutated"
  expect(model.extraSpatialEdges[0]?.state).toBe("open")
  expect(() => model.present({...projection, connections: [{...projection.connections[0]!, to: "missing"}]})).toThrow("Invalid network spatial connection")
  expect(model.extraSpatialEdges).toBe(retained)
  model.dispose()
  model.dispose()
  expect(() => model.present(projection)).toThrow("disposed")
})

const positioned = [
  {id: "a", label: "A", depth: 2, color: "#ffffff", viewport: {width: 720, height: 480}, rect: {x: 0, y: 0, z: 100, width: 180, height: 120}},
  {id: "b", label: "B", depth: 2, color: "#ffffff", viewport: {width: 720, height: 480}, rect: {x: 300, y: 0, z: 100, width: 180, height: 120}},
]
const observed = [{id: "actual", from: "a", to: "b", label: "Связь", state: "open"}]

test("настоящий cubic XYZ изгибает связь одинаковых уровней и привязан к границам Display", () => {
  const before = structuredClone(positioned)
  const curves = projectNetworkConnections({nodes: positioned}, observed)
  expect(curves).toHaveLength(1)
  expect(curves[0]?.id).toBe("network:connection:actual")
  const route = curves[0]!.route
  expect(route.kind).toBe("cubic")
  if (route.kind !== "cubic") throw new Error("Cubic route required")
  expect(route.points[0]).toEqual({x: 180, y: 60, z: 100})
  expect(route.points[3]).toEqual({x: 300, y: 60, z: 100})
  const points = tessellateSpatialEdge(route)
  expect(points).toHaveLength(65)
  expect(points[32]!.z).toBeGreaterThan(100)
  expect(points[32]!.x).toBeCloseTo(240)
  expect(positioned).toEqual(before)
  expect(projectNetworkConnections({nodes: positioned.slice(0, 1)}, observed)).toHaveLength(0)
})

test("смена реального rect меняет cubic координаты, состояние меняет только цвет", () => {
  const before = projectNetworkConnections({nodes: positioned}, observed)[0]!
  const changed = projectNetworkConnections({nodes: positioned.map(node => node.id === "b" ? {...node, rect: {...node.rect, x: 500, z: 280}} : node)}, observed)[0]!
  expect(changed.id).toBe(before.id)
  expect(changed.route).not.toEqual(before.route)
  expect(tessellateSpatialEdge(changed.route).at(-1)?.z).toBe(280)
  const unknown = projectNetworkConnections({nodes: positioned}, observed.map(edge => ({...edge, state: "unknown"})))[0]!
  expect(unknown.route).toEqual(before.route)
  expect(unknown.color).not.toBe(before.color)
})

test("параллельные и обратные связи имеют стабильные отдельные глубины при перестановке снимка", () => {
  const edges = [...observed, {id: "reverse", from: "b", to: "a", label: "Обратно", state: "open"}]
  const curves = projectNetworkConnections({nodes: positioned}, edges)
  const reversed = projectNetworkConnections({nodes: positioned}, edges.toReversed())
  expect(curves.find(edge => edge.id.endsWith(":actual"))).toEqual(reversed.find(edge => edge.id.endsWith(":actual")))
  expect(tessellateSpatialEdge(curves[0]!.route)[32]!.z).not.toBe(tessellateSpatialEdge(curves[1]!.route)[32]!.z)
})

test("пир без наблюдения внутренностей не получает вымышленных доменов или рёбер", () => {
  const pending: InfrastructureProjection = {frames: [{id: "peer:bookish", label: "Bookish · наблюдение ожидается"}], nodes: [], connections: []}
  const view = projectNetworkSpace(pending)
  expect(view.nodes.map(node => node.id)).toEqual(["network:root", "network:frame:peer:bookish"])
  expect(view.extraSpatialEdges).toEqual([])
})


test("Mac и Codespace образуют соседние ветки, внутренние связи сохраняют наблюдаемые окончания", () => {
  const devices: InfrastructureProjection = {
    frames: [{id: "mac", label: "Mac"}, {id: "bookish", label: "Codespace"}],
    nodes: [{id: "mac:dark", frameId: "mac", label: "Dark", details: "reported"},
      {id: "bookish:dark", frameId: "bookish", label: "Dark", details: "reported"},
      {id: "bookish:energy", frameId: "bookish", label: "Energy", details: "reported"}],
    connections: [{id: "bookish:force", from: "bookish:dark", to: "bookish:energy", label: "Force", state: "open"}],
  }
  const view = projectNetworkSpace(devices)
  expect(view.nodes.filter(node => node.parentId === "network:root").map(node => node.id)).toEqual(["network:frame:mac", "network:frame:bookish"])
  expect(view.nodes.find(node => node.id === "network:entity:bookish:energy")?.parentId).toBe("network:frame:bookish")
  expect(view.extraSpatialEdges.map(edge => [edge.from, edge.to])).toEqual([["network:entity:bookish:dark", "network:entity:bookish:energy"]])
  expect(view.nodes.some(node => node.label === "Boundary" || node.label === "Matrix")).toBe(false)
})

test("разные уровни при совпадении XY остаются пространственным изгибом", () => {
  const nodes = positioned.map(node => node.id === "b" ? {...node, rect: {...positioned[0]!.rect, z: 400}} : node)
  const curve = projectNetworkConnections({nodes}, observed)[0]!
  const points = tessellateSpatialEdge(curve.route)
  expect(points[0]).toEqual({x: 90, y: 60, z: 100})
  expect(points.at(-1)).toEqual({x: 90, y: 60, z: 400})
  expect(points[32]!.x).toBeGreaterThan(90)
})


test("coarse topology uses complete immutable geometry rather than the materialized Display subset", () => {
  expect(projectNetworkConnections({nodes: [], geometryNodes: positioned}, observed)).toHaveLength(1)
  const viewport = {left: 0, top: 0, width: 1000, height: 800}
  const labels = projectNetworkLabels({nodes: positioned.slice(0, 1), geometryNodes: positioned}, point => point, viewport)
  expect(labels.map(node => node.id)).toEqual(["b"])
  expect(projectNetworkLabels({nodes: [], geometryNodes: positioned}, () => null, viewport)).toEqual([])
  const many = Array.from({length: 300}, (_, index) => ({...positioned[0]!, id: String(index)}))
  expect(projectNetworkLabels({nodes: [], geometryNodes: many}, point => point, viewport)).toHaveLength(128)
})
