export interface BulkAtomRecord {
  uuid: string
  src: string
  parentUuid: string | null
  orderKey: Uint8Array
  status: "pending" | "active" | "deleted"
}

export interface ExecuteParams {
  action: Function
  self?: { atom: string; meta: string; path: string }
  field?: Record<string, unknown>
  value?: Record<string, unknown>
  mass?: Record<string, unknown>
}

export interface ProcessConfig {
  src: string
  importSpecifier?: string
}

export type ActionFn<ɸ = Record<string, unknown>, m = Record<string, unknown>, Res = unknown> = (params: {
  self: { atom: string; meta: string; path: string }
  field: ɸ
  value: Record<string, unknown>
  mass: m
}) => Res | Promise<Res>

export interface WeakStoreState {
  processes: Map<string, unknown>
}

export type WeakCoordinationKind = "claim" | "accept" | "reject" | "release"

export type WeakResultPart = "w+" | "w-"

export interface BulkSubscription {
  close(): void
}

export interface BulkWeakForceOptions {
  channelName?: string
}

export interface BulkWeakForce {
  emitZ(coordination: WeakCoordinationKind, wimpId: string, processId: string, executorId?: string): void
  emitZClaim(wimpId: string, processId: string, executorId?: string): void
  emitZAccept(wimpId: string, processId: string, executorId?: string): void
  emitZReject(wimpId: string, processId: string, executorId?: string): void
  emitZRelease(wimpId: string, processId: string, executorId?: string): void
  emitWSuccessParts(wimpId: string, processId: string, parts?: Array<{ op: "replace"; path: string; value: unknown }>): void
  emitWErrorParts(wimpId: string, processId: string, parts?: Array<{ op: "replace"; path: string; value: unknown }>): void
  emitWSuccessValues(wimpId: string, processId: string, values?: Record<string, unknown>): void
  emitWErrorValues(wimpId: string, processId: string, values?: Record<string, unknown>): void
  close(): void
}
