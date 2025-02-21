/** Тип "ложных" значений.
 *  @typedef {null | undefined | false | 0 | -0 | 0n | ''} Falsy */
/**
 *  Когда `condition` истинно, возвращает результат вызова `trueCase()`.
 * В противном случае возвращает результат вызова `falseCase()`, если он определен.
 * @template C - Тип условия
 * @template T - Возвращаемый тип для истинного случая
 * @template F - Возвращаемый тип для ложного случая
 * @param {C} condition - Условие для проверки
 * @param {(c: Exclude<C, Falsy>) => T} trueCase - Функция, выполняемая если условие истинно
 * @param {(c: Extract<C, Falsy>) => F} [falseCase] - Опциональная функция, выполняемая если условие ложно
 * @returns {C extends Falsy ? (F | string) : T} Результат выполнения trueCase или falseCase
 */
export function when(condition, trueCase, falseCase) {
  return /** @type {C extends Falsy ? (F | string) : T} */ (
    condition
      ? trueCase(/** @type {Exclude<C, Falsy>} */ (condition))
      : falseCase?.(/** @type {Extract<C, Falsy>} */ (condition))
  )
}
