import {useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {Typography} from "@zavx0z/immersive/ui"
import {SpatialEdges, type SpatialEdge} from "@zavx0z/immersive/space"
import type {DOMComponentConstructor, Presentation} from "@zavx0z/immersive"
import {
  SpatialTree,
  createSpatialTreeController,
  createSpatialTreeState,
  type SpatialTreeController,
  type SpatialTreeNode,
  type SpatialTreeSnapshot,
} from "@zavx0z/immersive/nodes/spatial/tree"
import type {InfrastructureProjection} from "./infrastructure-model.ts"

const ROOT_ID = "network:root"
const frameId = (id: string) => `network:frame:${id}`
const entityId = (id: string) => `network:entity:${id}`
const viewport = Object.freeze({width: 960, height: 640})

/**
Дополнительное отношение между сущностями. Оно не меняет иерархию Frame.
Связь появляется при наличии обоих окончаний в полной публичной геометрии.
*/
export type NetworkSpatialEdge = Readonly<{
  id: string
  from: string
  to: string
  label: string
  state: string
}>

/**
Переводит [инфраструктурную проекцию](../README.md#визуальная-среда-main) в
иерархию областей и отдельные реальные соединения. Details и state не входят
в configuration key, поэтому polling значений не перестраивает SpatialTree.
*/
export function projectNetworkSpace(projection: InfrastructureProjection) {
  const ids = new Set<string>()
  const frames = new Set(projection.frames.map(frame => frame.id))
  const entities = new Set(projection.nodes.map(node => node.id))
  const connections = new Set<string>()
  const nodes: SpatialTreeNode[] = [{id: ROOT_ID, label: "MetaFor · Сеть", viewport, color: "var(--widget-regular-content)"}]
  const add = (node: SpatialTreeNode) => {
    if (ids.has(node.id) || !node.label.trim()) throw new TypeError(`Invalid network spatial node: ${node.id}`)
    ids.add(node.id)
    nodes.push(node)
  }
  for (const frame of projection.frames) {
    if (!frame.id.trim()) throw new TypeError("Network Frame identity is missing")
    add({id: frameId(frame.id), parentId: ROOT_ID, label: frame.label, viewport})
  }
  for (const node of projection.nodes) {
    if (!node.id.trim() || !frames.has(node.frameId)) throw new TypeError(`Unknown network Frame: ${node.frameId}`)
    add({id: entityId(node.id), parentId: frameId(node.frameId), label: node.label, viewport})
  }
  const extraSpatialEdges: NetworkSpatialEdge[] = projection.connections.map(connection => {
    if (!connection.id.trim() || connections.has(connection.id) || !entities.has(connection.from) || !entities.has(connection.to)) {
      throw new TypeError(`Invalid network spatial connection: ${connection.id}`)
    }
    connections.add(connection.id)
    return {...connection, from: entityId(connection.from), to: entityId(connection.to)}
  })
  return {nodes, extraSpatialEdges, configurationKey: JSON.stringify(nodes)}
}

type Rectangle = SpatialTreeSnapshot["nodes"][number]["rect"]

/**
Наблюдаемые соединения получают cubic XYZ-маршрут в мм общего Space через
публичный SpatialEdges. Окончания лежат на границе rect полной авторитетной раскладки;
контрольные точки поднимают кривую над их плоскостью. Параллельные отношения
получают стабильные глубины по identity. Камера не участвует в маршрутизации;
материализация Display не меняет существование маршрута. Отсутствующее в
геометрии окончание не получает вымышленную координату.
*/
export function projectNetworkConnections(snapshot: Pick<SpatialTreeSnapshot, "nodes" | "geometryNodes">, edges: readonly NetworkSpatialEdge[]): readonly SpatialEdge[] {
  const nodes = new Map((snapshot.geometryNodes ?? snapshot.nodes).map(node => [node.id, node]))
  const groups = new Map<string, string[]>()
  for (const edge of edges) {
    const key = JSON.stringify([edge.from, edge.to].sort())
    const group = groups.get(key) ?? []
    group.push(edge.id)
    groups.set(key, group)
  }
  for (const group of groups.values()) group.sort()
  const center = (rect: Rectangle) => ({x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, z: rect.z})
  const boundary = (rect: Rectangle, dx: number, dy: number) => {
    const point = center(rect)
    const scale = Math.max(Math.abs(dx) / (rect.width / 2), Math.abs(dy) / (rect.height / 2))
    return scale === 0 ? point : {...point, x: point.x + dx / scale, y: point.y + dy / scale}
  }
  return edges.flatMap(edge => {
    const source = nodes.get(edge.from)?.rect
    const target = nodes.get(edge.to)?.rect
    if (source === undefined || target === undefined) return []
    const a = center(source), b = center(target)
    const dx = b.x - a.x, dy = b.y - a.y
    const from = boundary(source, dx, dy), to = boundary(target, -dx, -dy)
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
    if (length === 0) return []
    const group = groups.get(JSON.stringify([edge.from, edge.to].sort()))!
    const lane = group.indexOf(edge.id)
    const lift = Math.max(32, Math.min(180, length * .24)) + lane * 20
    const top = Math.max(from.z, to.z) + lift
    const lateral = dx === 0 && dy === 0 ? lift * .6 : 0
    const color = edge.state === "open" || edge.state === "connected" ? 0xa4ffe4
      : edge.state === "error" || edge.state === "failed" ? 0xffacc0
      : edge.state === "closed" || edge.state === "disconnected" ? 0xb8c4d6 : 0xffdb99
    return [{id: `network:connection:${edge.id}`, color, route: {kind: "cubic" as const, segments: 64,
      points: [from, {x: from.x + (to.x - from.x) / 3 + lateral, y: from.y + (to.y - from.y) / 3, z: top},
        {x: from.x + (to.x - from.x) * 2 / 3 + lateral, y: from.y + (to.y - from.y) * 2 / 3, z: top}, to] as const}}]
  })
}

type CoarseLabel = SpatialTreeSnapshot["nodes"][number]

/** Лёгкие подписи не используют бюджет Display. Public world→client projection ограничивает рабочий набор. */
export function projectNetworkLabels(snapshot: Pick<SpatialTreeSnapshot, "nodes" | "geometryNodes">,
  project: (point: Readonly<{x: number; y: number; z: number}>) => Readonly<{x: number; y: number}> | null,
  viewport: Readonly<{left: number; top: number; width: number; height: number}>): readonly CoarseLabel[] {
  const materialized = new Set(snapshot.nodes.map(node => node.id))
  return (snapshot.geometryNodes ?? snapshot.nodes).flatMap(node => {
    if (materialized.has(node.id)) return []
    const point = project({x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2, z: node.rect.z})
    if (point === null || point.x < viewport.left - 32 || point.x > viewport.left + viewport.width + 32
      || point.y < viewport.top - 32 || point.y > viewport.top + viewport.height + 32) return []
    return [{node, distance: Math.hypot(point.x - viewport.left - viewport.width / 2, point.y - viewport.top - viewport.height / 2)}]
  }).sort((a, b) => a.distance - b.distance || a.node.id.localeCompare(b.node.id)).slice(0, 128).map(value => value.node)
}

/**
Один retained controller поверх существующего Presentation. Источник хранит
полный последний снимок; SpatialTree владеет geometry, visibility и navigation.
Подробности материализуются только для выбранной сущности, а прежний content
освобождается. attach повторно с тем же Root безопасен; другой Root запрещён.
*/
export function createNetworkSpace() {
  const state = createSpatialTreeState()
  const controllerState = createSpatialTreeState()
  let projection: InfrastructureProjection = {frames: [{id: "server", label: "Сервер"}, {id: "browser", label: "Браузер"}], nodes: [], connections: []}
  let prepared = projectNetworkSpace(projection)
  let configuredKey = ""
  let controller: SpatialTreeController | null = null
  let attached: Presentation | null = null
  let selected: string | null = null
  let contentKey = ""
  let followingOverview = true
  let releaseInput = () => {}
  let releasePresentation = () => {}
  let disposed = false
  let geometryKey = ""
  let edgesKey = ""
  let edgeSnapshot: Readonly<{edges: readonly SpatialEdge[]; geometryRevision: number}> = {edges: [], geometryRevision: 0}
  let previousSnapshot: SpatialTreeSnapshot | null = null
  let edgeGeometryInput: readonly CoarseLabel[] | null = null
  let edgeInput: readonly NetworkSpatialEdge[] | null = null
  let renderedEdges: readonly SpatialEdge[] = []
  let styledEdges: readonly SpatialEdge[] | null = null
  let labelSource: SpatialTreeSnapshot | null = null
  let labelProjectionKey = ""
  let publishedEdges = edgeSnapshot
  let labels: readonly CoarseLabel[] = []
  let labelsKey = ""
  let publishedLabels = labels

  const publishDerived = () => {
    const snapshot = controllerState.getSnapshot()
    if (snapshot === null) {
      if (edgeSnapshot.edges.length > 0) edgeSnapshot = {edges: [], geometryRevision: edgeSnapshot.geometryRevision + 1}
      if (labels.length > 0) labels = []
      state.publish(null)
      return
    }
    const geometryInput = snapshot.geometryNodes ?? snapshot.nodes
    if (geometryInput !== edgeGeometryInput || prepared.extraSpatialEdges !== edgeInput) {
      renderedEdges = projectNetworkConnections(snapshot, prepared.extraSpatialEdges)
      edgeGeometryInput = geometryInput
      edgeInput = prepared.extraSpatialEdges
    }
    const edges = renderedEdges
    if (edges !== styledEdges) {
      const key = JSON.stringify(edges.map(edge => [edge.id, edge.route]))
      const styles = JSON.stringify(edges)
      if (styles !== edgesKey) {
        edgeSnapshot = {edges, geometryRevision: edgeSnapshot.geometryRevision + (key === geometryKey ? 0 : 1)}
        geometryKey = key
        edgesKey = styles
      }
      styledEdges = edges
    }
    if (attached !== null) {
      const rect = attached.canvas.getBoundingClientRect()
      const vp = attached.viewPoint
      const camera = JSON.stringify([vp.x, vp.y, vp.z, vp.targetX, vp.targetY, vp.targetZ, vp.fov, vp.near, vp.far,
        rect.left, rect.top, rect.width, rect.height])
      if (snapshot !== labelSource || camera !== labelProjectionKey) {
        const projection = attached.getProjection(attached.space)
        const next = projectNetworkLabels(snapshot, point => projection.projectPoint(point), rect)
        const key = JSON.stringify([snapshot.geometryRevision, next.map(node => node.id)])
        if (key !== labelsKey) { labels = next; labelsKey = key }
        labelSource = snapshot
        labelProjectionKey = camera
      }
    }
    if (snapshot === previousSnapshot && publishedEdges === edgeSnapshot && publishedLabels === labels) return
    previousSnapshot = snapshot
    publishedEdges = edgeSnapshot
    publishedLabels = labels
    // Группировка областей не является наблюдаемой transport-связью.
    const bodies = snapshot.bodyVolumes ?? snapshot.volumes.filter(volume => volume.caps !== false)
    const bodyIds = new Set(bodies.map(body => body.id))
    state.publish({...snapshot, volumes: bodies, bodyVolumes: bodies, branchVolumes: [],
      visibleVolumeIds: new Set([...snapshot.visibleVolumeIds].filter(id => bodyIds.has(id)))})
  }
  const unsubscribe = controllerState.subscribe(publishDerived)

  const assertActive = () => { if (disposed) throw new Error("Network space is disposed") }
  const syncViewport = () => {
    if (attached === null || controller === null) return
    const rect = attached.canvas.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) controller.updateViewport({width: rect.width, height: rect.height})
  }
  const details = (id: string): NetworkDetailsProps => {
    if (id === ROOT_ID) return {title: "MetaFor · Сеть", lines: [
      `Области: ${projection.frames.length}`,
      `Участники: ${projection.nodes.length}`,
      `Наблюдаемые соединения: ${projection.connections.length}`,
    ]}
    const frame = projection.frames.find(frame => frameId(frame.id) === id)
    if (frame !== undefined) return {title: frame.label, lines: projection.nodes.filter(node => node.frameId === frame.id).map(node => node.label)}
    const node = projection.nodes.find(node => entityId(node.id) === id)
    if (node === undefined) throw new Error(`Unknown network entity: ${id}`)
    return {title: node.label, lines: [
      ...node.details.split(/\r?\n/u),
      ...projection.connections.filter(connection => connection.from === node.id || connection.to === node.id)
        .map(connection => `${connection.label} ↔ · ${connection.state}`),
    ]}
  }
  const refreshDetails = () => {
    if (controller === null || selected === null) return
    const props = details(selected)
    const key = JSON.stringify([selected, props])
    if (key === contentKey) return
    contentKey = key
    controller.setContent(selected, {
      type: NetworkDetails as unknown as DOMComponentConstructor<NetworkDetailsProps>,
      props,
      key: selected,
    })
  }
  const selectSpatial = (id: string, focus = false) => {
    assertActive()
    if (controller === null) throw new Error("Network space is not attached")
    if (!prepared.nodes.some(node => node.id === id)) throw new Error(`Unknown network entity: ${id}`)
    followingOverview = false
    syncViewport()
    if (selected !== null && selected !== id) controller.release(selected)
    selected = id
    contentKey = ""
    controller.select(id, focus)
    refreshDetails()
  }
  const configure = () => {
    if (controller === null || configuredKey === prepared.configurationKey) return
    if (selected !== null && !prepared.nodes.some(node => node.id === selected)) {
      controller.release(selected)
      selected = null
      contentKey = ""
    }
    controller.configure(prepared.nodes, selectSpatial)
    configuredKey = prepared.configurationKey
    if (followingOverview) {
      syncViewport()
      controller.fit()
    }
  }

  return {
    state,
    getEdgeSnapshot: () => edgeSnapshot,
    getLabelSnapshot: () => labels,
    get extraSpatialEdges(): readonly NetworkSpatialEdge[] { return prepared.extraSpatialEdges },
    attach(root: Presentation) {
      assertActive()
      if (attached === root) return
      if (attached !== null) throw new Error("Network space already belongs to another Presentation")
      attached = root
      const stopFollowing = () => { followingOverview = false }
      for (const name of ["pointerdown", "wheel", "keydown"] as const) root.canvas.addEventListener?.(name, stopFollowing, {capture: true})
      releaseInput = () => {
        for (const name of ["pointerdown", "wheel", "keydown"] as const) root.canvas.removeEventListener?.(name, stopFollowing, {capture: true})
      }
      controller = createSpatialTreeController({root, state: controllerState, showGrid: false, motionDurationMs: 0,
        layout: {layerGap: 280, bodyDepth: 12, spacing: 80, aspectRatio: 1.5}, getViewport: () => {
        const rect = root.canvas.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 ? {width: rect.width, height: rect.height} : null
      }})
      configure()
      releasePresentation = root.subscribePresented(publishDerived)
    },
    present(value: InfrastructureProjection) {
      assertActive()
      const owned = structuredClone(value)
      const next = projectNetworkSpace(owned)
      projection = owned
      prepared = next
      configure()
      refreshDetails()
      publishDerived()
    },
    select(id: string, focus = false) {
      const spatialId = prepared.nodes.some(node => node.id === id) ? id : entityId(id)
      selectSpatial(spatialId, focus)
    },
    fit() { assertActive(); followingOverview = true; syncViewport(); controller?.fit() },
    zoom(factor: number) { assertActive(); followingOverview = false; controller?.zoom(factor) },
    updateViewport(size: Readonly<{width: number; height: number}>) { assertActive(); controller?.updateViewport(size) },
    dispose() {
      if (disposed) return
      disposed = true
      releaseInput()
      releasePresentation()
      controller?.dispose()
      unsubscribe()
      state.publish(null)
      controller = null
      attached = null
    },
  }
}

