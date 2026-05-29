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

describe("TerminalPane control sequences", () => {
  test("keeps last-column wrap pending until the next printable glyph", () => {
    const terminal = new TerminalPane({cols: 4, rows: 3, fitToRect: false})
    try {
      terminal.write("1234\rX")
      expect(terminal.toText()).toBe("X234")
    } finally {
      terminal.dispose()
    }
  })

  test("lets zsh erase its inverse partial-line marker", () => {
    const terminal = new TerminalPane({cols: 8, rows: 3, fitToRect: false})
    try {
      terminal.write("\x1b[1m\x1b[7m%\x1b[27m\x1b[0m       \r \r\r\x1b[Jprompt")
      expect(terminal.toText()).toBe("prompt")
    } finally {
      terminal.dispose()
    }
  })

  test("keeps scroll-region line feeds inside the configured margins", () => {
    const terminal = new TerminalPane({cols: 8, rows: 4, fitToRect: false})
    try {
      terminal.write("aaaa\r\nbbbb\r\ncccc\r\ndddd")
      terminal.write("\x1b[2;3r\x1b[3;1H\nZZ")
      expect(terminal.toText()).toBe("aaaa\ncccc\nZZ\ndddd")
    } finally {
      terminal.dispose()
    }
  })

  test("keeps reverse-index scrolls inside the configured margins", () => {
    const terminal = new TerminalPane({cols: 8, rows: 4, fitToRect: false})
    try {
      terminal.write("aaaa\r\nbbbb\r\ncccc\r\ndddd")
      terminal.write("\x1b[2;3r\x1b[2;1H\x1bMZZ")
      expect(terminal.toText()).toBe("aaaa\nZZ\nbbbb\ndddd")
    } finally {
      terminal.dispose()
    }
  })

  test("answers terminal cursor-position and device-attributes queries through input callback", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      terminal.write("\x1b[2;3H\x1b[6n\x1b[c")
      expect(responses).toEqual(["\x1b[2;3R", "\x1b[?1;2c"])
    } finally {
      terminal.dispose()
    }
  })

  test("answers OSC terminal color queries through input callback", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      terminal.write("\x1b]10;?\x1b\\\x1b]11;?\x1b\\\x1b]12;?\x07")
      expect(responses).toHaveLength(3)
      expect(responses[0]?.startsWith("\x1b]10;rgb:")).toBe(true)
      expect(responses[1]?.startsWith("\x1b]11;rgb:")).toBe(true)
      expect(responses[2]?.startsWith("\x1b]12;rgb:")).toBe(true)
    } finally {
      terminal.dispose()
    }
  })

  test("uses application cursor key mode for fullscreen terminal apps", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      terminal.write("\x1b[?1h")
      terminal.onKey(keyEvent("ArrowUp"))
      terminal.onKey(keyEvent("ArrowRight", {ctrlKey: true}))
      expect(responses).toEqual(["\x1bOA", "\x1b[1;5C"])
    } finally {
      terminal.dispose()
    }
  })

  test("maps xterm function keys and shifted variants", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      terminal.onKey(keyEvent("F1"))
      terminal.onKey(keyEvent("F5"))
      terminal.onKey(keyEvent("F12", {shiftKey: true}))
      expect(responses).toEqual(["\x1bOP", "\x1b[15~", "\x1b[24;2~"])
    } finally {
      terminal.dispose()
    }
  })

  test("maps Escape to a plain ESC byte", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      terminal.onKey(keyEvent("Escape"))
      expect(responses).toEqual(["\x1b"])
    } finally {
      terminal.dispose()
    }
  })

  test("maps application keypad and bracketed paste modes", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      terminal.write("\x1b=\x1b[?2004h")
      terminal.onKey(keyEvent("2", {code: "Numpad2"}))
      terminal.onInputText("alpha")
      expect(responses).toEqual(["\x1bOr", "\x1b[200~alpha\x1b[201~"])
    } finally {
      terminal.dispose()
    }
  })

  test("normalizes terminal spacing around wide emoji glyphs", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("✨\u200aUpdate")
      expect(terminal.toText()).toBe("✨ Update")
    } finally {
      terminal.dispose()
    }
  })
})

function keyEvent(
  key: string,
  init: Partial<Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey">> = {},
): KeyboardEvent {
  const event = {
    key,
    code: init.code ?? key,
    altKey: init.altKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    preventDefault() {
      event.defaultPrevented = true
    },
    defaultPrevented: false,
  }
  return event as unknown as KeyboardEvent
}

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
