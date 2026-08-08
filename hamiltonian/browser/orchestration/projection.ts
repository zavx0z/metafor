import type {
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemNode,
  NodeSystemPort,
  PositionedNodeSystem,
} from "@ui/node"
import {hamiltonianWindowNodeId} from "../../core/orchestration.js"

export {hamiltonianWindowNodeId}

type OrchestrationProjection = Readonly<{
  reason?: string
  worker?: Readonly<{
    incarnationId?: string
    socket?: string
    connectionId?: string | null
  }>
  host?: Readonly<{
    identity?: string
    hostEpoch?: string
    version?: string
    placement?: string
    bunEmbodiments?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
    peer?: Readonly<{
      assignment?: Readonly<Record<string, unknown>> | null
      snapshot?: Readonly<Record<string, unknown>> | null
      error?: string | null
    }>
  }> | null
  topology?: Readonly<{
    revision?: number
    leader?: Readonly<Record<string, unknown>> | null
    peers?: readonly Readonly<{
      connectionId?: string
      deviceId?: string
      windows?: readonly Readonly<Record<string, unknown>>[]
    }>[]
  }> | null
}>

export type HamiltonianOrchestrationContext = Readonly<{
  origin: string
  deviceId: string
  tabId: string
}>

const hostPorts: readonly NodeSystemPort[] = [
  {id: "listener", label: "порт", direction: "out"},
  {id: "ipc", label: "IPC", direction: "out"},
  {id: "peer", label: "пир", direction: "out"},
]

