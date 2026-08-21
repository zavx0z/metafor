import type {FieldDefinition} from "@ui/components"
import type {PositionedNodeTree} from "../node-editor.ts"
import type {BlenderFrame, BlenderLink, BlenderNode, BlenderSocket} from "../blender-node.ts"

export type NodeFieldValueState = Readonly<Record<string, unknown>>
export type NodeFieldValueChange = (nodeId: string, fieldId: string, value: unknown) => void
type CatalogTree = PositionedNodeTree<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame>

export function nodeFieldStateKey(nodeId: string, fieldId: string): string {
  return `${nodeId}/${fieldId}`
}

/** Captures every mutable public Field value without adding state to the Node renderer. */
export function createNodeFieldValueState(tree: CatalogTree): NodeFieldValueState {
  const values: Record<string, unknown> = {}
  for (const {node} of tree.nodes) {
    for (const field of nodeFields(node)) {
      const value = fieldValue(field)
      if (value !== NO_VALUE) values[nodeFieldStateKey(node.id, field.id)] = cloneValue(value)
    }
  }
  return Object.freeze(values)
}

export function updateNodeFieldValueState(
  state: NodeFieldValueState,
  nodeId: string,
  fieldId: string,
  value: unknown,
): NodeFieldValueState {
  return Object.freeze({...state, [nodeFieldStateKey(nodeId, fieldId)]: cloneValue(value)})
}

/** Returns one immutable tree whose public Fields delegate values to a dev-only owner. */
export function bindNodeFieldValueState(
  tree: CatalogTree,
  state: NodeFieldValueState,
  onChange: NodeFieldValueChange,
): CatalogTree {
  return Object.freeze({
    ...tree,
    nodes: Object.freeze(tree.nodes.map((entry) => {
      const node = entry.node
      return Object.freeze({
        ...entry,
        node: Object.freeze({
          ...node,
          ...(node.properties === undefined ? {} : {
            properties: Object.freeze(node.properties.map((field) => bindField(node.id, field, state, onChange))),
          }),
          ...(node.parameters === undefined ? {} : {
            parameters: Object.freeze(node.parameters.map((parameter) => Object.freeze({
              ...parameter,
              ...(parameter.field === undefined ? {} : {
                field: bindField(node.id, parameter.field, state, onChange),
              }),
            }))),
          }),
        }),
      })
    })),
  })
}

const NO_VALUE = Symbol("node-field-no-value")

function nodeFields(node: BlenderNode): readonly FieldDefinition[] {
  return [
    ...(node.properties ?? []),
    ...(node.parameters ?? []).flatMap(({field}) => field === undefined ? [] : [field]),
  ]
}

function fieldValue(field: FieldDefinition): unknown | typeof NO_VALUE {
  if (field.kind === "collection") return Object.freeze({items: cloneValue(field.items), selectedId: field.selectedId})
  if (field.kind === "readonly") return NO_VALUE
  return field.value
}

function bindField(
  nodeId: string,
  field: FieldDefinition,
  state: NodeFieldValueState,
  publish: NodeFieldValueChange,
): FieldDefinition {
  const key = nodeFieldStateKey(nodeId, field.id)
  const stored = Object.hasOwn(state, key) ? state[key] : fieldValue(field)
  const changed = (value: unknown): void => publish(nodeId, field.id, cloneValue(value))
  if (field.kind === "text") return {...field, value: stored as string, onChange: (value: string) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "number") return {...field, value: stored as number, onChange: (value: number) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "integer") return {...field, value: stored as number, onChange: (value: number) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "boolean") return {...field, value: stored as boolean, onChange: (value: boolean) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "enum") return {...field, value: stored as typeof field.value, onChange: (value: typeof field.value) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "color") return {...field, value: stored as typeof field.value, onChange: (value: typeof field.value) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "vector") return {...field, value: stored as readonly number[], onChange: (value: readonly number[]) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "rotation") return {...field, value: stored as readonly number[], onChange: (value: readonly number[]) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "matrix") return {...field, value: stored as readonly (readonly number[])[], onChange: (value: readonly (readonly number[])[]) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "path") return {...field, value: stored as string, onChange: (value: string) => { field.onChange?.(value); changed(value) }}
  if (field.kind === "reference") {
    return {
      ...field,
      value: stored as typeof field.value,
      onClear: () => { field.onClear?.(); changed(null) },
    }
  }
  if (field.kind === "collection") {
    const value = stored as Readonly<{items: typeof field.items; selectedId: string | null}>
    const publishCollection = (items: typeof field.items, selectedId: string | null): void => changed({items, selectedId})
    return {
      ...field,
      items: value.items,
      selectedId: value.selectedId,
      onSelect: (id) => { field.onSelect?.(id); publishCollection(value.items, id) },
      onRemove: (id) => {
        field.onRemove?.(id)
        publishCollection(value.items.filter((item) => item.id !== id), value.selectedId === id ? null : value.selectedId)
      },
      onMove: (id, direction) => {
        field.onMove?.(id, direction)
        const index = value.items.findIndex((item) => item.id === id)
        const target = index + (direction === "up" ? -1 : 1)
        if (index < 0 || target < 0 || target >= value.items.length) return
        const items = [...value.items]
        ;[items[index], items[target]] = [items[target]!, items[index]!]
        publishCollection(Object.freeze(items), value.selectedId)
      },
    }
  }
  return field
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneValue))
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)])))
  }
  return value
}
