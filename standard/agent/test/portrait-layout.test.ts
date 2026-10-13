import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, flushDocumentLayoutObservers, HTMLTextAreaElement, HTMLButtonElement, InputEvent, type DOMComponentConstructor, HTMLElement, type Element} from "@zavx0z/immersive"
import {createDocumentRenderer} from "@zavx0z/immersive/renderer/html"
import {createSpaceElementFactories} from "@zavx0z/immersive/space"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import type {AtomChatMessage, AtomContext, AtomViewSnapshot} from "../atom"
import {DEFAULT_AGENT_PRESENTATION} from "../presentation"

let directory = "", View: DOMComponentConstructor<{atom: AtomContext}>, theme = ""
beforeAll(async () => {
  const owner = resolve(import.meta.dir, "..")
  const timelineRoot = resolve(dirname(Bun.resolveSync("@zavx0z/storybook-chat-view/timeline", owner)), "..")
  directory = await mkdtemp(join(owner, ".compiled-portrait-"))
  await symlink(join(owner, "node_modules"), join(directory, "node_modules"), "dir")
  const build = await Bun.build({entrypoints: [join(owner, "view.tsx")], outdir: directory, target: "bun", format: "esm", splitting: true,
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"], plugins: [createJsxBunPlugin({cwd: owner,
      sourceRoots: [owner, resolve(dirname(Bun.resolveSync("@zavx0z/chat/composer", owner)), "../../.."), timelineRoot, dirname(Bun.resolveSync("@zavx0z/storybook-chat-preferences", owner))], styleSourceRootIds: ["@metafor/agent", "@zavx0z/chat", "@zavx0z/storybook-chat-view", "@zavx0z/storybook-chat-preferences"]})]})
  if (!build.success) throw new AggregateError(build.logs, "Portrait Agent did not compile")
  View = (await import(pathToFileURL(join(directory, "view.js")).href)).AgentView
  theme = await Bun.file(new URL(import.meta.resolve("@zavx0z/immersive/ui/theme.css"))).text()
}, 30_000)
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

function fixture(width = 390, height = 844, chat?: readonly AtomChatMessage[], changingFont = false) {
  const document = createDocument({elementFactories: createSpaceElementFactories()}), html = document.createElement("html"), body = document.createElement("body"), space = document.createElement("space"), display = document.createElement("display")
  document.append(html); html.append(body); body.append(space); space.append(document.createElement("viewpoint"), display)
  display.setAttribute("width", String(width)); display.setAttribute("height", String(height))
  display.setAttribute("style", `width: ${width}px; height: ${height}px`)
  let activeDisplay = display, advanceScale = .5, measurements = 0
  const textMeasurer = {measureTextAdvance(value: string, fontSize: number, letterSpacing: number) {measurements++; return value.length * (fontSize * advanceScale + letterSpacing)}}
  const createRenderer = (target: Element, nextWidth: number, nextHeight: number) => createDocumentRenderer({document, root: target, viewport: {width: nextWidth, height: nextHeight}, styleSheets: [theme], ...(changingFont ? {textMeasurer} : {})})
  const root = createDomRoot(display)
  let renderer = createRenderer(display, width, height)
  const snapshot: AtomViewSnapshot = {ref: "atom:portrait", revision: "one", state: "idle", configuration: {id: "portrait", atom: {kind: "atom", scope: "owner"},
    presentation: DEFAULT_AGENT_PRESENTATION, tools: [], displays: []}, provider: null, operations: [], context: {}, chat: chat ?? [
      {id: "first-user", role: "user", content: "Проверь узкий интерфейс: первая пользовательская реплика должна занимать собственную измеренную высоту без наложения следующего инструмента. ".repeat(3)},
      {id: "tool-result", role: "service", content: "Результат Bun\n" + Array.from({length: 12}, (_, index) => `Строка ${index}: ${"длинное_значение_".repeat(8)}`).join("\n")},
      {id: "answer", role: "assistant", content: "Проверка закончена. **Ответ** остаётся отдельной репликой."},
    ]}
  const atom: AtomContext = {ref: snapshot.ref, getSnapshot: () => snapshot, subscribe: () => () => {}, actions: {async sendMessage() {}, async runDevelopment() {}}}
  root.render(View, {atom})
  const settle = async (rounds = 12) => {for (let index = 0; index < rounds; index++) {root.flush(); renderer.flush(); flushDocumentLayoutObservers(document); await Bun.sleep(0)}}
  return {document, get display() {return activeDisplay}, get renderer() {return renderer}, root, settle,
    get measurements() {return measurements},
    resize(nextWidth: number, nextHeight: number) {activeDisplay.setAttribute("width", String(nextWidth)); activeDisplay.setAttribute("height", String(nextHeight)); activeDisplay.setAttribute("style", `width: ${nextWidth}px; height: ${nextHeight}px`); renderer.resize({width: nextWidth, height: nextHeight})},
    reparent(nextWidth: number, nextHeight: number) {
      const view = activeDisplay.querySelector("[data-agent-atom]")!
      const target = document.createElement("display")
      target.setAttribute("width", String(nextWidth)); target.setAttribute("height", String(nextHeight)); target.setAttribute("style", `width: ${nextWidth}px; height: ${nextHeight}px`)
      space.append(target); target.append(view); renderer.flush(); renderer.dispose()
      activeDisplay = target; renderer = createRenderer(target, nextWidth, nextHeight)
    },
    publishFontMetrics() {advanceScale = .65; activeDisplay.setAttribute("style", `${activeDisplay.getAttribute("style")};--font-family:late-fixture-font`); renderer.invalidate(activeDisplay)},
    dispose() {root.unmount(); renderer.dispose()},
  }
}
const rect = (node: Element | null) => {if (!(node instanceof HTMLElement) || !node.getLayoutRect()) throw new Error("Measured public layout missing"); return node.getLayoutRect()!}

