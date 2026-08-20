import {describe, expect, test} from "bun:test"
import {
  palette,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {
  Field,
  type ReferenceFieldDefinition,
} from "./Field.ts"
import {
  ReferenceInput,
  type ReferenceInputProps,
  type ReferenceInputValue,
} from "./ReferenceInput.ts"

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

const selectedReference = Object.freeze({
  id: "material-1",
  label: "Material.001",
  kind: "material",
}) satisfies ReferenceInputValue

const referenceProps = (
  events: string[],
  extra: Partial<ReferenceInputProps> = {},
): ReferenceInputProps => ({
  value: selectedReference,
  onActivate: () => events.push("activate"),
  onClear: () => events.push("clear"),
  ...extra,
})

const trigger = (hit: HitCall | undefined): void => {
  expect(hit).toBeDefined()
  hit![4]()
}

describe("public ReferenceInput", () => {
  test("renders the opaque selected label and kind without mutating the controlled value", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    ReferenceInput(surface, 0, 0, 120, 28, referenceProps(events))

    expect(surface.centeredTexts.map(([text]) => text)).toContain("Material.001")
    const hitOptions = surface.hits[0]?.[5]
    expect(typeof hitOptions === "object" ? hitOptions.tooltip?.label : undefined).toBe("material")
    expect(selectedReference).toEqual({id: "material-1", label: "Material.001", kind: "material"})
  })

  test("uses the placeholder and omits the clear affordance for a null value", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    ReferenceInput(surface, 0, 0, 120, 28, referenceProps(events, {
      value: null,
      placeholder: "Выберите ресурс",
    }))

    expect(surface.centeredTexts.map(([text]) => text)).toContain("Выберите ресурс")
    expect(surface.roundedRects).toHaveLength(1)
    expect(surface.hits).toHaveLength(1)
    trigger(surface.hits[0])
    expect(events).toEqual(["activate"])
  })

  test("keeps activate and clear on separate non-overlapping hit paths", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    ReferenceInput(surface, 4, 6, 120, 22, referenceProps(events, {density: "compact"}))

    expect(surface.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 4, y: 6, width: 95, height: 22},
      {x: 102, y: 6, width: 22, height: 22},
    ])
    trigger(surface.hits[1])
    expect(events).toEqual(["clear"])
    trigger(surface.hits[0])
    expect(events).toEqual(["clear", "activate"])
  })

  test("blocks both actions while preserving selected structure when disabled or read-only", () => {
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const events: string[] = []
      const surface = new RecordingSurface()
      ReferenceInput(surface, 0, 0, 120, 28, referenceProps(events, state))

      expect(surface.roundedRects).toHaveLength(2)
      for (const hit of surface.hits) trigger(hit)
      expect(events).toEqual([])
    }
  })

  test("preserves regular and compact production geometry with MetaFor materials", () => {
    const regular = new RecordingSurface()
    ReferenceInput(regular, 4, 6, 120, 28, referenceProps([]))
    expect(regular.roundedRects.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 85, h: 28},
      {x: 96, y: 6, w: 28, h: 28},
    ])

    const compact = new RecordingSurface()
    ReferenceInput(compact, 4, 6, 120, 22, referenceProps([], {density: "compact"}))
    expect(compact.roundedRects.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 95, h: 22},
      {x: 102, y: 6, w: 22, h: 22},
    ])
    for (const call of compact.roundedRects) {
      expect(call[4].radius).toBe(3)
      expect(call[4].borderWidth).toBe(1)
      expect(call[4].fill).toEqual(palette.bgInput)
      expect(call[4].border).toEqual(palette.borderDim)
    }
  })

  test("returns one action contract standalone and through both reference Field densities", () => {
    const standaloneEvents: string[] = []
    const regularEvents: string[] = []
    const compactEvents: string[] = []

    const standalone = new RecordingSurface()
    ReferenceInput(standalone, 0, 0, 120, 28, referenceProps(standaloneEvents))
    trigger(standalone.hits[0])
    trigger(standalone.hits[1])

    const definition = (events: string[]): ReferenceFieldDefinition => ({
      id: "reference",
      label: "Материал",
      kind: "reference",
      value: selectedReference,
      onActivate: () => events.push("activate"),
      onClear: () => events.push("clear"),
    })

    const regular = new RecordingSurface()
    Field(regular, 0, 0, 120, definition(regularEvents))
    trigger(regular.hits[0])
    trigger(regular.hits[1])

    const compact = new RecordingSurface()
    Field(compact, 0, 0, 120, definition(compactEvents), {density: "compact"})
    trigger(compact.hits[0])
    trigger(compact.hits[1])

    expect(standaloneEvents).toEqual(["activate", "clear"])
    expect(regularEvents).toEqual(standaloneEvents)
    expect(compactEvents).toEqual(standaloneEvents)
  })
})
