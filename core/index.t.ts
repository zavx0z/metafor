/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { Schema, Snapshot as ContextSnapshot } from "@zavx0z/context"
import type { ProcessesSchema } from "../schema/process.t"
import type { ReactionsSchema } from "../schema/reactions.t"
import type { StatesConfig } from "../schema/states"

/**
 * Интерфейс снимка состояния компонента
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends Schema, S extends string> {
  /** Название компонента */
  name: string
  /** Описание компонента */
  description?: string
  /** Карта состояний и переходов */
  states: StatesConfig<S, C>
  /** Снимок процессов */
  processes?: ProcessesSchema
  /** Снимок реакций */
  reactions?: ReactionsSchema
  /** Сериализованный view как строка template literal */
  render?: string
  /** Стили компонента */
  style?: string
  /** Текущее состояние */
  state: S
  /** Индикатор выполнения процесса в текущем состоянии */
  process: boolean
  /** Снимок контекста */
  context: ContextSnapshot<C>
}

/**
 *  Ядро компонента
 */
export type Core = Record<string, any>

export interface ActorInternal extends HTMLElement {
  __updCore: (value: Partial<unknown>) => void
  __path: string[]
  update: (value: Partial<unknown>) => void
} /**
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
  index: string
  parent?: string
}

export type JsonPatch = { op: "replace" | "add" | "remove" | "test"; path: string; value?: any }
