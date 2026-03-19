import type { FieldID, FieldKey, WimpID } from "@dark/types"
import type { FieldDefinitionJson } from "@metafor/ast"

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
