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

export interface ActorInternal extends HTMLElement {
  __updCore: (value: Partial<unknown>) => void
  __path: string[]
  update: (value: Partial<unknown>) => void
}
