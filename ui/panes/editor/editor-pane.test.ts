import {describe, expect, test} from "bun:test"
import {PANE_FRAME} from "../pane-frame.ts"
import {EditorPane, editorIndentGuideRangesForLines} from "./editor-pane.ts"

describe("EditorPane indent guides", () => {
  test("uses leading whitespace for XML-like indentation", () => {
    const ranges = editorIndentGuideRangesForLines([
      "<root>",
      "  <item>",
      "    <name>Alpha</name>",
      "  </item>",
      "</root>",
    ])

    expect(ranges).toContainEqual({column: 2, startLine: 1, endLine: 3, includesEndLine: true})
    expect(ranges).toContainEqual({column: 4, startLine: 2, endLine: 2, includesEndLine: true})
  })
})

describe("EditorPane selection", () => {
  test("tracks selected text across lines", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha\nbeta\ngamma")
      editor.setSelection(0, 2, 1, 2)
      expect(editor.hasSelection()).toBe(true)
      expect(editor.getSelectedText()).toBe("pha\nbe")
      expect(editor.getSelectionSnapshot()).toEqual({
        cursor: {line: 1, col: 2},
        anchor: {line: 0, col: 2},
        focus: {line: 1, col: 2},
        range: {
          start: {line: 0, col: 2},
          end: {line: 1, col: 2},
        },
        text: "pha\nbe",
        selections: [{
          anchor: {line: 0, col: 2},
          focus: {line: 1, col: 2},
          range: {
            start: {line: 0, col: 2},
            end: {line: 1, col: 2},
          },
          text: "pha\nbe",
        }],
      })
    } finally {
      editor.dispose()
    }
  })

  test("emits cursor and selection changes", () => {
    const snapshots: unknown[] = []
    const editor = new EditorPane({
      onSelectionChange: (snapshot) => snapshots.push(snapshot),
    })
    try {
      editor.setText("alpha")
      editor.setCursor(0, 3)
      editor.setSelection(0, 1, 0, 4)
      expect(snapshots.at(-1)).toEqual({
        cursor: {line: 0, col: 4},
        anchor: {line: 0, col: 1},
        focus: {line: 0, col: 4},
        range: {
          start: {line: 0, col: 1},
          end: {line: 0, col: 4},
        },
        text: "lph",
        selections: [{
          anchor: {line: 0, col: 1},
          focus: {line: 0, col: 4},
          range: {
            start: {line: 0, col: 1},
            end: {line: 0, col: 4},
          },
          text: "lph",
        }],
      })
    } finally {
      editor.dispose()
    }
  })

  test("does not move cursor when execution line changes", () => {
    const snapshots: unknown[] = []
    const editor = new EditorPane({
      onSelectionChange: (snapshot) => snapshots.push(snapshot),
    })
    try {
      editor.setText("alpha\nbeta\ngamma")
      editor.setCursor(1, 2)
      const beforeCount = snapshots.length

      editor.setExecutionLine(3)

      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 1, col: 2})
      expect(snapshots).toHaveLength(beforeCount)
    } finally {
      editor.dispose()
    }
  })

  test("keeps cursor after newline when execution line refreshes", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha\nbeta gamma\ndelta")
      editor.setCursor(1, 5)

      editor.insertText("\n")
      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 2, col: 0})

      editor.setExecutionLine(1)
      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 2, col: 0})
    } finally {
      editor.dispose()
    }
  })

  test("indents new line after an open block", () => {
    const editor = new EditorPane()
    try {
      editor.setText("if (ok) {")
      editor.setCursor(0, "if (ok) {".length)

      pressEnter(editor)

      expect(editor.getText()).toBe("if (ok) {\n  ")
      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 1, col: 2})
    } finally {
      editor.dispose()
    }
  })

  test("indents new line after an open parenthesis", () => {
    const editor = new EditorPane()
    try {
      editor.setText("const row = (")
      editor.setCursor(0, "const row = (".length)

      pressEnter(editor)

      expect(editor.getText()).toBe("const row = (\n  ")
      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 1, col: 2})
    } finally {
      editor.dispose()
    }
  })

  test("keeps block indentation from the previous non-empty line", () => {
    const editor = new EditorPane()
    try {
      editor.setText("if (ok) {\n  doThing()\n")
      editor.setCursor(2, 0)

      pressEnter(editor)

      expect(editor.getText()).toBe("if (ok) {\n  doThing()\n\n  ")
      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 3, col: 2})
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
      const codeX = firstEditorCodeX()
      const charW = 13 * 0.62
      const y = firstEditorLineY()
      editor.onPointerDown({shiftKey: false} as MouseEvent, codeX + charW * 1.75, y)
      editor.onPointerMove({shiftKey: false} as MouseEvent, codeX + charW * 1.9, y)
      editor.onPointerUp({shiftKey: false} as MouseEvent, codeX + charW * 1.9, y)
      expect(editor.getSelectedText()).toBe("b")
    } finally {
      editor.dispose()
    }
  })

  test("keeps same-line drag focus aligned to the release coordinates", () => {
    const editor = new EditorPane()
    try {
      editor.setText("abcdef")
      const codeX = firstEditorCodeX()
      const charW = 13 * 0.62
      const y = firstEditorLineY()
      editor.onPointerDown({shiftKey: false} as MouseEvent, codeX + charW * 1.1, y)
      editor.onPointerUp({shiftKey: false} as MouseEvent, codeX + charW * 4.2, y)
      expect(editor.getSelectedText()).toBe("bcd")
    } finally {
      editor.dispose()
    }
  })

  test("selects a word on double click", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha beta")
      const codeX = firstEditorCodeX()
      const charW = 13 * 0.62
      const y = firstEditorLineY()
      editor.onPointerDown({shiftKey: false, detail: 2} as MouseEvent, codeX + charW * 7.1, y)
      editor.onPointerUp({shiftKey: false, detail: 2} as MouseEvent, codeX + charW * 7.1, y)
      expect(editor.getSelectedText()).toBe("beta")
    } finally {
      editor.dispose()
    }
  })

  test("selects a unicode word in a comment on double click", () => {
    const editor = new EditorPane()
    try {
      editor.setText("// русский комментарий")
      const codeX = firstEditorCodeX()
      const charW = 13 * 0.62
      const y = firstEditorLineY()
      editor.onPointerDown({shiftKey: false, detail: 2} as MouseEvent, codeX + charW * 5.4, y)
      editor.onPointerUp({shiftKey: false, detail: 2} as MouseEvent, codeX + charW * 5.4, y)
      expect(editor.getSelectedText()).toBe("русский")
    } finally {
      editor.dispose()
    }
  })

  test("adds word selections with alt double click", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha beta gamma")
      const y = firstEditorLineY()

      editor.onPointerDown({shiftKey: false, altKey: false, detail: 2} as MouseEvent, 60, y)
      editor.onPointerUp({shiftKey: false, altKey: false, detail: 2} as MouseEvent, 60, y)
      editor.onPointerDown({shiftKey: false, altKey: true, detail: 2} as MouseEvent, 30, y)
      editor.onPointerUp({shiftKey: false, altKey: true, detail: 2} as MouseEvent, 30, y)

      const snapshot = editor.getSelectionSnapshot()
      expect(snapshot.text).toBe("beta")
      expect(editor.getSelectedText()).toBe("alpha\nbeta")
      expect(snapshot.selections.length).toBe(2)
      expect(snapshot.selections.map((selection) => selection.text)).toEqual(["alpha", "beta"])
      expect(snapshot.range).toEqual({start: {line: 0, col: 6}, end: {line: 0, col: 10}})
    } finally {
      editor.dispose()
    }
  })

  test("adds dragged selections while alt is held", () => {
    const editor = new EditorPane()
    try {
      editor.setText("abcdef ghijkl")
      setEditorTestSize(editor)
      editor.setSelection(0, 1, 0, 4)
      const codeX = firstEditorCodeX()
      const charW = 13 * 0.62
      const y = firstEditorLineY()

      editor.onPointerDown({shiftKey: false, altKey: true} as MouseEvent, codeX + charW * 8.1, y)
      editor.onPointerMove({shiftKey: false, altKey: true} as MouseEvent, codeX + charW * 11.2, y)
      editor.onPointerUp({shiftKey: false, altKey: true} as MouseEvent, codeX + charW * 11.2, y)

      const snapshot = editor.getSelectionSnapshot()
      expect(snapshot.text).toBe("hij")
      expect(editor.getSelectedText()).toBe("bcd\nhij")
      expect(snapshot.selections.map((selection) => selection.text)).toEqual(["bcd", "hij"])
      expect(snapshot.range).toEqual({start: {line: 0, col: 8}, end: {line: 0, col: 11}})
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

  test("deletes the current line with mac Command Delete", () => {
    const editor = new EditorPane()
    try {
      editor.setText("alpha\nbeta\ngamma")
      editor.setCursor(1, 2, {scroll: false})

      pressKey(editor, "Backspace", {metaKey: true})

      expect(editor.getText()).toBe("alpha\ngamma")
      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 1, col: 2})
    } finally {
      editor.dispose()
    }
  })
})

