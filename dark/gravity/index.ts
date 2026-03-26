import {
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
  channel: "gravity",
  boson: "graviton",
  source: "dark",
  target: "boundary",
  patches,
})

export const createDarkGravityProtocol = (options: ProtocolChannelOptions = {}): DarkGravityProtocol => {
  const channel = openGravityBroadcastChannel(options)
  const emitPatches = (patches: GravityProtocolPatch[]): void => {
    if (patches.length === 0) return
    channel.postMessage(createDarkGravitonMessage(patches))
  }

  return {
    emitPatches,

    emitAdd(wimpId) {
      emitPatches([{ op: "add", path: `/wimp/${wimpId}` }])
    },

    emitRemove(wimpId) {
      emitPatches([{ op: "remove", path: `/wimp/${wimpId}` }])
    },

    emitBarrier(value = null) {
      emitPatches([{ op: "test", path: "", value }])
    },

    close() {
      channel.close()
    },
  }
}

export { resolveContinuationSources } from "./gravity.ts"
export type { GravityProtocolPatch, GravitonMessage, ProtocolChannelOptions } from "@shared/protocol"
