import {describe, expect, test} from "bun:test"
import type {UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {control} from "./control.ts"
import {uiShapeMetrics} from "./shape.ts"
import {palette} from "./theme.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  protected render(): void {}
}

describe("control visible geometry", () => {
  test("owns dense input-like chrome inside a caller layout rect", () => {
    const surface = new RecordingSurface()
    control(surface, 10, 20, 100, 40)

    const [x, y, width, height, chrome] = surface.roundedRects[0]!
    expect({x, y, width, height}).toEqual({x: 10, y: 29, width: 100, height: uiShapeMetrics.controlHeight})
    expect(chrome).toMatchObject({
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
      fill: palette.bgInput,
      border: palette.borderDim,
    })
  })

  test("keeps explicit chrome style authoritative", () => {
    const surface = new RecordingSurface()
    control(surface, 10, 20, 100, 40, {
      style: {height: 30, borderRadius: 8, borderWidth: 2, background: "bgHot", borderColor: "cyan"},
    })

    const [, y, , height, chrome] = surface.roundedRects[0]!
    expect({y, height, radius: chrome.radius, borderWidth: chrome.borderWidth}).toEqual({
      y: 25,
      height: 30,
      radius: 8,
      borderWidth: 2,
    })
    expect(chrome.fill).toEqual(palette.bgHot)
    expect(chrome.border).toEqual(palette.cyan)
  })
})
