import {describe, expect, test} from "bun:test"
import type {HitOptions, UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {
  createInputEditState,
  handleActiveInputKey,
  handleInputKey,
  input,
  insertInputText,
  surfaceHasActiveInput,
} from "./input.ts"
import {blenderRgba8ToColor, blenderTheme, resolveNumericZoneColors, resolveWidgetColors} from "./blender-theme.ts"
import {uiShapeMetrics} from "./shape.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type RectCall = Parameters<UiSurface["drawRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type HitCall = Parameters<UiSurface["hit"]>
type ImageCall = Parameters<UiSurface["drawImage"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly rects: RectCall[] = []
  readonly texts: TextCall[] = []
  readonly hits: HitCall[] = []
  readonly images: ImageCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override drawRect(...args: RectCall): void { this.rects.push(args) }

  override measureText(value: string): number { return value.length * 6 }

  override drawText(...args: TextCall): number {
    this.texts.push(args)
    return 0
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  override drawImage(...args: ImageCall): void { this.images.push(args) }

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

const pointer = (opts: Partial<MouseEvent> = {}): MouseEvent => ({
  button: opts.button ?? 0,
  ctrlKey: opts.ctrlKey === true,
  shiftKey: opts.shiftKey === true,
  preventDefault() {},
} as MouseEvent)

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
    expect(chrome.border).toEqual(blenderRgba8ToColor(resolveWidgetColors("text").outline))
    expect(surface.texts[0]?.slice(0, 3)).toEqual(["Text", 10 + uiShapeMetrics.tightGap * 2, 34.5])
    expect(surface.texts[0]?.[3]).toMatchObject({fontPx: uiShapeMetrics.compactFontPx})
    expect(surface.hits[0]?.slice(0, 4)).toEqual([10, 20, 100, 40])
  })

  test("maps idle and focused text states without a generic cyan focus owner", () => {
    const idle = new RecordingSurface()
    input(idle, 0, 0, 100, 22, {key: "idle", value: "Text"})
    const idleColors = resolveWidgetColors("text")
    expect(idle.roundedRects[0]?.[4]).toMatchObject({
      fill: blenderRgba8ToColor(idleColors.inner),
      border: blenderRgba8ToColor(idleColors.outline),
    })

    const active = new RecordingSurface()
    input(active, 0, 0, 100, 22, {key: "active", value: "Text", active: true, cursorVisible: false})
    const activeColors = resolveWidgetColors("text", {selected: true, textInput: true})
    expect(active.roundedRects[0]?.[4]).toMatchObject({
      fill: blenderRgba8ToColor(activeColors.inner),
      border: blenderRgba8ToColor(activeColors.outline),
    })
    expect(active.texts[0]?.[3].material.color).toEqual(blenderRgba8ToColor(activeColors.text))

    const disabled = new RecordingSurface()
    input(disabled, 0, 0, 100, 22, {key: "disabled", value: "Text", disabled: true})
    const disabledColors = resolveWidgetColors("text", {disabled: true})
    expect(disabled.roundedRects[0]?.[4]).toMatchObject({
      fill: blenderRgba8ToColor(disabledColors.inner),
      border: blenderRgba8ToColor(disabledColors.outline),
    })
    expect(disabled.texts[0]?.[3].material.color).toEqual(blenderRgba8ToColor(disabledColors.text))
    expect(disabled.hits).toHaveLength(0)
  })

  test("keeps grouped cells borderless while active material remains visible", () => {
    const appearance = {
      kind: "grouped-cell",
      corners: {topLeft: false, topRight: false, bottomLeft: false, bottomRight: false},
    } as const
    const idle = new RecordingSurface()
    input(idle, 0, 0, 100, 22, {
      key: "grouped-idle",
      value: "Text",
      appearance,
    })
    expect(idle.roundedRects).toHaveLength(0)

    const active = new RecordingSurface()
    input(active, 0, 0, 100, 22, {
      key: "grouped-active",
      value: "Text",
      appearance,
      active: true,
      cursorVisible: false,
    })
    expect(active.roundedRects).toHaveLength(1)
    expect(active.roundedRects[0]?.slice(0, 4)).toEqual([0, 0, 100, 22])
    expect(active.roundedRects[0]?.[4]).toMatchObject({
      radius: 0,
      border: null,
      borderWidth: 0,
      fill: blenderRgba8ToColor(resolveWidgetColors("text", {selected: true, textInput: true}).inner),
    })
  })

  test("uses exact selection and caret roles", () => {
    const surface = new RecordingSurface()
    input(surface, 0, 0, 100, 22, {
      key: "selection",
      value: "Text",
      active: true,
      cursor: 3,
      selectionAnchor: 1,
      onChange() {},
    })

    expect(surface.rects[0]?.[4]).toEqual(blenderRgba8ToColor(blenderTheme.widgets.text.item))
    expect(surface.rects[1]?.[4]).toEqual(blenderRgba8ToColor(blenderTheme.material.widgetTextCursor))
  })

  test("draws left, center and right numeric hover zones as secondary results", () => {
    class NumericHoverSurface extends RecordingSurface {
      constructor(readonly pointerX: number) { super() }
      override hitState(): {hovered: boolean; pressed: boolean} { return {hovered: true, pressed: false} }
      override hoveredPointer(): Readonly<{x: number; y: number}> { return {x: this.pointerX, y: 11} }
    }

    for (const [zone, pointerX] of [["left", 4], ["center", 50], ["right", 96]] as const) {
      const surface = new NumericHoverSurface(pointerX)
      input(surface, 0, 0, 100, 22, {key: zone, type: "number", value: "1"})
      const expected = resolveNumericZoneColors("number", {hovered: true, numericZone: zone})
      expect(expected).not.toBeNull()
      expect(surface.roundedRects[1]?.[4].fill).toEqual(blenderRgba8ToColor(expected!.colors.inner))
      if (zone === "center") expect(surface.images).toHaveLength(0)
      else expect(surface.images[0]![5]!.tint).toEqual(blenderRgba8ToColor(expected!.colors.item))
    }

    const editing = new NumericHoverSurface(4)
    input(editing, 0, 0, 100, 22, {key: "editing", type: "number", value: "1", active: true, cursorVisible: false})
    expect(editing.roundedRects).toHaveLength(1)
    expect(editing.roundedRects[0]?.[4].fill).toEqual(blenderRgba8ToColor(
      resolveWidgetColors("number", {hovered: true, selected: true, textInput: true, numericZone: "left"}).inner,
    ))
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

describe("number input pointer gesture dispatch", () => {
  test("dispatches side steps and center text transition after a no-drag release", () => {
    for (const [x, zone, action] of [
      [4, "left", {kind: "step", direction: -1}],
      [50, "center", {kind: "text"}],
      [96, "right", {kind: "step", direction: 1}],
    ] as const) {
      const events: unknown[] = []
      const surface = new RecordingSurface()
      input(surface, 0, 0, 100, 22, {
        key: zone,
        type: "number",
        value: "1",
        onNumericGesture: (event) => events.push(event),
      })
      const options = surface.hits[0]![5] as HitOptions
      options.onPointerDown?.(x, 11, pointer())
      options.onPointerUp?.(pointer())
      expect(events).toEqual([{kind: "start", zone}, action, {kind: "end"}])
      expect(surfaceHasActiveInput(surface)).toBe(zone === "center")
    }
  })

  test("waits for the horizontal threshold and reports scrub distance with Shift", () => {
    const events: unknown[] = []
    const surface = new RecordingSurface()
    input(surface, 0, 0, 100, 22, {
      key: "scrub",
      type: "number",
      value: "1",
      onNumericGesture: (event) => events.push(event),
    })
    const options = surface.hits[0]![5] as HitOptions
    options.onPointerDown?.(50, 11, pointer())
    options.onPointerMove?.(53, 11, pointer())
    options.onPointerMove?.(55, 11, pointer({shiftKey: true}))
    options.onPointerMove?.(65, 11, pointer({shiftKey: true}))
    options.onPointerUp?.(pointer())
    expect(events).toEqual([
      {kind: "start", zone: "center"},
      {kind: "scrub", zone: "center", deltaX: 5, distanceX: 5, shiftKey: true},
      {kind: "scrub", zone: "center", deltaX: 10, distanceX: 15, shiftKey: true},
      {kind: "end"},
    ])
    expect(surfaceHasActiveInput(surface)).toBeFalse()
  })

  test("enters text immediately on Ctrl and cancels numeric edit on Escape or right press", () => {
    const ctrlEvents: unknown[] = []
    const ctrl = new RecordingSurface()
    input(ctrl, 0, 0, 100, 22, {
      key: "ctrl",
      type: "number",
      value: "1",
      onNumericGesture: (event) => ctrlEvents.push(event),
    })
    const ctrlOptions = ctrl.hits[0]![5] as HitOptions
    ctrlOptions.onPointerDown?.(50, 11, pointer({ctrlKey: true}))
    expect(ctrlEvents).toEqual([{kind: "text"}])
    expect(surfaceHasActiveInput(ctrl)).toBeTrue()

    const cancelEvents: unknown[] = []
    const cancel = new RecordingSurface()
    input(cancel, 0, 0, 100, 22, {
      key: "cancel",
      type: "number",
      value: "1",
      onNumericGesture: (event) => cancelEvents.push(event),
    })
    const cancelOptions = cancel.hits[0]![5] as HitOptions
    cancelOptions.onPointerDown?.(50, 11, pointer())
    expect(handleActiveInputKey(cancel, key("Escape"))).toBeTrue()
    expect(cancelEvents).toEqual([{kind: "start", zone: "center"}, {kind: "cancel"}])

    cancelEvents.length = 0
    cancelOptions.onPointerDown?.(50, 11, pointer())
    cancelOptions.onPointerDown?.(50, 11, pointer({button: 2}))
    expect(cancelEvents).toEqual([{kind: "start", zone: "center"}, {kind: "cancel"}])
  })

  test("publishes center move cursor and default side cursors", () => {
    class ZoneSurface extends RecordingSurface {
      constructor(readonly pointerX: number) { super() }
      override hitState(): {hovered: boolean; pressed: boolean} { return {hovered: true, pressed: false} }
      override hoveredPointer(): Readonly<{x: number; y: number}> { return {x: this.pointerX, y: 11} }
    }
    for (const [x, cursor] of [[4, "default"], [50, "ew-resize"], [96, "default"]] as const) {
      const surface = new ZoneSurface(x)
      input(surface, 0, 0, 100, 22, {key: String(x), type: "number", value: "1", onNumericGesture() {}})
      expect(surface.hits[0]?.[5]).toMatchObject({cursor, activeCursor: cursor})
    }
    const editing = new ZoneSurface(50)
    input(editing, 0, 0, 100, 22, {
      key: "editing-cursor",
      type: "number",
      value: "1",
      active: true,
      onNumericGesture() {},
    })
    expect(editing.hits[0]?.[5]).toMatchObject({cursor: "text", activeCursor: "text"})
  })
})
