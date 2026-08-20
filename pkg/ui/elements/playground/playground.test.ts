import {beforeAll, describe, expect, test} from "bun:test"
import {basename, join} from "node:path"
import {fileURLToPath} from "node:url"
import {TrueTypeFont} from "@metafor/engine"
import {definePlaygroundStoryModule, planPlaygroundShell} from "@ui/playground"
import type {UiRuntime} from "@ui/elements/runtime"
import {
  ELEMENT_LEGACY_ROUTES,
  ELEMENT_STORIES,
  ELEMENT_STORY_ROUTES,
  elementCatalogItems,
  elementSectionItems,
  elementVariantItems,
  normalizeElementsPlaygroundPath,
} from "./stories.ts"
import {ElementsStoryPreviewSurface} from "./story-preview.ts"
import {uiShapeMetrics} from "../shape.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("@ui/elements package-owned Workbench stories", () => {
  test("normalizes every historical route without silently dropping a screen", () => {
    expect(ELEMENT_LEGACY_ROUTES).toEqual([
      "div",
      "div/scroll",
      "span",
      "button",
      "input",
      "img",
      "ul",
      "layout/flex",
      "layout/flex-css",
      "style/css",
      "style/theme",
      "events",
    ])
    const expected = new Map<string, string>([
      ["div", "div/basic/background"],
      ["div/scroll", "div/scroll/vertical"],
      ["span", "span/content/left"],
      ["button", "button/state/default"],
      ["input", "input/state/inactive"],
      ["img", "img/fit/cover"],
      ["ul", "list/mode/regular"],
      ["layout/flex", "flex/direction/row"],
      ["layout/flex-css", "flex-css/sizes/fraction"],
      ["style/css", "css/padding/default"],
      ["style/theme", "theme/tone/cyan"],
      ["events", "pointer/state/idle"],
    ])
    for (const legacy of ELEMENT_LEGACY_ROUTES) {
      const normalized = normalizeElementsPlaygroundPath(`/${legacy}`)
      expect(normalized).toBe(expected.get(legacy)!)
      expect(ELEMENT_STORY_ROUTES).toContain(normalized!)
    }
    expect(normalizeElementsPlaygroundPath("/missing")).toBeNull()
  })

  test("catalogs concrete Russian Elements and their real sections", () => {
    const catalog = elementCatalogItems(new Set())
    expect(catalog.map(({id}) => id)).toEqual([
      "div",
      "span",
      "button",
      "input",
      "select",
      "img",
      "list",
      "flex",
      "flex-css",
      "css",
      "theme",
      "pointer",
    ])
    expect(catalog.map(({label}) => label)).toEqual([
      "Контейнер",
      "Строка текста",
      "Кнопка",
      "Текстовый ввод",
      "Выбор значения",
      "Изображение",
      "Список",
      "Flex",
      "Flex CSS",
      "CSS-свойства",
      "Тема",
      "Указатель",
    ])
    expect(catalog.map(({group}) => group?.label)).toEqual([
      "Примитивы",
      "Примитивы",
      "Примитивы",
      "Примитивы",
      "Примитивы",
      "Примитивы",
      "Примитивы",
      "Раскладка",
      "Раскладка",
      "Стили",
      "Стили",
      "События",
    ])
    expect(elementSectionItems("div/scroll/vertical").map(({id}) => id)).toEqual(["basic", "scroll"])
    expect(elementSectionItems("css/border/rounded").map(({id}) => id)).toEqual(["padding", "flex", "border", "color", "typography"])
    expect(elementVariantItems("div/basic/padding").map(({id}) => id)).toEqual(["background", "border", "padding", "z-index"])
    expect(elementVariantItems("pointer/state/release").map(({id}) => id)).toEqual(["idle", "hover", "press", "release", "click", "disabled"])
  })

  test("loads lazy stories through exact public subpaths and keeps source driven by args", async () => {
    const primitive = await ELEMENT_STORIES.load("button/state/clickable")
    expect(primitive.source(primitive.defaultArgs)).toContain('from "@ui/elements/button"')
    expect(primitive.defaultArgs).toMatchObject({disabled: false, state: "clickable", clicks: 0})
    expect(primitive.source({...primitive.defaultArgs, label: "Запуск", disabled: true})).toContain('children: "Запуск"')
    expect(primitive.source({...primitive.defaultArgs, label: "Запуск", disabled: true})).toContain("disabled: true")
    expect(primitive.defaultArgs).toMatchObject({radius: uiShapeMetrics.lowRadius})

    const input = await ELEMENT_STORIES.load("input/state/inactive")
    expect(input.defaultArgs).toMatchObject({radius: uiShapeMetrics.lowRadius})

    const select = await ELEMENT_STORIES.load("select/state/open")
    expect(select.source(select.defaultArgs)).toContain('from "@ui/elements/select"')
    expect(select.defaultArgs).toMatchObject({label: "Умножение", open: true, radius: uiShapeMetrics.lowRadius})
    expect(select.source(select.defaultArgs)).toContain("options")
    for (const route of ["button/state/default", "input/state/inactive", "select/state/inactive"] as const) {
      const control = await ELEMENT_STORIES.load(route)
      expect(control.source(control.defaultArgs)).not.toContain("borderColor")
    }

    const layout = await ELEMENT_STORIES.load("flex-css/sizes/fraction")
    expect(layout.source(layout.defaultArgs)).toContain('from "@ui/elements/flex-css"')
    expect(layout.source({...layout.defaultArgs, gap: 24})).toContain("gap: 24")

    const style = await ELEMENT_STORIES.load("theme/tone/green")
    expect(style.source(style.defaultArgs)).toContain('from "@ui/elements/theme"')
    expect(style.defaultArgs).toMatchObject({tone: "green"})

    const events = await ELEMENT_STORIES.load("pointer/state/click")
    expect(events.source(events.defaultArgs)).toContain('from "@ui/elements/button"')
    expect(events.defaultArgs).toMatchObject({state: "click", clicks: 1})
  })

  test("loads every published detail story with non-empty exact code", async () => {
    expect(ELEMENT_STORY_ROUTES).toHaveLength(46)
    for (const route of ELEMENT_STORY_ROUTES) {
      const module = await ELEMENT_STORIES.load(route)
      const source = module.source(module.defaultArgs)
      expect(source.length).toBeGreaterThan(24)
      expect(source).toContain("@ui/elements/")
    }
  })

  test("keeps one retained production preview owner across story arg changes", () => {
    const module = definePlaygroundStoryModule({
      defaultArgs: {value: 1},
      render() {},
      source: (args) => `const value = ${args.value}`,
    })
    const index = ELEMENT_STORIES.find("flex/direction/row")!
    const surface = new ElementsStoryPreviewSurface()
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setStory(index, module, module.defaultArgs)
      surface.setRect({x: 0, y: 0, w: 1024, h: 720}, 0.001, font)
      expect(surface.diagnostics).toEqual({route: "flex/direction/row", layoutPlans: 1, materializations: 1})
      surface.setArgs({value: 2})
      surface.flushPendingRender()
      expect(surface.diagnostics).toEqual({route: "flex/direction/row", layoutPlans: 1, materializations: 2})
    } finally {
      surface.dispose()
    }
  })

  test("replaces manual route and info ownership with the shared interaction panel", async () => {
    const entry = await Bun.file(join(playgroundRoot, "entry.ts")).text()
    expect(entry).toContain("ELEMENT_STORIES")
    expect(entry).toContain("PlaygroundStoryPanelSurface")
    expect(entry).toContain("ElementsStoryPreviewSurface")
    expect(entry).toContain('title: "Элементы UI"')
    expect(entry).toContain('title: "Варианты"')
    expect(entry).toContain("navigator.clipboard.writeText")
    expect(entry).toContain("runtime.handleResize()")
    expect(entry).not.toContain("PlaygroundInfoSurface")
    expect(entry).not.toContain("elementsPlaygroundInfo")
    expect(entry).not.toContain("ElementsPreviewSurface")
    for (const forbidden of ["NodeEditor", "BlenderSocket", "NodeSystemSurface", "Hamiltonian", "Bulk"]) {
      expect(entry).not.toContain(forbidden)
    }
  })

  test("story modules import production Elements only through exact public leaves", async () => {
    const storyFiles = ["primitives.ts", "layout.ts", "style.ts", "events.ts"]
    const sources = await Promise.all(storyFiles.map((name) => Bun.file(join(playgroundRoot, "stories", name)).text()))
    for (const source of sources) {
      expect(source).not.toMatch(/from ["']@ui\/elements["']/)
      expect(source).not.toMatch(/from ["']\.\.\/\.\.\/(?:div|span|button|input|img|list|flex|flexCss|style|theme)\.ts["']/)
    }
    expect(sources[0]).toContain('from "@ui/elements/div"')
    expect(sources[0]).toContain('from "@ui/elements/list"')
    expect(sources[0]).toContain('from "@ui/elements/select"')
    expect(sources[0]).toContain('import {uiShapeMetrics} from "../../shape.ts"')
    expect(sources[0]!.match(/uiShapeMetrics\.controlHeight/g)?.length).toBe(6)
    expect(sources[0]).not.toContain("240, 52")
    expect(sources[0]).not.toContain("460, 50")
    expect(sources[1]).toContain('from "@ui/elements/flex"')
    expect(sources[1]).toContain('from "@ui/elements/flex-css"')
    expect(sources[2]).toContain('from "@ui/elements/theme"')
    expect(sources[3]).toContain('from "@ui/elements/button"')
  })

  test("keeps story implementations out of the initial split entry", async () => {
    const build = await Bun.build({
      entrypoints: [join(playgroundRoot, "entry.ts")],
      target: "browser",
      format: "esm",
      splitting: true,
      minify: false,
      sourcemap: "none",
    })
    expect(build.success, build.logs.map(({message}) => message).join("\n")).toBeTrue()
    expect(build.outputs.length).toBeGreaterThan(4)
    const outputs = await Promise.all(build.outputs.map(async (output) => ({
      name: basename(output.path),
      source: await output.text(),
    })))
    const entry = outputs.find(({name}) => name === "entry.js")
    expect(entry).toBeDefined()
    expect(entry!.source).toContain("import(")
    expect(entry!.source).not.toContain("function createPrimitiveStory")
    expect(entry!.source).not.toContain("function createLayoutStory")
    expect(entry!.source).not.toContain("function createStyleStory")
    expect(entry!.source).not.toContain("function createEventStory")
    expect(outputs.some(({source}) => source.includes("function createPrimitiveStory"))).toBeTrue()
    expect(outputs.some(({source}) => source.includes("function createLayoutStory"))).toBeTrue()
    expect(outputs.some(({source}) => source.includes("function createStyleStory"))).toBeTrue()
    expect(outputs.some(({source}) => source.includes("function createEventStory"))).toBeTrue()
  })

  test("serves detail paths through the package no-HMR server and full desktop shell", async () => {
    const desktop = planPlaygroundShell(1920, 1080)
    expect(desktop.preview).toEqual({x: 375, y: 3, w: 1101, h: 1049})
    expect(desktop.info).toEqual({x: 1477, y: 3, w: 440, h: 1074})

    const port = await freePort()
    const process = Bun.spawn(["bun", "playground/server.ts"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {...Bun.env, ELEMENTS_PLAYGROUND_PORT: String(port)},
      stdout: "pipe",
      stderr: "pipe",
    })
    try {
      const html = await waitForText(`http://127.0.0.1:${port}/flex-css/sizes/fraction`)
      expect(html).toContain("<title>@ui/elements</title>")
      expect(html).toContain('<canvas id="stage-canvas"></canvas>')
      const entry = await fetch(`http://127.0.0.1:${port}/entry.js`)
      const source = await entry.text()
      expect(entry.status).toBe(200)
      expect(source).toContain("elementsPlayground")
      expect(source).toContain("import(")
      expect(source).not.toContain("function createPrimitiveStory")
    } finally {
      process.kill()
      await process.exited
    }
  }, 30000)
})

function createFakeRuntime(): UiRuntime {
  return {
    canvas: {style: {}},
    renderer: {pixelRatio: 1, invalidateGeometry() {}},
    requestRender() {},
    uiRectToFramebufferClipBounds: (
      xMin: number,
      yMin: number,
      xMax: number,
      yMax: number,
    ) => [xMin, yMin, xMax, yMax],
  } as unknown as UiRuntime
}

async function freePort(): Promise<number> {
  const server = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => new Response("probe")})
  const port = server.port
  server.stop(true)
  if (port === undefined) throw new Error("Bun did not allocate a test port")
  return port
}

async function waitForText(url: string): Promise<string> {
  let cause: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.text()
      cause = new Error(`HTTP ${response.status}`)
    } catch (error) {
      cause = error
    }
    await Bun.sleep(50)
  }
  throw new Error(`Elements playground did not start: ${String(cause)}`)
}