for (const messages of [[], stressHistory()]) test(`Inspector fills the remaining Display height with ${messages.length ? "scrolling" : "empty"} history`, async () => {
  const f = fixture(390, 844, messages)
  try {
    await f.settle()
    const agent = rect(f.display.querySelector("[data-agent-atom]"))
    const inspector = rect(f.display.querySelector('aside[aria-label="Инспектор Agent"]'))
    const composer = rect(f.display.querySelector("[data-chat-composer]"))
    expect(inspector.bottom).toBeLessThanOrEqual(agent.bottom + .1)
    expect(inspector.bottom).toBeGreaterThanOrEqual(agent.bottom - .1)
    expect(composer.bottom).toBeLessThanOrEqual(inspector.bottom + .1)
    expect(inspector.bottom - composer.bottom).toBeLessThanOrEqual(13.1)
    const viewport = f.display.querySelector("[data-chat-messages]")!
    expect(rect(viewport).bottom).toBeLessThanOrEqual(composer.top + .1)
    const frame = f.renderer.flush()
    const scroll = frame.scrolls.get(viewport)
    const panels = f.display.querySelector("[data-inspector-panels]")!
    expect(frame.scrolls.get(panels)?.maxScrollTop ?? 0).toBeLessThanOrEqual(.1)
    if (messages.length) expect(scroll?.maxScrollTop ?? 0).toBeGreaterThan(0)
    else expect(scroll?.maxScrollTop ?? 0).toBe(0)
  } finally {f.dispose()}
})

function stressHistory(): readonly AtomChatMessage[] {
  return Array.from({length: 12}, (_, index) => ({id: `height-${index}`, role: "user", content: "История занимает доступное место, а Composer остаётся внутри Inspector. ".repeat(8)}))
}

for (const width of [320, 390]) test(`compiled portrait ${width}px has measured non-overlapping rows and fully visible Composer send button`, async () => {
  const f = fixture(width)
  try {
    await f.settle()
    const rows = [...f.display.querySelectorAll("[data-chat-history-id]")]
    expect(rows).toHaveLength(3)
    const positions = rows.map(row => rect(row))
    for (let index = 1; index < positions.length; index++) expect(positions[index]!.top).toBeGreaterThanOrEqual(positions[index - 1]!.bottom - .1)
    const composer = f.display.querySelector("[data-chat-composer]"), send = f.display.querySelector('button[aria-label="Отправить"]')
    const region = rect(composer), button = rect(send), surface = rect(f.display)
    expect(button.right).toBeLessThanOrEqual(region.right + .1)
    expect(button.right).toBeLessThanOrEqual(surface.right + .1)
    expect(button.left).toBeGreaterThanOrEqual(region.left - .1)
    expect(button.bottom).toBeLessThanOrEqual(surface.bottom + .1)
  } finally {f.dispose()}
})

