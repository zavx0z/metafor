import type {Buffer} from "node:buffer"
import type {BoundaryMatrixRuntimeSnapshot, BoundaryUpdateMessage} from "boundary"
import type {MatrixBridgeIncomingMessage, MatrixServerStatus, MatrixServerSocketState} from "./server.t.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function bridgeUrlWithToken(rawUrl: string, token: string | null): string {
  if (token === null || token.length === 0) return rawUrl
  const url = new URL(rawUrl)
  url.searchParams.set("token", token)
  return url.toString()
}

export function readMatrixBridgeIncomingMessage(raw: string | Buffer): MatrixBridgeIncomingMessage | null {
  let value: unknown
  try {
    value = JSON.parse(String(raw))
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.type !== "string") return null

  if (value.type === "matrix-snapshot") {
    if (value.version !== 1 || !isRecord(value.snapshot)) return null
    return {
      type: "matrix-snapshot",
      version: 1,
      ...(typeof value.reason === "string" ? {reason: value.reason} : {}),
      snapshot: value.snapshot as BoundaryMatrixRuntimeSnapshot,
    }
  }

  if (value.type === "force") {
    return Array.isArray(value.parts)
      ? {type: "force", parts: value.parts as BoundaryUpdateMessage["parts"]}
      : null
  }

  return null
}

export function createMatrixServerStatus(input: {
  pid: number
  startedAt: string
  host: string
  port: number
  bridgeUrl: string
  socketState: MatrixServerSocketState
  loaded: boolean
  snapshotVersion: number | null
  actorCount: number
  braneCount: number
  fieldCount: number
  structuralDirty: boolean
  reconnects: number
  lastSnapshotAt: string | null
  lastForceAt: string | null
  lastError: string | null
}): MatrixServerStatus {
  return {
    ok: true,
    runtime: "matrix",
    pid: input.pid,
    startedAt: input.startedAt,
    host: input.host,
    port: input.port,
    bridgeUrl: input.bridgeUrl,
    socketState: input.socketState,
    connected: input.socketState === "connected",
    loaded: input.loaded,
    snapshotVersion: input.snapshotVersion,
    actorCount: input.actorCount,
    braneCount: input.braneCount,
    fieldCount: input.fieldCount,
    structuralDirty: input.structuralDirty,
    reconnects: input.reconnects,
    lastSnapshotAt: input.lastSnapshotAt,
    lastForceAt: input.lastForceAt,
    lastError: input.lastError,
  }
}
