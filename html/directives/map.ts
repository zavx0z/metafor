/**
 * Возвращает итерируемый объект, содержащий результат вызова `f(value)` для каждого значения из `items`.
 *
 * @example
 *
 * ```ts
 * render() {
 *   return html`
 *     <ul>
 *       ${map(items, (i) => html`<li>${i}</li>`)}
 *     </ul>
 *   `;
 * }
 * ```
 */
export function* map<T>(items: Iterable<T> | undefined, f: (value: T, index: number) => unknown) {
  if (items !== undefined) {
    let i = 0
    for (const value of items) {
      yield f(value, i++)
    }
  }
}
