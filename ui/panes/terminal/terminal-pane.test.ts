import {beforeAll, describe, expect, test} from "bun:test"
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

function touchMouseEvent(overrides: Partial<MouseEvent> = {}): MouseEvent {
  return {
    button: 0,
    buttons: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    detail: 1,
    preventDefault: () => {},
    metaforPointerType: "touch",
    ...overrides,
  } as MouseEvent
}

function touchCompatibilityMouseEvent(overrides: Partial<MouseEvent> = {}): MouseEvent {
  return {
    button: 0,
    buttons: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    detail: 1,
    preventDefault: () => {},
    sourceCapabilities: {firesTouchEvents: true},
    ...overrides,
  } as unknown as MouseEvent
}

function mouseEvent(overrides: Partial<MouseEvent> = {}): MouseEvent {
  return {
    button: 0,
    buttons: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    detail: 1,
    preventDefault: () => {},
    ...overrides,
  } as MouseEvent
}

function wheelEvent(overrides: Partial<WheelEvent> = {}): WheelEvent {
  const event = {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    timeStamp: 1,
    preventDefault() {
      event.defaultPrevented = true
    },
    defaultPrevented: false,
    ...overrides,
  }
  return event as unknown as WheelEvent
}

function withControlledRaf<T>(fn: (flush: () => void) => T): T {
  const previousRaf = globalThis.requestAnimationFrame
  const previousCancel = globalThis.cancelAnimationFrame
  let now = 1
  let nextId = 1
  let queue: Array<{id: number; callback: FrameRequestCallback}> = []
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    const id = nextId++
    queue.push({id, callback})
    return id
  }) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) => {
    queue = queue.filter((item) => item.id !== id)
  }) as typeof cancelAnimationFrame
  const flush = () => {
    for (let guard = 0; queue.length > 0 && guard < 240; guard++) {
      const item = queue.shift()
      if (item === undefined) break
      now += 16
      item.callback(now)
    }
    if (queue.length > 0) throw new Error("RAF queue did not settle")
  }
  try {
    return fn(flush)
  } finally {
    globalThis.requestAnimationFrame = previousRaf
    globalThis.cancelAnimationFrame = previousCancel
  }
}

async function renderTerminalForWheel(terminal: TerminalPane, rect = {x: 0, y: 0, w: 220, h: 68}): Promise<void> {
  terminal.attachCanvas({
    canvas: {style: {cursor: "default"}},
    renderer: {invalidateGeometry: () => {}, pixelRatio: 1},
    uiRectToFramebufferClipBounds: (xMin: number, yMin: number, xMax: number, yMax: number) => [xMin, yMin, xMax, yMax],
    setFocused: () => {},
    inputProxy: {focus: () => {}},
    requestRender: () => {},
  } as never)
  terminal.setRect(rect, 1, await testFont())
}

function terminalScrollTop(terminal: TerminalPane): number {
  return (terminal as unknown as {outputScrollPosition(): {top: number}}).outputScrollPosition().top
}

function terminalScrollTo(terminal: TerminalPane, top: number): void {
  ;(terminal as unknown as {outputScrollTo(pos: {top?: number}): void}).outputScrollTo({top})
}

beforeAll(() => {
  installRafStub()
})

