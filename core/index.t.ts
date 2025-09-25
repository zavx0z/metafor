/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { Schema, Snapshot as ContextSnapshot } from "@zavx0z/context"
import type { SnapshotProcesses } from "../schema/process.t"
import type { SnapshotReactions } from "./react/index.t"
import type { StatesConfig } from "./state"
import type { MetaStore } from "./store/index.t"
import type { Node as ParseNode } from "@zavx0z/template"


export interface MetaSchema<C extends Schema, S extends string> {
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
  /** Схема контекста */
  context: Schema
  /** Сериализованный view как строка template literal */
  render?: ParseNode[]
  /** Стили компонента */
  style?: string
}

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
  processes?: SnapshotProcesses
  /** Снимок реакций */
  reactions?: SnapshotReactions
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

/**
 * @internal
 * @description
 * Тип параметров для создания web-компонента-актора конечного автомата (Actor)
 */
export type FabricParams = {
  store: MetaStore
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
  // view: ViewDeclaration<C, I, S> | undefined
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
  __path: string[]
  update: (value: Partial<unknown>) => void
}
