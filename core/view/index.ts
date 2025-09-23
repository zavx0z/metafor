/**
 * Реализация представления (View)
 * @packageDocumentation
 * @module View
 */

import type { ViewDeclaration } from "./index.t.ts"

export type { ViewDeclaration }


/**
 * Извлекает CSS template literal из style функции
 */
export function extractCSSTemplateLiteral(fn: Function): string {
  const fnString = fn.toString()

  // Извлекаем CSS template literal через regex
  const match = fnString.match(/css`([\s\S]*)`/)
  if (!match) {
    console.warn("Не удалось найти CSS template literal в функции")
    return ""
  }

  return match[1]!.replace(/\s+/g, "")
}
