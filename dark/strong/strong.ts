import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta } from "@metafor/dsl"
import { Wimp } from "./Wimp.ts"
import { createFieldValueResolvers, resolveNodeFieldValues } from "./fields.ts"

/**
 * Вычисляет continuation для дочернего `Wimp`, приходящий от родительской meta.
 *
 * На этом шаге сам `Wimp` ещё остаётся пустым: continuation только сохраняет
 * входные `values` и `mass`, которые будут применены позже при загрузке meta схемы
 * и передаче этого `Wimp` в `matterPipeline`.
 *
 * Traversal, parent resolution и wiring в `dark$` сюда не входят.
 */
export const resolveWimpContinuation = (
  node: NodeMeta,
  fields?: FieldsAST,
): { values?: Wimp["values"]; mass?: Wimp["mass"] } => {
  const fieldResolvers = fields ? createFieldValueResolvers(fields) : undefined
  const values =
    node.fields !== undefined && fieldResolvers !== undefined
      ? resolveNodeFieldValues(node.fields, fieldResolvers)
      : undefined
  const continuation: { values?: Wimp["values"]; mass?: Wimp["mass"] } = {}

  if (values !== undefined) continuation.values = values
  if (node.mass !== undefined) continuation.mass = node.mass

  return continuation
}
