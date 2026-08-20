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
      "vector-input",
      "matrix-input",
      "reference-input",
      "enum-input",
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
      "Ввод вектора",
      "Ввод матрицы",
      "Выбор ссылки",
      "Выбор значения",
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

  test("catalogs every exact public input leaf as its own component", async () => {
    const manifest = await Bun.file(join(playgroundRoot, "..", "package.json")).json() as {
      exports: Readonly<Record<string, string>>
    }
    const publicInputLeaves = Object.keys(manifest.exports)
      .filter((specifier) => specifier.endsWith("-input"))
      .map((specifier) => specifier.slice(2))
      .sort()
    expect(publicInputLeaves).toEqual([
      "color-input",
      "enum-input",
      "matrix-input",
      "number-input",
      "reference-input",
      "vector-input",
    ])
    const catalog = new Set(componentCatalogItems(new Set()).map(({id}) => id))
    for (const component of publicInputLeaves) expect(catalog.has(component)).toBeTrue()

    const vector = await COMPONENT_STORIES.load("vector-input/basic/default")
    expect(vector.defaultArgs).toEqual({value: [1, 2, 3], density: "regular", disabled: false})
    expect(vector.controls.map(({key, label}) => [key, label])).toEqual([
      ["value", "Координаты"],
      ["density", "Плотность"],
      ["disabled", "Недоступно"],
    ])
    expect(vector.source({...vector.defaultArgs, value: [4, 5, 6], density: "compact"})).toContain(
      'from "@ui/components/vector-input"',
    )
    expect(vector.source({...vector.defaultArgs, value: [4, 5, 6], density: "compact"})).toContain(
      'value: [4,5,6],\n  dimensions: 3,\n  density: "compact"',
    )

    const matrix = await COMPONENT_STORIES.load("matrix-input/basic/default")
    expect(matrix.defaultArgs).toEqual({value: [[1, 0], [0, 1]], density: "regular", disabled: false})
    expect(matrix.controls.map(({key, label}) => [key, label])).toEqual([
      ["value", "Ячейки"],
      ["density", "Плотность"],
      ["disabled", "Недоступно"],
    ])
    const matrixSource = matrix.source({...matrix.defaultArgs, value: [[1, 2], [3, 4]], disabled: true})
    expect(matrixSource).toContain('from "@ui/components/matrix-input"')
    expect(matrixSource).toContain('value: [[1,2],[3,4]],\n  density: "regular",\n  disabled: true')

    const reference = await COMPONENT_STORIES.load("reference-input/basic/default")
    expect(reference.defaultArgs).toEqual({
      value: {id: "texture.brick", label: "Кирпичная текстура", kind: "Texture"},
      density: "regular",
      disabled: false,
      readonly: false,
      event: "Ожидание",
    })
    expect(reference.controls.map(({key, label}) => [key, label])).toEqual([
      ["value", "Ссылка"],
      ["density", "Плотность"],
      ["disabled", "Недоступно"],
      ["readonly", "Только чтение"],
      ["event", "Последнее событие"],
    ])
    const referenceSource = reference.source({...reference.defaultArgs, value: null, readonly: true})
    expect(referenceSource).toContain('from "@ui/components/reference-input"')
    expect(referenceSource).toContain("let value: ReferenceInputValue | null = null")
    expect(referenceSource).toContain("readOnly: true")
    expect(referenceSource).toContain("onActivate: openReferencePicker")
    expect(referenceSource).toContain("onClear: () => setValue(null)")

    const referenceImplementation = await Bun.file(join(playgroundRoot, "stories", "reference-input.ts")).text()
    expect(referenceImplementation).toContain('globalThis.__componentsStoryControlBridge?.("value", SAMPLE_REFERENCE)')
    expect(referenceImplementation).toContain('globalThis.__componentsStoryControlBridge?.("value", null)')
    expect(referenceImplementation).toContain('globalThis.__componentsStoryControlBridge?.("event", "onActivate")')
    expect(referenceImplementation).toContain('globalThis.__componentsStoryControlBridge?.("event", "onClear")')

    expect(componentSectionItems("enum-input/presentation/cycle").map(({id}) => id)).toEqual([
      "presentation", "value", "exception", "state",
    ])
    expect(componentVariantItems("enum-input/presentation/cycle").map(({id}) => id)).toEqual([
      "cycle", "expanded",
    ])
    expect(componentVariantItems("enum-input/value/selected-description").map(({id}) => id)).toEqual([
      "selected-description", "invalid-legacy",
    ])
    expect(componentVariantItems("enum-input/exception/no-items").map(({id}) => id)).toEqual([
      "no-items", "menu-undefined", "menu-error",
    ])
    expect(componentVariantItems("enum-input/state/disabled").map(({id}) => id)).toEqual([
      "disabled", "readonly",
    ])
    const enumCycle = await COMPONENT_STORIES.load("enum-input/presentation/cycle")
    expect(enumCycle.defaultArgs).toMatchObject({
      value: "multiply",
      presentation: "cycle",
      options: "ready",
      state: "ready",
      disabled: false,
      readonly: false,
    })
    expect(enumCycle.controls.map(({key, label}) => [key, label])).toEqual([
      ["value", "Значение"],
      ["presentation", "Представление"],
      ["options", "Варианты"],
      ["state", "Состояние меню"],
      ["density", "Плотность"],
      ["disabled", "Недоступно"],
      ["readonly", "Только чтение"],
      ["event", "Последнее событие"],
    ])
    const cycleSource = enumCycle.source(enumCycle.defaultArgs)
    expect(cycleSource).toContain('from "@ui/components/enum-input"')
    expect(cycleSource).toContain('description":"Умножить входные значения"')
    expect(cycleSource).toContain('presentation: "cycle"')

    const enumSelected = await COMPONENT_STORIES.load("enum-input/value/selected-description")
    expect(enumSelected.defaultArgs).toMatchObject({value: "multiply", presentation: "cycle"})
    expect(enumSelected.source(enumSelected.defaultArgs)).toContain('description":"Умножить входные значения"')

    const enumExpanded = await COMPONENT_STORIES.load("enum-input/presentation/expanded")
    expect(enumExpanded.defaultArgs).toMatchObject({presentation: "expanded", value: "multiply"})
    expect(enumExpanded.source(enumExpanded.defaultArgs)).toContain('presentation: "expanded"')

    const enumInvalid = await COMPONENT_STORIES.load("enum-input/value/invalid-legacy")
    expect(enumInvalid.defaultArgs).toMatchObject({value: "missing", presentation: "cycle"})
    expect(enumInvalid.source(enumInvalid.defaultArgs)).toContain('value: "missing"')

    const enumNoItems = await COMPONENT_STORIES.load("enum-input/exception/no-items")
    expect(enumNoItems.defaultArgs).toMatchObject({options: "empty"})
    expect(enumNoItems.source(enumNoItems.defaultArgs)).toContain("const options: readonly EnumInputOption[] = []")
    const enumUndefined = await COMPONENT_STORIES.load("enum-input/exception/menu-undefined")
    expect(enumUndefined.defaultArgs).toMatchObject({options: "undefined"})
    expect(enumUndefined.source(enumUndefined.defaultArgs)).not.toContain("  options,")
    const enumError = await COMPONENT_STORIES.load("enum-input/exception/menu-error")
    expect(enumError.defaultArgs).toMatchObject({state: "error"})
    expect(enumError.source(enumError.defaultArgs)).toContain('state: "error"')
    const enumDisabled = await COMPONENT_STORIES.load("enum-input/state/disabled")
    expect(enumDisabled.defaultArgs).toMatchObject({disabled: true})
    expect(enumDisabled.source(enumDisabled.defaultArgs)).toContain("disabled: true")
    const enumReadonly = await COMPONENT_STORIES.load("enum-input/state/readonly")
    expect(enumReadonly.defaultArgs).toMatchObject({readonly: true})
    expect(enumReadonly.source(enumReadonly.defaultArgs)).toContain("readOnly: true")

    const enumImplementation = await Bun.file(join(playgroundRoot, "stories", "enum-input.ts")).text()
    expect(enumImplementation).toContain('from "@ui/components/enum-input"')
    expect(enumImplementation).toContain('globalThis.__componentsStoryControlBridge?.("value", value)')
    expect(enumImplementation).toContain('globalThis.__componentsStoryControlBridge?.("event", `onChange: ${value}`)')

    const referenceField = await COMPONENT_STORIES.load("field/reference/default")
    expect(referenceField.source(referenceField.defaultArgs)).toContain('from "@ui/components/field"')
    expect(referenceField.source(referenceField.defaultArgs)).toContain('kind: "reference"')
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
    expect(noti.source(noti.defaultArgs)).toContain("не опубликован в рабочем API")
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
    expect(entry!.source).not.toContain("function createStandaloneInputStory")
    expect(entry!.source).not.toContain("function createReferenceInputStory")
    expect(entry!.source).not.toContain("function createEnumInputStory")
    expect(entry!.source).not.toContain('@ui/components/vector-input')
    expect(entry!.source).not.toContain('@ui/components/matrix-input')
    expect(entry!.source).not.toContain('@ui/components/reference-input')
    expect(entry!.source).not.toContain('@ui/components/enum-input')
    expect(outputs.some(({source}) => source.includes("function createButtonStory"))).toBeTrue()
    expect(outputs.some(({source}) => source.includes("function createFieldStory"))).toBeTrue()
    expect(outputs.some(({source}) => source.includes("function createSimpleComponentStory"))).toBeTrue()
    const inputChunk = outputs.find(({source}) => source.includes("function createStandaloneInputStory"))
    expect(inputChunk).toBeDefined()
    expect(inputChunk!.source).toContain('@ui/components/vector-input')
    expect(inputChunk!.source).toContain('@ui/components/matrix-input')
    const referenceInputChunk = outputs.find(({source}) => source.includes("function createReferenceInputStory"))
    expect(referenceInputChunk).toBeDefined()
    expect(referenceInputChunk!.source).toContain('@ui/components/reference-input')
    const enumInputChunk = outputs.find(({source}) => source.includes("function createEnumInputStory"))
    expect(enumInputChunk).toBeDefined()
    expect(enumInputChunk!.source).toContain('@ui/components/enum-input')
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
