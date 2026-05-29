import {describe, expect, test} from "bun:test"
import {TerminalPane} from "./terminal-pane.ts"

describe("TerminalPane selection", () => {
  test("tracks selected terminal text across lines", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("alpha\r\nbeta\r\ngamma")
      terminal.setSelection(0, 2, 1, 2)
      expect(terminal.hasSelection()).toBe(true)
      expect(terminal.getSelectedText()).toBe("pha\nbe")
    } finally {
      terminal.dispose()
    }
  })

  test("selects all non-empty output lines", () => {
    const terminal = new TerminalPane({cols: 20, rows: 5, fitToRect: false})
    try {
      terminal.write("alpha\r\nbeta")
      terminal.selectAll()
      expect(terminal.getSelectedText()).toBe("alpha\nbeta")
    } finally {
      terminal.dispose()
    }
  })
})
