import type { ElementToken } from "./splitter"

/**
 * Текстовый узел.
 *
 * @description
 * Представляет текстовое содержимое в иерархии элементов.
 *
 * @property {string} type - Тип узла, всегда "text"
 * @property {string} text - Исходный текст
 *
 * @example
 * ```typescript
 * const textNode: PartText = {
 *   type: "text",
 *   text: "Hello ${name}"
 * }
 * ```
 */
export type PartText = {
  /** Тип узла */
  type: "text"
  /** Исходный текст */
  text: string
}

/**
 * Узел map-операции с шаблоном элемента.
 *
 * @description
 * Представляет цикл по коллекции данных. Содержит исходный текст map-выражения
 * и дочерние элементы, которые будут повторены для каждого элемента коллекции.
 *
 * @property {string} type - Тип узла, всегда "map"
 * @property {string} text - Исходный текст map-выражения
 * @property {(PartElement | PartText)[]} child - Дочерние элементы, повторяемые для каждого элемента коллекции
 *
 * @example
 * ```typescript
 * const mapNode: PartMap = {
 *   type: "map",
 *   text: "core.list.map(({ title, nested }) => html`",
 *   child: [
 *     { tag: "div", type: "el", text: "<div>", child: [...] }
 *   ]
 * }
 * ```
 */
export type PartMap = {
  /** Тип узла */
  type: "map"
  /** Исходный текст map-выражения */
  text: string
  /** Дочерние элементы, повторяемые для каждого элемента коллекции */
  child: (PartElement | PartText | PartMap | PartCondition | PartMeta)[]
}

/**
 * Узел условия (тернарный оператор) с ветками true/false.
 *
 * @description
 * Представляет условный рендеринг на основе значения из context или core.
 * Содержит исходный текст условия и две ветки: для случая когда условие истинно и когда ложно.
 *
 * @property {string} type - Тип узла, всегда "cond"
 * @property {string} text - Исходный текст условия
 * @property {PartElement} true - Элемент, рендерящийся когда условие истинно
 * @property {PartElement} false - Элемент, рендерящийся когда условие ложно
 *
 * @example
 * ```typescript
 * const conditionNode: PartCondition = {
 *   type: "cond",
 *   text: "context.flag ?",
 *   true: { tag: "div", type: "el", text: "<div>", child: [...] },
 *   false: { tag: "span", type: "el", text: "<span>", child: [...] }
 * }
 * ```
 */
export type PartCondition = {
  /** Тип узла */
  type: "cond"
  /** Исходный текст условия */
  text: string
  /** Элемент, рендерящийся когда условие истинно */
  true: PartElement | PartCondition | PartMeta
  /** Элемент, рендерящийся когда условие ложно */
  false: PartElement | PartCondition | PartMeta
}

/**
 * Узел иерархии элементов, соответствующий открытому тегу.
 *
 * @description
 * Представляет HTML элемент в иерархии. Может содержать дочерние элементы,
 * включая другие элементы, условия, map-операции и текстовые узлы.
 *
 * @property {string} tag - Имя HTML тега (например, "div", "span", "p")
 * @property {string} type - Тип узла, всегда "el"
 * @property {string} text - Исходный текст тега
 * @property {(PartElement | PartCondition | PartMap | PartText)[]} [child] - Дочерние элементы (опционально)
 *
 * @example
 * ```typescript
 * const elementNode: PartElement = {
 *   tag: "div",
 *   type: "el",
 *   text: "<div>",
 *   child: [
 *     { type: "text", text: "Hello" },
 *     { tag: "span", type: "el", text: "<span>", child: [...] }
 *   ]
 * }
 * ```
 */
export type PartElement = {
  /** Имя HTML тега */
  tag: string
  /** Тип узла */
  type: "el"
  /** Исходный текст тега */
  text: string
  /** Дочерние элементы (опционально) */
  child?: (PartElement | PartCondition | PartMap | PartText | PartMeta)[]
}

/**
 * Корневая иерархия элементов для переданного HTML.
 *
 * @description
 * Массив узлов верхнего уровня, представляющий полную структуру HTML документа.
 * Может содержать элементы, условия, map-операции и текстовые узлы.
 *
 * @example
 * ```typescript
 * const hierarchy: PartHierarchy = [
 *   { tag: "div", type: "el", text: "<div>", child: [...] },
 *   { type: "cond", text: "context.showHeader ?", true: {...}, false: {...} },
 *   { type: "map", text: "core.items.map(...)", child: [...] }
 * ]
 * ```
 */
/**
 * Мета-узел иерархии.
 * Представляет мета-тег в иерархии элементов.
 */
export type PartMeta = {
  /** Имя мета-тега */
  tag: string
  /** Тип узла */
  type: "meta"
  /** Исходный текст тега */
  text: string
  /** Дочерние элементы (опционально) */
  child?: (PartElement | PartCondition | PartMap | PartText | PartMeta)[]
}

export type PartHierarchy = (PartElement | PartCondition | PartMap | PartText | PartMeta)[]

/**
 * Элемент стека для отслеживания открытых тегов.
 *
 * @description
 * Используется внутренне для построения иерархии элементов.
 *
 * @property {ElementToken} tag - Токен открывающего тега
 * @property {PartElement} element - Соответствующий элемент иерархии
 */
export type StackItem = {
  /** Токен открывающего тега */
  tag: ElementToken
  /** Соответствующий элемент иерархии */
  element: PartElement | PartMeta
}

/**
 * Информация о map-операции в стеке.
 *
 * @description
 * Используется для отслеживания map-операций во время построения иерархии.
 *
 * @property {ElementToken} startElement - Элемент начала map-операции
 * @property {ElementToken} endElement - Элемент конца map-операции
 * @property {string} text - Исходный текст map-выражения
 */
export type MapStackItem = {
  /** Элемент начала map-операции */
  startElement: ElementToken
  /** Элемент конца map-операции */
  endElement: ElementToken
  /** Исходный текст map-выражения */
  text: string
}

/**
 * Информация об условии в стеке.
 *
 * @description
 * Используется для отслеживания условных операторов во время построения иерархии.
 *
 * @property {ElementToken} startElement - Элемент начала условия
 * @property {ElementToken} endElement - Элемент конца условия
 * @property {string} text - Исходный текст условия
 */
export type ConditionStackItem = {
  /** Элемент начала условия */
  startElement: ElementToken
  /** Элемент конца условия */
  endElement: ElementToken
  /** Исходный текст условия */
  text: string
}
