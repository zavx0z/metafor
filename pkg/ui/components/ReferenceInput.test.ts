import {describe, expect, test} from "bun:test"
import {
  uiIcons,
  uiShapeMetrics,
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
type ImageCall = Parameters<UiSurface["drawImage"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []
  readonly images: ImageCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
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
  onPick: () => events.push("pick"),
  onClear: () => events.push("clear"),
  ...extra,
})

const trigger = (hit: HitCall | undefined): void => {
  expect(hit).toBeDefined()
  hit![4]()
}

describe("public ReferenceInput", () => {
  test("renders a generic resource label and owner picker without mutating the opaque value", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    ReferenceInput(surface, 0, 0, 120, 28, referenceProps(events))

    expect(surface.centeredTexts.map(([text]) => text)).toContain("Material.001")
    expect(surface.images.map(([src]) => src)).toContain(uiIcons.resource)
    expect(surface.images.map(([src]) => src)).toContain(uiIcons.picker)
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
    expect(surface.images.map(([src]) => src)).not.toContain(uiIcons.close)
    expect(surface.hits).toHaveLength(2)
    trigger(surface.hits[0])
    expect(events).toEqual(["activate"])
    trigger(surface.hits[1])
    expect(events).toEqual(["activate", "pick"])
  })

  test("keeps activate, picker and optional clear on separate non-overlapping hit paths", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    ReferenceInput(surface, 4, 6, 120, 22, referenceProps(events, {density: "compact"}))

    expect(surface.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 4, y: 6, width: 76, height: 22},
      {x: 80, y: 6, width: 22, height: 22},
      {x: 102, y: 6, width: 22, height: 22},
    ])
    trigger(surface.hits[2])
    expect(events).toEqual(["clear"])
    trigger(surface.hits[0])
    expect(events).toEqual(["clear", "activate"])
    trigger(surface.hits[1])
    expect(events).toEqual(["clear", "activate", "pick"])
  })

  test("joins unequal cells and never substitutes activate for an absent picker owner", () => {
    const joined = new RecordingSurface()
    ReferenceInput(joined, 4, 6, 120, 22, referenceProps([]))
    expect(joined.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 4, y: 6, width: 76, height: 22},
      {x: 80, y: 6, width: 22, height: 22},
      {x: 102, y: 6, width: 22, height: 22},
    ])
    expect(joined.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius).map((call) => call.slice(0, 4))).toEqual([
      [4, 6, 120, 22],
      [4, 6, 120, 22],
    ])

    const {onPick: _onPick, ...withoutPick} = referenceProps([])
    const noPicker = new RecordingSurface()
    ReferenceInput(noPicker, 4, 6, 120, 22, withoutPick)
    expect(noPicker.images.map(([src]) => src)).not.toContain(uiIcons.picker)
    trigger(noPicker.hits[0])
    expect(noPicker.hits).toHaveLength(2)
  })

  test("omits only clear when its owner callback is absent", () => {
    const surface = new RecordingSurface()
    const {onClear: _onClear, ...withoutClear} = referenceProps([])
    ReferenceInput(surface, 0, 0, 120, 22, withoutClear)

    expect(surface.images.map(([src]) => src)).not.toContain(uiIcons.close)
    expect(surface.hits).toHaveLength(2)
  })

  test("blocks both actions while preserving selected structure when disabled or read-only", () => {
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const events: string[] = []
      const surface = new RecordingSurface()
      ReferenceInput(surface, 0, 0, 120, 28, referenceProps(events, state))

      expect(surface.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius)).toHaveLength(2)
      for (const hit of surface.hits) trigger(hit)
      expect(events).toEqual([])
    }
  })

  test("uses one Elements-owned regular and compact geometry with MetaFor materials", () => {
    const regular = new RecordingSurface()
    ReferenceInput(regular, 4, 6, 120, 28, referenceProps([]))
    expect(regular.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius).map((call) => call.slice(0, 4))).toEqual([
      [4, 6, 120, 28],
      [4, 6, 120, 28],
    ])
    expect(regular.roundedRects.filter((call) => call[4].radius === 0 && call[2] === 1).map((call) => call[0])).toEqual([79.5, 101.5])

    const compact = new RecordingSurface()
    ReferenceInput(compact, 4, 6, 120, 22, referenceProps([], {density: "compact"}))
    expect(compact.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius).map((call) => call.slice(0, 4))).toEqual([
      [4, 6, 120, 22],
      [4, 6, 120, 22],
    ])
  })

  test("returns one action contract standalone and through both reference Field densities", () => {
    const standaloneEvents: string[] = []
    const regularEvents: string[] = []
    const compactEvents: string[] = []

    const standalone = new RecordingSurface()
    ReferenceInput(standalone, 0, 0, 120, 28, referenceProps(standaloneEvents))
    trigger(standalone.hits[0])
    trigger(standalone.hits[1])
    trigger(standalone.hits[2])

    const definition = (events: string[]): ReferenceFieldDefinition => ({
      id: "reference",
      label: "Материал",
      kind: "reference",
      value: selectedReference,
      onActivate: () => events.push("activate"),
      onPick: () => events.push("pick"),
      onClear: () => events.push("clear"),
    })

    const regular = new RecordingSurface()
    Field(regular, 0, 0, 120, definition(regularEvents))
    trigger(regular.hits[0])
    trigger(regular.hits[1])
    trigger(regular.hits[2])

    const compact = new RecordingSurface()
    Field(compact, 0, 0, 120, definition(compactEvents), {density: "compact"})
    trigger(compact.hits[0])
    trigger(compact.hits[1])
    trigger(compact.hits[2])

    expect(standaloneEvents).toEqual(["activate", "pick", "clear"])
    expect(regularEvents).toEqual(standaloneEvents)
    expect(compactEvents).toEqual(standaloneEvents)
  })
})
