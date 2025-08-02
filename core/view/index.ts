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
 * Извлекает CSS template literal из style функции
 */
export function extractCSSTemplateLiteral(fn: Function): string {
  const fnString = fn.toString()

  // Извлекаем CSS template literal через regex
  const match = fnString.match(/css`([\s\S]*)`/)
  if (!match) {
    throw new Error("Не удалось найти CSS template literal в функции")
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

/**
 * Восстанавливает CSS функцию из template literal
 */
export function restoreCSSFunction(template: string) {
  // Создаем функцию через eval с фиксированными параметрами
  const functionString = `({ css }) => css\`${template}\``
  return eval(functionString)
}

/**
 * Создает статическую view функцию с заменой динамических тегов
 *
 * @param originalView - оригинальная view функция с динамическими тегами
 * @param tagName - имя тега для замены
 * @returns новая view функция со статическими тегами
 *
 * @example
 * ```typescript
 * const originalView = ({ context, html }) => html`
 *   <div>
 *     <metafor-${childTag} context=${context}></metafor-${childTag}>
 *   </div>
 * `
 *
 * const staticView = createStaticViewFunction(originalView, 'child-243232')
 * ```
 */
export function createStaticViewFunction(originalView: Function, tagName: string): any {
  // 1. Извлекаем template literal из оригинальной функции
  const template = extractTemplateLiteral(originalView)

  // 2. Заменяем динамический тег на статический
  // Ищем любые переменные в metafor- тегах и заменяем на реальное значение
  const staticTemplate = template.replace(/metafor-\$\{([^}]+)\}/g, `metafor-${tagName}`)

  // 3. Создаем новую функцию с замененным шаблоном
  return restoreViewFunction(staticTemplate)
}

/**
 * Создает статическую view функцию с заменой нескольких динамических тегов
 *
 * @param originalView - оригинальная view функция с динамическими тегами
 * @param replacements - объект с заменами { childTag: 'child-123', parentTag: 'parent-456' }
 * @returns новая view функция со статическими тегами
 *
 * @example
 * ```typescript
 * const originalView = ({ context, html }) => html`
 *   <div>
 *     <metafor-${parentTag}>
 *       <metafor-${childTag} context=${context}></metafor-${childTag}>
 *     </metafor-${parentTag}>
 *   </div>
 * `
 *
 * const staticView = createStaticViewFunctionWithReplacements(originalView, {
 *   parentTag: 'parent-123',
 *   childTag: 'child-456'
 * })
 * ```
 */
export function createStaticViewFunctionWithReplacements(
  originalView: Function,
  replacements: Record<string, string>
): Function {
  // 1. Извлекаем template literal из оригинальной функции
  const template = extractTemplateLiteral(originalView)

  // 2. Заменяем все динамические теги на статические
  let staticTemplate = template
  for (const [variableName, tagName] of Object.entries(replacements)) {
    // Заменяем переменные в metafor- тегах
    // Ищем как переменные, так и их значения в кавычках
    const regex1 = new RegExp(`metafor-\\$\\{${variableName}\\}`, "g")
    const regex2 = new RegExp(`metafor-\\$\\{"${tagName}"\\}`, "g")
    staticTemplate = staticTemplate.replace(regex1, `metafor-${tagName}`)
    staticTemplate = staticTemplate.replace(regex2, `metafor-${tagName}`)
  }

  // 3. Создаем новую функцию с замененным шаблоном
  return restoreViewFunction(staticTemplate)
}
