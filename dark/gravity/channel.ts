import { createProtocolChannel } from "../../protocol.ts"

export const gravityCH = createProtocolChannel()

export interface DarkGravityProtocol {
  emitPatches(patches: Array<{ op: "add" | "remove" | "test"; path: string; value?: unknown }>): void
  emitAdd(wimpId: string): void
  emitRemove(wimpId: string): void
  emitBarrier(value?: null | "" | Record<string, never>): void
  close(): void
}

function emitPatches(patches: Array<{ op: "add" | "remove" | "test"; path: string; value?: unknown }>): void {
  gravityCH.postMessage({ patches: patches.map((patch) => ({ part: "graviton", ...patch })) })
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
