import {describe, expect, test} from "bun:test"
import type {TextMaterial} from "@metafor/engine"
import type {UiSurface} from "@ui/elements"
import {normalizeEditorTokensForLine, renderEditorTextRuns, renderEditorTokenizedLine} from "./token-renderer.ts"

describe("normalizeEditorTokensForLine", () => {
  test("sorts, clamps and removes invalid ranges", () => {
    const tokens = normalizeEditorTokensForLine("abcdef", [
      {s: 4, e: 6, c: "z"},
      {s: 0, e: 2, c: "a"},
      {s: 1, e: 5, c: "b", fg: "#abcdef", bg: "#123456"},
      {s: -2, e: 1, c: "n"},
      {s: 6, e: 10, c: "out"},
      {s: 3, e: 3, c: "empty"},
      {s: Number.NaN, e: 4, c: "bad"},
    ])

    expect(tokens).toEqual([
      {s: 0, e: 1, c: "n"},
      {s: 1, e: 2, c: "a"},
      {s: 2, e: 5, c: "b", fg: "#abcdef", bg: "#123456"},
      {s: 5, e: 6, c: "z"},
    ])
  })

  test("prefers a longer token over punctuation at the same start", () => {
    const tokens = normalizeEditorTokensForLine("brane.stateCount", [
      {s: 5, e: 6, c: "p"},
      {s: 5, e: 16, c: "t", fg: "#c77dbb"},
    ])

    expect(tokens).toEqual([
      {s: 5, e: 16, c: "t", fg: "#c77dbb"},
    ])
  })
})

describe("renderEditorTextRuns", () => {
  test("keeps tab characters out of drawText", () => {
    const calls: Array<{text: string; x: number; maxWidthPx: number | undefined}> = []
    const pane = {
      drawText: (text: string, x: number, _y: number, opts: {maxWidthPx?: number}) => {
        calls.push({text, x, maxWidthPx: opts.maxWidthPx})
        return 0
      },
      measureText: (text: string) => text.length * 10,
    } as unknown as UiSurface

    renderEditorTextRuns({
      pane,
      text: "\t\tready",
      startX: 100,
      y: 20,
      fontPx: 13,
      material: {} as TextMaterial,
      maxPx: 400,
      columnX: (col) => [0, 20, 40, 50, 60, 70, 80, 90][col] ?? col * 10,
    })

    expect(calls).toEqual([{text: "ready", x: 140, maxWidthPx: 360}])
  })
})

describe("renderEditorTokenizedLine", () => {
  test("places color swatches in the whitespace before the token", () => {
    const backgrounds: Array<{x: number; w: number; slotX: number; slotW: number}> = []
    const pane = {
      drawText: () => 0,
      measureText: (text: string) => text.length * 10,
    } as unknown as UiSurface

    renderEditorTokenizedLine({
      pane,
      text: "color: #fff;",
      tokens: [{s: 7, e: 11, c: "n", bg: "#fff"}],
      startX: 100,
      y: 20,
      fontPx: 13,
      maxPx: 400,
      materials: new Map(),
      fallbackMaterial: {} as TextMaterial,
      drawTokenBackground: (x, _y, w, _h, _bg, slotX, slotW) => backgrounds.push({x, w, slotX, slotW}),
    })

    expect(backgrounds).toEqual([{x: 170, w: 40, slotX: 160, slotW: 10}])
  })
})
