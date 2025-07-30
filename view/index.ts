/**
 * Реализация представления (View)
 * @module View
 */

/**
 * Извлекает template literal из view функции
 */
export function extractTemplateLiteral(fn: Function): string {
  const fnString = fn.toString()

  // Извлекаем template literal через regex
  const match = fnString.match(/html`([\s\S]*)`/)
  if (!match) {
    throw new Error("Не удалось найти template literal в функции")
  }

  return match[1]!
}
/**
 * Восстанавливает view функцию из template literal
 */
export function restoreViewFunction(template: string) {
  // Создаем функцию через eval с фиксированными параметрами
  const functionString = `({ html, update, context, ref, repeat, when, map, style, choose, nothing, core, state }) => html\`${template}\``
  return eval(functionString)
}
