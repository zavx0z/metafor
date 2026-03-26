import {
  GRAVITY_BROADCAST_CHANNEL,
  type GravitonMessage,
  type GravityProtocolPatch,
  type ProtocolChannelOptions,
} from "@shared/protocol"

export const gravityCH = new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL)

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
  patches,
})

export const createDarkGravityProtocol = (options: ProtocolChannelOptions = {}): DarkGravityProtocol => {
  const emitPatches = (patches: GravityProtocolPatch[]): void => {
    if (patches.length === 0) return
    gravityCH.postMessage(createDarkGravitonMessage(patches))
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
      gravityCH.close()
    },
  }
}
