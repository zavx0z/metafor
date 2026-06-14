import {force, type Particle} from "store"

export const gravityCH = force

type ForcePartInput = Pick<Particle, "part" | "op" | "path" | "value" | "from">

export interface DarkGravityForce {
  emitParts(parts: ForcePartInput[]): void
  emitAdd(wimpId: string): void
  emitRemove(wimpId: string): void
  emitBarrier(value?: null | "" | Record<string, never>): void
  close(): void
}

function emitParts(parts: ForcePartInput[]): void {
  force.emit({parts})
}

export function emitAdd(wimpId: string) {
  emitParts([{part: "graviton", op: "add", path: "wimp", value: wimpId}])
}

export function emitRemove(wimpId: string) {
  emitParts([{part: "graviton", op: "remove", path: "wimp", value: wimpId}])
}
export function emitBarrier(value = null) {
  emitParts([{part: "graviton", op: "test", path: "", value}])
}
