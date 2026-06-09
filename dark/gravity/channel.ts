import { GRAVITY_BROADCAST_CHANNEL } from "../../protocol.ts"

export const gravityCH = new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL)

export interface DarkGravityProtocol {
  emitPatches(patches: Array<{ op: "add" | "remove" | "test"; path: string; value?: unknown }>): void
  emitAdd(wimpId: string): void
  emitRemove(wimpId: string): void
  emitBarrier(value?: null | "" | Record<string, never>): void
  close(): void
}

function emitPatches(patches: Array<{ op: "add" | "remove" | "test"; path: string; value?: unknown }>): void {
  if (patches.length === 0) return
  gravityCH.postMessage({ patches })
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
