/**
 * Выбирает и вычисляет функцию шаблона из списка на основе сопоставления
 * заданного `value` с вариантом.
 *
 * Варианты структурированы как `[caseValue, func]`. `value` сопоставляется с
 * `caseValue` через строгое равенство. Выбирается первое совпадение. Значения
 * вариантов могут быть любого типа, включая примитивы, объекты и символы.
 *
 * Это похоже на оператор switch, но в виде выражения и без проваливания.
 *
 * @template T
 * @template V
 * @template {T} K
 * @param {T} value
 * @param {Array<[K, () => V]>} cases
 * @param {(() => V)=} defaultCase
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
export const choose = (value, cases, defaultCase) => {
  for (const c of cases) {
    const caseValue = c[0]
    if (caseValue === value) {
      const fn = c[1]
      return fn()
    }
  }
  return defaultCase?.()
}
