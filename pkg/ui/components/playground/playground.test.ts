import {beforeAll, describe, expect, test} from "bun:test"
import {basename, join} from "node:path"
import {fileURLToPath} from "node:url"
import {TrueTypeFont} from "@metafor/engine"
import {FIELD_KINDS} from "@ui/components/field"
import {definePlaygroundStoryModule, planPlaygroundShell} from "@ui/playground"
import {
  createInputEditState,
  focusInput,
  insertActiveInputText,
  UiSurface as BaseUiSurface,
  type UiSurface,
} from "@ui/elements"
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
type HitCall = Parameters<UiSurface["hit"]>
type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type CenteredTextCall = Parameters<UiSurface["drawTextCentered"]>

class StoryActionSurface extends BaseUiSurface {
  readonly hits: HitCall[] = []

  override drawRoundedRect(..._args: RoundedRectCall): void {}
  override drawText(..._args: TextCall): number { return 0 }
  override drawTextCentered(..._args: CenteredTextCall): number { return 0 }
  override hit(...args: HitCall): void { this.hits.push(args) }
  override pushClip(): void {}
  override popClip(): void {}
  protected render(): void {}
}

function storyActionHit(surface: StoryActionSurface, label: "↑" | "↓"): HitCall | undefined {
  return surface.hits.find((hit) => {
    const options = hit[5]
    return typeof options === "object" && options !== null && options.key?.endsWith(`:${label}`) === true
  })
}

