/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { ContextSchema } from "./context"
import type { ContextSnapshot } from "./context/index.t"
import type { ProcessesConfig, ProcessesDeclaration } from "./proc/index.t"
import type { SnapshotProcesses } from "./proc/parser.t"
import type { ReactionRegistry } from "./react"
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
export type CreateMetaForParams<C extends ContextSchema, S extends string, I extends Core> = {
  tag: string
  env: "server" | "browser"
  schema: C
  states: StatesConfig<S, C>
  core: I
  processesDeclaration: ProcessesDeclaration<C, S, I>
  reactions: ReactionRegistry<C, S>
  view: ViewConfig<C, S, I> | undefined
}
