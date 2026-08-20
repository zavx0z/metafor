import {describe, expect, test} from "bun:test"
import type {UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {select, type SelectElementOption} from "./select.ts"
import {blenderRgba8ToColor, resolveWidgetColors} from "./blender-theme.ts"
import {uiShapeMetrics} from "./shape.ts"
import {palette} from "./theme.ts"
import type {DismissableLayerOptions} from "./surface.ts"
import type {UiSurfaceRect} from "./runtime.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type ImageCall = Parameters<UiSurface["drawImage"]>
type HitCall = Parameters<UiSurface["hit"]>
type ShadowCall = Parameters<UiSurface["drawRoundedShadow"]>
type RectCall = Parameters<UiSurface["drawRect"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly images: ImageCall[] = []
  readonly hits: HitCall[] = []
  readonly shadows: ShadowCall[] = []
  readonly rects: RectCall[] = []
  readonly renderKeys: string[] = []
  readonly keyedRenders: string[] = []
  readonly dismissables: DismissableLayerOptions[] = []
  viewport: UiSurfaceRect = {x: 0, y: 0, w: 320, h: 240}

  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  override drawText(...args: TextCall): number { this.texts.push(args); return 0 }
  override drawImage(...args: ImageCall): void { this.images.push(args) }
  override hit(...args: HitCall): void { this.hits.push(args) }
  override drawRoundedShadow(...args: ShadowCall): void { this.shadows.push(args) }
  override drawRect(...args: RectCall): void { this.rects.push(args) }
  override registerRenderKey(key: string): void { this.renderKeys.push(key) }
  override requestKeyedRender(key: string): void { this.keyedRenders.push(key) }
  override interactionViewport(): UiSurfaceRect { return this.viewport }
  override dismissableLayer(options: DismissableLayerOptions): void { this.dismissables.push(options) }
  protected render(): void {}

  clearRecording(): void {
    this.roundedRects.length = 0
    this.texts.length = 0
    this.images.length = 0
    this.hits.length = 0
    this.dismissables.length = 0
    this.rects.length = 0
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
    const colors = resolveWidgetColors("menu")
    expect(chrome.fill).toEqual(blenderRgba8ToColor(colors.inner))
    expect(chrome.border).toEqual(blenderRgba8ToColor(colors.outline))
    expect(surface.texts[0]?.slice(0, 3)).toEqual(["Multiply", 16, 34.5])
    expect(surface.texts[0]?.[3]).toMatchObject({fontPx: uiShapeMetrics.compactFontPx, maxWidthPx: 117})
    expect(surface.images[0]?.slice(1, 5)).toEqual([136, 33, uiShapeMetrics.iconGlyphSize, uiShapeMetrics.iconGlyphSize])
    expect(surface.images[0]![5]!.tint).toEqual(blenderRgba8ToColor(colors.item))
    expect(surface.hits[0]?.slice(0, 4)).toEqual([10, 20, 146, 40])
  })

  test("renders placeholder, active and disabled states without hidden mutation", () => {
    const active = new RecordingSurface()
    select(active, 0, 0, 146, 22, {placeholder: "Choose", active: true, onClick() {}})
    expect(active.texts[0]?.[0]).toBe("Choose")
    expect(active.texts[0]?.[3].material.color).toEqual(blenderRgba8ToColor(
      resolveWidgetColors("menu", {inactive: true}).text,
    ))
    const activeColors = resolveWidgetColors("menu", {pressed: true})
    expect(active.roundedRects[0]?.[4].fill).toEqual(blenderRgba8ToColor(activeColors.inner))
    expect(active.roundedRects[0]?.[4].border).toEqual(blenderRgba8ToColor(activeColors.outline))

    const disabled = new RecordingSurface()
    select(disabled, 0, 0, 146, 22, {value: "Multiply", disabled: true, onClick() {}})
    expect(disabled.hits).toHaveLength(0)
    const disabledColors = resolveWidgetColors("menu", {disabled: true})
    expect(disabled.roundedRects[0]?.[4]).toMatchObject({
      fill: blenderRgba8ToColor(disabledColors.inner),
      border: blenderRgba8ToColor(disabledColors.outline),
    })
    expect(disabled.texts[0]?.[3].material.color).toEqual(blenderRgba8ToColor(disabledColors.text))
  })

  test("owns hover and pressed visual states", () => {
    const hovered = new PointerStateSurface({hovered: true, pressed: false})
    select(hovered, 0, 0, 146, 22, {value: "Multiply", onClick() {}})
    const hoverColors = resolveWidgetColors("menu", {hovered: true})
    expect(hovered.roundedRects[0]?.[4].fill).toEqual(blenderRgba8ToColor(hoverColors.inner))
    expect(hovered.roundedRects[0]?.[4].border).toEqual(blenderRgba8ToColor(hoverColors.outline))

    const pressed = new PointerStateSurface({hovered: true, pressed: true})
    select(pressed, 0, 0, 146, 22, {value: "Multiply", onClick() {}})
    const pressedColors = resolveWidgetColors("menu", {hovered: true, pressed: true})
    expect(pressed.roundedRects[0]?.[4].fill).toEqual(blenderRgba8ToColor(pressedColors.inner))
    expect(pressed.roundedRects[0]?.[4].border).toEqual(blenderRgba8ToColor(pressedColors.outline))
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
    expect(surface.shadows).toHaveLength(1)
    expect(surface.roundedRects.map((call) => call[4].fill)).toEqual([
      blenderRgba8ToColor(resolveWidgetColors("menu", {pressed: true}).inner),
      blenderRgba8ToColor(resolveWidgetColors("menuBack").inner),
      blenderRgba8ToColor(resolveWidgetColors("menuItem").inner),
      blenderRgba8ToColor(resolveWidgetColors("menuItem", {selectedDraw: true}).inner),
      blenderRgba8ToColor(resolveWidgetColors("menuItem").inner),
      blenderRgba8ToColor(resolveWidgetColors("menuItem", {disabled: true}).inner),
    ])
    expect(surface.hits.map(hitKey)).toEqual([
      "operation",
      "operation:option:add",
      "operation:option:multiply",
      "operation:option:subtract",
      "operation:option:divide",
    ])

    trigger(surface.hits.find((hit) => hitKey(hit) === "operation:option:subtract"))
    expect(values).toEqual(["subtract"])
    expect(surface.keyedRenders).toEqual(["operation", "operation"])

    surface.clearRecording()
    select(surface, 10, 20, 146, 22, {...props, value: "subtract"})
    expect(surface.texts.map(([text]) => text)).toEqual(["Subtract"])
  })

  test("measures an optional non-interactive popup label and delegates content through rect-only hooks", () => {
    const surface = new RecordingSurface()
    const triggerContexts: unknown[] = []
    const optionContexts: unknown[] = []
    select(surface, 10, 20, 146, 22, {
      key: "labelled",
      value: "multiply",
      options,
      open: true,
      popupLabel: "Operation",
      renderTriggerContent(context) {
        triggerContexts.push(context)
        surface.drawText(`trigger:${context.label}`, context.rect.x, context.rect.y, {
          fontPx: uiShapeMetrics.compactFontPx,
          material: surface.materials.text,
          maxWidthPx: context.rect.w,
        })
      },
      renderOptionContent(context) {
        optionContexts.push(context)
        surface.drawText(`option:${context.option.label}`, context.rect.x, context.rect.y, {
          fontPx: uiShapeMetrics.compactFontPx,
          material: surface.materials.text,
          maxWidthPx: context.rect.w,
        })
      },
    })

    expect(surface.texts.map(([text]) => text)).toEqual([
      "trigger:Multiply",
      "Operation",
      "option:Add",
      "option:Multiply",
      "option:Subtract",
      "option:Divide",
    ])
    expect(triggerContexts).toEqual([expect.objectContaining({
      label: "Multiply",
      value: "multiply",
      placeholder: false,
      rect: {x: 16, y: 20, w: 117, h: 22},
    })])
    expect(optionContexts).toHaveLength(4)
    expect(optionContexts[0]).toEqual(expect.objectContaining({
      option: options[0],
      selected: false,
      disabled: false,
      rect: {x: 17, y: 67, w: 132, h: 22},
    }))
    expect(optionContexts[1]).toEqual(expect.objectContaining({selected: true}))
    expect(optionContexts[3]).toEqual(expect.objectContaining({disabled: true}))
    expect(surface.roundedRects[1]?.slice(0, 4)).toEqual([10, 43, 146, 113])
    expect(surface.rects[0]?.slice(0, 4)).toEqual([11, 66, 144, uiShapeMetrics.borderWidth])
    expect(surface.hits.map(hitKey)).toEqual([
      "labelled",
      "labelled:option:add",
      "labelled:option:multiply",
      "labelled:option:subtract",
      "labelled:option:divide",
    ])

    const plain = new RecordingSurface()
    select(plain, 10, 20, 146, 22, {key: "plain", value: "multiply", options, open: true})
    expect(plain.roundedRects[1]?.slice(0, 4)).toEqual([10, 43, 146, 90])
    expect(plain.texts.map(([text]) => text)).not.toContain("Operation")
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
    expect(menu?.border).toEqual(blenderRgba8ToColor(resolveWidgetColors("menuBack").outline))
    expect(rows.map(({radius, border}) => ({radius, border}))).toEqual([
      {radius: 0, border: null},
      {radius: 0, border: null},
      {radius: 0, border: null},
      {radius: 0, border: null},
    ])
    expect(rows.map(({fill}) => fill)).toEqual([
      blenderRgba8ToColor(resolveWidgetColors("menuItem", {hovered: true}).inner),
      blenderRgba8ToColor(resolveWidgetColors("menuItem", {selectedDraw: true}).inner),
      blenderRgba8ToColor(resolveWidgetColors("menuItem").inner),
      blenderRgba8ToColor(resolveWidgetColors("menuItem", {disabled: true}).inner),
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

  test("uses the common popover owner for outside dismissal and viewport flip", async () => {
    const surface = new RecordingSurface()
    const props = {key: "common", value: "multiply", options}
    select(surface, 0, 70, 146, 22, props)
    trigger(surface.hits[0])
    surface.clearRecording()
    surface.viewport = {x: 0, y: 0, w: 180, h: 100}
    select(surface, 0, 70, 146, 22, props)

    expect(surface.dismissables).toHaveLength(1)
    expect(surface.roundedRects[1]?.[1]).toBe(0)
    surface.dismissables[0]?.dismiss("outside")
    surface.clearRecording()
    select(surface, 0, 70, 146, 22, props)
    expect(surface.texts.map(([text]) => text)).toEqual(["Multiply"])
    const source = await Bun.file(new URL("./select.ts", import.meta.url)).text()
    expect(source).toContain('from "./popover.ts"')
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
