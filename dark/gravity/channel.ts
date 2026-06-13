import {force, type Particle} from "store"

export const gravityCH = force

type GravitonPart = Pick<Particle, "op" | "path" | "value" | "from">

export interface DarkGravityForce {
  emitParts(parts: GravitonPart[]): void
  emitAdd(wimpId: string): void
  emitRemove(wimpId: string): void
  emitBarrier(value?: null | "" | Record<string, never>): void
  close(): void
}

function emitParts(parts: GravitonPart[]): void {
  force.postMessage({ parts: parts.map((item) => ({ part: "graviton", ...item })) })
}

export function emitAdd(wimpId: string) {
  emitParts([{ op: "add", path: `/wimp/${wimpId}` }])
}

export function emitRemove(wimpId: string) {
  emitParts([{ op: "remove", path: `/wimp/${wimpId}` }])
}
export function emitBarrier(value = null) {
  emitParts([{ op: "test", path: "", value }])
}
