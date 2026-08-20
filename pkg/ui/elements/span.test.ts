import {beforeAll, describe, expect, test} from "bun:test"
import {CachedText, TrueTypeFont} from "@metafor/engine"
import {span} from "./span.ts"
import {UiSurface} from "./surface.ts"

const PIXEL_SCALE = 0.001
const FONT_PX = 11
const ROWS = Object.freeze([
  Object.freeze({label: "Mapping", align: "left" as const, x: 12, y: 8, w: 176, h: 24}),
  Object.freeze({label: "Noise Texture", align: "right" as const, x: 12, y: 38, w: 176, h: 24}),
  Object.freeze({label: "gy", align: "center" as const, x: 12, y: 68, w: 176, h: 24}),
])

class GlyphBoundsSurface extends UiSurface {
  protected render(): void {
    for (const row of ROWS) {
      span(this, row.x, row.y, row.w, row.h, {
        children: row.label,
        style: {fontSize: FONT_PX, textAlign: row.align},
      })
    }
  }

  textNodes(): readonly CachedText[] {
    const texts: CachedText[] = []
    this.node.traverse((object) => {
      if (object instanceof CachedText) texts.push(object)
    })
    return texts
  }
}

let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("span project-font glyph bounds", () => {
  test("centers actual left, right and center glyph geometry in the same row law", () => {
    const surface = new GlyphBoundsSurface()
    try {
      surface.setRect({x: 0, y: 0, w: 200, h: 100}, PIXEL_SCALE, font)
      const texts = surface.textNodes()
      expect(texts.map(({text}) => text)).toEqual(ROWS.map(({label}) => label))

      for (const row of ROWS) {
        const text = texts.find((candidate) => candidate.text === row.label)!
        const bounds = cachedTextDisplayBounds(text)
        expect(bounds.centerY).toBeCloseTo(row.y + row.h / 2, 5)

        const measured = surface.measureText(row.label, FONT_PX)
        const expectedX = row.align === "left"
          ? row.x
          : row.align === "right"
            ? row.x + row.w - measured
            : row.x + (row.w - measured) / 2
        expect(text.position.x / PIXEL_SCALE).toBeCloseTo(expectedX, 5)
      }
    } finally {
      surface.dispose()
    }
  })
})

function cachedTextDisplayBounds(text: CachedText): Readonly<{minY: number; maxY: number; centerY: number}> {
  const positions = text.stencilGeometry.attributes.position?.array
  if (positions === undefined) throw new Error(`Missing stencil geometry for ${text.text}`)
  const ys: number[] = []
  for (let index = 1; index < positions.length; index += 3) {
    ys.push(-(text.position.y + Number(positions[index])) / PIXEL_SCALE)
  }
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {minY, maxY, centerY: (minY + maxY) / 2}
}
