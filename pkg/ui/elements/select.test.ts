import {describe, expect, test} from "bun:test"
import type {UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {select, type SelectElementOption} from "./select.ts"
import {uiShapeMetrics} from "./shape.ts"
import {palette} from "./theme.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type ImageCall = Parameters<UiSurface["drawImage"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly images: ImageCall[] = []
  readonly hits: HitCall[] = []
  readonly renderKeys: string[] = []
  readonly keyedRenders: string[] = []

  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  override drawText(...args: TextCall): number { this.texts.push(args); return 0 }
  override drawImage(...args: ImageCall): void { this.images.push(args) }
  override hit(...args: HitCall): void { this.hits.push(args) }
  override registerRenderKey(key: string): void { this.renderKeys.push(key) }
  override requestKeyedRender(key: string): void { this.keyedRenders.push(key) }
  protected render(): void {}

  clearRecording(): void {
    this.roundedRects.length = 0
    this.texts.length = 0
    this.images.length = 0
    this.hits.length = 0
  }
}

class PointerStateSurface extends RecordingSurface {
  constructor(readonly state: Readonly<{hovered: boolean; pressed: boolean}>) { super() }
  override hitState(): {hovered: boolean; pressed: boolean} { return {...this.state} }
}

const options = Object.freeze([
  Object.freeze({value: "add", label: "Add"}),
  Object.freeze({value: "multiply", label: "Multiply"}),
  Object.freeze({value: "subtract", label: "Subtract"}),
  Object.freeze({value: "divide", label: "Divide", disabled: true}),
]) satisfies readonly SelectElementOption[]

const trigger = (hit: HitCall | undefined): void => {
  expect(hit).toBeDefined()
  hit![4]()
}

const hitKey = (hit: HitCall): string | undefined => {
  const hitOptions = hit[5]
  return typeof hitOptions === "object" ? hitOptions.key : undefined
}