/** Turns the sanitised browser-local observation into a generic node document. */
export function projectHamiltonianTopology(
  projection: OrchestrationProjection,
  context: HamiltonianOrchestrationContext,
  revision: string | number,
): NodeSystemDocument {
  const nodes: NodeSystemNode[] = []
  const edges: NodeSystemEdge[] = []
  const host = projection.host
  const topology = projection.topology
  const worker = projection.worker
  const hostId = "hamiltonian:host"
  const listenerId = "hamiltonian:listener"

  nodes.push({
    id: hostId,
    title: localizeHostIdentity(host?.identity),
    kind: "распределённый координатор",
    tone: host ? "live" : "paused",
    order: 0,
    ports: hostPorts,
    facts: [
      {id: "version", label: "Версия", value: host?.version || "ожидание"},
      {id: "placement", label: "Размещение", value: localizeValue(host?.placement || "unknown")},
      {id: "epoch", label: "Эпоха хоста", value: compact(host?.hostEpoch)},
    ],
  })
  nodes.push({
    id: listenerId,
    title: "Единый внешний порт",
    kind: "HTTP / управляющий WSS",
    tone: worker?.socket === "connected" ? "live" : "paused",
    order: 1,
    ports: [
      {id: "host", label: "хост", direction: "in"},
      {id: "control", label: "управление", direction: "out"},
    ],
    facts: [
      {id: "origin", label: "Адрес", value: context.origin},
      {id: "path", label: "Управление", value: "/control"},
      {id: "socket", label: "Локальный сокет", value: localizeValue(worker?.socket || "waiting")},
    ],
  })
  edges.push(edge("host-listener", hostId, "listener", listenerId, "host", "владеет фиксированным портом", "neutral", 0))

  const peers = topology?.peers ?? []
  for (const [peerIndex, peer] of peers.entries()) {
    const connectionId = peer.connectionId || `unknown-${peerIndex}`
    const controlId = `browser-control:${safeId(connectionId)}`
    const isLocalControl = connectionId === worker?.connectionId
    nodes.push({
      id: controlId,
      title: isLocalControl ? "Сервис-воркер" : "Профиль браузера",
      kind: "контур управления браузером",
      tone: isLocalControl && worker?.socket !== "connected" ? "paused" : "live",
      order: 10 + peerIndex,
      ports: [
        {id: "wss", label: "WSS", direction: "in"},
        {id: "windows", label: "окна", direction: "out"},
        {id: "broadcast", label: "трансляция", direction: "out"},
      ],
      facts: [
        {id: "device", label: "Устройство", value: compact(peer.deviceId)},
        {id: "connection", label: "Соединение", value: compact(connectionId)},
        ...(isLocalControl ? [{id: "worker", label: "Воплощение сервис-воркера", value: compact(worker?.incarnationId)}] : []),
      ],
    })
    edges.push(edge(
      `control-wss:${safeId(connectionId)}`,
      listenerId,
      "control",
      controlId,
      "wss",
      "управляющий WSS",
      isLocalControl && worker?.socket !== "connected" ? "paused" : "live",
      10 + peerIndex,
    ))

    for (const [windowIndex, candidate] of (peer.windows ?? []).entries()) {
      const tabId = stringValue(candidate.tabId) || `unknown-${windowIndex}`
      const windowId = hamiltonianWindowNodeId(peer.deviceId || "unknown", tabId)
      const isLeader = sameLeader(topology?.leader, connectionId, tabId)
      const isLocal = peer.deviceId === context.deviceId && tabId === context.tabId
      const actions = isLocal ? [
        {id: "open-window", label: "Открыть ещё одно окно", tone: "neutral" as const},
        {id: "rebirth-worker", label: "Перезапустить выделенный воркер", tone: "paused" as const},
        ...(isLeader ? [{id: "reload-main", label: "Перезапустить основной контур", tone: "warn" as const}] : []),
        {id: "reconnect", label: "Переподключить канал страницы", tone: "paused" as const},
        {id: "reload", label: "Перезагрузить это окно", tone: "neutral" as const},
      ] : []
      nodes.push({
        id: windowId,
        title: isLocal ? "Это окно" : `Окно ${compact(tabId)}`,
        kind: isLeader ? "выбранное основное воплощение" : "окно наблюдателя",
        ...(isLocal ? {summary: "Текущее окно браузера и управление его жизненным циклом"} : {}),
        tone: isLeader ? "live" : candidate.visible === true ? "neutral" : "paused",
        order: 30 + peerIndex * 20 + windowIndex,
        ports: [
          {id: "message", label: "сообщения", direction: "in"},
          {id: "broadcast", label: "трансляция", direction: "in"},
          {id: "oracle", label: "Oracle", direction: "out"},
          {id: "force", label: "Force", direction: "out"},
        ],
        facts: [
          {id: "tab", label: "Окно", value: compact(tabId)},
          {id: "visibility", label: "Видимость", value: candidate.visible === true ? "видимое" : "фоновое"},
          {id: "role", label: "Роль", value: isLeader ? "лидер" : "ведомое", tone: isLeader ? "live" : "neutral"},
          ...(isLeader ? [{
            id: "fence",
            label: "Токен защиты",
            value: String(numberValue(topology?.leader?.fencingToken)),
            tone: "live" as const,
          }] : []),
        ],
        actions,
      })
      edges.push(edge(
        `message-port:${safeId(connectionId)}:${safeId(tabId)}`,
        controlId,
        "windows",
        windowId,
        "message",
        "MessagePort",
        "neutral",
        30 + windowIndex,
      ))
      if (isLocalControl) {
        edges.push(edge(
          `broadcast:${safeId(connectionId)}:${safeId(tabId)}`,
          controlId,
          "broadcast",
          windowId,
          "broadcast",
          "BroadcastChannel · UI-проекция",
          "live",
          40 + windowIndex,
        ))
      }
    }
  }

  const bunEmbodiments = host?.bunEmbodiments ?? {}
  for (const [index, [role, snapshot]] of Object.entries(bunEmbodiments).sort(([a], [b]) => a.localeCompare(b)).entries()) {
    const nodeId = `bun:${safeId(role)}`
    const state = stringValue(snapshot.state)
    nodes.push({
      id: nodeId,
      title: localizeBunRole(role),
      kind: "процесс Bun в ОС",
      tone: state === "ready" ? "live" : state === "error" ? "warn" : "paused",
      order: 70 + index,
      ports: [{id: "ipc", direction: "in"}],
      facts: [
        {id: "state", label: "Состояние", value: localizeValue(state || "unknown")},
        {id: "pid", label: "PID", value: nullableValue(snapshot.pid)},
        {id: "incarnation", label: "Воплощение", value: compact(stringValue(snapshot.incarnation))},
      ],
    })
    edges.push(edge(`ipc:${safeId(role)}`, hostId, "ipc", nodeId, "ipc", "Bun.spawn IPC", state === "ready" ? "live" : "paused", 70 + index))
  }

  const assignment = host?.peer?.assignment
  const peerSnapshot = host?.peer?.snapshot
  if (assignment) {
    const peerId = stringValue(assignment.peerId)
    const peerNodeId = `direct-peer:${safeId(peerId)}`
    const peerState = stringValue(peerSnapshot?.state)
    const channels = Array.isArray(peerSnapshot?.channels) ? peerSnapshot.channels.map(String) : []
    nodes.push({
      id: peerNodeId,
      title: "Прямой пиринговый канал",
      kind: "RTCPeerConnection",
      tone: peerState === "connected" ? "live" : host?.peer?.error ? "warn" : "paused",
      order: 100,
      ports: [
        {id: "supervision", label: "надзор", direction: "in"},
        {id: "oracle", label: "Oracle", direction: "in"},
        {id: "force", label: "Force", direction: "in"},
      ],
      facts: [
        {id: "state", label: "Состояние", value: localizeValue(peerState || "negotiating")},
        {id: "session", label: "Сессия", value: compact(stringValue(assignment.sessionEpoch))},
        {id: "generation", label: "Поколение", value: String(numberValue(assignment.peerGeneration))},
        {id: "lanes", label: "Каналы", value: channels.map(localizeChannel).join(" + ") || "ожидание"},
      ],
    })
    edges.push(edge("peer-supervision", hostId, "peer", peerNodeId, "supervision", "надзор Bun за пиром", "neutral", 100))
    const leader = topology?.leader
    if (leader) {
      const leaderWindowId = hamiltonianWindowNodeId(stringValue(leader.deviceId), stringValue(leader.tabId))
      if (nodes.some((node) => node.id === leaderWindowId)) {
        edges.push(edge("oracle-lane", leaderWindowId, "oracle", peerNodeId, "oracle", "Oracle · прямой RPC", channels.includes("oracle") ? "live" : "paused", 110))
        edges.push(edge("force-lane", leaderWindowId, "force", peerNodeId, "force", "Force · прямые события", channels.includes("force") ? "live" : "paused", 111))
      }
    }
  }

  return {revision, nodes, edges}
}

