/**
 * Выбирает и выполняет функцию шаблона из списка на основе соответствия
 * заданного `value` к случаю.
 *
 * Случаи структурированы как `[caseValue, func]`. `value` сопоставляется с
 * `caseValue` по строгому равенству. Выбирается первое совпадение. Значения
 * случаев могут быть любого типа, включая примитивы, объекты и символы.
 *
 * Это похоже на switch statement, но как выражение и без fallthrough.
 *
 * @example
 *
 * ```ts
 * render() {
 *   return html`
 *     ${choose(this.section, [
 *       ['home', () => html`<h1>Home</h1>`],
 *       ['about', () => html`<h1>About</h1>`]
 *     ],
 *     () => html`<h1>Error</h1>`)}
 *   `;
 * }
 * ```
 */
export const choose = <T, V, K extends T = T>(value: T, cases: Array<[K, () => V]>, defaultCase?: () => V) => {
  for (const c of cases) {
    const caseValue = c[0]
    if (caseValue === value) {
      const fn = c[1]
      return fn()
    }
  }
  return defaultCase?.()
}