function storyBrowseHit(surface: StoryActionSurface): HitCall | undefined {
  return surface.hits.find((hit) => {
    const options = hit[5]
    return typeof options === "object" && options !== null && options.tooltip?.label === "Выбрать путь"
  })
}

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
      "control-group",
      "field",
      "text-field",
      "number-input",
      "color-input",
      "vector-input",
      "matrix-input",
      "reference-input",
      "enum-input",
      "collection-input",
      "path-input",
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
      "Группа контролов",
      "Поле",
      "Текстовый ввод",
      "Числовой ввод",
      "Ввод цвета",
      "Ввод вектора",
      "Ввод матрицы",
      "Выбор ссылки",
      "Выбор значения",
      "Редактор коллекции",
      "Ввод пути",
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
      "collection-input",
      "color-input",
      "enum-input",
      "matrix-input",
      "number-input",
      "path-input",
      "reference-input",
      "vector-input",
    ])
    const catalog = new Set(componentCatalogItems(new Set()).map(({id}) => id))
    for (const component of publicInputLeaves) expect(catalog.has(component)).toBeTrue()

    const controlGroup = await COMPONENT_STORIES.load("control-group/basic/default")
    expect(controlGroup.defaultArgs).toEqual({rows: 3})
    expect(controlGroup.source(controlGroup.defaultArgs)).toContain('from "@ui/components/control-group"')
    expect(controlGroup.source(controlGroup.defaultArgs)).toContain("ControlGroup(surface, x, y, 146, 66")

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

    expect(componentSectionItems("collection-input/value/selected").map(({id}) => id)).toEqual([
      "value", "state", "density",
    ])
    expect(componentVariantItems("collection-input/value/selected").map(({id}) => id)).toEqual([
      "selected", "empty",
    ])
    expect(componentVariantItems("collection-input/state/disabled").map(({id}) => id)).toEqual([
      "disabled", "readonly",
    ])
    expect(componentVariantItems("collection-input/density/compact").map(({id}) => id)).toEqual(["compact"])
    const collection = await COMPONENT_STORIES.load("collection-input/value/selected")
    expect(collection.defaultArgs).toEqual({
      items: [
        {id: "position", label: "Позиция", description: "Векторный атрибут"},
        {id: "normal", label: "Нормаль", description: "Отключённый атрибут", disabled: true},
        {id: "rotation", label: "Вращение", description: "Углы объекта"},
      ],
      "selected-id": "rotation",
      "visible-rows": 3,
      density: "regular",
      disabled: false,
      readonly: false,
      event: "Ожидание",
    })
    expect(collection.controls.map(({key, label}) => [key, label])).toEqual([
      ["items", "Элементы"],
      ["selected-id", "Выбранный элемент"],
      ["visible-rows", "Видимые строки"],
      ["density", "Плотность"],
      ["disabled", "Недоступно"],
      ["readonly", "Только чтение"],
      ["event", "Последнее событие"],
    ])
    const collectionSource = collection.source({...collection.defaultArgs, "visible-rows": 2, density: "compact"})
    expect(collectionSource).toContain('from "@ui/components/collection-input"')
    expect(collectionSource).toContain('selectedId: "rotation"')
    expect(collectionSource).toContain("visibleRows: 2")
    expect(collectionSource).toContain('density: "compact"')
    expect(collectionSource).toContain("onSelect: setSelectedId")
    expect(collectionSource).toContain("onAdd: addItem")
    expect(collectionSource).toContain("onRemove: removeItem")
    expect(collectionSource).toContain("onMove: moveItem")

    const bridgeEvents: [string, unknown][] = []
    globalThis.__componentsStoryControlBridge = (key, value) => bridgeEvents.push([key, value])
    const actionSurface = new StoryActionSurface()
    try {
      collection.render(actionSurface, collection.defaultArgs, {x: 0, y: 0, w: 1024, h: 720})
      for (const index of [0, 2, 3, 4]) actionSurface.hits[index]![4]()
    } finally {
      globalThis.__componentsStoryControlBridge = undefined
      actionSurface.dispose()
    }
    expect(bridgeEvents).toEqual([
      ["selected-id", "position"],
      ["event", "onSelect: position"],
      ["selected-id", "rotation"],
      ["event", "onSelect: rotation"],
      ["items", [
        {id: "position", label: "Позиция", description: "Векторный атрибут"},
        {id: "normal", label: "Нормаль", description: "Отключённый атрибут", disabled: true},
        {id: "rotation", label: "Вращение", description: "Углы объекта"},
        {id: "item-4", label: "Элемент 4"},
      ]],
      ["selected-id", "item-4"],
      ["event", "onAdd"],
      ["items", [
        {id: "position", label: "Позиция", description: "Векторный атрибут"},
        {id: "normal", label: "Нормаль", description: "Отключённый атрибут", disabled: true},
      ]],
      ["selected-id", null],
      ["event", "onRemove: rotation"],
    ])

    const collectionEmpty = await COMPONENT_STORIES.load("collection-input/value/empty")
    expect(collectionEmpty.defaultArgs).toMatchObject({items: [], "selected-id": null})
    const collectionDisabled = await COMPONENT_STORIES.load("collection-input/state/disabled")
    expect(collectionDisabled.defaultArgs).toMatchObject({disabled: true})
    const collectionReadonly = await COMPONENT_STORIES.load("collection-input/state/readonly")
    expect(collectionReadonly.defaultArgs).toMatchObject({readonly: true})
    const collectionCompact = await COMPONENT_STORIES.load("collection-input/density/compact")
    expect(collectionCompact.defaultArgs).toMatchObject({density: "compact"})

    const collectionImplementation = await Bun.file(join(playgroundRoot, "stories", "collection-input.ts")).text()
    expect(collectionImplementation).toContain('from "@ui/components/collection-input"')
    expect(collectionImplementation).toContain('globalThis.__componentsStoryControlBridge?.("selected-id", id)')
    expect(collectionImplementation).toContain('globalThis.__componentsStoryControlBridge?.("event", `onSelect: ${id}`)')
    expect(collectionImplementation).toContain('globalThis.__componentsStoryControlBridge?.("event", "onAdd")')
    expect(collectionImplementation).toContain('globalThis.__componentsStoryControlBridge?.("event", `onRemove: ${id}`)')
    expect(collectionImplementation).toContain('globalThis.__componentsStoryControlBridge?.("event", `onMove: ${id}, ${moveLabel}`)')

    expect(componentSectionItems("path-input/value/path").map(({id}) => id)).toEqual([
      "value", "state", "density",
    ])
    expect(componentVariantItems("path-input/value/path").map(({id}) => id)).toEqual(["path", "empty"])
    expect(componentVariantItems("path-input/state/disabled").map(({id}) => id)).toEqual(["disabled", "readonly"])
    expect(componentVariantItems("path-input/density/compact").map(({id}) => id)).toEqual(["compact"])

    const path = await COMPONENT_STORIES.load("path-input/value/path")
    expect(path.defaultArgs).toEqual({
      value: "/textures/source.exr",
      density: "regular",
      disabled: false,
      readonly: false,
      event: "Ожидание",
    })
    expect(path.controls.map(({key, label}) => [key, label])).toEqual([
      ["value", "Путь"],
      ["density", "Плотность"],
      ["disabled", "Недоступно"],
      ["readonly", "Только чтение"],
      ["event", "Последнее событие"],
    ])
    const pathSource = path.source({...path.defaultArgs, density: "compact", readonly: true})
    expect(pathSource).toContain('from "@ui/components/path-input"')
    expect(pathSource).toContain('let value = "/textures/source.exr"')
    expect(pathSource).toContain('density: "compact"')
    expect(pathSource).toContain("readOnly: true")
    expect(pathSource).toContain("onChange: setValue")
    expect(pathSource).toContain("onBrowse: openPathPicker")

    const pathEvents: [string, unknown][] = []
    const pathSurface = new StoryActionSurface()
    globalThis.__componentsStoryControlBridge = (key, value) => pathEvents.push([key, value])
    try {
      path.render(pathSurface, path.defaultArgs, {x: 0, y: 0, w: 1024, h: 720})
      focusInput(pathSurface, "components-story-path-input", createInputEditState("/textures/source.exr"))
      expect(insertActiveInputText(pathSurface, ".bak")).toBeTrue()
      const browse = storyBrowseHit(pathSurface)
      expect(browse).toBeDefined()
      browse![4]()
    } finally {
      globalThis.__componentsStoryControlBridge = undefined
      pathSurface.dispose()
    }
    expect(pathEvents).toEqual([
      ["value", "/textures/source.exr.bak"],
      ["event", "onChange: /textures/source.exr.bak"],
      ["event", "onBrowse"],
    ])

    const pathEmpty = await COMPONENT_STORIES.load("path-input/value/empty")
    expect(pathEmpty.defaultArgs).toMatchObject({value: ""})
    const pathDisabled = await COMPONENT_STORIES.load("path-input/state/disabled")
    expect(pathDisabled.defaultArgs).toMatchObject({disabled: true})
    const pathReadonly = await COMPONENT_STORIES.load("path-input/state/readonly")
    expect(pathReadonly.defaultArgs).toMatchObject({readonly: true})
    const pathCompact = await COMPONENT_STORIES.load("path-input/density/compact")
    expect(pathCompact.defaultArgs).toMatchObject({density: "compact"})

    const referenceField = await COMPONENT_STORIES.load("field/reference/default")
    expect(referenceField.source(referenceField.defaultArgs)).toContain('from "@ui/components/field"')
    expect(referenceField.source(referenceField.defaultArgs)).toContain('kind: "reference"')
    const collectionField = await COMPONENT_STORIES.load("field/collection/default")
    expect(collectionField.source(collectionField.defaultArgs)).toContain('kind: "collection"')
    expect(collectionField.source(collectionField.defaultArgs)).toContain("onSelect: setSelectedId")
    const pathField = await COMPONENT_STORIES.load("field/path/default")
    expect(pathField.source(pathField.defaultArgs)).toContain('kind: "path"')
    expect(pathField.source(pathField.defaultArgs)).toContain("onChange: setValue")
    expect(pathField.source(pathField.defaultArgs)).toContain("onBrowse: openPathPicker")
  })

  test("reorders CollectionInput story items immutably and preserves the controlled selection", async () => {
    const collection = await COMPONENT_STORIES.load("collection-input/value/selected")
    const initialItems = collection.defaultArgs.items as readonly Readonly<{id: string}>[]

    for (const scenario of [
      {
        selectedId: "rotation",
        legalLabel: "↑",
        blockedLabel: "↓",
        directionLabel: "вверх",
        order: ["position", "rotation", "normal"],
      },
      {
        selectedId: "position",
        legalLabel: "↓",
        blockedLabel: "↑",
        directionLabel: "вниз",
        order: ["normal", "position", "rotation"],
      },
    ] as const) {
      const bridgeEvents: [string, unknown][] = []
      const surface = new StoryActionSurface()
      globalThis.__componentsStoryControlBridge = (key, value) => bridgeEvents.push([key, value])
      try {
        collection.render(surface, {...collection.defaultArgs, "selected-id": scenario.selectedId}, {
          x: 0,
          y: 0,
          w: 1024,
          h: 720,
        })
        const legal = storyActionHit(surface, scenario.legalLabel)
        const blocked = storyActionHit(surface, scenario.blockedLabel)
        expect(legal).toBeDefined()
        expect(blocked).toBeDefined()
        blocked![4]()
        expect(bridgeEvents).toEqual([])
        legal![4]()
      } finally {
        globalThis.__componentsStoryControlBridge = undefined
        surface.dispose()
      }

      expect(bridgeEvents.map(([key]) => key)).toEqual(["items", "event"])
      const movedItems = bridgeEvents[0]![1] as readonly Readonly<{id: string}>[]
      expect(movedItems).not.toBe(initialItems)
      expect(Object.isFrozen(movedItems)).toBeTrue()
      expect(movedItems.map(({id}) => id)).toEqual([...scenario.order])
      expect(bridgeEvents[1]).toEqual([
        "event",
        `onMove: ${scenario.selectedId}, ${scenario.directionLabel}`,
      ])
      expect(bridgeEvents.some(([key]) => key === "selected-id")).toBeFalse()
      expect(initialItems.map(({id}) => id)).toEqual(["position", "normal", "rotation"])
    }
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
    expect(entry!.source).not.toContain("function createCollectionInputStory")
    expect(entry!.source).not.toContain("function createPathInputStory")
    expect(entry!.source).not.toContain('@ui/components/vector-input')
    expect(entry!.source).not.toContain('@ui/components/matrix-input')
    expect(entry!.source).not.toContain('@ui/components/reference-input')
    expect(entry!.source).not.toContain('@ui/components/enum-input')
    expect(entry!.source).not.toContain('@ui/components/collection-input')
    expect(entry!.source).not.toContain('@ui/components/path-input')
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
    const collectionInputChunk = outputs.find(({source}) => source.includes("function createCollectionInputStory"))
    expect(collectionInputChunk).toBeDefined()
    expect(collectionInputChunk!.source).toContain('@ui/components/collection-input')
    const pathInputChunk = outputs.find(({source}) => source.includes("function createPathInputStory"))
    expect(pathInputChunk).toBeDefined()
    expect(pathInputChunk!.source).toContain('@ui/components/path-input')
  })

  test("uses public full-viewport Workbench geometry and the package server", async () => {
    const desktop = planPlaygroundShell(1920, 1080)
    expect(desktop.preview).toEqual({x: 375, y: 3, w: 1101, h: 1049})
    expect(desktop.info).toEqual({x: 1477, y: 3, w: 440, h: 1074})
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
