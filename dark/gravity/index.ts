import {
  METAFOR_PROTOCOL_KIND,
  openGravityBroadcastChannel,
  type GravityProtocolPatch,
  type GravitonMessage,
  type ProtocolChannelOptions,
} from "@shared/protocol"

export interface DarkGravityProtocol {
  emitPatches(patches: GravityProtocolPatch[]): void
  emitAdd(wimpId: string): void
  emitRemove(wimpId: string): void
  emitBarrier(value?: null | "" | Record<string, never>): void
  close(): void
}

const createDarkGravitonMessage = (patches: GravityProtocolPatch[]): GravitonMessage => ({
  protocol: METAFOR_PROTOCOL_KIND,
  channel: "gravity",
  boson: "graviton",
  source: "dark",
  target: "boundary",
  patches,
})

export const createDarkGravityProtocol = (options: ProtocolChannelOptions = {}): DarkGravityProtocol => {
  const channel = openGravityBroadcastChannel(options)

  return {
    emitPatches(patches) {
      if (patches.length === 0) return
      channel.postMessage(createDarkGravitonMessage(patches))
    },

    emitAdd(wimpId) {
      channel.postMessage(createDarkGravitonMessage([{ op: "add", path: `/wimp/${wimpId}` }]))
    },

    emitRemove(wimpId) {
      channel.postMessage(createDarkGravitonMessage([{ op: "remove", path: `/wimp/${wimpId}` }]))
    },

    emitBarrier(value = null) {
      channel.postMessage(createDarkGravitonMessage([{ op: "test", path: "", value }]))
    },

    close() {
      channel.close()
    },
  }
}

export { resolveContinuationSources } from "./gravity.ts"
export type { GravityProtocolPatch, GravitonMessage, ProtocolChannelOptions } from "@shared/protocol"
