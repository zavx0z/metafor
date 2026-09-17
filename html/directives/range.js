/**
 * Возвращает итерируемый объект целых чисел от `start` до `end` (не включая), с шагом `step`.
 *
 * Если `start` не указан, диапазон начинается с `0`. 
 * По умолчанию `step` равен `1`.
 *
 * @example
 *
 * ```js
 * render() {
 *   return html`
 *     ${map(range(8), () => html`<div class="cell"></div>`)}
 *   `;
 * }
 * ```
 * 
 * @param {number} startOrEnd - Начальное значение или конечное, если end не указан
 * @param {number} [end] - Конечное значение (не включительно)
 * @param {number} [step=1] - Шаг итерации
 * @yields {number} Следующее число в последовательности
 */
export function* range(startOrEnd, end, step = 1) {
  const start = end === undefined ? 0 : startOrEnd;
  end ??= startOrEnd;
  for (let i = start; step > 0 ? i < end : end < i; i += step) {
    yield i;
  }
} 