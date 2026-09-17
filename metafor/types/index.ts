import type {
  ContextData,
  ContextDefinition,
  ContextTypes,
  EnumDefinition,
  UpdateParameters,
  TypeDefinition,
} from "./context.ts"
import type {
  BooleanTriggerCondition,
  EnumTriggerCondition,
  NumberTriggerCondition,
  StringTriggerCondition,
} from "./trigger.ts"
import type { Transitions, TransitionTo } from "./transition.ts"
import type { Core, CoreDefinition } from "./core.ts"
import type { Action, Actions } from "./action.ts"
import type { SignalType } from "./state.ts"
import type { ReactionType } from "./reaction.ts"
import type { CreateOptions } from "./create.ts"

export type {
  SignalType,
  Action,
  Actions,
  CoreDefinition,
  Core,
  Transitions,
  TransitionTo,
  ContextData,
  ContextDefinition,
  TypeDefinition,
  ContextTypes,
  EnumDefinition,
  EnumTriggerCondition,
  NumberTriggerCondition,
  StringTriggerCondition,
  BooleanTriggerCondition,
}
/**
 * Снимок состояния частицы
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
 * @property transitions - Переходы
 */
export type Snapshot<C extends Record<string, any>, S> = {
  id: string
  title?: string
  description?: string
  state: S
  states: readonly S[]
  context: ContextData<C>
  types: ContextDefinition
  transitions: Transitions<C, S>
  actions: Record<string, { read: string[]; write: string[] }>
  core: Record<string, { read: string[]; write: string[] }>
}

/**
 * Частица
 * @interface MetaFor
 * @template C
 * @template S
 * @property id - Идентификатор частицы
 * @property title - Заголовок частицы
 * @property description - Описание частицы
 * @property state - Текущее состояние
 * @property context - Данные контекста
 * @property states - Доступные состояния
 * @property transitions - Переходы
 * @property update - Функция обновления контекста
 * @property onTransition - Слушатель переходов
 * @property snapshot - Функция получения снимка
 * @property process - Статус выполнения действия
 */
export type MetaFor<C extends Record<string, any>, S, I extends Record<string, any>> = {
  id: string
  title?: string
  description?: string
  state: S
  context: ContextData<C>
  states: readonly S[]
  transitions: Transitions<C, S>
  core: Core<I>
  update: (context: UpdateParameters<C>) => void
  onTransition: (listener: (oldState: S, newState: S) => void) => () => void
  snapshot: () => Snapshot<C, S>
  graph: () => Promise<MetaForGraph>  
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
export type DebugOptions = boolean | { host?: string; port?: number }

export type Meta = {
  name?: string
}

/**
 * Создание частицы
 * @template C - Определение контекста
 * @template S - Тип состояния
 * @template I - Тип данных ядра
 * @param options - Опции создания частицы
 * @param tag - Идентификатор частицы
 * @param description - Описание частицы
 * @param states - Список состояний
 * @param contextDefinition - Определение контекста
 * @param transitions - Определение переходов
 * @param actions - Определение действий
 * @param coreDefinition - Определение ядра
 * @param reactions - Определение реакций
 * @returns - Частица
 * */
export type CreateMetaFor<C extends Record<string, any>, S extends string, I extends Record<string, any>> = {
  options: CreateOptions<C, S, I>
  tag: string
  description: string
  states: S[]
  contextDefinition: ContextDefinition
  transitions: Transitions<C, S>
  actions: Actions<C, I>
  coreDefinition: CoreDefinition<I, C>
  reactions: ReactionType<C, I>
}
