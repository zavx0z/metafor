import { GRAVITY_BROADCAST_CHANNEL, type GravitonMessage, type GravityProtocolPatch } from "@shared/protocol"

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

function emitPatches(patches: GravityProtocolPatch[]): void {
  if (patches.length === 0) return
  gravityCH.postMessage(createDarkGravitonMessage(patches))
}

export function emitAdd(wimpId: string) {
  emitPatches([{ op: "add", path: `/wimp/${wimpId}` }])
}

export function emitRemove(wimpId: string) {
  emitPatches([{ op: "remove", path: `/wimp/${wimpId}` }])
}
export function emitBarrier(value = null) {
  emitPatches([{ op: "test", path: "", value }])
}
