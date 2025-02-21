/**
 * Возвращает итерируемый объект, содержащий значения из `items`,
 * чередующиеся со значением `joiner`.
 *
 * @example
 *
 * ```javascript
 * render() {
 *   return html`
 *     ${join(items, html`<span class="separator">|</span>`)}
 *   `;
 * }
 * ```
 *
 * @template I Тип элементов в `items`.
 * @template J Тип значения `joiner`.
 * @param {Iterable<I> | undefined} items Итерируемый объект с элементами.
 * @param {J | ((index: number) => J)} joiner Значение или функция для вставки между элементами.
 * @returns {Iterable<I | J>} Итерируемый объект, содержащий элементы и значения `joiner`.
 */
export function* join(items, joiner) {
  const isFunction = typeof joiner === "function"
  if (items !== undefined) {
    let i = -1
    for (const value of items) {
      if (i > -1) {
        // @ts-ignore
        yield isFunction ? joiner(i) : joiner
      }
      i++
      yield value
    }
  }
}
