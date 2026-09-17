import type { Actions } from "./action.ts"
import type { CoreData } from "./core.ts"
import type { Transitions } from "./transition.ts"
import type { ContextData, ContextDefinition } from "./context.ts"
import type { CoreDefinition } from "./core.ts"
import type { ReactionType } from "./reaction.ts"
import {ClassMetaFor} from "../index";

/**
 * Параметры обновления контекста
 * @interface UpdateContextParams
 * @template C - Тип контекста
 * @property context - Данные контекста для обновления
 * @property srcName - Имя источника изменения
 * @property funcName - Имя функции вызвавшей изменение
 */
export interface UpdateContextParams<C extends Record<string, any>> {
  context: ContextData<C>
  srcName?: string
  funcName?: string
}

/**
 * Параметры конструктора MetaFor
 * @interface MetaForConstructorParams
 * @template C - Тип контекста
 * @template I - Тип ядра
 * @template S - Тип состояния
 * @property channel - Канал для коммуникации
 * @property id - Идентификатор частицы
 * @property states - Список возможных состояний
 * @property contextDefinition - Определение контекста
 * @property transitions - Правила переходов
 * @property initialState - Начальное состояние
 * @property contextData - Начальные данные контекста
 * @property actions - Действия частицы
 * @property core - Определение ядра
 * @property coreData - Данные ядра
 * @property reactions - Реакции на изменения
 * @property onTransition - Callback при изменении состояния
 * @property onUpdate - Callback при изменении контекста
 * @property destroy - Callback при уничтожении частицы
 */
export interface MetaForConstructorParams<C extends Record<string, any>, I extends Record<string, any>, S extends string> {
  channel: BroadcastChannel
  id: string
  states: S[]
  contextDefinition: ContextDefinition
  transitions: Transitions<C, S>
  initialState: S
  contextData: ContextData<C>
  actions: Actions<C, I>
  core: CoreDefinition<I, C>
  coreData: CoreData<I>
  reactions: ReactionType<C, I>
  onTransition?: (oldState: S, newState: S, atom: ClassMetaFor<C, I, S>) => void
  onUpdate?: (context: ContextData<C>, srcName?: string, funcName?: string) => void
  destroy?: (atom: ClassMetaFor<C, I, S>) => void
}
