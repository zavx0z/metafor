import type {ContextData, ContextDefinition, ContextTypes, EnumDefinition, UpdateParameters, TypeDefinition} from "./context.ts"
import type {BooleanTriggerCondition, EnumTriggerCondition, NumberTriggerCondition, StringTriggerCondition} from "./trigger.ts"
import type {Collapses, CollapseTo} from "./collapse.ts"
import type {Core, CoreDefinition} from "./core.ts"
import type {Action, Actions} from "./action.ts"
import type {SignalType} from "./state.ts"

export type {
  SignalType,
  Action,
  Actions,
  CoreDefinition,
  Core,
  Collapses,
  CollapseTo,
  ContextData,
  ContextDefinition,
  TypeDefinition,
  ContextTypes,
  EnumDefinition,
  EnumTriggerCondition,
  NumberTriggerCondition,
  StringTriggerCondition,
  BooleanTriggerCondition
}
/**
 * Снимок состояния атома
 * @interface Snapshot
 * @template C
 * @template S
 * @property id - Идентификатор снимка
 * @property title - Заголовок снимка
 * @property description - Описание снимка
 * @property state - Текущее состояние
 * @property states - Доступные состояния
 * @property context - Данные контекста
 * @property types - Определение типов контекста
 * @property collapses - Переходы
 */
export type Snapshot<C extends Record<string, any>, S> = {
  id: string
  title?: string
  description?: string
  state: S
  states: readonly S[]
  context: ContextData<C>
  types: ContextDefinition
  collapses: Collapses<C, S>
  actions: Record<string, {read: string[]; write: string[]}>
  core: Record<string, {read: string[]; write: string[]}>
}

/**
 * Атом квантового состояния
 * @interface QuantumAtom
 * @template C
 * @template S
 * @property id - Идентификатор атома
 * @property title - Заголовок атома
 * @property description - Описание атома
 * @property state - Текущее состояние
 * @property context - Данные контекста
 * @property states - Доступные состояния
 * @property collapses - Переходы
 * @property update - Функция обновления контекста
 * @property onCollapse - Слушатель переходов
 * @property snapshot - Функция получения снимка
 * @property process - Статус выполнения действия
 */
export type QuantumAtom<C extends Record<string, any>, S, I extends Record<string, any>> = {
  id: string
  title?: string
  description?: string
  state: S
  context: ContextData<C>
  states: readonly S[]
  collapses: Collapses<C, S>
  core: Core<I>
  update: (context: UpdateParameters<C>) => void
  onCollapse: (listener: (oldState: S, newState: S) => void) => () => void
  snapshot: () => Snapshot<C, S>
  graph: () => Promise<QGraphAtom>
  process: boolean
}

/**
 * Опции графа
 * @interface GraphOptions
 */
export type GraphOptions = boolean

/**
 * Опции отладки
 * @interface DebugOptions
 * @property host - Хост для отладки
 * @property port - Порт для отладки
 */
export type DebugOptions = boolean | {host?: string; port?: number}

export type Meta = {
  name?: string
}