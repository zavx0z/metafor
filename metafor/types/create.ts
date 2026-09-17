import type {Meta} from "./index.ts"
import type {DebugOptions, GraphOptions} from "./index.ts"
import type {ContextData, PartialContextData} from "./context.ts"
import type {CoreData} from "./core.ts"
import type {ContextDefinition} from "./context.ts"
import {ClassMetaFor} from "../index";

/**
 * Опции создания частицы
 * @interface CreateOptions
 * @property meta - Метаданные частицы
 * @property title - Заголовок частицы
 * @property description - Описание частицы
 * @property state - Начальное состояние
 * @property context - Начальные данные контекста
 * @property core - Начальные данные ядра
 * @property debug - Опции отладки
 * @property graph - Опции визуализации графа
 * @property onTransition - Обработчик смены состояния
 * @property view - Опции отображения
 * @property [view.isolated=true] - Флаг изолированного отображения (по умолчанию Shadow DOM)
 */
export interface CreateOptions<C extends ContextDefinition, S extends string, I extends Record<string, any>> {
  meta?: Meta
  title?: string
  description?: string
  state: S
  context?: PartialContextData<C>
  view?: {isolated?: boolean}
  core?: CoreData<I>
  debug?: DebugOptions
  graph?: GraphOptions
  onTransition?: (oldState: S, newState: S, particle: ClassMetaFor<C, I, S>) => void
  onUpdate?: (context: ContextData<C>, srcName?: string, funcName?: string) => void
}
