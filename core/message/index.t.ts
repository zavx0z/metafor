/**
 * Типы для сообщений
 * @packageDocumentation
 * @module Messages
 */

/**
 Сообщение для обмена данными между акторами

 @property meta - Хеш меты компонента-актора
 @property actor - Информация об акторе
 @property actor.index - Индекс актора по отношению к братьям в родителе
 @property actor.parent - Хеш родительской меты актора
 @property timestamp - Время отправки сообщения
 @property patches - Массив патчей для применения к актору (JSON Patch RFC 6902)
 */
export type Message = {
  meta: string
  actor: ActorInfo
  timestamp: number
  patches: JsonPatch[]
}

/**
Информация об акторе в сообщении

@property index - Индекс актора по отношению к братьям в родителе (для уникализации)
@property parent - Хеш родительской меты актора
*/
export type ActorInfo = {
  index: number
  parent?: string
}

export type JsonPatch = { op: "replace" | "add" | "remove" | "test"; path: "/context" | "/state" | "/"; value?: any }
