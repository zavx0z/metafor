import {
  Parameter,
  createNodeTree,
  createNodeTreeExternalStore,
  type Node,
  type NodeTreeDefinition,
} from "@zavx0z/immersive/nodes/tree"

/**
Полный read-only снимок для [визуальной инфраструктуры](../README.md#визуальная-среда-main).
`from` и `to` адресуют Nodes этого же снимка. Состояния и сведения остаются
текстом источника; Visual не выводит из них транспортную или причинную истину.
Снимок содержит только данные и не переносит Store или subscriptions.
*/
export type InfrastructureProjection = Readonly<{
  frames: readonly Readonly<{id: string; label: string}>[]
  nodes: readonly Readonly<{id: string; frameId: string; label: string; details: string}>[]
  connections: readonly Readonly<{id: string; from: string; to: string; label: string; state: string}>[]
}>

type TextPresentation = Readonly<{label: string; readOnly: true}>
type TextParameter = Parameter<string, TextPresentation>

const initialProjection: InfrastructureProjection = {
  frames: [{id: "server", label: "Сервер"}, {id: "browser", label: "Браузер"}],
  nodes: [],
  connections: [],
}

/**
Производная модель одного приложения. Сохраняет exact Parameter identity,
применяет topology одним reconcile и удаляет окончания вместе с соединением.
Невалидный снимок отклоняется до изменения текущего дерева. `dispose` завершает
только принадлежащие модели подписки; повторное использование запрещено.
Сценарии identity и удаления проверяет [модель инфраструктуры](./infrastructure-model.spec.ts).
*/
export function createInfrastructureModel() {
  const initialDefinition: NodeTreeDefinition<TextParameter> = {frames: initialProjection.frames.map(frame => ({
    id: frame.id,
    metadata: {label: frame.label},
  })), nodes: []}
  const tree = createNodeTree(initialDefinition)
  const store = createNodeTreeExternalStore(tree)
  let parameters = new Map<string, Map<string, TextParameter>>()
  let disposed = false

  function present(projection: InfrastructureProjection): void {
    if (disposed) throw new Error("Visual infrastructure model is disposed")
    validateProjection(projection)
    const nextParameters = new Map<string, Map<string, TextParameter>>()
    const values = new Map<TextParameter, string>()
    const nodes: Node<TextParameter>[] = projection.nodes.map(node => {
      const owned = new Map<string, TextParameter>()
      nextParameters.set(node.id, owned)
      const parameter = (id: string, label: string, value: string) => {
        const retained = parameters.get(node.id)?.get(id)
        const result = retained ?? new Parameter<string, TextPresentation>(id, value, {label, readOnly: true})
        owned.set(id, result)
        values.set(result, value)
        return result
      }
      node.details.split(/\r?\n/u).forEach((line, index) => {
        parameter(index === 0 ? "details" : `details:${index}`, index === 0 ? "Сведения" : `Сведения ${index + 1}`, line)
      })
      const sockets: NonNullable<Node<TextParameter>["sockets"]>[number][] = []
      for (const connection of projection.connections) {
        if (connection.from !== node.id && connection.to !== node.id) continue
        const parameterId = `connection:${connection.id}`
        parameter(parameterId, "Соединение ↔", `${connection.label}: ${connection.state}`)
        if (connection.from === node.id) sockets.push({
          id: `source:${connection.id}`,
          parameterId,
          direction: "output",
          side: "right",
          metadata: {kind: "custom", label: `${connection.label} ↔`},
        })
        if (connection.to === node.id) sockets.push({
          id: `target:${connection.id}`,
          parameterId,
          direction: "input",
          side: "left",
          metadata: {kind: "custom", label: `${connection.label} ↔`},
        })
      }
      return {
        id: node.id,
        frameId: node.frameId,
        metadata: {label: node.label},
        parameters: [...owned.values()],
        sockets,
      }
    })
    const definition: NodeTreeDefinition<TextParameter> = {
      frames: projection.frames.map(frame => ({id: frame.id, metadata: {label: frame.label}})),
      nodes,
      links: projection.connections.map(connection => ({
        id: connection.id,
        from: {nodeId: connection.from, socketId: `source:${connection.id}`},
        to: {nodeId: connection.to, socketId: `target:${connection.id}`},
        metadata: {label: `${connection.label} ↔`},
      })),
    }
    tree.reconcile({expectedRevision: tree.getSnapshot().revision, definition})
    parameters = nextParameters
    for (const [parameter, value] of values) parameter.set(value)
  }

  return {
    tree,
    store,
    present,
    dispose() {
      if (disposed) return
      disposed = true
      parameters.clear()
      tree.dispose()
    },
  }
}

/** Заимствованная компонентом модель; её lifecycle завершает создавший App. */
export type InfrastructureModel = ReturnType<typeof createInfrastructureModel>

function validateProjection(projection: InfrastructureProjection): void {
  const entities = new Set<string>()
  const frames = new Set<string>()
  const nodes = new Set<string>()
  const connections = new Set<string>()
  const text = (value: string, label: string) => {
    if (typeof value !== "string") throw new TypeError(`Infrastructure ${label} must be text`)
  }
  const identity = (value: string, set: Set<string>) => {
    if (typeof value !== "string" || value.trim().length === 0 || set.has(value)) {
      throw new TypeError(`Invalid or duplicate infrastructure identity: ${value}`)
    }
    set.add(value)
  }
  for (const frame of projection.frames) {
    identity(frame.id, entities)
    frames.add(frame.id)
    if (typeof frame.label !== "string" || frame.label.trim().length === 0) throw new TypeError("Infrastructure Frame label is missing")
  }
  for (const node of projection.nodes) {
    identity(node.id, entities)
    nodes.add(node.id)
    if (!frames.has(node.frameId)) throw new TypeError(`Unknown infrastructure Frame: ${node.frameId}`)
    if (typeof node.label !== "string" || node.label.trim().length === 0) throw new TypeError("Infrastructure Node label is missing")
    text(node.details, "details")
  }
  for (const connection of projection.connections) {
    identity(connection.id, connections)
    if (!nodes.has(connection.from) || !nodes.has(connection.to)) throw new TypeError(`Unknown infrastructure connection endpoint: ${connection.id}`)
    text(connection.label, "connection label")
    text(connection.state, "connection state")
  }
}
