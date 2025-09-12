/**
 * Реализация сообщений
 * @module Messages
 */

import type { Schema, Values } from "@zavx0z/context"
import type { Snapshot } from "../../core/index.t"
import type { Message, JsonPatch, ActorInfo } from "./index.t"
export type { Message, JsonPatch, ActorInfo }

export const initMessage = <C extends Schema, S extends string>(
  meta: string,
  actor: ActorInfo,
  snapshot: Snapshot<C, S>,
  path: string[]
): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patches: [{ op: "add", path: "/" + path.join("/"), value: snapshot }],
  }
}

export const updateContextMessage = <C extends Schema>(
  meta: string,
  actor: ActorInfo,
  updated: Partial<Values<C>>
): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patches: [{ op: "replace", path: "/context", value: updated }],
  }
}

export const stateBeforeActionMessage = <S extends string>(meta: string, actor: ActorInfo, state: S): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patches: [{ op: "test", path: "/state", value: state }],
  }
}

export const stateAfterActionMessage = <S extends string>(meta: string, actor: ActorInfo, state: S): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patches: [{ op: "replace", path: "/state", value: state }],
  }
}

/**
 * Создает сообщение с несколькими патчами
 */
export const createMultiPatchMessage = (meta: string, actor: ActorInfo, patches: JsonPatch[]): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patches,
  }
}

/**
 * Создает сообщение для удаления компонента
 */
export const removeMessage = (meta: string, actor: ActorInfo): Message => {
  return {
    meta,
    actor,
    timestamp: Date.now(),
    patches: [{ op: "remove", path: "/" }],
  }
}
