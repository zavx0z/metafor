import {describe, expect, test} from "bun:test"
import type {UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {createInputEditState, handleInputKey, input, insertInputText} from "./input.ts"
import {uiShapeMetrics} from "./shape.ts"
import {palette} from "./theme.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override drawText(...args: TextCall): number {
    this.texts.push(args)
    return 0
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  override pushClip(): void {}

  override popClip(): void {}

  protected render(): void {}
}

function key(name: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: name,
    metaKey: opts.metaKey === true,
    ctrlKey: opts.ctrlKey === true,
    shiftKey: opts.shiftKey === true,
    preventDefault() {},
  } as KeyboardEvent
}

describe("input editing", () => {
  test("inserts text at the cursor", () => {
    const state = createInputEditState("ab", 1)
    expect(insertInputText(state, "X")).toEqual({value: "aXb", cursor: 2, selectionAnchor: null})
  })

  test("handles backspace and arrows", () => {
    let state = createInputEditState("abc", 3)
    state = handleInputKey(state, key("ArrowLeft")).state
    expect(state.cursor).toBe(2)
    state = handleInputKey(state, key("Backspace")).state
    expect(state).toEqual({value: "ac", cursor: 1, selectionAnchor: null})
  })

  test("replaces selected text", () => {
    let state = createInputEditState("abcdef", 2)
    state = handleInputKey(state, key("ArrowRight", {shiftKey: true})).state
    state = handleInputKey(state, key("ArrowRight", {shiftKey: true})).state
    expect(state.selectionAnchor).toBe(2)
    state = insertInputText(state, "X")
    expect(state).toEqual({value: "abXef", cursor: 3, selectionAnchor: null})
  })

  test("returns paste and submit actions", () => {
    const state = createInputEditState("run", 3)
    expect(handleInputKey(state, key("v", {metaKey: true})).paste).toBe(true)
    expect(handleInputKey(state, key("Enter"), {submitOnEnter: true}).submit).toBe(true)
  })
})

describe("input visible geometry", () => {
  test("uses shared dense defaults inside the caller-owned hit rect", () => {
    const surface = new RecordingSurface()
    input(surface, 10, 20, 100, 40, {key: "value", value: "Text", onChange() {}})

    const [x, y, width, height, chrome] = surface.roundedRects[0]!
    expect({x, y, width, height}).toEqual({x: 10, y: 29, width: 100, height: uiShapeMetrics.controlHeight})
    expect({radius: chrome.radius, borderWidth: chrome.borderWidth}).toEqual({
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })
    expect(chrome.border).toEqual(palette.borderRule)
    expect(surface.texts[0]?.slice(0, 3)).toEqual(["Text", 10 + uiShapeMetrics.tightGap * 2, 34.5])
    expect(surface.texts[0]?.[3]).toMatchObject({fontPx: uiShapeMetrics.compactFontPx})
    expect(surface.hits[0]?.slice(0, 4)).toEqual([10, 20, 100, 40])
  })

  test("uses subtle idle border while active input keeps cyan focus", () => {
    const idle = new RecordingSurface()
    input(idle, 0, 0, 100, 22, {key: "idle", value: "Text"})
    expect(idle.roundedRects[0]?.[4].border).toEqual(palette.borderRule)

    const active = new RecordingSurface()
    input(active, 0, 0, 100, 22, {key: "active", value: "Text", active: true, cursorVisible: false})
    expect(active.roundedRects[0]?.[4].border).toEqual(palette.cyan)
  })

  test("preserves explicit chrome, font, padding and palette styles", () => {
    const surface = new RecordingSurface()
    input(surface, 10, 20, 100, 40, {
      key: "value-explicit",
      value: "Text",
      style: {
        height: 30,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: "orange",
        background: "bgPanel",
        fontSize: 13,
        paddingLeft: 12,
        paddingRight: 9,
      },
    })

    const [, y, , height, chrome] = surface.roundedRects[0]!
    expect({y, height, radius: chrome.radius, borderWidth: chrome.borderWidth}).toEqual({
      y: 25,
      height: 30,
      radius: 8,
      borderWidth: 2,
    })
    expect(surface.texts[0]?.slice(0, 3)).toEqual(["Text", 22, 33.5])
    expect(surface.texts[0]?.[3]).toMatchObject({fontPx: 13})
  })
})
