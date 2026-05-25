import {describe, expect, test} from "bun:test"
import {EditorPane} from "./editor-pane.ts"

describe("EditorPane selection", () => {
  test("tracks selected text across lines", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha\nbeta\ngamma")
      editor.setSelection(0, 2, 1, 2)
      expect(editor.hasSelection()).toBe(true)
      expect(editor.getSelectedText()).toBe("pha\nbe")
    } finally {
      editor.dispose()
    }
  })

  test("tracks a single-character selection", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha")
      editor.setSelection(0, 1, 0, 2)
      expect(editor.hasSelection()).toBe(true)
      expect(editor.getSelectedText()).toBe("l")
    } finally {
      editor.dispose()
    }
  })

  test("selects one character with a short right drag inside the same glyph", () => {
    const editor = new EditorPane()
    try {
      editor.setText("abc")
      const codeX = 60
      const charW = 13 * 0.62
      const y = 39
      editor.onPointerDown({shiftKey: false} as MouseEvent, codeX + charW * 1.75, y)
      editor.onPointerMove({shiftKey: false} as MouseEvent, codeX + charW * 1.9, y)
      editor.onPointerUp({shiftKey: false} as MouseEvent, codeX + charW * 1.9, y)
      expect(editor.getSelectedText()).toBe("b")
    } finally {
      editor.dispose()
    }
  })

  test("selects characters from same-line release coordinates", () => {
    const editor = new EditorPane()
    try {
      editor.setText("abcdef")
      const codeX = 60
      const charW = 13 * 0.62
      const y = 39
      editor.onPointerDown({shiftKey: false} as MouseEvent, codeX + charW * 1.1, y)
      editor.onPointerUp({shiftKey: false} as MouseEvent, codeX + charW * 4.2, y)
      expect(editor.getSelectedText()).toBe("bcde")
    } finally {
      editor.dispose()
    }
  })

  test("replaces selection when inserting text", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha\nbeta\ngamma")
      editor.setSelection(0, 2, 1, 2)
      editor.insertText("X")
      expect(editor.getText()).toBe("alXta\ngamma")
      expect(editor.hasSelection()).toBe(false)
    } finally {
      editor.dispose()
    }
  })

  test("selects all text for replacement", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha\nbeta")
      editor.selectAll()
      expect(editor.getSelectedText()).toBe("alpha\nbeta")
      editor.insertText("done")
      expect(editor.getText()).toBe("done")
    } finally {
      editor.dispose()
    }
  })
})
