import {expect, test} from "bun:test"
import {createInfrastructureModel, type InfrastructureProjection} from "./infrastructure-model.ts"
import {createInfrastructureLayout} from "./infrastructure-layout.ts"

const projection: InfrastructureProjection = {
  frames: [{id: "server", label: "Сервер"}, {id: "browser", label: "Браузер"}],
  nodes: [
    {id: "release", frameId: "server", label: "Выпуск", details: "Bun process"},
    {id: "window", frameId: "browser", label: "Окно", details: "Window"},
  ],
  connections: [{id: "rpc", from: "window", to: "release", label: "RPC", state: "connected"}],
}

test("снимки инфраструктуры сохраняют Parameters и отделяют значения от topology", () => {
  const model = createInfrastructureModel()
  try {
    model.present(projection)
    const details = model.tree.parameter("release", "details")
    const state = model.tree.parameter("window", "connection:rpc")
    const snapshot = model.tree.getSnapshot()
    model.present(structuredClone(projection))
    expect(model.tree.getSnapshot()).toBe(snapshot)
    expect(model.tree.parameter("release", "details")).toBe(details)
    expect(model.tree.parameter("window", "connection:rpc")).toBe(state)
    model.present({...projection,
      nodes: projection.nodes.map(node => node.id === "release" ? {...node, details: "Bun process ready"} : node),
      connections: projection.connections.map(connection => ({...connection, state: "reconnecting"})),
    })
    expect(model.tree.getSnapshot().topologyRevision).toBe(snapshot.topologyRevision)
    expect(model.tree.parameter("release", "details")).toBe(details)
    expect(model.tree.parameter("window", "connection:rpc")).toBe(state)
    expect(state.value).toBe("RPC: reconnecting")
    expect(state.presentation.readOnly).toBe(true)
    const retained = model.tree.getSnapshot()
    expect(() => model.present({...projection, connections: [{...projection.connections[0]!, to: "missing"}]})).toThrow("Unknown infrastructure connection endpoint")
    expect(model.tree.getSnapshot()).toBe(retained)
  } finally {
    model.dispose()
  }
  expect(() => model.present(projection)).toThrow("disposed")
})

test("завершённое соединение удаляет Link и оба Socket одним изменением", () => {
  const model = createInfrastructureModel()
  try {
    model.present(projection)
    const details = model.tree.parameter("release", "details")
    const events: unknown[] = []
    const unsubscribe = model.tree.subscribe(change => events.push(change))
    model.present({...projection, connections: []})
    const snapshot = model.tree.getSnapshot()
    expect(events).toHaveLength(1)
    expect(snapshot.links).toHaveLength(0)
    expect(snapshot.nodes.flatMap(node => node.sockets)).toHaveLength(0)
    expect(model.tree.parameter("release", "details")).toBe(details)
    const layout = createInfrastructureLayout(1200, 800)(snapshot, {}, snapshot.nodes.map(node => ({
      id: node.id,
      width: 360,
      height: 140,
      anchors: [],
    })))
    expect("then" in layout).toBe(false)
    if (!("then" in layout)) {
      expect(layout.ports).toHaveLength(0)
      expect(layout.edges).toHaveLength(0)
      expect(layout.nodes.map(node => node.id).sort()).toEqual(["browser", "release", "server", "window"])
    }
    unsubscribe()
  } finally {
    model.dispose()
  }
})

test("строки сведений имеют независимые read-only Parameters со стабильными адресами", () => {
  const model = createInfrastructureModel()
  try {
    const view = {...projection, nodes: projection.nodes.map(node => ({...node, details: "Исполнение готово\nЗапросы: 2\nCache: 1"}))}
    model.present(view)
    const counter = model.tree.parameter("window", "details:1")
    const topology = model.tree.getSnapshot().topologyRevision
    expect(counter.value).toBe("Запросы: 2")
    expect(counter.presentation.readOnly).toBe(true)
    model.present({...view, nodes: view.nodes.map(node => ({...node, details: "Исполнение готово\nЗапросы: 3\nCache: 1"}))})
    expect(model.tree.parameter("window", "details:1")).toBe(counter)
    expect(counter.value).toBe("Запросы: 3")
    expect(model.tree.getSnapshot().topologyRevision).toBe(topology)
  } finally {
    model.dispose()
  }
})