const stressMessages: readonly AtomChatMessage[] = [
  {id: "long-user", role: "user", content: "Проверь интерфейс после переноса между Display: длинная реплика должна переноситься по ширине, измеряться по содержимому и не перекрывать карточки Bun. ".repeat(9)},
  ...[1, 2].map(step => ({id: `tool-${step}`, role: "assistant" as const, content: "bun.evaluate", tool: {id: `decision-${step}`, name: "bun.evaluate" as const, status: "completed" as const,
    input: {code: `const task${step} = ${JSON.stringify("строка данных ".repeat(40))};\nconsole.log(task${step})`}, output: {result: "Длинный результат инструмента\n".repeat(30)}, correlation: {modelRequestId: `model-${step}`, taskId: "portrait-task", step}}})),
  {id: "final-answer", role: "assistant", content: "Проверено: **отдельный ответ** после двух операций.\n\n" + "Финальная реплика тоже переносится по текущей ширине. ".repeat(5)},
]
function assertMeasuredLayout(f: ReturnType<typeof fixture>, count: number) {
  const rows = [...f.display.querySelectorAll("[data-chat-history-id]")]
  expect(rows).toHaveLength(count)
  const boxes = rows.map(row => rect(row))
  for (let index = 1; index < boxes.length; index++) expect(boxes[index]!.top).toBeGreaterThanOrEqual(boxes[index - 1]!.bottom - .1)
  for (const row of rows) {
    const message = row.querySelector("[data-conversation-message]")
    if (message) expect(rect(message).bottom).toBeLessThanOrEqual(rect(row).bottom + .1)
  }
  const button = rect(f.display.querySelector('button[aria-label="Отправить"]')), composer = rect(f.display.querySelector("[data-chat-composer]"))
  const inspector = rect(f.display.querySelector('aside[aria-label="Инспектор Agent"]'))
  const agent = rect(f.display.querySelector("[data-agent-atom]"))
  expect(inspector.bottom).toBeLessThanOrEqual(agent.bottom + .1)
  expect(inspector.bottom).toBeGreaterThanOrEqual(agent.bottom - .1)
  expect(composer.bottom).toBeLessThanOrEqual(inspector.bottom + .1)
  expect(button.right).toBeLessThanOrEqual(composer.right + .1)
  expect(button.right).toBeLessThanOrEqual(rect(f.display).right + .1)
  expect(button.bottom).toBeLessThanOrEqual(rect(f.display).bottom + .1)
  const viewport = f.display.querySelector("[data-chat-messages]")!
  expect(f.renderer.flush().scrolls.get(viewport)?.maxScrollLeft ?? 0).toBeLessThanOrEqual(.1)
}

test("large user bubble, two Tool cards and final answer remeasure after same-Document move, resize and late font metrics", async () => {
  const f = fixture(1200, 800, stressMessages, true)
  try {
    await f.settle()
    const chat = f.display.querySelector("[data-agent-atom]")!, input = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(input instanceof HTMLTextAreaElement)) throw new Error("Shared Composer missing")
    input.value = "Черновик после resize и font metrics"; input.dispatchEvent(new InputEvent("input", {bubbles: true})); await f.settle()
    const wideHeight = rect(f.display.querySelector('[data-chat-history-id="long-user"]')).height
    f.reparent(390, 844); await f.settle()
    expect(f.display.querySelector("[data-agent-atom]")).toBe(chat)
    expect(rect(f.display.querySelector('[data-chat-history-id="long-user"]')).height).toBeGreaterThan(wideHeight)
    assertMeasuredLayout(f, 4)
    const toggle = f.display.querySelector('[data-chat-kind="tool"] button')
    if (!(toggle instanceof HTMLButtonElement)) throw new Error("Public Tool card missing")
    toggle.click(); await f.settle()
    assertMeasuredLayout(f, 4)
    f.resize(320, 720); await f.settle(); f.publishFontMetrics(); await f.settle()
    assertMeasuredLayout(f, 4)
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(input)
    expect(input.value).toBe("Черновик после resize и font metrics")
    expect(chat.ownerDocument).toBe(f.document)
    const measured = f.measurements, revision = f.renderer.flush().revision
    await f.settle(6)
    expect(f.measurements).toBe(measured)
    expect(f.renderer.flush().revision).toBe(revision)
  } finally {f.dispose()}
}, 20_000)

test.skipIf(!Bun.env.AGENT_PORTRAIT_MESSAGES)("private current Agent projection remains measured after landscape→portrait", async () => {
  const chat = await Bun.file(Bun.env.AGENT_PORTRAIT_MESSAGES!).json() as AtomChatMessage[]
  const f = fixture(1200, 800, chat, true)
  try {
    await f.settle(); f.reparent(390, 844); await f.settle()
    assertMeasuredLayout(f, chat.length)
    f.resize(320, 720); await f.settle(); f.publishFontMetrics(); await f.settle()
    assertMeasuredLayout(f, chat.length)
    const measured = f.measurements, revision = f.renderer.flush().revision; await f.settle(6)
    expect(f.measurements).toBe(measured)
    expect(f.renderer.flush().revision).toBe(revision)
  } finally {f.dispose()}
})

test("portrait renderer resize remeasures the same history and retains Composer draft without horizontal overflow", async () => {
  const f = fixture(390)
  try {
    await f.settle()
    const draft = f.display.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Composer missing")
    draft.value = "Сохранённый portrait draft"; draft.dispatchEvent(new InputEvent("input", {bubbles: true})); await f.settle()
    const before = rect(f.display.querySelector('[data-chat-history-id="first-user"]')).height
    f.resize(320, 720); await f.settle()
    expect(f.display.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Сохранённый portrait draft")
    const first = rect(f.display.querySelector('[data-chat-history-id="first-user"]')), second = rect(f.display.querySelector('[data-chat-history-id="tool-result"]'))
    expect(first.height).toBeGreaterThan(before)
    expect(second.top).toBeGreaterThanOrEqual(first.bottom - .1)
    const send = rect(f.display.querySelector('button[aria-label="Отправить"]'))
    expect(send.right).toBeLessThanOrEqual(rect(f.display).right + .1)
  } finally {f.dispose()}
})
