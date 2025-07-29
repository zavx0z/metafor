/**
 * Реализация сообщений
 * @module Messages
 */

import type { ContextSchema, ExtractValues } from "../context"
import type { Snapshot } from "../metafor.t"
import type { Message, JsonPatch, MetaDataMessage } from "./index.t"
export type { Message, JsonPatch, MetaDataMessage }

export const initMessage = <C extends ContextSchema, S extends string>(
  tag: string,
  snapshot: Snapshot<C, S>
): Message => {
  return {
    meta: { tag, timestamp: Date.now(), index: 0 },
    patch: { op: "add", path: "/", value: snapshot },
  }
}

export const updateContextMessage = <C extends ContextSchema>(
  tag: string,
  updated: Partial<ExtractValues<C>>
): Message => {
  return {
    meta: { tag, timestamp: Date.now(), index: 0 },
    patch: { op: "replace", path: "/context", value: updated },
  }
}

export const stateBeforeActionMessage = <S extends string>(tag: string, state: S): Message => {
  return {
    meta: { tag, timestamp: Date.now(), index: 0 },
    patch: { op: "test", path: "/state", value: state },
  }
}

export const stateAfterActionMessage = <S extends string>(tag: string, state: S): Message => {
  return {
    meta: { tag, timestamp: Date.now(), index: 0 },
    patch: { op: "replace", path: "/state", value: state },
  }
}
