import type {ContextData, ContextDefinition, Update} from "./context"
import type {Core, CoreObj} from "./core"
import type {QuantumAtom} from "../QuantumAtom.js"

/**
 * Структура условного блока для компонента
 * @interface Block
 * @property raw - HTML-шаблон для истинного условия
 * @property template - HTML-шаблон для ложного условия
 */
export type Block = {
  raw: string
  template?: HTMLTemplateElement | Node
  xpath?: string
}

/**
 * Структура условного блока для компонента
 * @interface Condition
 * @property condition - Функция для проверки условия
 * @property context - Массив ключей контекста, используемых в условии
 * @property states - Массив состояний, используемых в условии
 * @property true - HTML-шаблон для истинного условия
 * @property false - HTML-шаблон для ложного условия
 */
export interface Condition {
  condition: Function
  context: string[]
  states: string[]
  true?: Block
  false?: Block
}

/**
 * Интерфейс для хранения условий отображения компонентов
 * @interface ConditionsMap
 */
export interface ConditionsMap extends Map<string | number, Condition> {}

/**
 * Параметры инициализации компонента
 * @interface ComponentParams
 * @property view - Коллбек инициализации представления
 * @property atom - Экземпляр атома
 */
export interface ComponentParams<I extends CoreObj, C extends ContextDefinition, S extends string> {
  view: ViewDefinition<I, C, S>
  atom: QuantumAtom<C, I, S>
}
/**
 * Интерфейс для хранения представления компонента
 * @interface ViewDefinition
 * @property render - Коллбек для рендеринга компонента
 * @property mount - Коллбек для монтирования компонента
 * @property unmount - Коллбек для размонтирования компонента
 * @property [isolated=true] - Флаг изолированного рендеринга
 */
export type ViewDefinition<I extends Record<string, any>, C extends ContextDefinition, S extends string> = {
  render: (params: ViewDefinitionParams<I, C, S>) => string
  mount?: MountParams<I>
  unmount?: MountParams<I>
  style?: ({css}: {css: (strings: TemplateStringsArray, ...values: any[]) => CSSStyleSheet}) => void
  isolated?: boolean
}
type MountParams<I extends Record<string, any>> = ({component, core}: {component: HTMLElement; core: Core<I>}) => void
type ViewDefinitionParams<I extends Record<string, any>, C extends ContextDefinition, S extends string> = {
  update: Update<C>
  context: ContextData<C>
  state: S
  core: Core<I>
  html: (strings: TemplateStringsArray, ...values: any[]) => any
}
