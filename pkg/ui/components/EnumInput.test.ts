import {describe, expect, test} from "bun:test"
import {
  palette,
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
type CenteredTextCall = Parameters<UiSurface["drawTextCentered"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override drawTextCentered(...args: CenteredTextCall): number {
    this.centeredTexts.push(args)
    return 0
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

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

  test("renders the selected cycle label and description and publishes one forward value", () => {
    const values: string[] = []
    const surface = new RecordingSurface()
    EnumInput(surface, 4, 6, 120, 28, enumProps(values))

    expect(surface.centeredTexts.map(([text]) => text)).toEqual(["Multiply"])
    const hitOptions = surface.hits[0]?.[5]
    expect(typeof hitOptions === "object" ? hitOptions.tooltip?.label : undefined).toBe("Умножить значения")
    trigger(surface.hits[0])
    expect(values).toEqual(["subtract"])
  })

  test("keeps an invalid controlled value observable while retaining legacy cycle behavior", () => {
    const values: string[] = []
    const surface = new RecordingSurface()
    EnumInput(surface, 0, 0, 120, 28, enumProps(values, {value: "missing"}))

    expect(surface.centeredTexts.map(([text]) => text)).toEqual(["missing"])
    trigger(surface.hits[0])
    expect(values).toEqual(["multiply"])
  })

  test("renders inline expanded choices and publishes only the exact chosen value", () => {
    const values: string[] = []
    const surface = new RecordingSurface()
    EnumInput(surface, 4, 6, 128, 28, enumProps(values, {presentation: "expanded"}))

    expect(surface.roundedRects.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 40, h: 28},
      {x: 48, y: 6, w: 40, h: 28},
      {x: 92, y: 6, w: 40, h: 28},
    ])
    expect(surface.centeredTexts.map(([text]) => text)).toEqual(["Add", "Multiply", "Subtract"])
    trigger(surface.hits[2])
    expect(values).toEqual(["subtract"])

    const compact = new RecordingSurface()
    EnumInput(compact, 4, 6, 126, 22, enumProps([], {
      density: "compact",
      presentation: "expanded",
    }))
    expect(compact.roundedRects.map((call) => call[4].fill)).toEqual([
      palette.bgInput,
      palette.bgHot,
      palette.bgInput,
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

      expect(surface.centeredTexts.map(([text]) => text)).toEqual([label])
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

  test("preserves MetaFor regular and compact cycle geometry and delegates both Field densities", () => {
    const standaloneValues: string[] = []
    const regularValues: string[] = []
    const compactValues: string[] = []

    const regular = new RecordingSurface()
    EnumInput(regular, 4, 6, 120, 28, enumProps(standaloneValues))
    expect(regular.roundedRects.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 120, h: 28},
    ])

    const compact = new RecordingSurface()
    EnumInput(compact, 4, 6, 120, 22, enumProps([], {density: "compact"}))
    expect(compact.roundedRects.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 120, h: 22},
    ])
    expect(compact.roundedRects[0]?.[4].radius).toBe(3)
    expect(compact.roundedRects[0]?.[4].fill).toEqual(palette.bgInput)
    expect(compact.roundedRects[0]?.[4].border).toEqual(palette.borderDim)

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
    const compactField = new RecordingSurface()
    Field(compactField, 0, 0, 120, definition(compactValues), {density: "compact"})
    trigger(compactField.hits[0])
    trigger(regular.hits[0])

    expect(regularValues).toEqual(["subtract"])
    expect(compactValues).toEqual(regularValues)
    expect(standaloneValues).toEqual(regularValues)
  })
})
