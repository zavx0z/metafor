import type { Self } from "@metafor/dsl"

export interface Boson extends Self {
  timestamp: number
  initiator: Initiator
}

/**
 * Сообщение между акторами в системе MetaFor
 *
 * Содержит полную информацию о изменении состояния актора:
 * - `meta` - мета-информация о типе актора
 * - `atom` - уникальный идентификатор актора
 * - `path` - позиционный путь в VDOM (например, "0/1/2")
 * - `timestamp` - время создания сообщения
 * - `impulses` - массив изменений в формате JSON Patch
 *
 * @example
 * ```typescript
 * const photon: Photon = {
 *   meta: "metafor",
 *   atom: "metafor-123",
 *   path: "0/1/2",
 *   timestamp: Date.now(),
 *   impulses: [{ op: "replace", path: "/context", value: {name: "MetaFor"} }]
 * }
 * ```
 */
export interface Photon extends Boson {
  impulses: JsonPatch[]
}

export type JsonPatch = {
  from?: string
  op: "add" | "remove" | "replace" | "move" | "test"
  path: string
  value?: any
}

export enum Initiator {
  Transition = "t",
  Process = "p",
  Success = "s",
  Error = "e",
  Reaction = "r",
  Nothing = "",
}

/**
 * Интерфейс для методов, обернутых декоратором @it
 * Предоставляет доступ к оригинальному методу через свойство `original`
 */
export interface WrappedMethod<T extends (...args: any[]) => any> extends Function {
  (...args: Parameters<T>): ReturnType<T>
  original: T
}
