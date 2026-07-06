import type { ActorRecord } from "../boundary/actor.ts"
import type { ActorValueRecord, ValueItemRecord } from "../boundary/value.ts"
import type { Particle } from "../force/particle.ts"
import type { BulkRuntimeSnapshot, BulkRuntimeValue } from "./runtime.ts"
import type { BulkLayoutSettings } from "./settings.ts"

export type ActorSnapshotMessage = {
  actor: ActorRecord
  values: ActorValueRecord[]
  valueRecords: Array<{
    id: number
    kind: BulkRuntimeValue["kind"]
    boolean?: boolean
    number?: number
    text?: string
    variant?: number
  }>
  valueItems: ValueItemRecord[]
}

export type ForceSnapshotEffect = "none" | "partial" | "rebuild"

export type ForceSocketMessage = {
  type: "force"
  parts: Particle[]
}

export type SnapshotMessage = {
  type: "snapshot"
  src: string
  snapshot: BulkRuntimeSnapshot
}

export type BulkErrorMessage = {
  type: "error"
  error: string
}

export type ClientMaterializePayload = {
  type: "materialize"
  src: string
  layoutSettings: Partial<BulkLayoutSettings>
}