describe("TerminalPane selection", () => {
  test("tracks selected terminal text across lines", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("alpha\r\nbeta\r\ngamma")
      terminal.setSelection(0, 2, 1, 2)
      expect(terminal.hasSelection()).toBe(true)
      expect(terminal.getSelectedText()).toBe("pha\nbe")
      expect(terminal.selectionSnapshot()).toEqual({
        anchor: {line: 0, col: 2},
        focus: {line: 1, col: 2},
        start: {line: 0, col: 2},
        end: {line: 1, col: 2},
        text: "pha\nbe",
      })
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

  test("uses touch drag to scroll output instead of selecting text", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false})
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 220, rectH: 68})
      for (let i = 0; i < 24; i++) terminal.writeln(`line ${i}`)
      terminal.scrollToBottom()
      const before = terminalScrollTop(terminal)

      terminal.onPointerDown(touchMouseEvent(), 20, 52)
      terminal.onPointerMove(touchMouseEvent(), 20, 88)
      terminal.onPointerUp(touchMouseEvent({buttons: 0}), 20, 88)

      expect(terminalScrollTop(terminal)).toBeLessThan(before)
      expect(terminal.hasSelection()).toBe(false)
    } finally {
      terminal.dispose()
    }
  })

  test("pins autoscroll to bottom after explicit toggle", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false})
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 220, rectH: 68})
      for (let i = 0; i < 24; i++) terminal.writeln(`line ${i}`)
      terminal.scrollToBottom()
      const firstBottom = terminalScrollTop(terminal)

      terminalScrollTo(terminal, 0)
      expect(terminalScrollTop(terminal), "ручной скролл должен увести терминал наверх").toBe(0)

      terminal.setAutoscrollPinned(true)
      expect(terminal.isAutoscrollPinned(), "автоскролл должен стать включенным").toBe(true)
      expect(terminalScrollTop(terminal), "включение автоскролла должно сразу проскроллить вниз").toBe(firstBottom)

      terminalScrollTo(terminal, 0)
      terminal.writeln("tail")
      expect(terminalScrollTop(terminal), "новый вывод должен вернуть закрепленный терминал вниз").toBeGreaterThan(firstBottom)
    } finally {
      terminal.dispose()
    }
  })

  test("starts touch selection only after a long press", async () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false})
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 220, rectH: 68})
      terminal.write("alpha beta")

      terminal.onPointerDown(touchMouseEvent(), 12, 10)
      expect(terminal.hasSelection()).toBe(false)

      await Bun.sleep(540)

      expect(terminal.getSelectedText()).toBe("alpha")
      terminal.onPointerUp(touchMouseEvent({buttons: 0}), 12, 10)
      expect(terminal.getSelectedText()).toBe("alpha")
    } finally {
      terminal.dispose()
    }
  })

  test("ignores Android compatibility mouse tap for selection", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false})
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 220, rectH: 68})
      terminal.write("alpha beta")

      terminal.onPointerDown(touchCompatibilityMouseEvent(), 12, 10)
      terminal.onPointerUp(touchCompatibilityMouseEvent({buttons: 0}), 12, 10)

      expect(terminal.hasSelection()).toBe(false)
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

  test("does not move from header drag by default", () => {
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
      expect(changes).toEqual([])
      expect(frameRect).toEqual({x: 10, y: 20, w: 300, h: 180})
    } finally {
      terminal.dispose()
    }
  })

  test("emits final frame rect after draggable header drag", () => {
    const previews: Array<{x: number; y: number; w: number; h: number}> = []
    const changes: Array<{x: number; y: number; w: number; h: number}> = []
    const terminal = new TerminalPane({
      cols: 20,
      rows: 4,
      fitToRect: false,
      draggable: true,
      onFrameRectPreview: (rect) => previews.push(rect),
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
      expect(previews).toEqual([{x: 60, y: 50, w: 300, h: 180}])
      expect(changes).toEqual([])
      terminal.onPointerUp({clientX: 150, clientY: 130} as MouseEvent, 51, 31)
      expect(changes).toEqual([{x: 60, y: 50, w: 300, h: 180}])
    } finally {
      terminal.dispose()
    }
  })

  test("does not resize from edge drag by default", () => {
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
        clientX: 300,
        clientY: 180,
        detail: 1,
        preventDefault: () => {},
      } as MouseEvent, 299, 179)
      terminal.onPointerMove({clientX: 340, clientY: 220} as MouseEvent, 339, 219)
      terminal.onPointerUp({clientX: 340, clientY: 220} as MouseEvent, 339, 219)
      expect(changes).toEqual([])
      expect(frameRect).toEqual({x: 10, y: 20, w: 300, h: 180})
    } finally {
      terminal.dispose()
    }
  })

  test("emits final frame rect after resizable edge drag", () => {
    const previews: Array<{x: number; y: number; w: number; h: number}> = []
    const changes: Array<{x: number; y: number; w: number; h: number}> = []
    const terminal = new TerminalPane({
      cols: 20,
      rows: 4,
      fitToRect: false,
      resizable: true,
      onFrameRectPreview: (rect) => previews.push(rect),
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
        clientX: 300,
        clientY: 180,
        detail: 1,
        preventDefault: () => {},
      } as MouseEvent, 299, 179)
      terminal.onPointerMove({clientX: 340, clientY: 220} as MouseEvent, 339, 219)
      expect(previews).toEqual([{x: 10, y: 20, w: 340, h: 220}])
      expect(changes).toEqual([])
      terminal.onPointerUp({clientX: 340, clientY: 220} as MouseEvent, 339, 219)
      expect(changes).toEqual([{x: 10, y: 20, w: 340, h: 220}])
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
      draggable: true,
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
        clientX: 36,
        clientY: 100,
        detail: 1,
        preventDefault: () => {},
      } as MouseEvent, 23, 19)
      terminal.onPointerMove({clientX: 86, clientY: 120} as MouseEvent, 23, 19)
      terminal.onPointerUp({clientX: 86, clientY: 120} as MouseEvent, 23, 19)
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

  test("keeps toText fresh after writes and clear", () => {
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false})
    try {
      terminal.write("alpha\r\nbeta")
      expect(terminal.toText()).toBe("alpha\nbeta")

      terminal.write("\r\ngamma")
      expect(terminal.toText()).toBe("alpha\nbeta\ngamma")

      terminal.clear()
      expect(terminal.toText()).toBe("")

      terminal.write("next")
      expect(terminal.toText()).toBe("next")
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

  test("keeps insert and delete line operations inside the scroll region", () => {
    const terminal = new TerminalPane({cols: 8, rows: 4, fitToRect: false})
    try {
      terminal.write("aaaa\r\nbbbb\r\ncccc\r\ndddd")
      terminal.write("\x1b[2;3r\x1b[2;1H\x1b[LII")
      expect(terminal.toText()).toBe("aaaa\nII\nbbbb\ndddd")

      terminal.write("\x1b[2;3r\x1b[2;1H\x1b[M")
      expect(terminal.toText()).toBe("aaaa\nbbbb\n\ndddd")
    } finally {
      terminal.dispose()
    }
  })

  test("keeps cursor position when erasing the display", () => {
    const terminal = new TerminalPane({cols: 8, rows: 3, fitToRect: false})
    try {
      terminal.write("abc\x1b[2JZ")
      expect(terminal.toText()).toBe("   Z")
    } finally {
      terminal.dispose()
    }
  })

  test("honors DEC origin and autowrap modes", () => {
    const terminal = new TerminalPane({cols: 4, rows: 4, fitToRect: false})
    try {
      terminal.write("aaaa\r\nbbbb\r\ncccc\r\ndddd")
      terminal.write("\x1b[2;3r\x1b[?6h\x1b[1;1HOO")
      expect(terminal.toText()).toBe("aaaa\nOObb\ncccc\ndddd")

      terminal.clear()
      terminal.write("\x1b[?7l12345\x1b[?7hZ")
      expect(terminal.toText()).toBe("1234\nZ")
    } finally {
      terminal.dispose()
    }
  })

  test("answers terminal cursor-position and device-attributes queries through input callback", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false, onInput: (data) => responses.push(data)})
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

  test("can leave terminal query responses to the PTY server", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({
      cols: 20,
      rows: 4,
      fitToRect: false,
      respondToTerminalQueries: false,
      onInput: (data) => responses.push(data),
    })
    try {
      terminal.write("\x1b[2;3H\x1b[6n\x1b[c\x1b]11;?\x1b\\")

      expect(responses).toEqual([])
    } finally {
      terminal.dispose()
    }
  })

  test("can answer only cursor-position queries when PTY server owns other probes", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({
      cols: 20,
      rows: 4,
      fitToRect: false,
      respondToTerminalQueries: false,
      terminalQueryMode: "cursor",
      onInput: (data) => responses.push(data),
    })
    try {
      terminal.write("\x1b[2;3H\x1b[6n\x1b[c\x1b]11;?\x1b\\")

      expect(responses).toEqual(["\x1b[2;3R"])
    } finally {
      terminal.dispose()
    }
  })

  test("sends SGR mouse events when terminal mouse tracking is enabled", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false, onInput: (data) => responses.push(data)})
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 300, rectH: 180})
      terminal.write("\x1b[?1000;1002;1006h")
      terminal.onPointerDown({button: 0, shiftKey: false, altKey: false, ctrlKey: false, detail: 1, preventDefault: () => {}} as MouseEvent, 20, 20)
      terminal.onPointerMove({button: 0, shiftKey: false, altKey: false, ctrlKey: false, preventDefault: () => {}} as MouseEvent, 32, 20)
      terminal.onPointerUp({button: 0, shiftKey: false, altKey: false, ctrlKey: false, preventDefault: () => {}} as MouseEvent, 32, 20)

      expect(responses[0]).toMatch(/^\x1b\[<0;\d+;\d+M$/)
      expect(responses[1]).toMatch(/^\x1b\[<32;\d+;\d+M$/)
      expect(responses[2]).toMatch(/^\x1b\[<0;\d+;\d+m$/)
    } finally {
      terminal.dispose()
    }
  })

  test("keeps Shift mouse gestures for terminal text selection", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false, onInput: (data) => responses.push(data)})
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 300, rectH: 180})
      terminal.write("alpha beta\r\nsecond")
      terminal.write("\x1b[?1000;1002;1006h")
      terminal.onPointerDown({button: 0, shiftKey: true, altKey: false, ctrlKey: false, detail: 1, preventDefault: () => {}} as MouseEvent, 20, 20)
      terminal.onPointerMove({button: 0, shiftKey: true, altKey: false, ctrlKey: false, preventDefault: () => {}} as MouseEvent, 20, 60)
      terminal.onPointerUp({button: 0, shiftKey: true, altKey: false, ctrlKey: false, preventDefault: () => {}} as MouseEvent, 20, 60)

      expect(responses).toEqual([])
      expect(terminal.hasSelection()).toBe(true)
    } finally {
      terminal.dispose()
    }
  })

  test("sends SGR wheel events to mouse-aware terminal apps", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false, onInput: (data) => responses.push(data)})
    try {
      Object.assign(terminal as unknown as {rectW: number; rectH: number}, {rectW: 300, rectH: 180})
      terminal.write("\x1b[?1000;1006h")
      terminal.onWheel({deltaY: -80, shiftKey: false, altKey: false, ctrlKey: false, preventDefault: () => {}} as WheelEvent, 20, 20)
      terminal.onWheel({deltaY: 80, shiftKey: false, altKey: false, ctrlKey: false, preventDefault: () => {}} as WheelEvent, 20, 20)

      expect(responses[0]).toMatch(/^\x1b\[<64;\d+;\d+M$/)
      expect(responses[1]).toMatch(/^\x1b\[<65;\d+;\d+M$/)
    } finally {
      terminal.dispose()
    }
  })

  test("can keep wheel scrolling local scrollback while terminal mouse tracking is enabled", async () => {
    const responses: string[] = []
    const terminal = new TerminalPane({
      cols: 20,
      rows: 4,
      fitToRect: false,
      showHeader: false,
      terminalMouseWheelMode: "scrollback",
      onInput: (data) => responses.push(data),
    })
    try {
      await renderTerminalForWheel(terminal)
      for (let i = 0; i < 24; i++) terminal.writeln(`line ${i}`)
      terminal.write("\x1b[?1000;1006h")
      terminal.scrollToBottom()
      await renderTerminalForWheel(terminal)
      const before = terminalScrollTop(terminal)

      const event = wheelEvent({deltaY: -80})
      withControlledRaf((flush) => {
        terminal.onWheel(event, 20, 20)
        flush()
      })

      expect(responses).toEqual([])
      expect(event.defaultPrevented).toBe(true)
      expect(terminalScrollTop(terminal)).toBeLessThan(before)
    } finally {
      terminal.dispose()
    }
  })

  test("keeps ANSI foreground, background, and truecolor styles", () => {
    const terminal = new TerminalPane({cols: 24, rows: 5, fitToRect: false})
    try {
      terminal.write("\x1b[31m-old\x1b[0m\r\n")
      terminal.write("\x1b[32m+new\x1b[0m\r\n")
      terminal.write("\x1b[48;5;22m bg \x1b[0m\r\n")
      terminal.write("\x1b[38:2::255:0:0mcolon\x1b[0m")

      const styles = terminal.getStyleSnapshot()
      expect(styles[0]?.[0]?.fg).toEqual({kind: "ansi", index: 1})
      expect(styles[1]?.[0]?.fg).toEqual({kind: "ansi", index: 2})
      expect(styles[2]?.[0]?.bg).toEqual({kind: "rgb", r: 0, g: 95, b: 0})
      expect(styles[3]?.[0]?.fg).toEqual({kind: "rgb", r: 255, g: 0, b: 0})
    } finally {
      terminal.dispose()
    }
  })

  test("keeps xterm underline color styles", () => {
    const terminal = new TerminalPane({cols: 12, rows: 2, fitToRect: false})
    try {
      terminal.write("\x1b[4;58;2;10;20;30munder\x1b[59mline")

      const styles = terminal.getStyleSnapshot()
      expect(styles[0]?.[0]?.underline).toBe(true)
      expect(styles[0]?.[0]?.underlineColor).toEqual({kind: "rgb", r: 10, g: 20, b: 30})
      expect(styles[0]?.[5]?.underline).toBe(true)
      expect(styles[0]?.[5]?.underlineColor).toBeNull()
    } finally {
      terminal.dispose()
    }
  })

  test("applies OSC terminal default background colors", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 6, rows: 2, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      terminal.write("\x1b]11;#123456\x07A")

      let styles = terminal.getStyleSnapshot()
      expect(styles[0]?.[0]?.ch).toBe("A")
      expect(styles[0]?.[0]?.bg).toEqual({kind: "rgb", r: 18, g: 52, b: 86})
      expect(styles[0]?.[1]?.bg).toEqual({kind: "rgb", r: 18, g: 52, b: 86})

      terminal.write("\x1b]11;?\x1b\\")
      expect(responses.at(-1)).toBe("\x1b]11;rgb:1212/3434/5656\x1b\\")

      terminal.write("\x1b]111\x1b\\")
      styles = terminal.getStyleSnapshot()
      expect(styles[0]?.[0]?.bg).toBeNull()
    } finally {
      terminal.dispose()
    }
  })

  test("uses the current background for erased characters", () => {
    const terminal = new TerminalPane({cols: 8, rows: 2, fitToRect: false})
    try {
      terminal.write("abcdef")
      terminal.write("\r\x1b[48;5;22m\x1b[4X\x1b[0m")

      const styles = terminal.getStyleSnapshot()
      expect(terminal.toText()).toBe("    ef")
      for (let col = 0; col < 4; col++) {
        expect(styles[0]?.[col]?.ch).toBe(" ")
        expect(styles[0]?.[col]?.bg).toEqual({kind: "rgb", r: 0, g: 95, b: 0})
      }
      expect(styles[0]?.[4]?.bg).toBeNull()
    } finally {
      terminal.dispose()
    }
  })

  test("repeats the previous cell with its background", () => {
    const terminal = new TerminalPane({cols: 8, rows: 2, fitToRect: false})
    try {
      terminal.write("\x1b[48;5;22m \x1b[5b\x1b[0mX")

      const styles = terminal.getStyleSnapshot()
      expect(terminal.toText()).toBe("      X")
      for (let col = 0; col < 6; col++) {
        expect(styles[0]?.[col]?.ch).toBe(" ")
        expect(styles[0]?.[col]?.bg).toEqual({kind: "rgb", r: 0, g: 95, b: 0})
      }
      expect(styles[0]?.[6]?.ch).toBe("X")
      expect(styles[0]?.[6]?.bg).toBeNull()
    } finally {
      terminal.dispose()
    }
  })

  test("does not infer diff colors without ANSI sequences", () => {
    const terminal = new TerminalPane({cols: 24, rows: 3, fitToRect: false})
    try {
      terminal.write("-old line\r\n+new line")

      const styles = terminal.getStyleSnapshot()
      expect(styles[0]?.[0]?.bg).toBeNull()
      expect(styles[0]?.[0]?.fg).toEqual({kind: "default"})
      expect(styles[1]?.[0]?.bg).toBeNull()
      expect(styles[1]?.[0]?.fg).toEqual({kind: "default"})
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

  test("keeps desktop text input live after clicking the cursor line", async () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false, onInput: (data) => responses.push(data)})
    try {
      await renderTerminalForWheel(terminal)
      terminal.onPointerDown(mouseEvent(), 10, 2)
      terminal.onInputText("a")
      terminal.onKey(keyEvent("b", {code: "KeyB"}))
      expect(responses).toEqual(["a", "b"])
    } finally {
      terminal.dispose()
    }
  })

  test("keeps touch cursor-line taps in soft keyboard preview mode", async () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, showHeader: false, onInput: (data) => responses.push(data)})
    try {
      await renderTerminalForWheel(terminal)
      terminal.onPointerDown(touchMouseEvent(), 10, 2)
      terminal.onInputText("a")
      expect(responses).toEqual([])

      terminal.onKey(keyEvent("Enter"))
      expect(responses).toEqual(["a", "\r"])
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

  test("maps terminal word-delete shortcuts", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      const altBackspace = keyEvent("Backspace", {altKey: true})
      const ctrlBackspace = keyEvent("Backspace", {ctrlKey: true})
      const altDelete = keyEvent("Delete", {altKey: true})
      const ctrlW = keyEvent("w", {code: "KeyW", ctrlKey: true})

      terminal.onKey(altBackspace)
      terminal.onKey(ctrlBackspace)
      terminal.onKey(altDelete)
      terminal.onKey(ctrlW)

      expect(responses).toEqual(["\x1b\x7f", "\x17", "\x1bd", "\x17"])
      expect(altBackspace.defaultPrevented).toBe(true)
      expect(ctrlBackspace.defaultPrevented).toBe(true)
      expect(altDelete.defaultPrevented).toBe(true)
      expect(ctrlW.defaultPrevented).toBe(true)
    } finally {
      terminal.dispose()
    }
  })

  test("maps macOS delete-labeled backspace to terminal erase", () => {
    const responses: string[] = []
    const terminal = new TerminalPane({cols: 20, rows: 4, fitToRect: false, onInput: (data) => responses.push(data)})
    try {
      const backspace = keyEvent("Backspace")
      const macDeleteLabelBackspace = keyEvent("Delete", {code: "Backspace"})
      const forwardDelete = keyEvent("Delete", {code: "Delete"})

      terminal.onKey(backspace)
      terminal.onKey(macDeleteLabelBackspace)
      terminal.onKey(forwardDelete)

      expect(responses).toEqual(["\x7f", "\x7f", "\x1b[3~"])
      expect(backspace.defaultPrevented).toBe(true)
      expect(macDeleteLabelBackspace.defaultPrevented).toBe(true)
      expect(forwardDelete.defaultPrevented).toBe(true)
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

  test("renders multi-character local echo and reconciles by character", () => {
    const terminal = new TerminalPane({cols: 30, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      expect(terminal.tryLocalEcho("voice submit")).toBe(true)
      expect(terminal.toText()).toBe("prompt voice submit")
      terminal.writeAuthoritative("voice ")
      expect(terminal.toText()).toBe("prompt voice submit")
      terminal.writeAuthoritative("submit")
      expect(terminal.toText()).toBe("prompt voice submit")
    } finally {
      terminal.dispose()
    }
  })

  test("does not local echo control characters in multi-character input", () => {
    const terminal = new TerminalPane({cols: 30, rows: 4, fitToRect: false})
    try {
      terminal.write("prompt ")
      expect(terminal.tryLocalEcho("voice submit\r")).toBe(false)
      expect(terminal.toText()).toBe("prompt")
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
