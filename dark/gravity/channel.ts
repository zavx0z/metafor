import { createProtocolChannel, type ProtocolPatch } from "store/protocol"

export const gravityCH = createProtocolChannel()

type GravitonPatch = Pick<ProtocolPatch, "op" | "path" | "value" | "from">

export interface DarkGravityProtocol {
  emitPatches(patches: GravitonPatch[]): void
  emitAdd(wimpId: string): void
  emitRemove(wimpId: string): void
  emitBarrier(value?: null | "" | Record<string, never>): void
  close(): void
}

function emitPatches(patches: GravitonPatch[]): void {
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
