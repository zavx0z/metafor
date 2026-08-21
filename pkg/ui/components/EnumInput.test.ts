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
  EnumInput,
  findEnumInputOption,
  nextEnumInputValue,
  type EnumInputOption,
  type EnumInputProps,
} from "./EnumInput.ts"
import {
  Field,
  nextEnumFieldValue,
  type EnumFieldDefinition,
} from "./Field.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type CenteredTextCall = Parameters<UiSurface["drawTextCentered"]>
type ImageCall = Parameters<UiSurface["drawImage"]>
type HitCall = Parameters<UiSurface["hit"]>
type ShadowCall = Parameters<UiSurface["drawRoundedShadow"]>
type RectCall = Parameters<UiSurface["drawRect"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []
  readonly images: ImageCall[] = []
  readonly hits: HitCall[] = []
  readonly shadows: ShadowCall[] = []
  readonly rects: RectCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override drawText(...args: TextCall): number {
    this.texts.push(args)
    return 0
  }

  override drawTextCentered(...args: CenteredTextCall): number {
    this.centeredTexts.push(args)
    return 0
  }

  override drawImage(...args: ImageCall): void {
    this.images.push(args)
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  override drawRoundedShadow(...args: ShadowCall): void { this.shadows.push(args) }

  override drawRect(...args: RectCall): void { this.rects.push(args) }

  override pushClip(): void {}

  override popClip(): void {}

  protected render(): void {}
}

const options = Object.freeze([
  Object.freeze({value: "add", label: "Add", description: "Сложить значения"}),
  Object.freeze({value: "multiply", label: "Multiply", description: "Умножить значения"}),
  Object.freeze({value: "subtract", label: "Subtract"}),
]) satisfies readonly EnumInputOption[]

const enumProps = (
  values: string[],
  extra: Partial<EnumInputProps> = {},
): EnumInputProps => ({
  value: "multiply",
  options,
  onChange: (value) => values.push(value),
  ...extra,
})

const trigger = (hit: HitCall | undefined): void => {
  expect(hit).toBeDefined()
  hit![4]()
}

describe("public EnumInput", () => {
  test("owns stable option lookup and preserves the established cycle contract", () => {
    expect(findEnumInputOption("multiply", options)).toBe(options[1])
    expect(findEnumInputOption("missing", options)).toBeUndefined()
    expect(nextEnumInputValue("add", options)).toBe("multiply")
    expect(nextEnumInputValue("add", options, -1)).toBe("subtract")
    expect(nextEnumInputValue("missing", options)).toBe("multiply")
    expect(nextEnumInputValue("missing", [])).toBe("missing")
    expect(nextEnumFieldValue).toBe(nextEnumInputValue)
    expect(options.map(({value}) => value)).toEqual(["add", "multiply", "subtract"])
  })

  test("passes stable options to Elements dropdown and publishes only the chosen value", () => {
    const values: string[] = []
    const surface = new RecordingSurface()
    EnumInput(surface, 4, 6, 120, 28, enumProps(values))

    expect(surface.texts.map(([text]) => text)).toEqual(["Multiply"])
    const hitOptions = surface.hits[0]?.[5]
    expect(typeof hitOptions === "object" ? hitOptions.tooltip?.label : undefined).toBe("Умножить значения")
    trigger(surface.hits[0])
    surface.roundedRects.length = 0
    surface.texts.length = 0
    surface.images.length = 0
    surface.hits.length = 0
    EnumInput(surface, 4, 6, 120, 28, enumProps(values))
    expect(surface.texts.map(([text]) => text)).toEqual(["Multiply", "Add", "Multiply", "Subtract"])
    trigger(surface.hits[3])
    expect(values).toEqual(["subtract"])
  })

  test("owns selected and per-option icons while keeping one aligned mixed-option column", () => {
    const surface = new RecordingSurface()
    const iconOptions = Object.freeze([
      Object.freeze({value: "add", label: "Add", iconSrc: "icon:add"}),
      Object.freeze({value: "multiply", label: "Multiply"}),
      Object.freeze({value: "subtract", label: "Subtract", iconSrc: "icon:subtract"}),
    ]) satisfies readonly EnumInputOption[]
    const props: EnumInputProps = {
      value: "add",
      options: iconOptions,
      popupLabel: "Operation",
    }
    EnumInput(surface, 4, 6, 120, 28, props)
    trigger(surface.hits[0])
    surface.texts.length = 0
    surface.images.length = 0
    surface.hits.length = 0
    EnumInput(surface, 4, 6, 120, 28, props)

    expect(surface.texts.map(([text]) => text)).toEqual([
      "Add",
      "Operation",
      "Add",
      "Multiply",
      "Subtract",
    ])
    expect(surface.images.map(([src]) => src).filter((src) => src.startsWith("icon:"))).toEqual([
      "icon:add",
      "icon:add",
      "icon:subtract",
    ])
    const optionLabels = surface.texts.slice(2)
    expect(optionLabels.map(([, x]) => x)).toEqual([
      optionLabels[0]![1],
      optionLabels[0]![1],
      optionLabels[0]![1],
    ])
  })

  test("passes the semantic Field label as popup header without Node-owned copy", () => {
    const surface = new RecordingSurface()
    const definition: EnumFieldDefinition = {
      id: "operation",
      label: "Operation",
      compactLabel: "hidden",
      kind: "enum",
      value: "multiply",
      options,
    }
    Field(surface, 0, 0, 120, definition, {density: "compact"})
    trigger(surface.hits[0])
    surface.texts.length = 0
    surface.hits.length = 0
    Field(surface, 0, 0, 120, definition, {density: "compact"})

    expect(surface.texts.map(([text]) => text)).toEqual([
      "Multiply",
      "Operation",
      "Add",
      "Multiply",
      "Subtract",
    ])
    expect(surface.hits).toHaveLength(4)
  })

  test("keeps an invalid controlled value observable while retaining legacy cycle behavior", () => {
    const values: string[] = []
    const surface = new RecordingSurface()
    EnumInput(surface, 0, 0, 120, 28, enumProps(values, {value: "missing"}))

    expect(surface.texts.map(([text]) => text)).toEqual(["missing"])
    trigger(surface.hits[0])
    surface.hits.length = 0
    EnumInput(surface, 0, 0, 120, 28, enumProps(values, {value: "missing"}))
    trigger(surface.hits[2])
    expect(values).toEqual(["multiply"])
  })

  test("renders inline expanded choices and publishes only the exact chosen value", () => {
    const values: string[] = []
    const surface = new RecordingSurface()
    EnumInput(surface, 4, 6, 128, 28, enumProps(values, {presentation: "expanded"}))

    const expandedRects = surface.roundedRects
      .filter((call) => call[4].z !== Z.ELEMENT - 0.01)
      .map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))
    expect(expandedRects).toHaveLength(3)
    expect(expandedRects[0]).toEqual({x: 4, y: 9, w: 122 / 3, h: uiShapeMetrics.controlHeight})
    expect(expandedRects[1]).toEqual({x: 4 + 122 / 3 + uiShapeMetrics.tightGap, y: 9, w: 122 / 3, h: uiShapeMetrics.controlHeight})
    expect(expandedRects[2]).toEqual({x: 4 + (122 / 3 + uiShapeMetrics.tightGap) * 2, y: 9, w: 122 / 3, h: uiShapeMetrics.controlHeight})
    expect(surface.centeredTexts.map(([text]) => text)).toEqual(["Add", "Multiply", "Subtract"])
    trigger(surface.hits[2])
    expect(values).toEqual(["subtract"])

    const compact = new RecordingSurface()
    EnumInput(compact, 4, 6, 126, 22, enumProps([], {
      density: "compact",
      presentation: "expanded",
    }))
    const compactChrome = compact.roundedRects.filter((call) => call[4].z !== Z.ELEMENT - 0.01)
    expect(compactChrome.map((call) => call[4].fill)).toEqual([
      blenderRgba8ToColor(resolveWidgetColors("toggle").inner),
      blenderRgba8ToColor(resolveWidgetColors("toggle", {selected: true}).inner),
      blenderRgba8ToColor(resolveWidgetColors("toggle").inner),
    ])
    expect(compactChrome.map((call) => call[4].border)).toEqual([
      blenderRgba8ToColor(resolveWidgetColors("toggle").outline),
      blenderRgba8ToColor(resolveWidgetColors("toggle", {selected: true}).outline),
      blenderRgba8ToColor(resolveWidgetColors("toggle").outline),
    ])
  })

  test("shows explicit exceptional states without publishing a hidden change", () => {
    for (const [extra, label] of [
      [{options: []}, "No Items"],
      [{state: "undefined"}, "Menu Undefined"],
      [{state: "error"}, "Menu Error"],
    ] as const) {
      const values: string[] = []
      const surface = new RecordingSurface()
      EnumInput(surface, 0, 0, 120, 28, enumProps(values, extra))

      expect(surface.texts.map(([text]) => text)).toEqual([label])
      for (const hit of surface.hits) trigger(hit)
      expect(values).toEqual([])
    }
  })

  test("blocks cycle and expanded mutation when disabled or read-only", () => {
    for (const presentation of ["cycle", "expanded"] as const) {
      for (const state of [{disabled: true}, {readOnly: true}] as const) {
        const values: string[] = []
        const surface = new RecordingSurface()
        EnumInput(surface, 0, 0, 128, 22, enumProps(values, {
          density: "compact",
          presentation,
          ...state,
        }))
        for (const hit of surface.hits) trigger(hit)
        expect(values).toEqual([])
      }
    }
  })

  test("uses one Elements-owned cycle geometry and delegates both Field densities", () => {
    const standaloneValues: string[] = []
    const regularValues: string[] = []
    const compactValues: string[] = []

    const regular = new RecordingSurface()
    EnumInput(regular, 4, 6, 120, 28, enumProps(standaloneValues))
    expect(regular.roundedRects.filter((call) => call[4].z !== Z.ELEMENT - 0.01).map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 9, w: 120, h: uiShapeMetrics.controlHeight},
    ])

    const compact = new RecordingSurface()
    EnumInput(compact, 4, 6, 120, 22, enumProps([], {density: "compact"}))
    expect(compact.roundedRects.filter((call) => call[4].z !== Z.ELEMENT - 0.01).map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 120, h: uiShapeMetrics.controlHeight},
    ])
    expect(regular.roundedRects[0]?.[4].radius).toBe(uiShapeMetrics.lowRadius)
    expect(compact.roundedRects[0]?.[4].radius).toBe(uiShapeMetrics.lowRadius)
    expect(compact.roundedRects[0]?.[4].fill).toEqual(blenderRgba8ToColor(resolveWidgetColors("menu").inner))
    expect(compact.roundedRects[0]?.[4].border).toEqual(blenderRgba8ToColor(resolveWidgetColors("menu").outline))
    expect(regular.roundedRects[0]?.[4].fill).toEqual(compact.roundedRects[0]?.[4].fill)
    expect(regular.roundedRects[0]?.[4].border).toEqual(compact.roundedRects[0]?.[4].border)

    const definition = (values: string[]): EnumFieldDefinition => ({
      id: "operation",
      label: "Operation",
      kind: "enum",
      value: "multiply",
      options,
      onChange: (value) => values.push(value),
    })
    const regularField = new RecordingSurface()
    Field(regularField, 0, 0, 120, definition(regularValues))
    trigger(regularField.hits[0])
    regularField.hits.length = 0
    Field(regularField, 0, 0, 120, definition(regularValues))
    trigger(regularField.hits[3])
    const compactField = new RecordingSurface()
    Field(compactField, 0, 0, 120, definition(compactValues), {density: "compact"})
    trigger(compactField.hits[0])
    compactField.hits.length = 0
    Field(compactField, 0, 0, 120, definition(compactValues), {density: "compact"})
    trigger(compactField.hits[3])
    trigger(regular.hits[0])
    regular.hits.length = 0
    EnumInput(regular, 4, 6, 120, 28, enumProps(standaloneValues))
    trigger(regular.hits[3])

    expect(regularValues).toEqual(["subtract"])
    expect(compactValues).toEqual(regularValues)
    expect(standaloneValues).toEqual(regularValues)
  })
})
