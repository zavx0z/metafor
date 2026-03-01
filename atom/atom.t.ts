/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { Schema, Snapshot as ContextSnapshot } from "@zavx0z/context";
import type { ProcessesSchema } from "../dsl/meta/process.t";
import type { ReactionsSchema } from "../dsl/meta/reactions.t";
import type { Superposition } from "../dsl/meta/states.t";

/**
 * Интерфейс снимка состояния компонента
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends Schema, 𝛴 extends string> {
  /** Название компонента */
  name: string;
  /** Описание компонента */
  desc?: string;
  /** Карта состояний и переходов */
  states: Superposition<𝛴, ɸ>;
  /** Снимок процессов */
  processes?: ProcessesSchema;
  /** Снимок реакций */
  reactions?: ReactionsSchema;
  /** Сериализованный view*/
  render?: string;
  /** Стили компонента */
  style?: string;
  /** Текущее состояние */
  state: S;
  /** Снимок контекста */
  context: ContextSnapshot<C>;
  core: string[];
}