describe("EditorPane layout options", () => {
  test("can hide line numbers and map pointer hits from the compact code inset", () => {
    const editor = new EditorPane({showHeader: false, showLineNumbers: false})
    try {
      editor.setText("alpha beta")
      const charW = 13 * 0.62
      const x = embeddedEditorCodeX() + charW * 7.1
      const y = embeddedEditorLineY()

      editor.onPointerDown({shiftKey: false, detail: 2} as MouseEvent, x, y)
      editor.onPointerUp({shiftKey: false, detail: 2} as MouseEvent, x, y)

      expect(editor.getSelectedText()).toBe("beta")
    } finally {
      editor.dispose()
    }
  })

  test("keeps an embedded top body gap when header chrome is hidden", () => {
    const editor = new EditorPane({showHeader: false, showLineNumbers: false})
    try {
      editor.setText("alpha")
      editor.setCursor(0, 5)

      editor.onPointerDown({shiftKey: false} as MouseEvent, embeddedEditorCodeX(), 1)
      editor.onPointerUp({shiftKey: false} as MouseEvent, embeddedEditorCodeX(), 1)

      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 0, col: 5})
    } finally {
      editor.dispose()
    }
  })

  test("maps pointer hits from an edge-to-edge embedded body", () => {
    const editor = new EditorPane({showHeader: false, showLineNumbers: false, bodyInsetX: 0, bodyTopGap: 0, bodyBottomInset: 0, wrapLines: true})
    try {
      setEditorTestSize(editor)
      editor.setText("alpha beta")
      const charW = 13 * 0.62
      const x = 2 + charW * 7.1
      const y = 5

      editor.onPointerDown({shiftKey: false, detail: 2} as MouseEvent, x, y)
      editor.onPointerUp({shiftKey: false, detail: 2} as MouseEvent, x, y)

      expect(editor.getSelectedText()).toBe("beta")
    } finally {
      editor.dispose()
    }
  })

  test("maps pointer hits on wrapped visual rows back to the source line", () => {
    const editor = new EditorPane({showHeader: false, showLineNumbers: false, wrapLines: true})
    try {
      Object.assign(editor as unknown as {rectW: number; rectH: number}, {rectW: 72, rectH: 120})
      editor.setText("abcdef")
      const charW = 13 * 0.62
      const x = embeddedEditorCodeX() + charW * 1.1
      const y = embeddedEditorLineY() + 18

      editor.onPointerDown({shiftKey: false} as MouseEvent, x, y)
      editor.onPointerUp({shiftKey: false} as MouseEvent, x, y)

      expect(editor.getSelectionSnapshot().cursor).toEqual({line: 0, col: 4})
    } finally {
      editor.dispose()
    }
  })
})

function firstEditorLineY(): number {
  return PANE_FRAME.headerHeight + PANE_FRAME.bodyTopGap + 5
}

function firstEditorCodeX(): number {
  return 54
}

function embeddedEditorLineY(): number {
  return PANE_FRAME.bodyTopGap + 5
}

function embeddedEditorCodeX(): number {
  return PANE_FRAME.bodyInsetX + 2
}

function setEditorTestSize(editor: EditorPane): void {
  Object.assign(editor as unknown as {rectW: number; rectH: number}, {rectW: 520, rectH: 260})
}

function pressEnter(editor: EditorPane): void {
  pressKey(editor, "Enter")
}

function pressKey(editor: EditorPane, key: string, opts: Partial<Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey">> = {}): void {
  editor.onKey({
    key,
    code: opts.code ?? key,
    metaKey: false,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    ...opts,
    preventDefault() {},
  } as KeyboardEvent)
}
