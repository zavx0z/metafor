/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { Schema, Snapshot as ContextSnapshot } from "@zavx0z/context"
import type { ProcessesSchema } from "./schema/process.t"
import type { ReactionsSchema } from "./schema/reactions.t"
import type { StatesConfig } from "./schema/states"

/**
 * Интерфейс снимка состояния компонента
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends Schema, S extends string> {
  /** Название компонента */
  name: string
  /** Описание компонента */
  desc?: string
  /** Карта состояний и переходов */
  states: StatesConfig<S, C>
  /** Снимок процессов */
  processes?: ProcessesSchema
  /** Снимок реакций */
  reactions?: ReactionsSchema
  /** Сериализованный view как строка template literal из @zavx0z/template */
  render?: string
  /** Стили компонента */
  style?: string
  /** Текущее состояние */
  state: S
  /** Индикатор выполнения процесса в текущем состоянии */
  process: boolean
  /** Снимок контекста */
  context: ContextSnapshot<C>
  core: string[]
}

/**
 *  Ядро компонента
 */
/**
 * Ядро актора - объект для хранения сложных данных
 *
 * Используется для хранения данных, которые не подходят для контекста:
 * - Сложные объекты и структуры данных
 * - Кэшированные результаты вычислений
 * - Внешние ресурсы (DOM элементы, WebSocket соединения)
 * - Состояние, которое не влияет на UI напрямую
 *
 * @example
 * ```typescript
 * const core: Core = {
 *   users: [],
 *   cache: new Map(),
 *   socket: new WebSocket("ws://localhost:8080"),
 *   domElement: document.getElementById("container")
 * }
 * ```
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
export type Message = {
  meta: string
  actor: string
  path: string
  timestamp: number
  patches: JsonPatch[]
}

export type JsonPatch = { op: "replace" | "add" | "remove" | "test"; path: string; value?: any }
