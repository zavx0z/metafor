import type {ConditionsMap} from "../types/view"

/** Параметры для извлечения условий отображения компонентов */
export interface ExtractConditionsParams {
  map: ConditionsMap
  ids: string[]
  context: Record<string, any>
  state: string
}

/** Результат извлечения из литерального шаблона */
export type ExtractAllResult = { 
  html: string
  handlers: Map<string, Function> 
}

/**
 * Извлекает условия отображения компонентов из литерального шаблона
 * @param strings - Части строкового шаблона
 * @param values - Значения шаблона
 * @returns {(params: ExtractConditionsParams) => ExtractAllResult}
 */
export type ExtractConditions = (
  strings: TemplateStringsArray, 
  ...values: any[]
) => (params: ExtractConditionsParams) => ExtractAllResult

/**
 * Извлечение из литерального шаблона 
 *  - HTML строка
 *  - Обработчики событий
 *  - Условия отображения компонентов
 * 
 * @param strings - Части строкового шаблона
 * @param values - Значения шаблона
 * @returns {ExtractAllResult}
 */
export type ExtractAll = (
  strings: TemplateStringsArray, 
  ...values: any[]
) => ExtractAllResult

/**
 * Установка id для условных блоков в отрендеренном HTML
 * Порядок соответствия условий и элементов:
 * - Прямой порядок в ifBlocks и в элементах
 * - Получает все элементы с data-if-block=id этот id соответствует условию в ifBlocks
 * Идентификация:
 * - В ifBlocks каждое сравнение получает id
 * - Так же каждое условие сравнения получает id
 * 
 * @param element - Отрендеренный HTML
 * @param conditions - Блоки условий
 * @param context - Контекст атома
 * @param state - Текущее состояние
 */
export type CondMapUpdateFromTemplate = (
    element: DocumentFragment,
    conditions: ConditionsMap,
    context: Record<string, any>,
    state: string
  ) => void