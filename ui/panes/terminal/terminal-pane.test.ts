import {describe, expect, test} from "bun:test"
import {TrueTypeFont} from "@metafor/engine"
import {LogViewerPane, TerminalPane} from "./terminal-pane.ts"

let testFontPromise: Promise<TrueTypeFont> | null = null

function testFont(): Promise<TrueTypeFont> {
  testFontPromise ??= Bun.file(new URL("../playground/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
    .then((buffer) => new TrueTypeFont(buffer))
  return testFontPromise
}

function installRafStub(): () => void {
  const previousRaf = globalThis.requestAnimationFrame
  const previousCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
  return () => {
    globalThis.requestAnimationFrame = previousRaf
    globalThis.cancelAnimationFrame = previousCancel
  }
}

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

  test("emits final frame rect after header drag", () => {
    const changes: Array<{x: number; y: number; w: number; h: number}> = []
    const terminal = new TerminalPane({
      cols: 20,
      rows: 4,
      fitToRect: false,
      onFrameRectChange: (rect) => changes.push(rect),
    })
    let frameRect = {x: 10, y: 20, w: 300, h: 180}
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 300, rectH: 180})
      terminal.attachCanvas({
        canvas: {style: {cursor: "default"}},
        setFocused: () => {},
        inputProxy: {focus: () => {}},
        requestRender: () => {},
        surfaceFrame: () => ({rect: {...frameRect}, bounds: {w: 1000, h: 800}}),
        setSurfaceRect: (_surface: unknown, rect: typeof frameRect) => {
          frameRect = {...rect}
          return {...frameRect}
        },
      } as never)
      terminal.onPointerDown({
        button: 0,
        clientX: 100,
        clientY: 100,
        detail: 1,
        preventDefault: () => {},
      } as MouseEvent, 1, 1)
      terminal.onPointerMove({clientX: 150, clientY: 130} as MouseEvent, 51, 31)
      terminal.onPointerUp({clientX: 150, clientY: 130} as MouseEvent, 51, 31)
      expect(changes).toEqual([{x: 60, y: 50, w: 300, h: 180}])
    } finally {
      terminal.dispose()
    }
  })

  test("emits dock request from header button without starting frame drag", async () => {
    let dockRequests = 0
    const changes: Array<{x: number; y: number; w: number; h: number}> = []
    const terminal = new TerminalPane({
      cols: 20,
      rows: 4,
      fitToRect: false,
      onFrameDockRequest: () => {
        dockRequests += 1
      },
      onFrameRectChange: (rect) => changes.push(rect),
    })
    let frameRect = {x: 10, y: 20, w: 300, h: 180}
    const restoreRaf = installRafStub()
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 300, rectH: 180})
      terminal.attachCanvas({
        canvas: {style: {cursor: "default"}},
        renderer: {invalidateGeometry: () => {}},
        uiRectToFramebufferClipBounds: (xMin: number, yMin: number, xMax: number, yMax: number) => [xMin, yMin, xMax, yMax],
        setFocused: () => {},
        inputProxy: {focus: () => {}},
        requestRender: () => {},
        surfaceFrame: () => ({rect: {...frameRect}, bounds: {w: 1000, h: 800}}),
        setSurfaceRect: (_surface: unknown, rect: typeof frameRect) => {
          frameRect = {...rect}
          return {...frameRect}
        },
      } as never)
      terminal.setRect({x: 10, y: 20, w: 300, h: 180}, 1, await testFont())
      terminal.onPointerDown({
        button: 0,
        clientX: 80,
        clientY: 100,
        detail: 1,
        preventDefault: () => {},
      } as MouseEvent, 173, 19)
      terminal.onPointerMove({clientX: 130, clientY: 120} as MouseEvent, 173, 19)
      terminal.onPointerUp({clientX: 130, clientY: 120} as MouseEvent, 173, 19)
      expect(dockRequests).toBe(1)
      expect(changes).toEqual([])
      expect(frameRect).toEqual({x: 10, y: 20, w: 300, h: 180})
    } finally {
      terminal.dispose()
      restoreRaf()
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

  test("maps Shift+Enter to an input newline without submitting CR", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      terminal.onKey(keyEvent("Enter", {shiftKey: true}))
      terminal.onKey(keyEvent("Enter"))
      expect(responses).toEqual(["\n", "\r"])
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

  test("maps ctrl letter chords by physical key code across keyboard layouts", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      const ctrlC = keyEvent("с", {code: "KeyC", ctrlKey: true})
      const ctrlV = keyEvent("м", {code: "KeyV", ctrlKey: true})
      const ctrlA = keyEvent("ф", {code: "KeyA", ctrlKey: true})
      const ctrlEsc = keyEvent("х", {code: "BracketLeft", ctrlKey: true})
      terminal.onKey(ctrlC)
      terminal.onKey(ctrlV)
      terminal.onKey(ctrlA)
      terminal.onKey(ctrlEsc)
      expect(responses).toEqual(["\x03", "\x16", "\x01", "\x1b"])
      expect(ctrlC.defaultPrevented).toBe(true)
      expect(ctrlV.defaultPrevented).toBe(true)
      expect(ctrlA.defaultPrevented).toBe(true)
      expect(ctrlEsc.defaultPrevented).toBe(true)
    } finally {
      terminal.dispose()
    }
  })

  test("maps meta shortcuts by physical key code across keyboard layouts", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("alpha\r\nbeta")
      const selectAll = keyEvent("ф", {code: "KeyA", metaKey: true})
      terminal.onKey(selectAll)
      expect(selectAll.defaultPrevented).toBe(true)
      expect(terminal.getSelectedText()).toBe("alpha\nbeta")

      const clear = keyEvent("л", {code: "KeyK", metaKey: true})
      terminal.onKey(clear)
      expect(clear.defaultPrevented).toBe(true)
      expect(terminal.toText()).toBe("")
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

describe("TerminalPane local echo", () => {
  test("renders a printable key immediately and suppresses matching PTY echo", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      expect(terminal.tryLocalEcho("a")).toBe(true)
      expect(terminal.toText()).toBe("prompt a")
      terminal.writeAuthoritative("a")
      expect(terminal.toText()).toBe("prompt a")
      terminal.writeAuthoritative("b")
      expect(terminal.toText()).toBe("prompt ab")
    } finally {
      terminal.dispose()
    }
  })

  test("rolls back optimistic echo when PTY output disagrees", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      expect(terminal.tryLocalEcho("a")).toBe(true)
      terminal.writeAuthoritative("x")
      expect(terminal.toText()).toBe("prompt x")
    } finally {
      terminal.dispose()
    }
  })

  test("keeps pending local echo across partial authoritative matches", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      expect(terminal.tryLocalEcho("a")).toBe(true)
      expect(terminal.tryLocalEcho("b")).toBe(true)
      terminal.writeAuthoritative("a")
      expect(terminal.toText()).toBe("prompt ab")
      terminal.writeAuthoritative("x")
      expect(terminal.toText()).toBe("prompt ax")
    } finally {
      terminal.dispose()
    }
  })

  test("shows replaceable input preview without committing terminal output", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      terminal.setInputPreview("альфа")
      expect(terminal.toText()).toBe("prompt альфа")
      terminal.setInputPreview("альфа бета")
      expect(terminal.toText()).toBe("prompt альфа бета")
      terminal.clearInputPreview()
      expect(terminal.toText()).toBe("prompt")
    } finally {
      terminal.dispose()
    }
  })

  test("clears input preview before committed input output", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      terminal.setInputPreview("draft")
      terminal.clearInputPreview()
      terminal.writeAuthoritative("server")
      expect(terminal.toText()).toBe("prompt server")
    } finally {
      terminal.dispose()
    }
  })

  test("keeps input preview visible across authoritative repaints", () => {
    const terminal = new TerminalPane({cols: 30, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      terminal.setInputPreview("говорю")
      terminal.writeAuthoritative("\rprompt ")
      expect(terminal.toText()).toBe("prompt говорю")
    } finally {
      terminal.dispose()
    }
  })

  test("disables local echo state in alternate screen mode", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      expect(terminal.getTerminalState().localEcho).toBe(true)
      terminal.write("\x1b[?1049h")
      expect(terminal.getTerminalState().alternateScreen).toBe(true)
      expect(terminal.getTerminalState().localEcho).toBe(false)
      terminal.write("\x1b[?1049l")
      expect(terminal.getTerminalState().alternateScreen).toBe(false)
      expect(terminal.getTerminalState().localEcho).toBe(true)
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

describe("TerminalPane wrapping", () => {
  test("keeps terminal wrapping immediate for active PTY input", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      terminal.write("command")
      expect(terminal.toText()).toBe("prompt command")
    } finally {
      terminal.dispose()
    }
  })

  test("wraps terminal output without horizontal scroll by default", () => {
    const terminal = new TerminalPane({cols: 10, rows: 4, fitToRect: false})
    try {
      terminal.write("0123456789abc")
      expect(terminal.toText()).toBe("0123456789\nabc")
    } finally {
      terminal.dispose()
    }
  })
})
