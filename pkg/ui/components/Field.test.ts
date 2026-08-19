import {describe, expect, test} from "bun:test"
import {
  FIELD_KINDS,
  fieldColorToHex,
  measureFieldHeight,
  nextEnumFieldValue,
  normalizeFieldColor,
  normalizeMatrixFieldValue,
  normalizeNumberFieldValue,
  normalizeVectorFieldValue,
  parseFieldColor,
  type FieldDefinition,
} from "./Field.ts"

describe("universal UI fields", () => {
  test("publishes node-independent field kinds", () => {
    expect(FIELD_KINDS).toEqual([
      "text",
      "number",
      "boolean",
      "enum",
      "color",
      "vector",
      "rotation",
      "matrix",
      "reference",
      "readonly",
    ])
  })

  test("normalizes finite integer, float, range and step contracts", () => {
    expect(normalizeNumberFieldValue(3.1415927)).toBe(3.141593)
    expect(normalizeNumberFieldValue(7.8, {numberKind: "integer"})).toBe(8)
    expect(normalizeNumberFieldValue(13, {min: 0, max: 10})).toBe(10)
    expect(normalizeNumberFieldValue(0.74, {min: 0, max: 1, step: 0.25})).toBe(0.75)
    expect(normalizeNumberFieldValue(Number.NaN, {min: 2})).toBe(2)
  })

  test("cycles stable enum values in both directions", () => {
    const options = [
      {value: "one", label: "One"},
      {value: "two", label: "Two"},
      {value: "three", label: "Three"},
    ]
    expect(nextEnumFieldValue("one", options)).toBe("two")
    expect(nextEnumFieldValue("one", options, -1)).toBe("three")
    expect(nextEnumFieldValue("missing", options)).toBe("two")
    expect(nextEnumFieldValue("missing", [])).toBe("missing")
  })

  test("round-trips normalized RGBA hex values", () => {
    const color = normalizeFieldColor({r: 1.2, g: -1, b: 0.5, a: 0.25})
    expect(color).toEqual({r: 1, g: 0, b: 0.5, a: 0.25})
    expect(fieldColorToHex(color)).toBe("#FF008040")
    expect(parseFieldColor("#FF008040")).toEqual({r: 1, g: 0, b: 128 / 255, a: 64 / 255})
    expect(parseFieldColor("336699")).toEqual({r: 0.2, g: 0.4, b: 0.6, a: 1})
    expect(parseFieldColor("bad")).toBeNull()
  })

  test("normalizes vector dimensions and square matrices", () => {
    expect(normalizeVectorFieldValue([1, 2], 4)).toEqual([1, 2, 0, 0])
    expect(normalizeVectorFieldValue([1.2, 2.8, 9], 3, {step: 1, min: 0})).toEqual([1, 3, 9])
    expect(normalizeMatrixFieldValue([[2]])).toEqual([[2, 0], [0, 1]])
    expect(normalizeMatrixFieldValue([])).toEqual([[1, 0], [0, 1]])
  })

  test("measures every discriminated field kind", () => {
    const fields: FieldDefinition[] = [
      {id: "text", label: "Text", kind: "text", value: "A"},
      {id: "number", label: "Number", kind: "number", value: 1},
      {id: "slider", label: "Slider", kind: "number", presentation: "slider", value: 1, max: 2},
      {id: "boolean", label: "Boolean", kind: "boolean", value: true},
      {id: "enum", label: "Enum", kind: "enum", value: "a", options: [{value: "a", label: "A"}]},
      {id: "color", label: "Color", kind: "color", value: {r: 1, g: 1, b: 1, a: 1}},
      {id: "vector", label: "Vector", kind: "vector", value: [1, 2, 3]},
      {id: "rotation", label: "Rotation", kind: "rotation", value: [0, 0, 0]},
      {id: "matrix", label: "Matrix", kind: "matrix", value: [[1, 0], [0, 1]]},
      {id: "reference", label: "Reference", kind: "reference", value: null},
      {id: "readonly", label: "Readonly", kind: "readonly", value: "value"},
    ]
    expect(fields.map(measureFieldHeight).every((height) => height > 0)).toBeTrue()
    expect(measureFieldHeight(fields[2]!)).toBeGreaterThan(measureFieldHeight(fields[1]!))
  })
})
