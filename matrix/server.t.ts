import type {BoundaryMatrixRuntimeSnapshot, BoundaryUpdateMessage} from "boundary"

export type MatrixBridgeIncomingMessage =
  | {type: "matrix-snapshot"; version: 1; reason?: string; snapshot: BoundaryMatrixRuntimeSnapshot}
  | {type: "force"; parts: BoundaryUpdateMessage["parts"]}
  | {type: "error"; error: string}

export type MatrixBridgeOutgoingMessage =
  | {type: "hello"; runtime: "matrix"; pid: number; startedAt: string}
  | {type: "force"; parts: BoundaryUpdateMessage["parts"]}
  | {type: "snapshot-request"; reason?: string}

export type MatrixServerSocketState =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error"

export type MatrixServerStatus = {
  ok: true
  runtime: "matrix"
  pid: number
  startedAt: string
  host: string
  port: number
  bridgeUrl: string
  socketState: MatrixServerSocketState
  connected: boolean
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
}
