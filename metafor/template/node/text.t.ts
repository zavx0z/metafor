/**
 * Часть текста (статическая или динамическая).
 */

export type ParseTextPart = {
  /** Тип части: "static" для статического текста, "dynamic" для динамического */
  type: "static" | "dynamic"
  /** Содержимое части */
  text: string
}
export type TokenText = { kind: "text"; text: string }

/**
 * Текстовый узел в AST.
 *
 * Узел может представлять:
 * - **статическое значение** (`value`),
 * - **динамическое значение** (один или несколько путей в `data`),
 * - **смешанное выражение** (динамика + статический текст, в `expr`).
 *
 * ## Структура
 * - `type` — всегда `"text"`
 * - `value` — строка, если узел статический
 * - `data` — строка или массив строк, если узел динамический
 * - `expr` — строка-шаблон с индексами `${_[i]}`, если текст смешанный
 *
 * ## Примеры
 *
 * ### Статический
 * {@includeCode ./text.spec.ts#static}
 * {@includeCode ./text.spec.ts#expectStatic}
 *
 * ### Динамический
 * {@includeCode ./text.spec.ts#dynamic}
 * {@includeCode ./text.spec.ts#expectDynamic}
 *
 * ### Смешанный
 * {@includeCode ./text.spec.ts#mixed}
 * {@includeCode ./text.spec.ts#expectMixed}
 *
 * ### Методы
 * {@includeCode ./text.spec.ts#methods}
 * {@includeCode ./text.spec.ts#expectMethods}
 *
 * ### Математический
 * {@includeCode ./text.spec.ts#mathematical}
 * {@includeCode ./text.spec.ts#expectMathematical}
 *
 * ### Логический
 * {@includeCode ./text.spec.ts#logical}
 * {@includeCode ./text.spec.ts#expectLogical}
 *
 * ### Логический литерал
 * {@includeCode ./text.spec.ts#logicalLiteral}
 * {@includeCode ./text.spec.ts#expectLogicalLiteral}
 *
 * ### Тернарный
 * {@includeCode ./text.spec.ts#ternary}
 * {@includeCode ./text.spec.ts#expectTernary}
 *
 * ### Тернарный литерал
 * {@includeCode ./text.spec.ts#ternaryLiteral}
 * {@includeCode ./text.spec.ts#expectTernaryLiteral}
 *
 * @group Nodes
 */
export interface NodeText {
  /** Тип узла — всегда `"text"` */
  type: "text"

  /** Путь или список путей к данным. */
  data?: string | string[]

  /** Статическое значение (если текст полностью статический). */
  value?: string

  /**
   * Выражение с индексами (если текст смешанный или содержит операторы).
   *
   * Индексы (`_[0]`, `_[1]`) ссылаются на элементы массива `data`.
   */
  expr?: string
}

export type PartText = {
  /** Тип узла */
  type: "text"
  /** Исходный текст */
  text: string
}
