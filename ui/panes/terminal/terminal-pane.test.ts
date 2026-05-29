import {describe, expect, test} from "bun:test"
import {LogViewerPane, TerminalPane} from "./terminal-pane.ts"

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

describe("TerminalPane focus", () => {
  test("focuses its runtime input proxy on terminal body click", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    let focusedSurface: unknown = null
    let inputFocused = false
    try {
      terminal.attachCanvas({
        setFocused: (surface: unknown) => {
          focusedSurface = surface
        },
        inputProxy: {
          focus: () => {
            inputFocused = true
          },
        },
        requestRender: () => {},
      } as never)
      terminal.onPointerDown({shiftKey: false, detail: 1} as MouseEvent, 2, 40)
      expect(focusedSurface).toBe(terminal)
      expect(inputFocused).toBe(true)
    } finally {
      terminal.dispose()
    }
  })
})

describe("LogViewerPane", () => {
  test("reuses terminal output rendering without accepting input", () => {
    const logViewer = new LogViewerPane({cols: 32, rows: 4, fitToRect: false})
    try {
      logViewer.write("\x1b[36mBuild\x1b[0m started\r\nDone")
      expect(logViewer.toText()).toBe("Build started\nDone")
      expect("setInputEnabled" in logViewer).toBe(false)
      expect("onInputText" in logViewer).toBe(false)
    } finally {
      logViewer.dispose()
    }
  })

  test("keeps selection and copy API for logs", () => {
    const logViewer = new LogViewerPane({cols: 24, rows: 4, fitToRect: false})
    try {
      logViewer.write("alpha\r\nbeta\r\n")
      logViewer.setSelection(0, 1, 1, 3)
      expect(logViewer.getSelectedText()).toBe("lpha\nbet")
    } finally {
      logViewer.dispose()
    }
  })

  test("can clip long log lines without horizontal scroll state", () => {
    const logViewer = new LogViewerPane({cols: 8, rows: 4, fitToRect: false, wrapLines: false})
    try {
      logViewer.write("0123456789\nnext")
      expect(logViewer.toText()).toBe("01234567\nnext")
    } finally {
      logViewer.dispose()
    }
  })

  test("wraps log output by words", () => {
    const logViewer = new LogViewerPane({cols: 10, rows: 4, fitToRect: false})
    try {
      logViewer.write("alpha beta gamma")
      expect(logViewer.toText()).toBe("alpha beta\ngamma")
    } finally {
      logViewer.dispose()
    }
  })

  test("starts a wrapped word at column zero", () => {
    const logViewer = new LogViewerPane({cols: 10, rows: 4, fitToRect: false})
    try {
      logViewer.write("123456789 word")
      expect(logViewer.toText()).toBe("123456789\nword")
    } finally {
      logViewer.dispose()
    }
  })

  test("reflows word wrapped logs after resize", () => {
    const logViewer = new LogViewerPane({cols: 80, rows: 4, fitToRect: false})
    try {
      logViewer.write("Long log records wrap into the visible pane width without clipping early")
      logViewer.setTerminalSize(32, 4)
      const lines = logViewer.toText().split("\n")
      expect(lines.length).toBeGreaterThan(1)
      expect(lines.every((line) => line.length <= 32)).toBe(true)
    } finally {
      logViewer.dispose()
    }
  })
})
