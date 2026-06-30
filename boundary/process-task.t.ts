export type ProcessRuntimeKind =
  | "server"
  | "browser-main"
  | "worker"
  | "service-worker"
  | "desktop-main"
  | "unknown"

export type ProcessEnv = {
  kind: ProcessRuntimeKind
  id: string
  labels?: string[]
  capabilities?: string[]
}

export type ProcessMass = {
  actorId?: number
  deviceActorId?: number
  connectionId?: string
  transport?: "websocket" | "local" | "worker" | "service-worker"
  labels?: string[]
}

export type ProcessTask = {
  actorId: number
  state: string | number
  processId: number
  token: string
  env?: Record<string, unknown>
  mass?: ProcessMass
  fields?: Record<string, unknown>
}

export type ProcessResult =
  | {
      ok: true
      actorId: number
      processId: number
      token?: string
      fields: Record<string, unknown>
    }
  | {
      ok: false
      actorId: number
      processId: number
      token?: string
      error: string
      fields?: Record<string, unknown>
    }
