import {describe, expect, test} from "bun:test"
import {
  createInputEditState,
  focusInput,
  handleActiveInputKey,
  insertActiveInputText,
  uiIcons,
  uiShapeMetrics,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {
  Field,
  type PathFieldDefinition,
} from "./Field.ts"
import {
  PathInput,
  type PathInputProps,
} from "./PathInput.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type CenteredTextCall = Parameters<UiSurface["drawTextCentered"]>
type ImageCall = Parameters<UiSurface["drawImage"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []
  readonly images: ImageCall[] = []
  readonly hits: HitCall[] = []

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

  override pushClip(): void {}

  override popClip(): void {}

  protected render(): void {}
}

const pathProps = (
  events: string[],
  extra: Partial<PathInputProps> = {},
): PathInputProps => ({
  key: "path-input",
  value: "/textures/source.exr",
  onChange: (value) => events.push(`change:${value}`),
  onBrowse: () => events.push("browse"),
  ...extra,
})

const trigger = (hit: HitCall | undefined): void => {
  expect(hit).toBeDefined()
  hit![4]()
}

const keyEvent = (key: string): KeyboardEvent => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  preventDefault() {},
}) as KeyboardEvent

describe("public PathInput", () => {
  test("keeps controlled editing and browse on separate hit paths", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    const props = pathProps(events)
    PathInput(surface, 4, 6, 120, 28, props)

    expect(surface.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 4, y: 6, width: 98, height: 28},
      {x: 102, y: 6, width: uiShapeMetrics.iconActionSlot, height: 28},
    ])

    focusInput(surface, "path-input", createInputEditState("/textures/source.exr"))
    expect(insertActiveInputText(surface, ".bak")).toBeTrue()
    expect(events).toEqual(["change:/textures/source.exr.bak"])
    expect(props.value).toBe("/textures/source.exr")

    trigger(surface.hits[1])
    expect(events).toEqual(["change:/textures/source.exr.bak", "browse"])
    const browseOptions = surface.hits[1]?.[5]
    expect(typeof browseOptions === "object" ? browseOptions.tooltip?.label : undefined).toBe("Выбрать путь")
  })

  test("shows an empty placeholder and a folder affordance without inventing a path", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    const props = pathProps(events, {value: "", placeholder: "Выберите файл"})
    PathInput(surface, 0, 0, 120, 28, props)

    expect(surface.texts.map(([text]) => text)).toContain("Выберите файл")
    expect(surface.centeredTexts.map(([text]) => text)).not.toContain("…")
    expect(surface.images.map(([src]) => src)).toContain(uiIcons.folder)
    expect(props.value).toBe("")
    expect(events).toEqual([])
  })

  test("joins the path and exact folder action under one ControlGroup and omits an absent owner action", () => {
    const joined = new RecordingSurface()
    PathInput(joined, 4, 6, 120, 22, pathProps([]))
    expect(joined.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 4, y: 6, width: 98, height: 22},
      {x: 102, y: 6, width: 22, height: 22},
    ])
    const joinedOuter = joined.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius)
    expect(joinedOuter.map((call) => call.slice(0, 4))).toEqual([
      [4, 6, 120, 22],
      [4, 6, 120, 22],
    ])
    expect(joined.roundedRects.some((call) => call.slice(0, 4).toString() === [101.5, 6, 1, 22].toString())).toBeTrue()

    const {onBrowse: _onBrowse, ...withoutBrowse} = pathProps([])
    const noAction = new RecordingSurface()
    PathInput(noAction, 4, 6, 120, 22, withoutBrowse)
    expect(noAction.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 4, y: 6, width: 120, height: 22},
    ])
    expect(noAction.images.map(([src]) => src)).not.toContain(uiIcons.folder)
  })

  test("keeps raw platform-invalid-looking text and leaves Enter to the surrounding form", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    PathInput(surface, 0, 0, 120, 28, pathProps(events, {value: ""}))

    focusInput(surface, "path-input", createInputEditState(""))
    expect(insertActiveInputText(surface, "::not\\a/platform/path??")).toBeTrue()
    expect(handleActiveInputKey(surface, keyEvent("Enter"))).toBeFalse()
    expect(events).toEqual(["change:::not\\a/platform/path??"])
  })

  test("blocks editing and browse while preserving structure when disabled or read-only", () => {
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const events: string[] = []
      const surface = new RecordingSurface()
      PathInput(surface, 0, 0, 120, 28, pathProps(events, state))

      expect(surface.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius)).toHaveLength(2)
      expect(surface.hits).toHaveLength(1)
      trigger(surface.hits[0])
      expect(events).toEqual([])
    }
  })

  test("uses one Elements-owned regular and compact geometry", () => {
    const regular = new RecordingSurface()
    PathInput(regular, 4, 6, 120, 28, pathProps([]))
    expect(regular.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius).map((call) => call.slice(0, 4))).toEqual([
      [4, 6, 120, 28],
      [4, 6, 120, 28],
    ])
    expect(regular.roundedRects.some((call) => call.slice(0, 4).toString() === [101.5, 6, 1, 28].toString())).toBeTrue()

    const compact = new RecordingSurface()
    PathInput(compact, 4, 6, 120, 22, pathProps([], {density: "compact"}))
    expect(compact.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius).map((call) => call.slice(0, 4))).toEqual([
      [4, 6, 120, 22],
      [4, 6, 120, 22],
    ])
  })

  test("returns the same raw callbacks standalone and through both path Field densities", () => {
    const standaloneEvents: string[] = []
    const regularEvents: string[] = []
    const compactEvents: string[] = []

    const standalone = new RecordingSurface()
    PathInput(standalone, 0, 0, 120, 28, pathProps(standaloneEvents))
    focusInput(standalone, "path-input", createInputEditState("/textures/source.exr"))
    insertActiveInputText(standalone, ".bak")
    trigger(standalone.hits[1])

    const definition = (events: string[]): PathFieldDefinition => ({
      id: "path",
      label: "Файл",
      kind: "path",
      value: "/textures/source.exr",
      onChange: (value) => events.push(`change:${value}`),
      onBrowse: () => events.push("browse"),
    })

    const regular = new RecordingSurface()
    Field(regular, 0, 0, 120, definition(regularEvents))
    focusInput(regular, "field:path", createInputEditState("/textures/source.exr"))
    insertActiveInputText(regular, ".bak")
    trigger(regular.hits[1])

    const compact = new RecordingSurface()
    Field(compact, 0, 0, 120, definition(compactEvents), {density: "compact"})
    focusInput(compact, "field:path", createInputEditState("/textures/source.exr"))
    insertActiveInputText(compact, ".bak")
    trigger(compact.hits[1])

    expect(standaloneEvents).toEqual(["change:/textures/source.exr.bak", "browse"])
    expect(regularEvents).toEqual(standaloneEvents)
    expect(compactEvents).toEqual(standaloneEvents)
  })
})