describe("select element", () => {
  test("owns dense value chrome, left label, chevron and caller hit rect", () => {
    const surface = new RecordingSurface()
    select(surface, 10, 20, 146, 40, {value: "Multiply", onClick() {}})

    const [x, y, width, height, chrome] = surface.roundedRects[0]!
    expect({x, y, width, height, radius: chrome.radius, borderWidth: chrome.borderWidth}).toEqual({
      x: 10,
      y: 29,
      width: 146,
      height: uiShapeMetrics.controlHeight,
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })
    expect(chrome.fill).toEqual(palette.bgInput)
    expect(chrome.border).toEqual(palette.borderRule)
    expect(surface.texts[0]?.slice(0, 3)).toEqual(["Multiply", 16, 34.5])
    expect(surface.texts[0]?.[3]).toMatchObject({fontPx: uiShapeMetrics.compactFontPx, maxWidthPx: 117})
    expect(surface.images[0]?.slice(1, 5)).toEqual([136, 33, uiShapeMetrics.iconGlyphSize, uiShapeMetrics.iconGlyphSize])
    expect(surface.hits[0]?.slice(0, 4)).toEqual([10, 20, 146, 40])
  })

  test("renders placeholder, active and disabled states without hidden mutation", () => {
    const active = new RecordingSurface()
    select(active, 0, 0, 146, 22, {placeholder: "Choose", active: true, onClick() {}})
    expect(active.texts[0]?.[0]).toBe("Choose")
    expect(active.texts[0]?.[3].material).toBe(active.materials.muted)
    expect(active.roundedRects[0]?.[4].fill).toEqual(palette.bgHot)
    expect(active.roundedRects[0]?.[4].border).toEqual(palette.cyan)

    const disabled = new RecordingSurface()
    select(disabled, 0, 0, 146, 22, {value: "Multiply", disabled: true, onClick() {}})
    expect(disabled.hits).toHaveLength(0)
    expect(disabled.texts[0]?.[3].material).toBe(disabled.materials.muted)
  })

  test("owns hover and pressed visual states", () => {
    const hovered = new PointerStateSurface({hovered: true, pressed: false})
    select(hovered, 0, 0, 146, 22, {value: "Multiply", onClick() {}})
    expect(hovered.roundedRects[0]?.[4].fill).toEqual(palette.bgElevated)
    expect(hovered.roundedRects[0]?.[4].border).toEqual(palette.cyan)

    const pressed = new PointerStateSurface({hovered: true, pressed: true})
    select(pressed, 0, 0, 146, 22, {value: "Multiply", onClick() {}})
    expect(pressed.roundedRects[0]?.[4].fill).toEqual(palette.bgHot)
    expect(pressed.roundedRects[0]?.[4].border).toEqual(palette.cyan)
  })

  test("opens keyed overlay rows, selects one controlled value and closes after choice", () => {
    const values: Array<string | number> = []
    const surface = new RecordingSurface()
    const props = {
      key: "operation",
      value: "multiply",
      options,
      onChange: (value: string | number) => values.push(value),
    }

    select(surface, 10, 20, 146, 22, props)
    expect(new Set(surface.renderKeys)).toEqual(new Set(["operation"]))
    expect(surface.texts.map(([text]) => text)).toEqual(["Multiply"])
    trigger(surface.hits[0])
    expect(surface.keyedRenders).toEqual(["operation"])

    surface.clearRecording()
    select(surface, 10, 20, 146, 22, props)
    expect(surface.texts.map(([text]) => text)).toEqual([
      "Multiply",
      "Add",
      "Multiply",
      "Subtract",
      "Divide",
    ])
    expect(surface.roundedRects.map((call) => call[4].fill)).toEqual([
      palette.bgHot,
      palette.bgPanel,
      palette.bgInput,
      palette.bgHot,
      palette.bgInput,
      palette.bgPanelDim,
    ])
    expect(surface.hits.map(hitKey)).toEqual([
      "operation",
      "operation:option:add",
      "operation:option:multiply",
      "operation:option:subtract",
    ])

    trigger(surface.hits.find((hit) => hitKey(hit) === "operation:option:subtract"))
    expect(values).toEqual(["subtract"])
    expect(surface.keyedRenders).toEqual(["operation", "operation"])

    surface.clearRecording()
    select(surface, 10, 20, 146, 22, {...props, value: "subtract"})
    expect(surface.texts.map(([text]) => text)).toEqual(["Subtract"])
  })

  test("supports deterministic controlled open state and closes on trigger reclick", () => {
    const changes: boolean[] = []
    const surface = new RecordingSurface()
    select(surface, 0, 0, 146, 22, {
      key: "controlled",
      value: "multiply",
      options,
      open: true,
      onOpenChange: (open) => changes.push(open),
    })

    expect(surface.texts).toHaveLength(5)
    trigger(surface.hits[0])
    expect(changes).toEqual([false])
    expect(surface.keyedRenders).toEqual(["controlled"])
  })

  test("renders flat hover and disabled rows inside the one subtle menu border", () => {
    class RowHoverSurface extends RecordingSurface {
      override hitState(_x: number, _y: number, _w: number, _h: number, key?: string): {hovered: boolean; pressed: boolean} {
        return {hovered: key === "hover-menu:option:add", pressed: false}
      }
    }
    const surface = new RowHoverSurface()
    select(surface, 0, 0, 146, 22, {
      key: "hover-menu",
      value: "multiply",
      options,
      open: true,
    })

    const menu = surface.roundedRects[1]?.[4]
    const rows = surface.roundedRects.slice(2).map((call) => call[4])
    expect(menu).toMatchObject({radius: uiShapeMetrics.lowRadius, borderWidth: uiShapeMetrics.borderWidth})
    expect(menu?.border).toEqual(palette.borderRule)
    expect(rows.map(({radius, border}) => ({radius, border}))).toEqual([
      {radius: 0, border: null},
      {radius: 0, border: null},
      {radius: 0, border: null},
      {radius: 0, border: null},
    ])
    expect(rows.map(({fill}) => fill)).toEqual([
      palette.bgElevated,
      palette.bgHot,
      palette.bgInput,
      palette.bgPanelDim,
    ])
  })

  test("closes an internally owned menu on trigger reclick", () => {
    const surface = new RecordingSurface()
    const props = {key: "reclick", value: "multiply", options}
    select(surface, 0, 0, 146, 22, props)
    trigger(surface.hits[0])
    surface.clearRecording()
    select(surface, 0, 0, 146, 22, props)
    expect(surface.texts).toHaveLength(5)
    trigger(surface.hits[0])
    surface.clearRecording()
    select(surface, 0, 0, 146, 22, props)
    expect(surface.texts.map(([text]) => text)).toEqual(["Multiply"])
  })

  test("keeps explicit idle border override stronger than the subtle default", () => {
    const surface = new RecordingSurface()
    select(surface, 0, 0, 146, 22, {
      value: "multiply",
      style: {borderColor: "orange"},
    })
    expect(surface.roundedRects[0]?.[4].border).toEqual(palette.orange)
  })
})
