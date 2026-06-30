export type EnergyRuntimeKind =
  | "server"
  | "browser-main"
  | "worker"
  | "service-worker"
  | "desktop-main"
  | "unknown"

export type EnergyEnv = {
  kind: EnergyRuntimeKind
  id: string
  labels?: string[]
  capabilities?: string[]
}

export type EnergyMass = {
  actorId?: number
  deviceActorId?: number
  connectionId?: string
  transport?: "websocket" | "local" | "worker" | "service-worker"
  labels?: string[]
}

export type EnergyProcessTask = {
  actorId: number
  state: string | number
  processId: number
  token?: string
  env?: Record<string, unknown>
  mass?: EnergyMass
  fields?: Record<string, unknown>
}

export type EnergyProcessResult =
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
