import type {
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemNode,
  NodeSystemPort,
  PositionedNodeSystem,
} from "@ui/node"

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
  {id: "listener", label: "listener", direction: "out"},
  {id: "ipc", label: "IPC", direction: "out"},
  {id: "peer", label: "peer", direction: "out"},
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
    title: host?.identity || "Hamiltonian",
    kind: "distributed coordinator",
    tone: host ? "live" : "paused",
    order: 0,
    ports: hostPorts,
    facts: [
      {id: "version", label: "Version", value: host?.version || "waiting"},
      {id: "placement", label: "Placement", value: host?.placement || "unknown"},
      {id: "epoch", label: "Host epoch", value: compact(host?.hostEpoch)},
    ],
  })
  nodes.push({
    id: listenerId,
    title: "One fixed listener",
    kind: "HTTP / control WSS",
    tone: worker?.socket === "connected" ? "live" : "paused",
    order: 1,
    ports: [
      {id: "host", direction: "in"},
      {id: "control", direction: "out"},
    ],
    facts: [
      {id: "origin", label: "Origin", value: context.origin},
      {id: "path", label: "Control", value: "/control"},
      {id: "socket", label: "Local socket", value: worker?.socket || "waiting"},
    ],
  })
  edges.push(edge("host-listener", hostId, "listener", listenerId, "host", "owns fixed port", "neutral", 0))

  const peers = topology?.peers ?? []
  for (const [peerIndex, peer] of peers.entries()) {
    const connectionId = peer.connectionId || `unknown-${peerIndex}`
    const controlId = `browser-control:${safeId(connectionId)}`
    const isLocalControl = connectionId === worker?.connectionId
    nodes.push({
      id: controlId,
      title: isLocalControl ? "Service Worker" : "Browser profile",
      kind: "browser control facet",
      tone: isLocalControl && worker?.socket !== "connected" ? "paused" : "live",
      order: 10 + peerIndex,
      ports: [
        {id: "wss", direction: "in"},
        {id: "windows", direction: "out"},
        {id: "broadcast", direction: "out"},
      ],
      facts: [
        {id: "device", label: "Device", value: compact(peer.deviceId)},
        {id: "connection", label: "Connection", value: compact(connectionId)},
        ...(isLocalControl ? [{id: "worker", label: "SW incarnation", value: compact(worker?.incarnationId)}] : []),
      ],
    })
    edges.push(edge(
      `control-wss:${safeId(connectionId)}`,
      listenerId,
      "control",
      controlId,
      "wss",
      "control WSS",
      isLocalControl && worker?.socket !== "connected" ? "paused" : "live",
      10 + peerIndex,
    ))

    for (const [windowIndex, candidate] of (peer.windows ?? []).entries()) {
      const tabId = stringValue(candidate.tabId) || `unknown-${windowIndex}`
      const windowId = windowNodeId(peer.deviceId || "unknown", tabId)
      const isLeader = sameLeader(topology?.leader, connectionId, tabId)
      const isLocal = peer.deviceId === context.deviceId && tabId === context.tabId
      const actions = isLocal ? [
        {id: "open-window", label: "Open another Window", tone: "neutral" as const},
        {id: "rebirth-worker", label: "Rebirth Dedicated Worker", tone: "paused" as const},
        ...(isLeader ? [{id: "reload-main", label: "Rebirth main realm", tone: "warn" as const}] : []),
        {id: "reconnect", label: "Reconnect page channel", tone: "paused" as const},
        {id: "reload", label: "Reload this Window", tone: "neutral" as const},
      ] : []
      nodes.push({
        id: windowId,
        title: isLocal ? "This Window" : `Window ${compact(tabId)}`,
        kind: isLeader ? "elected main embodiment" : "observer Window",
        ...(isLocal ? {summary: "Current browser Window and its lifecycle actions"} : {}),
        tone: isLeader ? "live" : candidate.visible === true ? "neutral" : "paused",
        order: 30 + peerIndex * 20 + windowIndex,
        ports: [
          {id: "message", direction: "in"},
          {id: "broadcast", direction: "in"},
          {id: "oracle", label: "Oracle", direction: "out"},
          {id: "force", label: "Force", direction: "out"},
        ],
        facts: [
          {id: "tab", label: "Window", value: compact(tabId)},
          {id: "visibility", label: "Visibility", value: candidate.visible === true ? "visible" : "background"},
          {id: "role", label: "Role", value: isLeader ? "leader" : "follower", tone: isLeader ? "live" : "neutral"},
          ...(isLeader ? [{
            id: "fence",
            label: "Fence",
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
          "BroadcastChannel · UI projection",
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
      title: role,
      kind: "Bun OS process",
      tone: state === "ready" ? "live" : state === "error" ? "warn" : "paused",
      order: 70 + index,
      ports: [{id: "ipc", direction: "in"}],
      facts: [
        {id: "state", label: "State", value: state || "unknown"},
        {id: "pid", label: "PID", value: nullableValue(snapshot.pid)},
        {id: "incarnation", label: "Incarnation", value: compact(stringValue(snapshot.incarnation))},
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
      title: "Direct peer carrier",
      kind: "RTCPeerConnection",
      tone: peerState === "connected" ? "live" : host?.peer?.error ? "warn" : "paused",
      order: 100,
      ports: [
        {id: "supervision", direction: "in"},
        {id: "oracle", label: "Oracle", direction: "in"},
        {id: "force", label: "Force", direction: "in"},
      ],
      facts: [
        {id: "state", label: "State", value: peerState || "negotiating"},
        {id: "session", label: "Session", value: compact(stringValue(assignment.sessionEpoch))},
        {id: "generation", label: "Generation", value: String(numberValue(assignment.peerGeneration))},
        {id: "lanes", label: "Channels", value: channels.join(" + ") || "waiting"},
      ],
    })
    edges.push(edge("peer-supervision", hostId, "peer", peerNodeId, "supervision", "Bun peer supervision", "neutral", 100))
    const leader = topology?.leader
    if (leader) {
      const leaderWindowId = windowNodeId(stringValue(leader.deviceId), stringValue(leader.tabId))
      if (nodes.some((node) => node.id === leaderWindowId)) {
        edges.push(edge("oracle-lane", leaderWindowId, "oracle", peerNodeId, "oracle", "Oracle · direct RPC", channels.includes("oracle") ? "live" : "paused", 110))
        edges.push(edge("force-lane", leaderWindowId, "force", peerNodeId, "force", "Force · direct events", channels.includes("force") ? "live" : "paused", 111))
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

function windowNodeId(deviceId: string, tabId: string): string {
  return `window:${safeId(deviceId)}:${safeId(tabId)}`
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
