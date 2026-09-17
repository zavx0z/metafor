/**
 * Возвращает итерируемый объект, содержащий результат вызова `f(value)`
 * для каждого значения в `items`.
 *
 * @example
 *
 * ```js
 * render() {
 *   return html`
 *     <ul>
 *       ${map(items, (i) => html`<li>${i}</li>`)}
 *     </ul>
 *   `;
 * }
 * ```
 *
 * @template T
 * @param {Iterable<T> | undefined} items - Исходный итерируемый объект
 * @param {function(T, number): unknown} f - Функция преобразования
 * @yields {unknown} Результат применения функции f к каждому элементу
 */
export function* map(items, f) {
  if (items !== undefined) {
    let i = 0
    for (const value of items) {
      yield f(value, i++)
    }
  }
}
