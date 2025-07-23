import type { ContextSchema } from "../context"
import type { Snapshot } from "../metafor.t"
import type { Message } from "./index.t"

export const initMessage = <C extends ContextSchema, S extends string>(
  tag: string,
  snapshot: Snapshot<C, S>
): Message => {
  return {
    meta: {
      tag,
      timestamp: Date.now(),
    },
    patch: { op: "add", path: "/", value: snapshot },
  }
}
