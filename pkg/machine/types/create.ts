import type {Meta} from "."
import type {DebugOptions, GraphOptions} from "."
import type {QuantumAtom} from "../QuantumAtom"
import type {ContextData, PartialContextData} from "./context"
import type {CoreData} from "./core"
import type {ContextDefinition} from "./context"

/**
 * Опции создания атома
 * @interface CreateOptions
 * @property meta - Метаданные атома
 * @property title - Заголовок атома
 * @property description - Описание атома
 * @property state - Начальное состояние
 * @property context - Начальные данные контекста
 * @property core - Начальные данные ядра
 * @property debug - Опции отладки
 * @property graph - Опции визуализации графа
 * @property onCollapse - Обработчик смены состояния
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
  onCollapse?: (oldState: S, newState: S, atom: QuantumAtom<C, I, S>) => void
  onUpdate?: (context: ContextData<C>, srcName?: string, funcName?: string) => void
}
