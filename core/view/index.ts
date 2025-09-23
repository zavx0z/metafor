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
export function serializeStyle(fn: Function): string {
  const fnString = fn.toString()

  // Извлекаем CSS template literal через regex
  const match = fnString.match(/css`([\s\S]*)`/)
  if (!match) {
    console.warn("Не удалось найти CSS template literal в функции")
    return ""
  }

  // Минифицируем бережно: сохраняем необходимые пробелы между токенами
  // 1) удаляем комментарии /* ... */
  // 2) схлопываем последовательности пробелов в один пробел
  // 3) удаляем пробелы вокруг пунктуации : ; , ( ) { } и /
  // 4) обрезаем края
  const rawCss = match[1]!
  const withoutComments = rawCss.replace(/\/\*[\s\S]*?\*\//g, "")
  const collapsedWhitespace = withoutComments.replace(/\s+/g, " ")
  const tightPunct = collapsedWhitespace
    .replace(/\s*([:;,{()} ,])\s*/g, (m, p1) => (p1 === " " ? " " : p1))
    .replace(/\s*\/\s*/g, "/")
  return tightPunct.trim()
}
