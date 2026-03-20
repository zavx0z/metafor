import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta } from "@metafor/dsl"
import type { WimpInit } from "@dark/types/strong"
import { Wimp } from "./Wimp.ts"
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
    node.fields !== undefined && fieldResolvers !== undefined
      ? resolveNodeFieldValues(node.fields, fieldResolvers)
      : undefined

  if (values !== undefined) init.values = values
  if (node.mass !== undefined) init.mass = node.mass

  return new Wimp(init)
}
