import {
  isPhotonMessage,
  isZMessage,
  openElectromagnetismBroadcastChannel,
  openWeakWBroadcastChannel,
  openWeakZBroadcastChannel,
  type PhotonMessage,
  type ProtocolChannelOptions,
  type ValueProtocolPatch,
  type WeakCoordinationKind,
  type WMessage,
  type ZMessage,
} from "@shared/protocol"

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
  emitWSuccessPatches(wimpId: string, processId: string, patches?: ValueProtocolPatch[]): void
  emitWErrorPatches(wimpId: string, processId: string, patches?: ValueProtocolPatch[]): void
  emitWSuccessValues(wimpId: string, processId: string, values?: Record<string, unknown>): void
  emitWErrorValues(wimpId: string, processId: string, values?: Record<string, unknown>): void
  close(): void
}

const channelOptions = (channelName?: string): ProtocolChannelOptions =>
  channelName === undefined ? {} : { channelName }

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

const createWeakResultFieldPatches = (values: Record<string, unknown>): ValueProtocolPatch[] =>
  Object.entries(values).map(([wimpFieldId, value]) => ({
    op: "replace",
    path: `/field/${wimpFieldId}`,
    value,
  }))

const createBulkZMessage = (
  coordination: WeakCoordinationKind,
  wimpId: string,
  processId: string,
  executorId?: string,
): ZMessage => ({
  channel: "weak-z",
  boson: "z",
  source: "bulk",
  wimpId,
  processId,
  coordination,
  ...(executorId !== undefined ? { executorId } : {}),
})

const createBulkWMessage = (
  boson: "w+" | "w-",
  wimpId: string,
  processId: string,
  patches: ValueProtocolPatch[],
): WMessage => ({
  channel: "weak-w",
  boson,
  source: "bulk",
  wimpId,
  processId,
  patches,
})

export const subscribeBulkPhotons = (
  listener?: (message: PhotonMessage) => void,
  options: ProtocolChannelOptions = {},
): BulkPhotonSubscription => {
  return createSubscription(openElectromagnetismBroadcastChannel(options), (message) => {
    if (!isPhotonMessage(message)) return
    listener?.(message)
  })
}

export const subscribeBulkWeakCoordination = (
  listener?: (message: ZMessage) => void,
  options: ProtocolChannelOptions = {},
): BulkWeakCoordinationSubscription => {
  return createSubscription(openWeakZBroadcastChannel(options), (message) => {
    if (!isZMessage(message)) return
    listener?.(message)
  })
}

export const createBulkWeakProtocol = (options: BulkWeakProtocolOptions = {}): BulkWeakProtocol => {
  const zChannel = openWeakZBroadcastChannel(channelOptions(options.zChannelName))
  const wChannel = openWeakWBroadcastChannel(channelOptions(options.wChannelName))
  const emitZ = (
    coordination: WeakCoordinationKind,
    wimpId: string,
    processId: string,
    executorId?: string,
  ): void => {
    zChannel.postMessage(createBulkZMessage(coordination, wimpId, processId, executorId))
  }
  const emitW = (boson: "w+" | "w-", wimpId: string, processId: string, patches: ValueProtocolPatch[]): void => {
    wChannel.postMessage(createBulkWMessage(boson, wimpId, processId, patches))
  }
  const emitWValues = (boson: "w+" | "w-", wimpId: string, processId: string, values: Record<string, unknown>): void => {
    emitW(boson, wimpId, processId, createWeakResultFieldPatches(values))
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
      emitW("w+", wimpId, processId, patches)
    },

    emitWErrorPatches(wimpId, processId, patches = []) {
      emitW("w-", wimpId, processId, patches)
    },

    emitWSuccessValues(wimpId, processId, values = {}) {
      emitWValues("w+", wimpId, processId, values)
    },

    emitWErrorValues(wimpId, processId, values = {}) {
      emitWValues("w-", wimpId, processId, values)
    },

    close() {
      zChannel.close()
      wChannel.close()
    },
  }
}

export type { PhotonMessage, ProtocolChannelOptions, ValueProtocolPatch, WeakCoordinationKind, WMessage, ZMessage } from "@shared/protocol"
