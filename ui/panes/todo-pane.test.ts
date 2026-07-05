import {describe, expect, test} from "bun:test"
import {TrueTypeFont} from "@metafor/engine"
import {ToDoPane} from "./todo-pane.ts"
import {parseMarkdownTodo, todoVisibleItems, updateTodoMarkdownItem} from "./todo-model.ts"

let testFontPromise: Promise<TrueTypeFont> | null = null

function testFont(): Promise<TrueTypeFont> {
  testFontPromise ??= Bun.file(new URL("./playground/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
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

describe("ToDoPane markdown parser", () => {
  test("парсит заголовки и markdown checkbox задачи", () => {
    const items = parseMarkdownTodo([
      "# MetaFor Plan",
      "",
      "## Runtime",
      "",
      "- [ ] Сделать adapter",
      "  - [x] Проверить smoke",
      "- обычная заметка",
    ].join("\n"))

    expect(items.map((item) => ({
      kind: item.kind,
      line: item.line,
      depth: item.depth,
      text: item.text,
      checked: item.checked,
      marker: item.marker,
      section: item.section,
    }))).toEqual([
      {kind: "heading", line: 1, depth: 0, text: "MetaFor Plan", checked: null, marker: null, section: []},
      {kind: "heading", line: 3, depth: 1, text: "Runtime", checked: null, marker: null, section: ["MetaFor Plan"]},
      {kind: "task", line: 5, depth: 0, text: "Сделать adapter", checked: false, marker: " ", section: ["MetaFor Plan", "Runtime"]},
      {kind: "task", line: 6, depth: 1, text: "Проверить smoke", checked: true, marker: "x", section: ["MetaFor Plan", "Runtime"]},
      {kind: "note", line: 7, depth: 0, text: "обычная заметка", checked: null, marker: null, section: ["MetaFor Plan", "Runtime"]},
    ])
  })

  test("парсит общепринятые markdown markers", () => {
    const items = parseMarkdownTodo([
      "- [0] В работе",
      "- [.0] На паузе",
      "- [42] Частично",
      "- [>] Следующее",
      "- [?] Вопрос",
      "- [!] Важно",
      "- [I] Идея",
      "- [100] Готово",
    ].join("\n"))

    expect(items.map((item) => ({text: item.text, checked: item.checked, marker: item.marker, progress: item.progress, paused: item.paused}))).toEqual([
      {text: "В работе", checked: false, marker: "0", progress: 0, paused: false},
      {text: "На паузе", checked: false, marker: ".0", progress: 0, paused: true},
      {text: "Частично", checked: false, marker: "42", progress: 42, paused: false},
      {text: "Следующее", checked: false, marker: ">", progress: null, paused: false},
      {text: "Вопрос", checked: false, marker: "?", progress: null, paused: false},
      {text: "Важно", checked: false, marker: "!", progress: null, paused: false},
      {text: "Идея", checked: false, marker: "I", progress: null, paused: false},
      {text: "Готово", checked: true, marker: "100", progress: 100, paused: false},
    ])
  })

  test("делает id стабильными по смыслу, а не по строке", () => {
    const first = parseMarkdownTodo("## A\n- [ ] same\n")
    const second = parseMarkdownTodo("\n\n## A\n\n- [ ] same\n")

    expect(first.find((item) => item.kind === "task")?.id).toBe(second.find((item) => item.kind === "task")?.id)
  })

  test("отдает подсвеченные пункты в context snapshot", () => {
    const markdown = "## Runtime\n- [ ] Сделать adapter\n- [x] Проверить smoke\n"
    const taskId = parseMarkdownTodo(markdown).find((item) => item.text === "Сделать adapter")?.id
    if (taskId === undefined) throw new Error("task id not found")

    const pane = new ToDoPane({markdown, highlightedIds: [taskId]})
    const context = pane.contextSnapshot("/repo/TODO.md")

    expect(context.path).toBe("/repo/TODO.md")
    expect(context.highlightedIds).toEqual([taskId])
    expect(context.highlightedItems).toEqual([{
      id: taskId,
      kind: "task",
      line: 2,
      column: 6,
      depth: 0,
      text: "Сделать adapter",
      section: ["Runtime"],
      checked: false,
      marker: " ",
      progress: null,
      paused: false,
    }])
    expect(context.highlightedText).toBe("- [ ] Сделать adapter")
  })

  test("меняет markdown checkbox как данные TODO.md", () => {
    const markdown = "## Runtime\n- [ ] Сделать adapter\n"
    const taskId = parseMarkdownTodo(markdown).find((item) => item.kind === "task")?.id
    if (taskId === undefined) throw new Error("task id not found")

    const result = updateTodoMarkdownItem(markdown, taskId, {checked: true})

    expect(result.markdown).toBe("## Runtime\n- [x] Сделать adapter\n")
    expect(result.item.checked).toBe(true)
    expect(result.item.marker).toBe("x")
  })

  test("меняет markdown marker как данные TODO.md", () => {
    const markdown = "## Runtime\n- [ ] Сделать adapter\n"
    const taskId = parseMarkdownTodo(markdown).find((item) => item.kind === "task")?.id
    if (taskId === undefined) throw new Error("task id not found")

    const result = updateTodoMarkdownItem(markdown, taskId, {marker: "0"})

    expect(result.markdown).toBe("## Runtime\n- [0] Сделать adapter\n")
    expect(result.item.checked).toBe(false)
    expect(result.item.marker).toBe("0")
    expect(result.item.progress).toBe(0)
  })

  test("сворачивает completed-секцию и раскрывает ее по panel state", () => {
    const markdown = [
      "## Готово",
      "- [x] Первый пункт",
      "- [x] Второй пункт",
      "## В работе",
      "- [ ] Следующий пункт",
    ].join("\n")
    const items = parseMarkdownTodo(markdown)
    const doneId = items.find((item) => item.text === "Готово")?.id
    if (doneId === undefined) throw new Error("done heading id not found")

    expect(todoVisibleItems(items, []).map((item) => item.text)).toEqual([
      "Готово",
      "В работе",
      "Следующий пункт",
    ])
    expect(todoVisibleItems(items, [doneId]).map((item) => item.text)).toEqual([
      "Готово",
      "Первый пункт",
      "Второй пункт",
      "В работе",
      "Следующий пункт",
    ])
  })

  test("подсветка раскрывает completed-секцию с выбранным пунктом", () => {
    const markdown = [
      "## Готово",
      "- [x] Первый пункт",
      "- [x] Второй пункт",
      "## В работе",
      "- [ ] Следующий пункт",
    ].join("\n")
    const pane = new ToDoPane({markdown})
    const taskId = parseMarkdownTodo(markdown).find((item) => item.text === "Второй пункт")?.id
    const doneId = parseMarkdownTodo(markdown).find((item) => item.text === "Готово")?.id
    if (taskId === undefined || doneId === undefined) throw new Error("TODO ids not found")

    pane.setHighlightedIds([taskId])

    expect(pane.expandedCompletedIds()).toEqual([doneId])
    expect(todoVisibleItems(parseMarkdownTodo(markdown), pane.expandedCompletedIds()).map((item) => item.text)).toContain("Второй пункт")
  })

  test("ручное сворачивание completed-секции переживает повторную синхронизацию той же подсветки", async () => {
    const markdown = [
      "## Готово",
      "- [x] Первый пункт",
      "- [x] Второй пункт",
      "## В работе",
      "- [ ] Следующий пункт",
    ].join("\n")
    const items = parseMarkdownTodo(markdown)
    const doneId = items.find((item) => item.text === "Готово")?.id
    const firstDoneTaskId = items.find((item) => item.text === "Первый пункт")?.id
    const secondDoneTaskId = items.find((item) => item.text === "Второй пункт")?.id
    if (doneId === undefined || firstDoneTaskId === undefined || secondDoneTaskId === undefined) throw new Error("TODO ids not found")
    const pane = new ToDoPane({markdown})
    const restoreRaf = installRafStub()
    try {
      attachTestCanvas(pane, {x: 10, y: 20, w: 360, h: 220})
      pane.setRect({x: 10, y: 20, w: 360, h: 220}, 1, await testFont())

      pane.setHighlightedIds([firstDoneTaskId])
      pane.flushPendingRender()
      expect(pane.expandedCompletedIds()).toEqual([doneId])

      clickPane(pane, 30, 54)
      expect(pane.expandedCompletedIds()).toEqual([])

      pane.setHighlightedIds([firstDoneTaskId])
      expect(pane.expandedCompletedIds()).toEqual([])

      pane.setHighlightedIds([secondDoneTaskId])
      expect(pane.expandedCompletedIds()).toEqual([doneId])
    } finally {
      pane.dispose()
      restoreRaf()
    }
  })
})

describe("ToDoPane frame controls", () => {
  test("plain row click keeps a single highlighted item", async () => {
    const markdown = "- [ ] Первый пункт\n- [ ] Второй пункт\n"
    const items = parseMarkdownTodo(markdown)
    const firstId = items[0]?.id
    const secondId = items[1]?.id
    if (firstId === undefined || secondId === undefined) throw new Error("task ids not found")
    const pane = new ToDoPane({markdown})
    const restoreRaf = installRafStub()
    try {
      attachTestCanvas(pane, {x: 10, y: 20, w: 360, h: 220})
      pane.setRect({x: 10, y: 20, w: 360, h: 220}, 1, await testFont())

      clickPane(pane, 100, 54)
      expect(pane.highlightedIds()).toEqual([firstId])

      clickPane(pane, 100, 82)
      expect(pane.highlightedIds()).toEqual([secondId])
    } finally {
      pane.dispose()
      restoreRaf()
    }
  })

  test("modifier row click toggles multiple highlighted items", async () => {
    const markdown = "- [ ] Первый пункт\n- [ ] Второй пункт\n"
    const items = parseMarkdownTodo(markdown)
    const firstId = items[0]?.id
    const secondId = items[1]?.id
    if (firstId === undefined || secondId === undefined) throw new Error("task ids not found")
    const pane = new ToDoPane({markdown})
    const restoreRaf = installRafStub()
    try {
      attachTestCanvas(pane, {x: 10, y: 20, w: 360, h: 220})
      pane.setRect({x: 10, y: 20, w: 360, h: 220}, 1, await testFont())

      clickPane(pane, 100, 54)
      clickPane(pane, 100, 82, {shiftKey: true})
      expect(new Set(pane.highlightedIds())).toEqual(new Set([firstId, secondId]))

      clickPane(pane, 100, 54, {shiftKey: true})
      expect(pane.highlightedIds()).toEqual([secondId])
    } finally {
      pane.dispose()
      restoreRaf()
    }
  })

  test("emits dock request from header button without starting frame drag", async () => {
    let dockRequests = 0
    const changes: Array<{x: number; y: number; w: number; h: number}> = []
    const pane = new ToDoPane({
      markdown: "- [ ] Длинный пункт TODO",
      draggable: true,
      resizable: true,
      onFrameDockRequest: () => {
        dockRequests += 1
      },
      onFrameRectChange: (rect) => changes.push(rect),
    })
    let frameRect = {x: 10, y: 20, w: 360, h: 220}
    const restoreRaf = installRafStub()
    try {
      pane.attachCanvas({
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
      pane.setRect(frameRect, 1, await testFont())
      pane.onPointerDown({
        button: 0,
        clientX: 36,
        clientY: 36,
        detail: 1,
        preventDefault: () => {},
      } as MouseEvent, 23, 18)
      pane.onPointerMove({clientX: 86, clientY: 66} as MouseEvent, 23, 18)
      pane.onPointerUp({clientX: 86, clientY: 66} as MouseEvent, 23, 18)

      expect(dockRequests).toBe(1)
      expect(changes).toEqual([])
      expect(frameRect).toEqual({x: 10, y: 20, w: 360, h: 220})
    } finally {
      pane.dispose()
      restoreRaf()
    }
  })

  test("keeps resize edges above todo content hits", async () => {
    const previews: Array<{x: number; y: number; w: number; h: number}> = []
    const changes: Array<{x: number; y: number; w: number; h: number}> = []
    const pane = new ToDoPane({
      markdown: "- [ ] Первый пункт\n- [ ] Второй пункт\n",
      draggable: true,
      resizable: true,
      onFrameRectPreview: (rect) => previews.push(rect),
      onFrameRectChange: (rect) => changes.push(rect),
    })
    const canvas = {style: {cursor: "default"}}
    let frameRect = {x: 10, y: 20, w: 360, h: 220}
    const restoreRaf = installRafStub()
    try {
      pane.attachCanvas({
        canvas,
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
      pane.setRect(frameRect, 1, await testFont())

      pane.onPointerMove({clientX: 12, clientY: 74} as MouseEvent, 2, 54)
      expect(canvas.style.cursor).toBe("ew-resize")

      pane.onPointerDown({
        button: 0,
        clientX: 12,
        clientY: 74,
        detail: 1,
        preventDefault: () => {},
      } as MouseEvent, 2, 54)
      pane.onPointerMove({clientX: 0, clientY: 74} as MouseEvent, 2, 54)
      pane.onPointerUp({clientX: 0, clientY: 74} as MouseEvent, 2, 54)

      expect(previews.at(-1)).toEqual({x: 0, y: 20, w: 370, h: 220})
      expect(changes.at(-1)).toEqual({x: 0, y: 20, w: 370, h: 220})

      pane.onPointerMove({clientX: 120, clientY: 22} as MouseEvent, 120, 2)
      expect(canvas.style.cursor).toBe("ns-resize")
    } finally {
      pane.dispose()
      restoreRaf()
    }
  })
})

function attachTestCanvas(pane: ToDoPane, frameRect: {x: number; y: number; w: number; h: number}): void {
  pane.attachCanvas({
    canvas: {style: {cursor: "default"}},
    renderer: {invalidateGeometry: () => {}},
    uiRectToFramebufferClipBounds: (xMin: number, yMin: number, xMax: number, yMax: number) => [xMin, yMin, xMax, yMax],
    setFocused: () => {},
    inputProxy: {focus: () => {}},
    requestRender: () => {},
    surfaceFrame: () => ({rect: {...frameRect}, bounds: {w: 1000, h: 800}}),
    setSurfaceRect: (_surface: unknown, rect: typeof frameRect) => ({...rect}),
  } as never)
}

function clickPane(pane: ToDoPane, localX: number, localY: number, opts: {shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean} = {}): void {
  const event = {
    button: 0,
    clientX: localX,
    clientY: localY,
    detail: 1,
    shiftKey: opts.shiftKey === true,
    metaKey: opts.metaKey === true,
    ctrlKey: opts.ctrlKey === true,
    preventDefault: () => {},
  } as MouseEvent
  pane.onPointerDown(event, localX, localY)
  pane.onPointerUp(event, localX, localY)
}
