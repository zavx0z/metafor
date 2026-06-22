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
      "# MetaFor TODO",
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
      section: item.section,
    }))).toEqual([
      {kind: "heading", line: 1, depth: 0, text: "MetaFor TODO", checked: null, section: []},
      {kind: "heading", line: 3, depth: 1, text: "Runtime", checked: null, section: ["MetaFor TODO"]},
      {kind: "task", line: 5, depth: 0, text: "Сделать adapter", checked: false, section: ["MetaFor TODO", "Runtime"]},
      {kind: "task", line: 6, depth: 1, text: "Проверить smoke", checked: true, section: ["MetaFor TODO", "Runtime"]},
      {kind: "note", line: 7, depth: 0, text: "обычная заметка", checked: null, section: ["MetaFor TODO", "Runtime"]},
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
