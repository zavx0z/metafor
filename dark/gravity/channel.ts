import {force} from "boundary"
import type { DarkGravityForce } from "@metafor/types/force/channel"
import type { ForcePartInput } from "@metafor/types/force/particle"

export const gravityCH = force

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
