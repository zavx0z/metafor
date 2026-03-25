import {
  METAFOR_PROTOCOL_KIND,
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

export interface BulkPhotonSubscription {
  close(): void
}

export interface BulkWeakCoordinationSubscription {
  close(): void
}

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
  protocol: METAFOR_PROTOCOL_KIND,
  channel: "weak-z",
  boson: "z",
  source: "bulk",
  target: "broadcast",
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
  protocol: METAFOR_PROTOCOL_KIND,
  channel: "weak-w",
  boson,
  source: "bulk",
  target: "boundary",
  wimpId,
  processId,
  patches,
})

export const subscribeBulkPhotons = (
  listener?: (message: PhotonMessage) => void,
  options: ProtocolChannelOptions = {},
): BulkPhotonSubscription => {
  const channel = openElectromagnetismBroadcastChannel(options)

  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isPhotonMessage(event.data)) return
    if (event.data.target !== "bulk" && event.data.target !== "broadcast") return
    listener?.(event.data)
  }

  return {
    close() {
      channel.close()
    },
  }
}

export const subscribeBulkWeakCoordination = (
  listener?: (message: ZMessage) => void,
  options: ProtocolChannelOptions = {},
): BulkWeakCoordinationSubscription => {
  const channel = openWeakZBroadcastChannel(options)

  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isZMessage(event.data)) return
    if (event.data.target !== "bulk" && event.data.target !== "broadcast") return
    listener?.(event.data)
  }

  return {
    close() {
      channel.close()
    },
  }
}

export const createBulkWeakProtocol = (options: BulkWeakProtocolOptions = {}): BulkWeakProtocol => {
  const zChannel = openWeakZBroadcastChannel(
    options.zChannelName === undefined ? {} : { channelName: options.zChannelName },
  )
  const wChannel = openWeakWBroadcastChannel(
    options.wChannelName === undefined ? {} : { channelName: options.wChannelName },
  )

  return {
    emitZ(coordination, wimpId, processId, executorId) {
      zChannel.postMessage(createBulkZMessage(coordination, wimpId, processId, executorId))
    },

    emitZClaim(wimpId, processId, executorId) {
      zChannel.postMessage(createBulkZMessage("claim", wimpId, processId, executorId))
    },

    emitZAccept(wimpId, processId, executorId) {
      zChannel.postMessage(createBulkZMessage("accept", wimpId, processId, executorId))
    },

    emitZReject(wimpId, processId, executorId) {
      zChannel.postMessage(createBulkZMessage("reject", wimpId, processId, executorId))
    },

    emitZRelease(wimpId, processId, executorId) {
      zChannel.postMessage(createBulkZMessage("release", wimpId, processId, executorId))
    },

    emitWSuccessPatches(wimpId, processId, patches = []) {
      wChannel.postMessage(createBulkWMessage("w+", wimpId, processId, patches))
    },

    emitWErrorPatches(wimpId, processId, patches = []) {
      wChannel.postMessage(createBulkWMessage("w-", wimpId, processId, patches))
    },

    emitWSuccessValues(wimpId, processId, values = {}) {
      wChannel.postMessage(createBulkWMessage("w+", wimpId, processId, createWeakResultFieldPatches(values)))
    },

    emitWErrorValues(wimpId, processId, values = {}) {
      wChannel.postMessage(createBulkWMessage("w-", wimpId, processId, createWeakResultFieldPatches(values)))
    },

    close() {
      zChannel.close()
      wChannel.close()
    },
  }
}

export type { PhotonMessage, ProtocolChannelOptions, ValueProtocolPatch, WeakCoordinationKind, WMessage, ZMessage } from "@shared/protocol"
