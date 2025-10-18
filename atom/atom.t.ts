/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { Schema, Snapshot as ContextSnapshot } from "@zavx0z/context"
import type { ProcessesSchema } from "../meta/process.t"
import type { ReactionsSchema } from "../meta/reactions.t"
import type { Superposition } from "../meta/states"

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
  states: Superposition<S, C>
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
  /** Снимок контекста */
  context: ContextSnapshot<C>
  core: string[]
}

