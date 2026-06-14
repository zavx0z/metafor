import {force, type ForceMessage, type Particle} from "@metafor/boundary"

export type PhotonPayload = { value: string; path: string }
export type WeakCoordinationKind = "claim" | "accept" | "reject" | "release"

export interface BulkSubscription {
  close(): void
}

export type BulkPhotonSubscription = BulkSubscription
export type BulkWeakCoordinationSubscription = BulkSubscription

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

const createSubscription = (
  onMessage: (message: ForceMessage) => void,
): BulkSubscription => {
  const subscription = force.observe((event) => {
    onMessage(event.data)
  })

  return {
    close() {
      subscription.close()
    },
  }
}

const createWeakResultFieldParts = (values: Record<string, unknown>): Array<{ op: "replace"; path: string; value: unknown }> =>
  Object.entries(values).map(([wimpFieldId, value]) => ({
    op: "replace",
    path: `/field/${wimpFieldId}`,
    value,
  }))

export const subscribeBulkPhotons = (
  listener?: (message: PhotonPayload) => void,
  options: { channelName?: string } = {},
): BulkPhotonSubscription => {
  void options
  return createSubscription((message) => {
    for (const part of message.parts) {
      if (part.part !== "photon") continue
      listener?.({ path: part.path, value: String(part.value ?? "") })
    }
  })
}

export const subscribeBulkWeakCoordination = (
  listener?: (message: { wimpId: string; processId: string; coordination: WeakCoordinationKind; executorId?: string }) => void,
  options: { channelName?: string } = {},
): BulkWeakCoordinationSubscription => {
  void options
  return createSubscription((message) => {
    for (const part of message.parts) {
      if (part.part !== "+z" && part.part !== "-z") continue
      const coordination = weakCoordinationFromPart(part)
      if (!coordination) continue
      const weak = weakPartMeta(part)
      if (!weak) continue
      listener?.({ ...weak, coordination })
    }
  })
}

export const createBulkWeakForce = (options: BulkWeakForceOptions = {}): BulkWeakForce => {
  void options
  const emitZ = (
    coordination: WeakCoordinationKind,
    wimpId: string,
    processId: string,
    executorId?: string,
  ): void => {
    force.emit({ parts: [createBulkZPart(coordination, wimpId, processId, executorId)] })
  }
  const emitW = (wimpId: string, processId: string, parts: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    force.emit({ parts: createBulkWParts(wimpId, processId, parts) })
  }
  const emitWValues = (wimpId: string, processId: string, values: Record<string, unknown>): void => {
    emitW(wimpId, processId, createWeakResultFieldParts(values))
  }

  return {
    emitZ,

    emitZClaim(wimpId, processId, executorId) {
      emitZ("claim", wimpId, processId, executorId)
    },

    emitZAccept(wimpId, processId, executorId) {
      emitZ("accept", wimpId, processId, executorId)
    },

    emitZReject(wimpId, processId, executorId) {
      emitZ("reject", wimpId, processId, executorId)
    },

    emitZRelease(wimpId, processId, executorId) {
      emitZ("release", wimpId, processId, executorId)
    },

    emitWSuccessParts(wimpId, processId, parts = []) {
      emitW(wimpId, processId, parts)
    },

    emitWErrorParts(wimpId, processId, parts = []) {
      emitW(wimpId, processId, parts)
    },

    emitWSuccessValues(wimpId, processId, values = {}) {
      emitWValues(wimpId, processId, values)
    },

    emitWErrorValues(wimpId, processId, values = {}) {
      emitWValues(wimpId, processId, values)
    },

    close() {
      // Boundary owns force transport lifecycle.
    },
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isWeakCoordinationKind = (value: unknown): value is WeakCoordinationKind =>
  value === "claim" || value === "accept" || value === "reject" || value === "release"

const weakCoordinationFromPart = (part: Particle): WeakCoordinationKind | null => {
  if (isWeakCoordinationKind(part.coordination)) return part.coordination
  if (isRecord(part.value) && isWeakCoordinationKind(part.value.coordination)) return part.value.coordination
  return null
}

const weakPartMeta = (part: Particle): { wimpId: string; processId: string; executorId?: string } | null => {
  const wimpId = typeof part.wimpId === "string" ? part.wimpId : null
  const processId = typeof part.processId === "string" ? part.processId : null
  const executorId = typeof part.executorId === "string" ? part.executorId : undefined
  if (!wimpId || !processId) return null
  return { wimpId, processId, ...(executorId !== undefined ? { executorId } : {}) }
}

const createWeakPath = (wimpId: string, processId: string): string => `/wimp/${wimpId}/process/${processId}`

const createBulkZPart = (
  coordination: WeakCoordinationKind,
  wimpId: string,
  processId: string,
  executorId?: string,
): Particle => ({
  part: zPart(coordination),
  op: "test",
  path: createWeakPath(wimpId, processId),
  value: { coordination },
  coordination,
  wimpId,
  processId,
  ...(executorId !== undefined ? { executorId } : {}),
})

const createBulkWParts = (
  wimpId: string,
  processId: string,
  parts: Array<{ op: "replace"; path: string; value: unknown }>,
): Particle[] => {
  if (parts.length === 0) {
    return [{ part: "w", op: "test", path: createWeakPath(wimpId, processId), value: { kind: "result" }, kind: "result", wimpId, processId }]
  }

  return parts.map((part) => ({
    part: "w",
    ...part,
    wimpId,
    processId,
  }))
}

const zPart = (coordination: WeakCoordinationKind): "+z" | "-z" =>
  coordination === "claim" || coordination === "accept" ? "+z" : "-z"
