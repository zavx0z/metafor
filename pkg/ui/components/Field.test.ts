import {describe, expect, test} from "bun:test"
import {
  blenderRgba8ToColor,
  resolveWidgetColors,
  uiShapeMetrics,
  Z,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {
  Field,
  measureFieldLayout,
  FIELD_KINDS,
  fieldColorToHex,
  measureFieldHeight,
  nextEnumFieldValue,
  normalizeFieldColor,
  normalizeIntegerFieldValue,
  normalizeMatrixFieldValue,
  normalizeNumberFieldValue,
  normalizeVectorFieldValue,
  parseFieldColor,
  type CollectionFieldDefinition,
  type FieldDefinition,
  type RotationFieldDefinition,
} from "./Field.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  override drawText(...args: TextCall): number { this.texts.push(args); return 0 }
  override measureText(value: string, _fontPx?: number): number { return value.length * 6 }
  override hit(...args: HitCall): void { this.hits.push(args) }
  override pushClip(): void {}
  override popClip(): void {}
  protected render(): void {}
}

describe("universal UI fields", () => {
  test("publishes one grouped label/control layout with intrinsic Vector width", () => {
    const rotation: RotationFieldDefinition = {id: "rotation-layout", label: "Rotation", kind: "rotation", value: [0, 45, 90]}
    expect(measureFieldLayout(rotation, {density: "compact"})).toEqual({
      height: 91,
      labelRowHeight: 22,
      labelControlGap: 3,
      controlOffsetY: 25,
      controlHeight: 66,
      intrinsicWidth: 146,
    })
    expect(measureFieldLayout({...rotation, compactLabel: "hidden"}, {density: "compact"})).toEqual({
      height: 66,
      labelRowHeight: 0,
      labelControlGap: 0,
      controlOffsetY: 0,
      controlHeight: 66,
      intrinsicWidth: 146,
    })
  })
  test("publishes node-independent field kinds", () => {
    expect(FIELD_KINDS).toEqual([
      "text",
      "number",
      "integer",
      "boolean",
      "enum",
      "color",
      "vector",
      "rotation",
      "matrix",
      "reference",
      "collection",
      "path",
      "readonly",
    ])
  })

  test("maps canonical integer Field to one labeled IntegerInput control", () => {
    const regular = new RecordingSurface()
    Field(regular, 0, 0, 200, {id: "iterations", label: "Iterations", kind: "integer", value: 3})
    expect(regular.texts.map(([value]) => value)).toEqual(["3", "Iterations"])
    expect(regular.hits).toHaveLength(1)

    const compactHidden = new RecordingSurface()
    Field(compactHidden, 0, 0, 146, {
      id: "iterations-hidden",
      label: "Iterations",
      compactLabel: "hidden",
      kind: "integer",
      value: 3,
    }, {density: "compact"})
    expect(compactHidden.texts.map(([value]) => value)).toEqual(["3"])
  })

  test("allows owner-scoped render keys without changing semantic field ids", () => {
    const field: FieldDefinition = {id: "value", key: "node-a:value", label: "Value", kind: "number", value: 1}
    expect(field.id).toBe("value")
    expect(field.key).toBe("node-a:value")
  })

  test("keeps a semantic label when compact presentation hides it", () => {
    const field: FieldDefinition = {
      id: "dimensions",
      label: "Dimensions",
      compactLabel: "hidden",
      kind: "enum",
      value: "3d",
      options: [{value: "3d", label: "3D"}],
    }
    expect(field.label).toBe("Dimensions")
    expect(field.compactLabel).toBe("hidden")
    expect(measureFieldHeight(field, {density: "compact"})).toBe(22)
  })

  test("uses one dense scalar row compositor for regular and compact Fields", () => {
    const definition: FieldDefinition = {
      id: "mass",
      label: "Mass",
      kind: "number",
      value: 1,
      onChange() {},
    }
    const regular = new RecordingSurface()
    expect(Field(regular, 0, 10, 200, definition)).toBe(uiShapeMetrics.rowHeight)
    expect(regular.roundedRects.filter((call) => call[4].z !== Z.ELEMENT - 0.01)).toHaveLength(1)
    expect(regular.hits).toHaveLength(1)
    expect(regular.roundedRects[0]?.[1]).toBe(11)
    expect(regular.roundedRects[0]?.[2]).toBeCloseTo(116.4)
    expect(regular.roundedRects[0]?.[3]).toBe(uiShapeMetrics.controlHeight)

    const compact = new RecordingSurface()
    expect(Field(compact, 0, 10, 200, definition, {density: "compact"})).toBe(uiShapeMetrics.controlHeight)
    expect(compact.roundedRects.filter((call) => call[4].z !== Z.ELEMENT - 0.01)).toHaveLength(1)
    expect(compact.hits).toHaveLength(1)
    expect(compact.roundedRects[0]?.[2]).toBeCloseTo(116.4)
    expect(compact.roundedRects[0]?.[3]).toBe(uiShapeMetrics.controlHeight)
  })

  test("keeps the regular number slider visual and hit inside its measured dense row", () => {
    const definition: FieldDefinition = {
      id: "gain",
      label: "Gain",
      kind: "number",
      presentation: "slider",
      value: 0.5,
      min: 0,
      max: 1,
      onChange() {},
    }
    const surface = new RecordingSurface()
    const y = 10
    const height = Field(surface, 0, y, 200, definition)
    expect(height).toBe(uiShapeMetrics.rowHeight)
    for (const [, rectY, , rectHeight] of surface.roundedRects) {
      expect(rectY).toBeGreaterThanOrEqual(y)
      expect(rectY + rectHeight).toBeLessThanOrEqual(y + height)
    }
    expect(surface.hits).toHaveLength(1)
    expect(surface.hits[0]?.slice(1, 4)).toEqual([11, 200, uiShapeMetrics.controlHeight])
  })

  test("keeps explicit switch presentation rectangular inside the dense boolean row", () => {
    const surface = new RecordingSurface()
    const width = 200
    const height = Field(surface, 0, 10, width, {
      id: "enabled",
      label: "Enabled",
      kind: "boolean",
      value: true,
      presentation: "switch",
      onChange() {},
    })
    expect(height).toBe(uiShapeMetrics.rowHeight)
    expect(surface.hits).toHaveLength(1)
    expect(surface.roundedRects.filter((call) => call[4].z !== Z.ELEMENT - 0.01)).toHaveLength(1)
    expect(surface.roundedRects[0]?.[4].radius).toBe(uiShapeMetrics.lowRadius)
    const [hitX, , hitWidth] = surface.hits[0]!
    expect(hitX + hitWidth).toBeLessThanOrEqual(width)
  })

  test("uses the Blender option Checkbox for the default boolean presentation", () => {
    const surface = new RecordingSurface()
    Field(surface, 0, 0, 200, {
      id: "enabled-default",
      label: "Enabled",
      kind: "boolean",
      value: true,
      onChange() {},
    })
    const colors = resolveWidgetColors("option", {selected: true})
    expect(surface.roundedRects).toHaveLength(1)
    expect(surface.roundedRects[0]?.[4]).toMatchObject({
      fill: blenderRgba8ToColor(colors.inner),
      border: blenderRgba8ToColor(colors.outline),
    })
  })

  test("normalizes finite integer, float, range and step contracts", () => {
    expect(normalizeNumberFieldValue(3.1415927)).toBe(3.141593)
    expect(normalizeNumberFieldValue(7.8, {numberKind: "integer"})).toBe(8)
    expect(normalizeNumberFieldValue(13, {min: 0, max: 10})).toBe(10)
    expect(normalizeNumberFieldValue(0.74, {min: 0, max: 1, step: 0.25})).toBe(0.75)
    expect(normalizeNumberFieldValue(Number.NaN, {min: 2})).toBe(2)
    expect(normalizeIntegerFieldValue(3.8)).toBe(4)
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
      {id: "integer", label: "Integer", kind: "integer", value: 3},
      {id: "slider", label: "Slider", kind: "number", presentation: "slider", value: 1, max: 2},
      {id: "boolean", label: "Boolean", kind: "boolean", value: true},
      {id: "enum", label: "Enum", kind: "enum", value: "a", options: [{value: "a", label: "A"}]},
      {id: "color", label: "Color", kind: "color", value: {r: 1, g: 1, b: 1, a: 1}},
      {id: "vector", label: "Vector", kind: "vector", value: [1, 2, 3]},
      {id: "rotation", label: "Rotation", kind: "rotation", value: [0, 0, 0]},
      {id: "matrix", label: "Matrix", kind: "matrix", value: [[1, 0], [0, 1]]},
      {id: "reference", label: "Reference", kind: "reference", value: null},
      {id: "collection", label: "Collection", kind: "collection", items: [], selectedId: null},
      {id: "path", label: "Path", kind: "path", value: "/tmp/value"},
      {id: "readonly", label: "Readonly", kind: "readonly", value: "value"},
    ]
    expect(fields.map((field) => measureFieldHeight(field)).every((height) => height > 0)).toBeTrue()
    expect(measureFieldHeight(fields[1]!)).toBe(uiShapeMetrics.rowHeight)
    expect(measureFieldHeight(fields[2]!)).toBe(uiShapeMetrics.rowHeight)
    expect(measureFieldHeight(fields[3]!)).toBe(uiShapeMetrics.rowHeight)
    expect(measureFieldHeight(fields[4]!)).toBe(uiShapeMetrics.rowHeight)
    expect(measureFieldHeight(fields[1]!, {density: "compact"})).toBe(22)
    expect(measureFieldHeight(fields[2]!, {density: "compact"})).toBe(22)
    expect(measureFieldHeight(fields[3]!, {density: "compact"})).toBe(22)
    expect(measureFieldHeight(fields[7]!, {density: "compact"})).toBe(91)
    expect(measureFieldHeight(fields[9]!, {density: "compact"})).toBe(69)
    const collection = fields[11]! as CollectionFieldDefinition
    expect(measureFieldHeight(collection)).toBe(97)
    expect(measureFieldHeight(collection, {density: "compact"})).toBe(97)
    expect(measureFieldHeight({...collection, compactLabel: "hidden"}, {density: "compact"})).toBe(72)
    expect(measureFieldHeight({...collection, visibleRows: 1})).toBe(72)
    expect(measureFieldHeight({...collection, visibleRows: 1}, {density: "compact"})).toBe(72)
    expect(measureFieldHeight({...collection, visibleRows: 1, compactLabel: "hidden"}, {density: "compact"})).toBe(47)
    const reorder = {...collection, visibleRows: 1, onMove: () => {}}
    expect(measureFieldHeight(reorder)).toBe(122)
    expect(measureFieldHeight(reorder, {density: "compact"})).toBe(122)
    expect(measureFieldHeight({...reorder, compactLabel: "hidden"}, {density: "compact"})).toBe(97)
    expect(measureFieldHeight(fields[12]!)).toBe(uiShapeMetrics.rowHeight)
    expect(measureFieldHeight(fields[12]!, {density: "compact"})).toBe(22)
  })
})
