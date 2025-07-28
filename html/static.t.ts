export interface StaticValue {
  /** Значение, которое будет вставлено в шаблон как есть. */
  _$htmlStatic$: string
  /**
   * Маркер, который невозможно получить через обычный JSON.parse,
   * что усложняет атаки через сериализацию/десериализацию.
   */
  r: symbol
}

/**
 * Функция для создания статических значений в HTML шаблонах
 *
 * @includeExample ./html/tests/static.basic.spec.ts
 * @includeExample ./html/tests/static.attributes.spec.ts
 */
export type StaticFunction = (strings: TemplateStringsArray, ...values: any[]) => StaticValue
