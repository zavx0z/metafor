import {
  ELECTROMAGNETISM_BROADCAST_CHANNEL,
  WEAK_W_BROADCAST_CHANNEL,
  WEAK_Z_BROADCAST_CHANNEL,
} from "../../protocol.ts"

export type PhotonPayload = { value: string; path: string }
export type WeakCoordinationKind = "claim" | "accept" | "reject" | "release"

export interface BulkSubscription {
  close(): void
}

export type BulkPhotonSubscription = BulkSubscription
export type BulkWeakCoordinationSubscription = BulkSubscription

export interface BulkWeakProtocolOptions {
  zChannelName?: string
  wChannelName?: string
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
  channel: BroadcastChannel,
  onMessage: (message: unknown) => void,
): BulkSubscription => {
  channel.onmessage = (event: MessageEvent<unknown>) => {
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

const createBulkZPayload = (
  coordination: WeakCoordinationKind,
  wimpId: string,
  processId: string,
  executorId?: string,
): { wimpId: string; processId: string; coordination: WeakCoordinationKind; executorId?: string } => ({
  wimpId,
  processId,
  coordination,
  ...(executorId !== undefined ? { executorId } : {}),
})

const createBulkWPayload = (wimpId: string, processId: string, patches: Array<{ op: "replace"; path: string; value: unknown }>) => ({
  wimpId,
  processId,
  patches,
})

export const subscribeBulkPhotons = (
  listener?: (message: PhotonPayload) => void,
  options: { channelName?: string } = {},
): BulkPhotonSubscription => {
  return createSubscription(new BroadcastChannel(options.channelName ?? ELECTROMAGNETISM_BROADCAST_CHANNEL), (message) => {
    listener?.(message as PhotonPayload)
  })
}

export const subscribeBulkWeakCoordination = (
  listener?: (message: { wimpId: string; processId: string; coordination: WeakCoordinationKind; executorId?: string }) => void,
  options: { channelName?: string } = {},
): BulkWeakCoordinationSubscription => {
  return createSubscription(new BroadcastChannel(options.channelName ?? WEAK_Z_BROADCAST_CHANNEL), (message) => {
    listener?.(message as { wimpId: string; processId: string; coordination: WeakCoordinationKind; executorId?: string })
  })
}

export const createBulkWeakProtocol = (options: BulkWeakProtocolOptions = {}): BulkWeakProtocol => {
  const zChannel = new BroadcastChannel(options.zChannelName ?? WEAK_Z_BROADCAST_CHANNEL)
  const wChannel = new BroadcastChannel(options.wChannelName ?? WEAK_W_BROADCAST_CHANNEL)
  const emitZ = (
    coordination: WeakCoordinationKind,
    wimpId: string,
    processId: string,
    executorId?: string,
  ): void => {
    zChannel.postMessage(createBulkZPayload(coordination, wimpId, processId, executorId))
  }
  const emitW = (wimpId: string, processId: string, patches: Array<{ op: "replace"; path: string; value: unknown }>): void => {
    wChannel.postMessage(createBulkWPayload(wimpId, processId, patches))
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
      zChannel.close()
      wChannel.close()
    },
  }
}