/** Модель готовится до mount единственного Visual Browser Root. */
export type NetworkSpaceModel = ReturnType<typeof createNetworkSpace>

/** Тонкие поверхности сущностей и cubic-связи в том же единственном Space. */
export function NetworkSpace(props: Readonly<{model: NetworkSpaceModel}>) {
  const links = useSyncExternalStore(props.model.state.subscribe, props.model.getEdgeSnapshot)
  const labels = useSyncExternalStore(props.model.state.subscribe, props.model.getLabelSnapshot)
  return <>
    <SpatialTree
      source={props.model.state}
      style={css`
        background: rgb(var(--surface-900) / .78);
        --spatial-node-surface-opacity: .32;
        --spatial-node-foreground: var(--widget-regular-content);
        font-family: var(--font-family);
        --spatial-volume-opacity: .12;
        --spatial-volume-outline-opacity: .65;
      `}
    />
    {labels.map(node => <NetworkCoarseLabel key={node.id} node={node} model={props.model} />)}
    {links.edges.length === 0 ? null : <SpatialEdges edges={links.edges} geometryRevision={links.geometryRevision} name="Наблюдаемые соединения сети" />}
  </>
}

/** Нативный лёгкий текст на той же мировой поверхности; тяжёлый content остаётся в SpatialTree. */
function NetworkCoarseLabel(props: Readonly<{node: CoarseLabel; model: NetworkSpaceModel}>) {
  const node = props.node
  return <xr-text
    name={`network:label:${node.id}`}
    text={node.label}
    fontSize={Math.min(14, node.rect.height * .16)}
    x={node.rect.x + 8}
    y={node.rect.y + node.rect.height / 2}
    z={node.rect.z + 1}
    onClick={() => props.model.select(node.id, true)}
  >
    <xr-material kind="text" color="white" />
  </xr-text>
}

type NetworkDetailsProps = Readonly<{title: string; lines: readonly string[]}>

function NetworkDetails(props: NetworkDetailsProps) {
  return <section
    aria-label={`Сведения: ${props.title}`}
    style={css`
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      padding: var(--widget-content-padding);
      gap: var(--widget-content-gap);
      overflow: auto;
      color: var(--widget-regular-content);
      font-family: var(--font-family);
      font-size: var(--font-size-md);
    `}
  >
    {props.lines.map((line, index) => <NetworkDetailLine
      key={index}
      line={line}
    />)}
  </section>
}

function NetworkDetailLine(props: Readonly<{line: string}>) {
  return <Typography text={props.line} style={css`
    display: block;
    overflow-wrap: anywhere;
  `} />
}
