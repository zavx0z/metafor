import {describe, expect, test} from "bun:test"
import type {FieldDefinition} from "@ui/components"
import {
  bindNodeFieldValueState,
  createNodeFieldValueState,
  nodeFieldStateKey,
  updateNodeFieldValueState,
  type NodeFieldAction,
} from "./controlled-fields.ts"
import {createCatalogNodeTree} from "./fixtures.ts"

describe("Node playground controlled Field owner", () => {
  test("owns immutable values for every represented mutable Field kind", () => {
    const tree = createCatalogNodeTree()
    const state = createNodeFieldValueState(tree)
    expect(state[nodeFieldStateKey("scalar", "iterations")]).toBe(3)
    expect(state[nodeFieldStateKey("scalar", "operation")]).toBe("multiply")
    expect(state[nodeFieldStateKey("transform", "translation")]).toEqual([1, 2, 3])
    expect(state[nodeFieldStateKey("transform", "rotation")]).toEqual([0, 45, 90])
    expect(state[nodeFieldStateKey("shader", "base-color")]).toEqual({r: 0.15, g: 0.42, b: 0.88, a: 1})
    expect(state[nodeFieldStateKey("asset", "name")]).toBe("Suzanne")
    expect(state[nodeFieldStateKey("asset", "path")]).toBe("/textures/suzanne.png")
    expect(state[nodeFieldStateKey("asset", "resources")]).toEqual({
      items: [
        {id: "suzanne", label: "Suzanne"},
        {id: "cube", label: "Cube"},
      ],
      selectedId: "suzanne",
    })
    expect(state[nodeFieldStateKey("matrix", "matrix-value")]).toEqual([[1, 0], [0, 1]])
    expect(Object.isFrozen(state)).toBeTrue()
    expect(Object.isFrozen(state[nodeFieldStateKey("transform", "rotation")])).toBeTrue()
  })

  test("binds typed callbacks and rebuilds values without renderer-local state", () => {
    const tree = createCatalogNodeTree()
    let state = createNodeFieldValueState(tree)
    const changes: Array<Readonly<{nodeId: string; fieldId: string; value: unknown}>> = []
    const bind = () => bindNodeFieldValueState(tree, state, (nodeId, fieldId, value) => {
      changes.push({nodeId, fieldId, value})
      state = updateNodeFieldValueState(state, nodeId, fieldId, value)
    })

    let controlled = bind()
    const integer = field(controlled, "scalar", "iterations")
    const rotation = field(controlled, "transform", "rotation")
    if (integer.kind !== "integer" || rotation.kind !== "rotation") throw new Error("Unexpected Field kinds")
    integer.onChange?.(7)
    rotation.onChange?.([10, 20, 30])
    controlled = bind()

    const nextInteger = field(controlled, "scalar", "iterations")
    const nextRotation = field(controlled, "transform", "rotation")
    if (nextInteger.kind !== "integer" || nextRotation.kind !== "rotation") throw new Error("Unexpected rebound Field kinds")
    expect(nextInteger.value).toBe(7)
    expect(nextRotation.value).toEqual([10, 20, 30])
    expect(changes).toEqual([
      {nodeId: "scalar", fieldId: "iterations", value: 7},
      {nodeId: "transform", fieldId: "rotation", value: [10, 20, 30]},
    ])
    expect(Object.isFrozen(changes[1]!.value)).toBeTrue()
  })

  test("publishes bounded owner actions without inventing unrelated values", () => {
    const tree = createCatalogNodeTree()
    let state = createNodeFieldValueState(tree)
    const actions: NodeFieldAction[] = []
    const bind = () => bindNodeFieldValueState(
      tree,
      state,
      (nodeId, fieldId, value) => { state = updateNodeFieldValueState(state, nodeId, fieldId, value) },
      (action) => actions.push(action),
    )

    let controlled = bind()
    const path = field(controlled, "asset", "path")
    const reference = field(controlled, "asset", "object")
    const collection = field(controlled, "asset", "resources")
    if (path.kind !== "path" || reference.kind !== "reference" || collection.kind !== "collection") {
      throw new Error("Unexpected inventory Field kinds")
    }
    path.onBrowse?.()
    reference.onActivate?.()
    reference.onPick?.()
    collection.onAdd?.()
    expect(state[nodeFieldStateKey("asset", "path")]).toBe("/textures/suzanne.png")
    expect(state[nodeFieldStateKey("asset", "object")]).toEqual({id: "suzanne", label: "Suzanne", kind: "object"})

    collection.onSelect?.("cube")
    controlled = bind()
    const selected = field(controlled, "asset", "resources")
    if (selected.kind !== "collection") throw new Error("Expected rebound collection")
    selected.onMove?.("cube", "up")
    controlled = bind()
    const moved = field(controlled, "asset", "resources")
    if (moved.kind !== "collection") throw new Error("Expected moved collection")
    moved.onRemove?.("cube")
    reference.onClear?.()

    expect(actions.map(({action}) => action)).toEqual([
      "browse", "activate", "pick", "add", "select", "move-up", "remove", "clear",
    ])
    expect(state[nodeFieldStateKey("asset", "object")]).toBeNull()
    expect(state[nodeFieldStateKey("asset", "resources")]).toEqual({
      items: [{id: "suzanne", label: "Suzanne"}],
      selectedId: null,
    })
  })
})

function field(
  tree: ReturnType<typeof createCatalogNodeTree>,
  nodeId: string,
  fieldId: string,
): FieldDefinition {
  const node = tree.nodes.find(({node}) => node.id === nodeId)?.node
  const candidate = [
    ...(node?.properties ?? []),
    ...(node?.parameters ?? []).map(({field}) => field).filter((value): value is FieldDefinition => value !== undefined),
  ].find(({id}) => id === fieldId)
  if (candidate === undefined) throw new Error(`Missing Field: ${nodeId}/${fieldId}`)
  return candidate
}
