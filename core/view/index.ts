/**
 * Реализация представления (View)
 * @packageDocumentation
 * @module View
 */

import type { Values, Schema, Update } from "@zavx0z/context"
import type { Core } from "../index.t.ts"
import type { ViewDeclaration } from "./index.t.ts"
import { type Node, parse } from "@zavx0z/template"
import { render } from "./render/index.ts"

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

/**
 * Восстанавливает view функцию из template literal
 */
export function restoreViewFunction(template: string) {
  // Создаем функцию через eval с фиксированными параметрами
  const functionString = `({ html, update, context, ref, repeat, when, map, style, choose, core, state }) => html\`${template}\``
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
