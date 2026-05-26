import {describe, expect, test} from "bun:test"
import {createInputEditState, handleInputKey, insertInputText} from "./input.ts"

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
