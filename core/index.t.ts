/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { ContextSchema } from "./context"
import type { ContextSnapshot, ContextTypes } from "./context/index.t"
import type { ProcessesDeclaration } from "./proc/index.t"
import type { SnapshotProcesses } from "./proc/parser.t"
import type { ReactionsDeclaration, SnapshotReactions } from "./react/index.t"
import type { StatesConfig } from "./state"
import type { ViewDeclaration } from "./view/index.t"
import type { Store } from "./store/index.t"

declare global {
  var DEV: boolean
}
export {}

export interface FingerPrint<C extends ContextSchema, S extends string> {
  /** Название компонента */
  name: string
  /** Описание компонента */
  description?: string
  /** Карта состояний и переходов */
  states: StatesConfig<S, C>
  /** Снимок процессов */
  processes?: SnapshotProcesses
  /** Снимок реакций */
  reactions?: SnapshotReactions
  /** Снимок контекста */
  context: ContextSnapshot<C>
  /** Сериализованный view как строка template literal */
  render?: string
  /** Стили компонента */
  style?: string
}

/**
 * Интерфейс снимка состояния компонента
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends ContextSchema, S extends string> extends FingerPrint<C, S> {
  /** Текущее состояние */
  state: S
}

/**
 *  Ядро компонента
 */
export type Core = Record<string, any>

/**
 * @internal
 * @description
 * Тип параметров для создания web-компонента-актора конечного автомата (Actor)
 */
export type FabricParams = {
  store: Store
  // /** Название компонента */
  // name: string
  // /** Описание компонента */
  // description: string | undefined
  // /** Схема контекста */
  // schema: (types: ContextTypes) => C
  // /** Конфигурация состояний */
  // states: StatesConfig<S, C>
  // /** Ядро компонента */
  // core: I
  // /** Процессы */
  // process: ProcessesDeclaration<C, S, I>
  // /** Реакции */
  // reaction: ReactionsDeclaration<C, S, I>
  // /** Конфигурация view */
  // view: ViewConfig<C, S, I> | undefined
  // /** Восстановление из последнего сохраненного состояния (snapshot) */
  // persist: boolean
}
/**
 * Конфигурация компонента MetaFor
 */
export type MetaForConfig = {
  /** Описание компонента */
  description?: string
  /** Режим разработки */
  dev?: boolean
  /**
   * Восстановление из последнего сохраненного состояния (snapshot)
   *
   * @default false
   */
  persist?: boolean
}
export interface ActorInternal extends HTMLElement {
  __updCore: (value: Partial<unknown>) => void
  update: (value: Partial<unknown>) => void
}
