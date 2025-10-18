/**
 Сообщение для обмена данными между акторами

 @property meta - Хеш меты компонента-актора
 @property atom - Информация об акторе
 @property atom.index - Индекс актора по отношению к братьям в родителе
 @property atom.parent - Хеш родительской меты актора
 @property timestamp - Время отправки сообщения
 @property patches - Массив патчей для применения к актору (JSON Patch RFC 6902)
 */

import type { Self } from "./atom"

export interface Boson extends Self {
  timestamp: number
  src: Source
}

/**
 * Сообщение между акторами в системе MetaFor
 *
 * Содержит полную информацию о изменении состояния актора:
 * - `meta` - мета-информация о типе актора
 * - `atom` - уникальный идентификатор актора
 * - `path` - позиционный путь в VDOM (например, "0/1/2")
 * - `timestamp` - время создания сообщения
 * - `patches` - массив изменений в формате JSON Patch
 *
 * @example
 * ```typescript
 * const photon: Photon = {
 *   meta: "metafor",
 *   atom: "metafor-123",
 *   path: "0/1/2",
 *   timestamp: Date.now(),
 *   patches: [{ op: "replace", path: "/context", value: {name: "MetaFor"} }]
 * }
 * ```
 */
export interface Photon extends Boson {
  patches: JsonPatch[]
}

export type JsonPatch = {
  from?: string
  op: "add" | "remove" | "replace" | "move" | "test"
  path: string
  value?: any
}

export enum Source {
  Transition = "t",
  Process = "p",
  Success = "s",
  Error = "e",
  Reaction = "r",
  Nothing = "",
}
