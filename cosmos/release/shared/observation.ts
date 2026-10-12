/** Read-only wire contract одного service release; смысл — [наблюдение выпуска](../README.md#наблюдение-browser-release). */
export const NETWORK_OBSERVATION_SCHEMA = "cosmos:network-observation/v1"
export const NETWORK_OBSERVATION_CHANNEL = "cosmos:network-observation"

export type NetworkRuntimeState = "started" | "running" | "destroying" | "destroyed"
export type NetworkConnectionState = "connecting" | "open" | "error" | "closing" | "closed"

export interface NetworkConnection {
  id: string
  endpoint: string
  state: NetworkConnectionState
  /** Bytes принятого send() текста в UTF-8, без transport framing. */
  sentBytes: number
  /** Bytes полученного текста в UTF-8, без transport framing. */
  receivedBytes: number
}

export interface NetworkTransfer {
  id: string
  kind: "cache" | "network" | "ws-send" | "ws-receive"
  endpoint: string
  connectionId?: string
  phase: "hit" | "requested" | "response" | "failed" | "sent" | "received"
  status?: number
  bytes?: number
  at: number
}

/** Snapshot seq относится к этому producer; никакой общий порядок источников не предполагается. */
export interface NetworkSnapshot {
  schema: typeof NETWORK_OBSERVATION_SCHEMA
  kind: "snapshot"
  producerId: string
  seq: number
  releaseVersion: string | null
  state: NetworkRuntimeState
  connections: NetworkConnection[]
  transfers: NetworkTransfer[]
  counts: {cacheHits: number; networkRequests: number}
  historyDropped: number
}

export function isNetworkSnapshotRequest(data: unknown): boolean {
  return record(data) && data.schema === NETWORK_OBSERVATION_SCHEMA && data.kind === "snapshot-request"
}

/** Валидирует bounded read-only envelope до применения к consumer state. */
export function parseNetworkSnapshot(data: unknown): NetworkSnapshot | null {
  if (!record(data) || data.schema !== NETWORK_OBSERVATION_SCHEMA || data.kind !== "snapshot"
    || !text(data.producerId) || !count(data.seq)
    || !(data.releaseVersion === null || text(data.releaseVersion))
    || !oneOf(data.state, ["started", "running", "destroying", "destroyed"])
    || !Array.isArray(data.connections) || data.connections.length > 64
    || !Array.isArray(data.transfers) || data.transfers.length > 128
    || !record(data.counts) || !count(data.counts.cacheHits) || !count(data.counts.networkRequests)
    || !count(data.historyDropped)) return null
  const ids = new Set<string>()
  for (const connection of data.connections) {
    if (!record(connection) || !text(connection.id) || ids.has(connection.id)
      || !endpoint(connection.endpoint)
      || !oneOf(connection.state, ["connecting", "open", "error", "closing", "closed"])
      || !count(connection.sentBytes) || !count(connection.receivedBytes)) return null
    ids.add(connection.id)
  }
  for (const transfer of data.transfers) {
    if (!record(transfer) || !text(transfer.id) || !endpoint(transfer.endpoint)
      || !oneOf(transfer.kind, ["cache", "network", "ws-send", "ws-receive"])
      || !oneOf(transfer.phase, ["hit", "requested", "response", "failed", "sent", "received"])
      || !(transfer.connectionId === undefined || text(transfer.connectionId))
      || !(transfer.status === undefined || count(transfer.status) && transfer.status <= 599)
      || !(transfer.bytes === undefined || count(transfer.bytes))
      || typeof transfer.at !== "number" || !Number.isFinite(transfer.at)) return null
  }
  return data as unknown as NetworkSnapshot
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}
function oneOf(value: unknown, choices: readonly string[]) {
  return typeof value === "string" && choices.includes(value)
}
function endpoint(value: unknown) {
  if (!text(value)) return false
  try {
    const url = new URL(value)
    return ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      && !url.search && !url.hash && !url.username && !url.password
  } catch { return false }
}

export * from "./peer-observation"
