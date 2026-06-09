import { createProtocolChannel, type ProtocolChannel, type ProtocolMessage, type ProtocolPatch } from "../../protocol.ts"

export type PhotonPayload = { value: string; path: string }
export type WeakCoordinationKind = "claim" | "accept" | "reject" | "release"

export interface BulkSubscription {
  close(): void
}

export type BulkPhotonSubscription = BulkSubscription
export type BulkWeakCoordinationSubscription = BulkSubscription

export interface BulkWeakProtocolOptions {
  channelName?: string
}

export interface BulkWeakProtocol {
  emitZ(coordination: WeakCoordinationKind, wimpId: string, processId: string, executorId?: string): void
  emitZClaim(wimpId: string, processId: string, executorId?: string): void
  emitZAccept(wimpId: string, processId: string, executorId?: string): void
  emitZReject(wimpId: string, processId: string, executorId?: string): void
  emitZRelease(wimpId: string, processId: string, executorId?: string): void
  emitWSuccessPatches(wimpId: string, processId: string, patches?: Array<{ op: "replace"; path: string; value: unknown }>): void
  emitWErrorPatches(wimpId: string, processId: string, patches?: Array<{ op: "replace"; path: string; value: unknown }>): void
  emitWSuccessValues(wimpId: string, processId: string, values?: Record<string, unknown>): void
  emitWErrorValues(wimpId: string, processId: string, values?: Record<string, unknown>): void
  close(): void
}

const createSubscription = (
  channel: ProtocolChannel,
  onMessage: (message: ProtocolMessage) => void,
): BulkSubscription => {
  channel.onmessage = (event) => {
    onMessage(event.data)
  }

  return {
    close() {
      channel.close()
    },
  }
}

const createWeakResultFieldPatches = (values: Record<string, unknown>): Array<{ op: "replace"; path: string; value: unknown }> =>
  Object.entries(values).map(([wimpFieldId, value]) => ({
    op: "replace",
    path: `/field/${wimpFieldId}`,
    value,
  }))

export const subscribeBulkPhotons = (
  listener?: (message: PhotonPayload) => void,
  options: { channelName?: string } = {},
): BulkPhotonSubscription => {
  return createSubscription(createProtocolChannel(options.channelName), (message) => {
    for (const patch of message.patches) {
      if (patch.part !== "photon") continue
      listener?.({ path: patch.path, value: String(patch.value ?? "") })
    }
  })
}

export const subscribeBulkWeakCoordination = (
  listener?: (message: { wimpId: string; processId: string; coordination: WeakCoordinationKind; executorId?: string }) => void,
  options: { channelName?: string } = {},
): BulkWeakCoordinationSubscription => {
  return createSubscription(createProtocolChannel(options.channelName), (message) => {
    for (const patch of message.patches) {
      if (patch.part !== "+z" && patch.part !== "-z") continue
      if (!isWeakCoordinationKind(patch.op)) continue
      const weak = weakPatchMeta(patch)
      if (!weak) continue
      listener?.({ ...weak, coordination: patch.op })
    }
  })
}

export const createBulkWeakProtocol = (options: BulkWeakProtocolOptions = {}): BulkWeakProtocol => {
  const channel = createProtocolChannel(options.channelName)
  const emitZ = (
    coordination: WeakCoordinationKind,
    wimpId: string,
    processId: string,
    executorId?: string,
  ): void => {
    channel.postMessage({ patches: [createBulkZPatch(coordination, wimpId, processId, executorId)] })
  }
  const emitW = (wimpId: string, processId: string, patches: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    channel.postMessage({ patches: createBulkWPatches(wimpId, processId, patches) })
  }
  const emitWValues = (wimpId: string, processId: string, values: Record<string, unknown>): void => {
    emitW(wimpId, processId, createWeakResultFieldPatches(values))
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

    emitWSuccessPatches(wimpId, processId, patches = []) {
      emitW(wimpId, processId, patches)
    },

    emitWErrorPatches(wimpId, processId, patches = []) {
      emitW(wimpId, processId, patches)
    },

    emitWSuccessValues(wimpId, processId, values = {}) {
      emitWValues(wimpId, processId, values)
    },

    emitWErrorValues(wimpId, processId, values = {}) {
      emitWValues(wimpId, processId, values)
    },

    close() {
      channel.close()
    },
  }
}

const isWeakCoordinationKind = (value: string): value is WeakCoordinationKind =>
  value === "claim" || value === "accept" || value === "reject" || value === "release"

const weakPatchMeta = (patch: ProtocolPatch): { wimpId: string; processId: string; executorId?: string } | null => {
  const wimpId = typeof patch.wimpId === "string" ? patch.wimpId : null
  const processId = typeof patch.processId === "string" ? patch.processId : null
  const executorId = typeof patch.executorId === "string" ? patch.executorId : undefined
  if (!wimpId || !processId) return null
  return { wimpId, processId, ...(executorId !== undefined ? { executorId } : {}) }
}

const createWeakPath = (wimpId: string, processId: string): string => `/wimp/${wimpId}/process/${processId}`

const createBulkZPatch = (
  coordination: WeakCoordinationKind,
  wimpId: string,
  processId: string,
  executorId?: string,
): ProtocolPatch => ({
  part: zPart(coordination),
  op: coordination,
  path: createWeakPath(wimpId, processId),
  wimpId,
  processId,
  ...(executorId !== undefined ? { executorId } : {}),
})

const createBulkWPatches = (
  wimpId: string,
  processId: string,
  patches: Array<{ op: "replace"; path: string; value: unknown }>,
): ProtocolPatch[] => {
  if (patches.length === 0) {
    return [{ part: "w", op: "result", path: createWeakPath(wimpId, processId), wimpId, processId }]
  }

  return patches.map((patch) => ({
    part: "w",
    ...patch,
    wimpId,
    processId,
  }))
}

const zPart = (coordination: WeakCoordinationKind): "+z" | "-z" =>
  coordination === "claim" || coordination === "accept" ? "+z" : "-z"
