import {describe, expect, test} from "bun:test"
import {
  JSON_PATCH_LIMITS,
  JsonPatchError,
  applyJsonPatch,
  encodeJsonPointerToken,
  type JsonPatchOperation,
} from "./json-patch.ts"
import type {NodeJsonValue} from "./parameter.ts"

describe("neutral JSON Patch leaf", () => {
  test("encodes and strictly decodes RFC 6901 tokens", () => {
    expect(encodeJsonPointerToken("a~/b")).toBe("a~0~1b")
    const source = {
      "a/b": {"m~n": 1},
      "~1": "escaped in the RFC order",
    }
    expect(applyJsonPatch(source, [
      {op: "replace", path: "/a~1b/m~0n", value: 2},
      {op: "test", path: "/~01", value: "escaped in the RFC order"},
    ])).toEqual({
      "a/b": {"m~n": 2},
      "~1": "escaped in the RFC order",
    })

    for (const path of ["not-a-pointer", "/bad~", "/bad~2escape"]) {
      expectPatchError(() => applyJsonPatch(source, [{op: "test", path, value: null}]), "invalid_pointer")
    }
  })

  test("applies add, remove, replace and structural test to object members", () => {
    const result = applyJsonPatch({a: 1, nested: {left: true}}, [
      {op: "add", path: "/b", value: [1, 2]},
      {op: "add", path: "/a", value: 2},
      {op: "replace", path: "/nested", value: {right: false}},
      {op: "test", path: "/nested", value: {right: false}},
      {op: "remove", path: "/b"},
    ])
    expect(result).toEqual({a: 2, nested: {right: false}})
    expect(Object.isFrozen(result)).toBeTrue()
    expect(Object.isFrozen((result as {nested: object}).nested)).toBeTrue()

    expectPatchError(
      () => applyJsonPatch({a: 1}, [{op: "test", path: "/a", value: 2}]),
      "test_failed",
      0,
      "/a",
    )
  })

  test("supports root add, replace and test but rejects root remove", () => {
    expect(applyJsonPatch({before: true}, [
      {op: "add", path: "", value: [1, 2]},
      {op: "test", path: "", value: [1, 2]},
      {op: "replace", path: "", value: {after: true}},
    ])).toEqual({after: true})

    expectPatchError(
      () => applyJsonPatch({before: true}, [{op: "remove", path: ""}]),
      "invalid_pointer",
    )
  })

  test("uses canonical safe array indices and '-' only for add", () => {
    const result = applyJsonPatch({items: [0, 2]}, [
      {op: "add", path: "/items/1", value: 1},
      {op: "add", path: "/items/-", value: 3},
      {op: "replace", path: "/items/0", value: 9},
      {op: "test", path: "/items/2", value: 2},
      {op: "remove", path: "/items/2"},
    ])
    expect(result).toEqual({items: [9, 1, 3]})

    for (const token of ["00", "01", "+1", "-1", "1.0", "9007199254740992"]) {
      expectPatchError(
        () => applyJsonPatch({items: [1]}, [{op: "test", path: `/items/${token}`, value: 1}]),
        "invalid_array_index",
      )
    }
    expectPatchError(
      () => applyJsonPatch({items: [1]}, [{op: "replace", path: "/items/-", value: 2}]),
      "invalid_array_index",
    )
    expectPatchError(
      () => applyJsonPatch({items: [1]}, [{op: "add", path: "/items/2", value: 2}]),
      "path_not_found",
    )
  })

  test("traverses only own properties", () => {
    expectPatchError(
      () => applyJsonPatch({}, [{op: "test", path: "/toString", value: "inherited"}]),
      "path_not_found",
    )
    expectPatchError(
      () => applyJsonPatch({items: [{value: 1}]}, [{op: "test", path: "/items/1/value", value: 1}]),
      "path_not_found",
    )
  })

  test("clones before applying and never publishes partial failure", () => {
    const source = {nested: {value: 1}, items: [1, 2]}
    const replacement = {value: 2}
    const result = applyJsonPatch(source, [{op: "replace", path: "/nested", value: replacement}])
    source.nested.value = 7
    replacement.value = 9
    expect(result).toEqual({nested: {value: 2}, items: [1, 2]})

    const atomicSource = {first: 1, second: 2}
    expectPatchError(() => applyJsonPatch(atomicSource, [
      {op: "replace", path: "/first", value: 10},
      {op: "test", path: "/second", value: 20},
    ]), "test_failed", 1, "/second")
    expect(atomicSource).toEqual({first: 1, second: 2})
  })

  test("uses structural JSON equality independent of object key order", () => {
    expect(applyJsonPatch({value: {a: 1, b: [2, 3]}}, [{
      op: "test",
      path: "/value",
      value: {b: [2, 3], a: 1},
    }])).toEqual({value: {a: 1, b: [2, 3]}})
    expectPatchError(
      () => applyJsonPatch({value: [2, 3]}, [{op: "test", path: "/value", value: [3, 2]}]),
      "test_failed",
    )
  })

  test("rejects non-JSON, non-finite, cyclic, sparse and accessor values", () => {
    expectPatchError(
      () => applyJsonPatch(Number.POSITIVE_INFINITY as NodeJsonValue, []),
      "invalid_json",
    )
    expectPatchError(
      () => applyJsonPatch({}, [{op: "add", path: "/value", value: Number.NaN}]),
      "invalid_json",
    )
    expectPatchError(
      () => applyJsonPatch(new Date() as unknown as NodeJsonValue, []),
      "invalid_json",
    )

    const cyclic: {self?: unknown} = {}
    cyclic.self = cyclic
    expectPatchError(() => applyJsonPatch(cyclic as NodeJsonValue, []), "invalid_json")

    const sparse = new Array<NodeJsonValue>(2)
    sparse[0] = 1
    expectPatchError(() => applyJsonPatch(sparse, []), "invalid_json")

    const accessor = {}
    Object.defineProperty(accessor, "value", {enumerable: true, get: () => 1})
    expectPatchError(() => applyJsonPatch(accessor as NodeJsonValue, []), "invalid_json")
  })

  test("rejects malformed operations before applying any of them", () => {
    const invalid = [
      {op: "copy", path: "/a", value: 1},
      {op: "remove", path: "/a", value: 1},
      {op: "add", path: "/a"},
      {op: "add", path: "/a", value: 1, extra: true},
    ]
    for (const operation of invalid) {
      expectPatchError(
        () => applyJsonPatch({a: 1}, [operation] as unknown as readonly JsonPatchOperation[]),
        "invalid_patch",
      )
    }

    const sparseOperations = new Array<JsonPatchOperation>(1)
    expectPatchError(() => applyJsonPatch({}, sparseOperations), "invalid_patch")
  })

  test("enforces operation, path and document depth bounds", () => {
    const operations = Array.from({length: JSON_PATCH_LIMITS.operations + 1}, () => (
      {op: "test", path: "", value: null} as const
    ))
    expectPatchError(() => applyJsonPatch(null, operations), "limit_exceeded")

    const longPath = `/${"x".repeat(JSON_PATCH_LIMITS.pathLength)}`
    expectPatchError(() => applyJsonPatch({}, [{op: "add", path: longPath, value: 1}]), "limit_exceeded")

    const deepPath = `/${Array.from({length: JSON_PATCH_LIMITS.depth + 1}, () => "x").join("/")}`
    expectPatchError(() => applyJsonPatch({}, [{op: "add", path: deepPath, value: 1}]), "limit_exceeded")

    let deep: NodeJsonValue = 0
    for (let index = 0; index <= JSON_PATCH_LIMITS.depth; index += 1) deep = {next: deep}
    expectPatchError(() => applyJsonPatch(deep, []), "limit_exceeded")
  })

  test("edits prototype-sensitive own keys without traversing or polluting prototypes", () => {
    expect(({} as {polluted?: unknown}).polluted).toBeUndefined()
    const source = JSON.parse(`{
      "__proto__": {"polluted": false},
      "constructor": {"prototype": {"polluted": false}},
      "prototype": {"value": 1}
    }`) as NodeJsonValue
    const result = applyJsonPatch(source, [
      {op: "replace", path: "/__proto__/polluted", value: true},
      {op: "add", path: "/constructor/prototype/safe", value: true},
      {op: "test", path: "/prototype/value", value: 1},
      {op: "add", path: "/prototype/constructor", value: "own"},
    ]) as Record<string, NodeJsonValue>

    expect(Object.hasOwn(result, "__proto__")).toBeTrue()
    expect(Object.hasOwn(result, "constructor")).toBeTrue()
    expect(Object.hasOwn(result, "prototype")).toBeTrue()
    expect((result["__proto__"] as Record<string, NodeJsonValue>)["polluted"]).toBeTrue()
    expect(((result["constructor"] as Record<string, NodeJsonValue>)["prototype"] as Record<string, NodeJsonValue>)["safe"]).toBeTrue()
    expect((result["prototype"] as Record<string, NodeJsonValue>)["constructor"]).toBe("own")

    const added = applyJsonPatch({}, [{op: "add", path: "/__proto__", value: {safe: true}}]) as Record<string, NodeJsonValue>
    expect(Object.hasOwn(added, "__proto__")).toBeTrue()
    expect(added["__proto__"]).toEqual({safe: true})
    expectPatchError(
      () => applyJsonPatch({}, [{op: "add", path: "/constructor/prototype/polluted", value: true}]),
      "path_not_found",
    )
    expect(({} as {polluted?: unknown}).polluted).toBeUndefined()
  })
})

function expectPatchError(
  action: () => unknown,
  code: JsonPatchError["code"],
  operationIndex?: number,
  path?: string,
): void {
  try {
    action()
    throw new Error(`Expected JsonPatchError: ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(JsonPatchError)
    expect(error).toHaveProperty("code", code)
    if (operationIndex !== undefined) expect(error).toHaveProperty("operationIndex", operationIndex)
    if (path !== undefined) expect(error).toHaveProperty("path", path)
  }
}
