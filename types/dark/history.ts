import type {SourcedParticle} from "shared/protocol/force/particle"

export const DARK_HISTORY_READ_METHOD = "dark.history.read" as const
export const DARK_HISTORY_CLEAR_METHOD = "dark.history.clear" as const

export type DarkHistoryDirection = "incoming" | "outgoing"

/** One unchanged Force Particle observed at Dark's surface. */
export type DarkHistoryEntry = {
  direction: DarkHistoryDirection
  particle: SourcedParticle
}

export type DarkHistoryReadRequest = {
  fromTs?: number
  toTs?: number
  limitSteps?: number
}

export type DarkHistoryTimeStep = {
  ts: number
  patches: DarkHistoryEntry[]
}

export type DarkHistoryReadResult = {
  version: 1
  steps: DarkHistoryTimeStep[]
  throughTs: number | null
  latestTs: number | null
  hasMore: boolean
}

export type DarkHistoryClearRequest = {
  confirm: "clear-dark-history"
}

export type DarkHistoryClearResult = {
  version: 1
  removed: number
  latestTs: null
}
