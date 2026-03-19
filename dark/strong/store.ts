import type { FieldDefinitionJson } from "@metafor/ast"
import type { FieldKey } from "@metafor/ast"
import type { FieldID, WimpID } from "@dark/types"

export const strong$ = {
  fields: new Map<FieldKey, FieldDefinitionJson>(),
  keys: new Map<FieldID, FieldKey>(),
  wimp: new Map<WimpID, Set<FieldID>>(),
  push(wimpId: WimpID, key: FieldKey, field: FieldDefinitionJson) {
    const uuid = crypto.randomUUID()
    this.fields.set(key, field)
    this.keys.set(uuid, key)
    let wimp = this.wimp.get(wimpId)
    if (!wimp) {
      this.wimp.set(wimpId, new Set())
      wimp = this.wimp.get(wimpId)!
    }
    wimp.add(uuid)
    return uuid
  },
}
