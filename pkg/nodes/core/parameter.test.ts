import {describe, expect, test} from "bun:test"
import {
  Parameter,
  type NodeJsonValue,
} from "./parameter.ts"

describe("live Node Parameter", () => {
  test("owns deeply immutable value and presentation data", () => {
    const initial = {vector: [1, 2, 3], nested: {enabled: true}}
    const presentation = {field: {kind: "vector", label: "Position"}}
    const parameter = new Parameter("position", initial, presentation)

    initial.vector[0] = 99
    initial.nested.enabled = false
    presentation.field.label = "Changed outside"

    expect(parameter.value).toEqual({vector: [1, 2, 3], nested: {enabled: true}})
    expect(parameter.presentation).toEqual({field: {kind: "vector", label: "Position"}})
    expect(Object.isFrozen(parameter.value)).toBeTrue()
    expect(Object.isFrozen(parameter.value.vector)).toBeTrue()
    expect(Object.isFrozen(parameter.value.nested)).toBeTrue()
    expect(Object.isFrozen(parameter.presentation)).toBeTrue()
    expect(Object.isFrozen(parameter.presentation.field)).toBeTrue()
  })

  test("publishes one revision only for a structurally different value", () => {
    const parameter = new Parameter<readonly number[], {fieldKind: string}>(
      "rotation",
      [0, 45, 90],
      {fieldKind: "rotation"},
    )
    const revisions: number[] = []
    const unsubscribe = parameter.subscribe(() => revisions.push(parameter.revision))

    expect(parameter.set([0, 45, 90])).toBeFalse()
    expect(parameter.revision).toBe(0)
    expect(parameter.set([10, 20, 30])).toBeTrue()
    expect(parameter.value).toEqual([10, 20, 30])
    expect(parameter.revision).toBe(1)
    expect(revisions).toEqual([1])

    unsubscribe()
    unsubscribe()
    expect(parameter.set([30, 20, 10])).toBeTrue()
    expect(revisions).toEqual([1])
  })

  test("produces a frozen JSON snapshot with exact generic metadata", () => {
    const parameter = new Parameter<number, {field: string; limits: {minimum: number; maximum: number}}>("iterations", 3, {
      field: "integer",
      limits: {minimum: 0, maximum: 100},
    })
    parameter.set(4)

    const snapshot = parameter.snapshot()
    expect(snapshot).toEqual({
      id: "iterations",
      revision: 1,
      value: 4,
      presentation: {field: "integer", limits: {minimum: 0, maximum: 100}},
    })
    expect(Object.isFrozen(snapshot)).toBeTrue()
    expect(JSON.parse(JSON.stringify(parameter))).toEqual(snapshot)
  })

  test("rejects identifiers and runtime values that cannot form exact JSON", () => {
    expect(() => new Parameter(" ", 1)).toThrow("Parameter id must be non-empty")
    expect(() => new Parameter("infinite", Number.POSITIVE_INFINITY)).toThrow("finite numbers")
    expect(() => new Parameter("date", new Date() as unknown as NodeJsonValue)).toThrow("plain objects")

    const cyclic: {self?: unknown} = {}
    cyclic.self = cyclic
    expect(() => new Parameter("cyclic", cyclic as NodeJsonValue)).toThrow("must not contain cycles")
  })

  test("notifies every subscriber before reporting listener failures", () => {
    const parameter = new Parameter<number>("value", 1)
    const revisions: number[] = []
    parameter.subscribe(() => { throw new Error("listener failed") })
    parameter.subscribe(() => { revisions.push(parameter.revision) })

    expect(() => parameter.set(2)).toThrow(AggregateError)
    expect(parameter.value).toBe(2)
    expect(parameter.revision).toBe(1)
    expect(revisions).toEqual([1])
  })
})
