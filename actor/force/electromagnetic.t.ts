/**
 Сообщение для обмена данными между акторами

 @property meta - Хеш меты компонента-актора
 @property actor - Информация об акторе
 @property actor.index - Индекс актора по отношению к братьям в родителе
 @property actor.parent - Хеш родительской меты актора
 @property timestamp - Время отправки сообщения
 @property patches - Массив патчей для применения к актору (JSON Patch RFC 6902)
 */

export interface BaseMessage {
  meta: string
  actor: string
  path: string
  timestamp: number
  src: MsgSrc
}
/**
 * Сообщение между акторами в системе MetaFor
 *
 * Содержит полную информацию о изменении состояния актора:
 * - `meta` - мета-информация о типе актора
 * - `actor` - уникальный идентификатор актора
 * - `path` - позиционный путь в VDOM (например, "0/1/2")
 * - `timestamp` - время создания сообщения
 * - `patches` - массив изменений в формате JSON Patch
 *
 * @example
 * ```typescript
 * const message: Message = {
 *   meta: "user-profile",
 *   actor: "user-123",
 *   path: "0/1/2",
 *   timestamp: Date.now(),
 *   patches: [{ op: "replace", path: "/context/name", value: "John" }]
 * }
 * ```
 */
export interface Message extends BaseMessage {
  patches: JsonPatch[]
}

export type JsonPatch = { op: "replace" | "add" | "remove" | "test"; path: string; value?: any }

export enum MsgSrc {
  Transition = "t",
  Process = "p",
  Success = "s",
  Error = "e",
  Reaction = "r",
  Nothing = "",
}