/** Structural identity excludes telemetry and node copy, so layout is reused. */
export function nodeSystemStructureKey(document: NodeSystemDocument): string {
  return JSON.stringify({
    nodes: document.nodes.map((node) => ({
      id: node.id,
      ports: (node.ports ?? []).map((port) => `${port.id}:${port.direction}`).sort(),
    })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: document.edges.map((item) => ({
      id: item.id,
      source: `${item.source.nodeId}/${item.source.portId ?? ""}`,
      target: `${item.target.nodeId}/${item.target.portId ?? ""}`,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  })
}

/** Replaces observable labels/facts while preserving ELK geometry and viewport. */
export function refreshPositionedNodeSystem(
  layout: PositionedNodeSystem,
  document: NodeSystemDocument,
): PositionedNodeSystem {
  const nodes = new Map(document.nodes.map((node) => [node.id, node]))
  const edges = new Map(document.edges.map((item) => [item.id, item]))
  return {
    ...layout,
    ...(document.revision === undefined ? {} : {revision: document.revision}),
    nodes: layout.nodes.map((entry) => {
      const node = nodes.get(entry.node.id)
      if (!node) throw new Error(`Structural update removed node: ${entry.node.id}`)
      const ports = new Map((node.ports ?? []).map((port) => [port.id, port]))
      return {
        ...entry,
        node,
        ports: entry.ports.map((entryPort) => ({
          ...entryPort,
          port: ports.get(entryPort.port.id) ?? entryPort.port,
        })),
      }
    }),
    edges: layout.edges.map((entry) => {
      const next = edges.get(entry.edge.id)
      if (!next) throw new Error(`Structural update removed edge: ${entry.edge.id}`)
      return {...entry, edge: next}
    }),
  }
}

function edge(
  id: string,
  sourceNode: string,
  sourcePort: string,
  targetNode: string,
  targetPort: string,
  label: string,
  tone: "neutral" | "live" | "paused" | "warn",
  order: number,
): NodeSystemEdge {
  return {
    id,
    source: {nodeId: sourceNode, portId: sourcePort},
    target: {nodeId: targetNode, portId: targetPort},
    label,
    tone,
    order,
  }
}

function sameLeader(leader: Readonly<Record<string, unknown>> | null | undefined, connectionId: string, tabId: string): boolean {
  return leader?.connectionId === connectionId && leader.tabId === tabId
}

function safeId(value: string): string {
  return encodeURIComponent(value || "unknown")
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function nullableValue(value: unknown): string {
  return typeof value === "number" || typeof value === "string" ? String(value) : "—"
}

function compact(value: string | null | undefined): string {
  if (!value) return "—"
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`
}

function localizeHostIdentity(identity: string | undefined): string {
  if (!identity || /^hamiltonian(?:-lab)?$/i.test(identity)) return "Гамильтониан"
  return identity
}

function localizeBunRole(role: string): string {
  return ({
    "main-probe": "Проба основного процесса",
    "worker-probe": "Проба воркера",
  } as Readonly<Record<string, string>>)[role] ?? role
}

function localizeChannel(channel: string): string {
  return ({oracle: "Oracle", force: "Force"} as Readonly<Record<string, string>>)[channel] ?? channel
}

function localizeValue(value: string): string {
  return ({
    background: "фоновое",
    browser: "браузер",
    connected: "подключено",
    connecting: "подключение",
    disconnected: "отключено",
    error: "ошибка",
    follower: "ведомое",
    leader: "лидер",
    negotiating: "согласование",
    paused: "приостановлено",
    ready: "готов",
    reconnecting: "переподключение",
    server: "сервер",
    unknown: "неизвестно",
    visible: "видимое",
    waiting: "ожидание",
  } as Readonly<Record<string, string>>)[value] ?? value
}
