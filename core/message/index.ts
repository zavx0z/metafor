/**
 * Реализация сообщений
 * @module Messages
 */

import type { ContextSchema, ExtractValues } from "../context"
import type { Snapshot } from "../../core/index.t"
import type { Message, JsonPatch, ActorInfo } from "./index.t"
export type { Message, JsonPatch, ActorInfo }

export const initMessage = <C extends ContextSchema, S extends string>(
  meta: string,
  actor: ActorInfo,
  snapshot: Snapshot<C, S>
): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patch: { op: "add", path: "/", value: snapshot },
  }
}

export const updateContextMessage = <C extends ContextSchema>(
  meta: string,
  actor: ActorInfo,
  updated: Partial<ExtractValues<C>>
): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patch: { op: "replace", path: "/context", value: updated },
  }
}

export const stateBeforeActionMessage = <S extends string>(meta: string, actor: ActorInfo, state: S): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patch: { op: "test", path: "/state", value: state },
  }
}

export const stateAfterActionMessage = <S extends string>(meta: string, actor: ActorInfo, state: S): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patch: { op: "replace", path: "/state", value: state },
  }
}
