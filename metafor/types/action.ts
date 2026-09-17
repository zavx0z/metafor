import type {ContextData, ContextDefinition, Update} from "./context.ts"
import type {Core} from "./core.ts"

/**
 * Действие
 * @interface Action
 * @template C
 * @template I
 * @property context - Данные контекста
 * @property update - Функция обновления контекста
 * @property core - Внутренние данные
 */
export type Action<C extends ContextDefinition, I extends Record<string, unknown>> = ({context, update}: { context: ContextData<C>; update: Update<C>; core: Core<I> }) => void | Promise<void>
/**
 * Действия
 * @interface Actions
 * @template C
 * @template I
 */
export type Actions<C extends ContextDefinition, I extends Record<string, unknown>> = { [key: string]: Action<C, I> }