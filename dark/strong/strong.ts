import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta } from "@metafor/dsl"
import type { WimpInit } from "@dark/types/part"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"
import { createFieldValueResolvers, resolveNodeFieldValues } from "./fields.ts"

/**
 * Создаёт runtime Wimp для уже выбранного `src` текущей meta.
 *
 * Strong здесь занимается только локальной materialization:
 * - создаёт частицу;
 * - вычисляет runtime values из `node.fields`;
 * - переносит `mass`, если она определена на meta-узле.
 *
 * Traversal, parent resolution и wiring в `dark$` сюда не входят.
 */
export const materializeWimp = (node: NodeMeta, src: string, fields?: FieldsAST): Wimp => {
  const fieldResolvers = fields ? createFieldValueResolvers(fields) : undefined
  const init: WimpInit = { src }
  const values =
    node.fields !== undefined && fieldResolvers !== undefined ? resolveNodeFieldValues(node.fields, fieldResolvers) : undefined

  if (values !== undefined) init.values = values
  if (node.mass !== undefined) init.mass = node.mass

  return new Wimp(init)
}

/**
 * Создаёт пустую runtime Fuzzy.
 *
 * Решение о том, что в текущем проходе нужен именно `Fuzzy`, принимает `dark`.
 */
export const materializeFuzzy = (): Fuzzy => new Fuzzy()

/**
 * Создаёт пустую runtime Axion.
 *
 * Логика обхода и привязки дочерних ветвей остаётся на уровне `dark`.
 */
export const materializeAxion = (): Axion => new Axion()

/**
 * Создаёт пустую runtime Macho.
 *
 * Strong не знает, где эта частица окажется в graph wiring, и не пытается это решать.
 */
export const materializeMacho = (): Macho => new Macho()
