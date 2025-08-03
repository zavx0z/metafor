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
import type { ViewConfig } from "./view/index.t"

/**
 * Интерфейс снимка состояния компонента
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends ContextSchema, S extends string> {
  /** Текущее состояние */
  state: S
  /** Карта состояний и переходов */
  states: StatesConfig<S, C>
  /** Снимок контекста с текущими значениями и метаданными */
  context: ContextSnapshot<C>
  /** Сериализованный view как строка template literal */
  view?: string
  /** Стили компонента */
  style?: string
  /** Снимок процессов */
  processes?: SnapshotProcesses
  /** Снимок реакций */
  reactions?: SnapshotReactions
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
export type FabricParams<C extends ContextSchema, S extends string, I extends Core> = {
  /** Название компонента */
  name: string
  /** Описание компонента */
  description: string | undefined
  /** Схема контекста */
  schema: (types: ContextTypes) => C
  /** Конфигурация состояний */
  states: StatesConfig<S, C>
  /** Ядро компонента */
  core: I
  /** Процессы */
  process: ProcessesDeclaration<C, S, I>
  /** Реакции */
  reaction: ReactionsDeclaration<C, S, I>
  /** Конфигурация view */
  view: ViewConfig<C, S, I> | undefined
}
