import type { Actions } from "./action"
import type { CoreData } from "./core"
import type { Collapses } from "./collapse"
import type { ContextData, ContextDefinition } from "./context"
import type { CoreDefinition } from "./core"
import type { QuantumAtom } from "../QuantumAtom"
import type { ReactionType } from "./reaction"

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
 * Параметры конструктора QuantumAtom
 * @interface QuantumAtomConstructorParams
 * @template C - Тип контекста
 * @template I - Тип ядра
 * @template S - Тип состояния
 * @property channel - Канал для коммуникации
 * @property id - Идентификатор атома
 * @property states - Список возможных состояний
 * @property contextDefinition - Определение контекста
 * @property collapses - Правила переходов
 * @property initialState - Начальное состояние
 * @property contextData - Начальные данные контекста
 * @property actions - Действия атома
 * @property core - Определение ядра
 * @property coreData - Данные ядра
 * @property reactions - Реакции на изменения
 * @property onCollapse - Callback при изменении состояния
 * @property onUpdate - Callback при изменении контекста
 * @property destroy - Callback при уничтожении атома
 */
export interface QuantumAtomConstructorParams<C extends Record<string, any>, I extends Record<string, any>, S extends string> {
  channel: BroadcastChannel
  id: string
  states: S[]
  contextDefinition: ContextDefinition
  collapses: Collapses<C, S>
  initialState: S
  contextData: ContextData<C>
  actions: Actions<C, I>
  core: CoreDefinition<I, C>
  coreData: CoreData<I>
  reactions: ReactionType<C, I>
  onCollapse?: (oldState: S, newState: S, atom: QuantumAtom<C, I, S>) => void
  onUpdate?: (context: ContextData<C>, srcName?: string, funcName?: string) => void
  destroy?: (atom: QuantumAtom<C, I, S>) => void
}
