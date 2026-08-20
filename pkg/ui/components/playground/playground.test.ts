import {beforeAll, describe, expect, test} from "bun:test"
import {basename, join} from "node:path"
import {fileURLToPath} from "node:url"
import {TrueTypeFont} from "@metafor/engine"
import {FIELD_KINDS} from "@ui/components/field"
import {definePlaygroundStoryModule, planPlaygroundShell} from "@ui/playground"
import type {UiRuntime} from "@ui/elements/runtime"
import {
  COMPONENT_STORIES,
  COMPONENT_STORY_ROUTES,
  componentCatalogItems,
  componentSectionItems,
  componentVariantItems,
  normalizeComponentsPlaygroundPath,
} from "./stories.ts"
import {ComponentsStoryPreviewSurface} from "./story-preview.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("@ui/components package-owned Workbench stories", () => {
  test("preserves every historical detail route and normalizes former aggregate routes", () => {
    expect(COMPONENT_STORIES.fallback).toBe("button/basic/contained")
    for (const route of [
      "button/basic/text",
      "button/basic/contained",
      "button/basic/outlined",
      "button/icon/svg",
      "button/icon-label/left",
      "button/icon-label/right",
      "button/sizes/small",
      "button/sizes/medium",
      "button/sizes/large",
      "button/color/primary",
      "button/color/success",
      "button/color/warning",
      "button/color/error",
      "button/color/neutral",
      "pane/variants/glass",
      "pane/variants/outlined",
      "pane/variants/filled",
    ]) expect(COMPONENT_STORY_ROUTES).toContain(route)
    expect(normalizeComponentsPlaygroundPath("/button/basic")).toBe("button/basic/contained")
    expect(normalizeComponentsPlaygroundPath("/field/values")).toBe("field/text/default")
    expect(normalizeComponentsPlaygroundPath("/field/selection")).toBe("field/boolean/switch")
    expect(normalizeComponentsPlaygroundPath("/field/composite")).toBe("field/vector/default")
    expect(normalizeComponentsPlaygroundPath("/field/reference")).toBe("field/reference/default")
    expect(normalizeComponentsPlaygroundPath("/disabled/badge")).toBe("badge/basic/default")
    expect(normalizeComponentsPlaygroundPath("/disabled/noti-stack")).toBe("noti/status/unavailable")
    expect(normalizeComponentsPlaygroundPath("/missing")).toBeNull()
  })

  test("catalogs concrete Russian components and every universal Field kind", () => {
    const catalog = componentCatalogItems(new Set())
    expect(catalog.map(({id}) => id)).toEqual([
      "button",
      "pane",
      "badge",
      "typography",
      "divider",
      "field",
      "text-field",
      "number-input",
      "color-input",
      "checkbox",
      "switcher",
      "progress-checkbox",
      "slider-control",
      "list",
      "table",
      "scrollbar",
      "noti",
    ])
    expect(catalog.map(({label}) => label)).toEqual([
      "Кнопка",
      "Панель",
      "Метка",
      "Типографика",
      "Разделитель",
      "Поле",
      "Текстовый ввод",
      "Числовой ввод",
      "Ввод цвета",
      "Флажок",
      "Переключатель",
      "Флажок прогресса",
      "Слайдер",
      "Список",
      "Таблица",
      "Полоса прокрутки",
      "Уведомления",
    ])
    expect(componentSectionItems("field/number/input").map(({id}) => id)).toEqual([...FIELD_KINDS])
    expect(componentVariantItems("field/number/input").map(({id}) => id)).toEqual(["input", "slider"])
    expect(componentVariantItems("button/color/error").map(({id}) => id)).toEqual([
      "primary", "success", "warning", "error", "neutral",
    ])
  })

  test("loads exact public Button, Pane and Field stories lazily", async () => {
    const button = await COMPONENT_STORIES.load("button/icon-label/right")
    expect(button.source(button.defaultArgs)).toContain('from "@ui/components/button"')
    expect(button.defaultArgs).toMatchObject({icon: "apply", iconPosition: "end"})

    const pane = await COMPONENT_STORIES.load("pane/variants/outlined")
    expect(pane.source(pane.defaultArgs)).toContain('from "@ui/components/pane"')
    expect(pane.defaultArgs).toMatchObject({variant: "outlined"})

    const number = await COMPONENT_STORIES.load("field/number/input")
    expect(number.source(number.defaultArgs)).toContain('from "@ui/components/field"')
    expect(number.source(number.defaultArgs)).toContain('presentation: "input"')
    expect(number.defaultArgs).toMatchObject({value: 0.625, density: "regular", disabled: false})

    const color = await COMPONENT_STORIES.load("field/color/input")
    expect(color.source(color.defaultArgs)).toContain('kind: "color"')
    expect(color.defaultArgs.value).toEqual({r: 0.18, g: 0.58, b: 0.92, a: 1})

    const noti = await COMPONENT_STORIES.load("noti/status/unavailable")
    expect(noti.source(noti.defaultArgs)).toContain("не опубликован production package export")
  })

  test("uses one retained production preview parent", () => {
    const module = definePlaygroundStoryModule({
      defaultArgs: {value: 1},
      render() {},
      source: () => "const value = 1",
    })
    const index = COMPONENT_STORIES.find("field/number/input")!
    const surface = new ComponentsStoryPreviewSurface()
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setStory(index, module, module.defaultArgs)
      surface.setRect({x: 0, y: 0, w: 1024, h: 720}, 0.001, font)
      expect(surface.diagnostics).toEqual({route: "field/number/input", layoutPlans: 1, materializations: 1})
      surface.setArgs({value: 2})
      surface.flushPendingRender()
      expect(surface.diagnostics).toEqual({route: "field/number/input", layoutPlans: 1, materializations: 2})
    } finally {
      surface.dispose()
    }
  })

  test("replaces manual info ownership with the shared story interaction panel", async () => {
    const entry = await Bun.file(join(playgroundRoot, "entry.ts")).text()
    expect(entry).toContain("COMPONENT_STORIES")
    expect(entry).toContain("PlaygroundStoryPanelSurface")
    expect(entry).toContain("ComponentsStoryPreviewSurface")
    expect(entry).toContain('title: "Компоненты UI"')
    expect(entry).toContain('title: "Варианты"')
    expect(entry).toContain("navigator.clipboard.writeText")
    expect(entry).toContain("runtime.handleResize()")
    expect(entry).not.toContain("PlaygroundInfoSurface")
    expect(entry).not.toContain("componentsPlaygroundInfo")
    expect(entry).not.toContain("COMPONENT_PLAYGROUND_CATALOG")
    for (const forbidden of ["NodeEditor", "BlenderSocket", "NodeSystemSurface", "Hamiltonian", "Bulk"]) {
      expect(entry).not.toContain(forbidden)
    }
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
    expect(build.outputs.length).toBeGreaterThan(2)
    const outputs = await Promise.all(build.outputs.map(async (output) => ({
      name: basename(output.path),
      source: await output.text(),
    })))
    const entry = outputs.find(({name}) => name === "entry.js")
    expect(entry).toBeDefined()
    expect(entry!.source).toContain("import(")
    expect(entry!.source).not.toContain("function createFieldStory")
    expect(entry!.source).not.toContain("function createSimpleComponentStory")
    expect(outputs.some(({source}) => source.includes("function createButtonStory"))).toBeTrue()
    expect(outputs.some(({source}) => source.includes("function createFieldStory"))).toBeTrue()
    expect(outputs.some(({source}) => source.includes("function createSimpleComponentStory"))).toBeTrue()
  })

  test("uses public full-viewport Workbench geometry and the package server", async () => {
    const desktop = planPlaygroundShell(1920, 1080)
    expect(desktop.preview).toEqual({x: 422, y: 16, w: 1024, h: 930})
    expect(desktop.info).toEqual({x: 1464, y: 16, w: 440, h: 1048})
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    expect(server).toContain("startPlaygroundServer")
    expect(server).toContain('packageName: "@ui/components"')
    expect(server).toContain("4017")
    expect(server).toContain('entrypoint: join(import.meta.dir, "entry.ts")')
    expect(server).toContain('canvasId: "stage-canvas"')
  })
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
