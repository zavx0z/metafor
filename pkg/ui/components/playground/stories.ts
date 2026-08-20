import {
  definePlaygroundStories,
  type PlaygroundNavigationItem,
  type PlaygroundStoryIndexItem,
  type PlaygroundStoryModule,
} from "@ui/playground"

export type ButtonStorySection = "basic" | "icon" | "icon-label" | "sizes" | "color"
export type ButtonStoryVariant =
  | "text"
  | "contained"
  | "outlined"
  | "svg"
  | "left"
  | "right"
  | "small"
  | "medium"
  | "large"
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "neutral"

export type FieldStoryKind =
  | "text"
  | "number"
  | "boolean"
  | "enum"
  | "color"
  | "vector"
  | "rotation"
  | "matrix"
  | "reference"
  | "collection"
  | "path"
  | "readonly"

export type SimpleComponentStory =
  | "badge"
  | "text-field"
  | "number-input"
  | "color-input"
  | "checkbox"
  | "switcher"
  | "progress-checkbox"
  | "slider-control"
  | "typography"
  | "divider"
  | "list"
  | "table"
  | "scrollbar"
  | "noti"

export type StandaloneInputStory = "vector-input" | "matrix-input"
export type EnumInputStoryVariant =
  | "cycle"
  | "expanded"
  | "selected-description"
  | "header-icons"
  | "mixed-icons"
  | "invalid-legacy"
  | "no-items"
  | "menu-undefined"
  | "menu-error"
  | "disabled"
  | "readonly"
export type CollectionInputStoryVariant = "selected" | "empty" | "disabled" | "readonly" | "compact"
export type PathInputStoryVariant = "path" | "empty" | "disabled" | "readonly" | "compact"
export type ColorInputStoryVariant = "closed" | "open" | "expanded"

const loadButtonStory = (
  section: ButtonStorySection,
  variant: ButtonStoryVariant,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createButtonStory} = await import("./stories/button.ts")
  return createButtonStory({section, variant})
}

const loadPaneStory = (
  variant: "glass" | "outlined" | "filled",
) => async (): Promise<PlaygroundStoryModule> => {
  const {createPaneStory} = await import("./stories/pane.ts")
  return createPaneStory(variant)
}

const loadFieldStory = (
  kind: FieldStoryKind,
  presentation: "default" | "input" | "slider" | "switch",
) => async (): Promise<PlaygroundStoryModule> => {
  const {createFieldStory} = await import("./stories/field.ts")
  return createFieldStory({kind, presentation})
}

const loadSimpleStory = (
  component: SimpleComponentStory,
  variant: string,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createSimpleComponentStory} = await import("./stories/simple.ts")
  return createSimpleComponentStory({component, variant})
}

const loadStandaloneInputStory = (
  component: StandaloneInputStory,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createStandaloneInputStory} = await import("./stories/input.ts")
  return createStandaloneInputStory(component)
}

const loadControlGroupStory = async (): Promise<PlaygroundStoryModule> => {
  const {createControlGroupStory} = await import("./stories/control-group.ts")
  return createControlGroupStory()
}

const loadReferenceInputStory = async (): Promise<PlaygroundStoryModule> => {
  const {createReferenceInputStory} = await import("./stories/reference-input.ts")
  return createReferenceInputStory()
}

const loadColorInputStory = (
  variant: ColorInputStoryVariant,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createColorInputStory} = await import("./stories/color-input.ts")
  return createColorInputStory(variant)
}

const loadEnumInputStory = (
  variant: EnumInputStoryVariant,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createEnumInputStory} = await import("./stories/enum-input.ts")
  return createEnumInputStory(variant)
}

const loadCollectionInputStory = (
  variant: CollectionInputStoryVariant,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createCollectionInputStory} = await import("./stories/collection-input.ts")
  return createCollectionInputStory(variant)
}

const loadPathInputStory = (
  variant: PathInputStoryVariant,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createPathInputStory} = await import("./stories/path-input.ts")
  return createPathInputStory(variant)
}

const singleVariant = (
  component: SimpleComponentStory,
  title: string,
  variant = "default",
  label = "Основной",
) => [{id: variant, label, title, load: loadSimpleStory(component, variant)}] as const

export const COMPONENT_STORIES = definePlaygroundStories({
  groups: [
    {
      id: "foundation",
      label: "Основные",
      components: [
        {
          id: "button",
          label: "Кнопка",
          apiName: "Button",
          tags: ["action", "действие", "icon"],
          sections: [
            {
              id: "basic",
              label: "Основные",
              variants: [
                {id: "text", label: "Текстовая", title: "Кнопка · Текстовая", load: loadButtonStory("basic", "text")},
                {id: "contained", label: "Заполненная", title: "Кнопка · Заполненная", load: loadButtonStory("basic", "contained")},
                {id: "outlined", label: "Контурная", title: "Кнопка · Контурная", load: loadButtonStory("basic", "outlined")},
              ],
            },
            {
              id: "icon",
              label: "Иконка",
              variants: [{id: "svg", label: "SVG", title: "Кнопка · SVG-иконка", load: loadButtonStory("icon", "svg")}],
            },
            {
              id: "icon-label",
              label: "Иконка и подпись",
              variants: [
                {id: "left", label: "Слева", title: "Кнопка · Иконка слева", load: loadButtonStory("icon-label", "left")},
                {id: "right", label: "Справа", title: "Кнопка · Иконка справа", load: loadButtonStory("icon-label", "right")},
              ],
            },
            {
              id: "sizes",
              label: "Размер",
              variants: [
                {id: "small", label: "Маленькая", title: "Кнопка · Маленькая", load: loadButtonStory("sizes", "small")},
                {id: "medium", label: "Средняя", title: "Кнопка · Средняя", load: loadButtonStory("sizes", "medium")},
                {id: "large", label: "Большая", title: "Кнопка · Большая", load: loadButtonStory("sizes", "large")},
              ],
            },
            {
              id: "color",
              label: "Цвет",
              variants: [
                {id: "primary", label: "Основной", title: "Кнопка · Основной цвет", load: loadButtonStory("color", "primary")},
                {id: "success", label: "Успех", title: "Кнопка · Успех", load: loadButtonStory("color", "success")},
                {id: "warning", label: "Предупреждение", title: "Кнопка · Предупреждение", load: loadButtonStory("color", "warning")},
                {id: "error", label: "Ошибка", title: "Кнопка · Ошибка", load: loadButtonStory("color", "error")},
                {id: "neutral", label: "Нейтральный", title: "Кнопка · Нейтральный", load: loadButtonStory("color", "neutral")},
              ],
            },
          ],
        },
        {
          id: "pane",
          label: "Панель",
          apiName: "Pane",
          tags: ["surface", "container"],
          sections: [{
            id: "variants",
            label: "Варианты",
            variants: [
              {id: "glass", label: "Стекло", title: "Панель · Стекло", load: loadPaneStory("glass")},
              {id: "outlined", label: "Контурная", title: "Панель · Контурная", load: loadPaneStory("outlined")},
              {id: "filled", label: "Заполненная", title: "Панель · Заполненная", load: loadPaneStory("filled")},
            ],
          }],
        },
        {
          id: "badge",
          label: "Метка",
          apiName: "Badge",
          sections: [{id: "basic", label: "Основная", variants: singleVariant("badge", "Метка · Основная")}],
        },
        {
          id: "typography",
          label: "Типографика",
          apiName: "Typography",
          sections: [{id: "variants", label: "Начертания", variants: singleVariant("typography", "Типографика · Начертания")}],
        },
        {
          id: "divider",
          label: "Разделитель",
          apiName: "Divider",
          sections: [{
            id: "variants",
            label: "Отступ",
            variants: [
              {id: "full-width", label: "На всю ширину", title: "Разделитель · На всю ширину", load: loadSimpleStory("divider", "full-width")},
              {id: "inset", label: "С отступом", title: "Разделитель · С отступом", load: loadSimpleStory("divider", "inset")},
              {id: "middle", label: "По центру", title: "Разделитель · По центру", load: loadSimpleStory("divider", "middle")},
            ],
          }],
        },
      ],
    },
    {
      id: "inputs",
      label: "Ввод",
      components: [
        {
          id: "control-group",
          label: "Группа контролов",
          apiName: "ControlGroup",
          tags: ["input", "group", "joined", "grid"],
          sections: [{
            id: "basic",
            label: "Основная",
            variants: [{
              id: "default",
              label: "Три строки",
              title: "ControlGroup · Соединённые строки",
              load: loadControlGroupStory,
            }],
          }],
        },
        {
          id: "field",
          label: "Поле",
          apiName: "Field",
          tags: ["input", "controlled", "universal"],
          sections: [
            {id: "text", label: "Текст", variants: [{id: "default", label: "Основное", title: "Field · Текст", load: loadFieldStory("text", "default")}]},
            {id: "number", label: "Число", variants: [
              {id: "input", label: "Ввод", title: "Field · Числовой ввод", load: loadFieldStory("number", "input")},
              {id: "slider", label: "Слайдер", title: "Field · Числовой слайдер", load: loadFieldStory("number", "slider")},
            ]},
            {id: "boolean", label: "Переключатель", variants: [{id: "switch", label: "Switcher", title: "Field · Переключатель", load: loadFieldStory("boolean", "switch")}]},
            {id: "enum", label: "Выбор", variants: [{id: "default", label: "Основной", title: "Field · Выбор", load: loadFieldStory("enum", "default")}]},
            {id: "color", label: "Цвет", variants: [{id: "input", label: "RGBA", title: "Field · Цвет", load: loadFieldStory("color", "input")}]},
            {id: "vector", label: "Вектор", variants: [{id: "default", label: "XYZ", title: "Field · Вектор", load: loadFieldStory("vector", "default")}]},
            {id: "rotation", label: "Вращение", variants: [{id: "default", label: "XYZ", title: "Field · Вращение", load: loadFieldStory("rotation", "default")}]},
            {id: "matrix", label: "Матрица", variants: [{id: "default", label: "2×2", title: "Field · Матрица", load: loadFieldStory("matrix", "default")}]},
            {id: "reference", label: "Ссылка", variants: [{id: "default", label: "Ресурс", title: "Field · Ссылка", load: loadFieldStory("reference", "default")}]},
            {id: "collection", label: "Коллекция", variants: [{id: "default", label: "Элементы", title: "Field · Коллекция", load: loadFieldStory("collection", "default")}]},
            {id: "path", label: "Путь", variants: [{id: "default", label: "Файл", title: "Field · Путь", load: loadFieldStory("path", "default")}]},
            {id: "readonly", label: "Только чтение", variants: [{id: "default", label: "Результат", title: "Field · Только чтение", load: loadFieldStory("readonly", "default")}]},
          ],
        },
        {id: "text-field", label: "Текстовый ввод", apiName: "TextField", sections: [{id: "basic", label: "Основной", variants: singleVariant("text-field", "TextField · Основной")} ]},
        {id: "number-input", label: "Числовой ввод", apiName: "NumberInput", sections: [{id: "basic", label: "Основной", variants: singleVariant("number-input", "NumberInput · Основной")} ]},
        {id: "color-input", label: "Ввод цвета", apiName: "ColorInput", sections: [
          {id: "basic", label: "Основной", variants: [{
            id: "color-input",
            label: "Закрыт",
            title: "ColorInput · Закрытый picker",
            load: loadColorInputStory("closed"),
          }]},
          {id: "state", label: "Состояние", variants: [{
            id: "open",
            label: "Открыт",
            title: "ColorInput · Открытый picker",
            load: loadColorInputStory("open"),
          }]},
          {id: "presentation", label: "Представление", variants: [{
            id: "expanded",
            label: "Развёрнут",
            title: "ColorInput · Развёрнутый",
            load: loadColorInputStory("expanded"),
          }]},
        ]},
        {id: "vector-input", label: "Ввод вектора", apiName: "VectorInput", tags: ["input", "vector", "2D", "3D", "4D"], sections: [{
          id: "basic",
          label: "Основной",
          variants: [{
            id: "default",
            label: "XYZ",
            title: "VectorInput · Вектор XYZ",
            load: loadStandaloneInputStory("vector-input"),
          }],
        }]},
        {id: "matrix-input", label: "Ввод матрицы", apiName: "MatrixInput", tags: ["input", "matrix", "2×2", "3×3", "4×4"], sections: [{
          id: "basic",
          label: "Основной",
          variants: [{
            id: "default",
            label: "2×2",
            title: "MatrixInput · Матрица 2×2",
            load: loadStandaloneInputStory("matrix-input"),
          }],
        }]},
        {id: "reference-input", label: "Выбор ссылки", apiName: "ReferenceInput", tags: ["input", "reference", "ссылка", "ресурс", "выбор"], sections: [{
          id: "basic",
          label: "Основной",
          variants: [{
            id: "default",
            label: "Ресурс",
            title: "ReferenceInput · Выбор ресурса",
            load: loadReferenceInputStory,
          }],
        }]},
        {id: "enum-input", label: "Выбор значения", apiName: "EnumInput", tags: ["input", "enum", "выбор", "цикл", "варианты"], sections: [
          {
            id: "presentation",
            label: "Представление",
            variants: [
              {id: "cycle", label: "Цикл", title: "EnumInput · Циклический выбор", load: loadEnumInputStory("cycle")},
              {id: "expanded", label: "Развёрнуто", title: "EnumInput · Варианты в строке", load: loadEnumInputStory("expanded")},
            ],
          },
          {
            id: "value",
            label: "Значение",
            variants: [
              {id: "selected-description", label: "С описанием", title: "EnumInput · Описание выбранного значения", load: loadEnumInputStory("selected-description")},
              {id: "header-icons", label: "Заголовок и иконки", title: "EnumInput · Заголовок и иконки", load: loadEnumInputStory("header-icons")},
              {id: "mixed-icons", label: "Смешанные иконки", title: "EnumInput · Общая колонка иконок", load: loadEnumInputStory("mixed-icons")},
              {id: "invalid-legacy", label: "Неизвестное", title: "EnumInput · Неизвестное устаревшее значение", load: loadEnumInputStory("invalid-legacy")},
            ],
          },
          {
            id: "exception",
            label: "Исключения",
            variants: [
              {id: "no-items", label: "Нет вариантов", title: "EnumInput · No Items", load: loadEnumInputStory("no-items")},
              {id: "menu-undefined", label: "Не определено", title: "EnumInput · Menu Undefined", load: loadEnumInputStory("menu-undefined")},
              {id: "menu-error", label: "Ошибка", title: "EnumInput · Menu Error", load: loadEnumInputStory("menu-error")},
            ],
          },
          {
            id: "state",
            label: "Состояние",
            variants: [
              {id: "disabled", label: "Недоступно", title: "EnumInput · Недоступно", load: loadEnumInputStory("disabled")},
              {id: "readonly", label: "Только чтение", title: "EnumInput · Только чтение", load: loadEnumInputStory("readonly")},
            ],
          },
        ]},
        {id: "collection-input", label: "Редактор коллекции", apiName: "CollectionInput", tags: ["input", "collection", "список", "выбор", "добавление", "удаление"], sections: [
          {
            id: "value",
            label: "Значение",
            variants: [
              {id: "selected", label: "Выбрано", title: "CollectionInput · Выбранный элемент", load: loadCollectionInputStory("selected")},
              {id: "empty", label: "Пусто", title: "CollectionInput · Пустая коллекция", load: loadCollectionInputStory("empty")},
            ],
          },
          {
            id: "state",
            label: "Состояние",
            variants: [
              {id: "disabled", label: "Недоступно", title: "CollectionInput · Недоступно", load: loadCollectionInputStory("disabled")},
              {id: "readonly", label: "Только чтение", title: "CollectionInput · Только чтение", load: loadCollectionInputStory("readonly")},
            ],
          },
          {
            id: "density",
            label: "Плотность",
            variants: [
              {id: "compact", label: "Компактная", title: "CollectionInput · Компактная плотность", load: loadCollectionInputStory("compact")},
            ],
          },
        ]},
        {id: "path-input", label: "Ввод пути", apiName: "PathInput", tags: ["input", "path", "путь", "файл", "выбор"], sections: [
          {
            id: "value",
            label: "Значение",
            variants: [
              {id: "path", label: "Путь", title: "PathInput · Путь к файлу", load: loadPathInputStory("path")},
              {id: "empty", label: "Пусто", title: "PathInput · Пустой путь", load: loadPathInputStory("empty")},
            ],
          },
          {
            id: "state",
            label: "Состояние",
            variants: [
              {id: "disabled", label: "Недоступно", title: "PathInput · Недоступно", load: loadPathInputStory("disabled")},
              {id: "readonly", label: "Только чтение", title: "PathInput · Только чтение", load: loadPathInputStory("readonly")},
            ],
          },
          {
            id: "density",
            label: "Плотность",
            variants: [
              {id: "compact", label: "Компактная", title: "PathInput · Компактная плотность", load: loadPathInputStory("compact")},
            ],
          },
        ]},
        {id: "checkbox", label: "Флажок", apiName: "Checkbox", sections: [{id: "state", label: "Состояние", variants: [
          {id: "unchecked", label: "Выключен", title: "Checkbox · Выключен", load: loadSimpleStory("checkbox", "unchecked")},
          {id: "checked", label: "Включён", title: "Checkbox · Включён", load: loadSimpleStory("checkbox", "checked")},
        ]}]},
        {id: "switcher", label: "Переключатель", apiName: "Switcher", sections: [{id: "state", label: "Состояние", variants: [
          {id: "off", label: "Выключен", title: "Switcher · Выключен", load: loadSimpleStory("switcher", "off")},
          {id: "on", label: "Включён", title: "Switcher · Включён", load: loadSimpleStory("switcher", "on")},
        ]}]},
        {id: "progress-checkbox", label: "Флажок прогресса", apiName: "ProgressCheckbox", sections: [{id: "progress", label: "Прогресс", variants: singleVariant("progress-checkbox", "ProgressCheckbox · Прогресс")} ]},
        {id: "slider-control", label: "Слайдер", apiName: "SliderControl", sections: [{id: "basic", label: "Основной", variants: singleVariant("slider-control", "SliderControl · Основной")} ]},
      ],
    },
    {
      id: "data",
      label: "Данные",
      components: [
        {id: "list", label: "Список", apiName: "List", sections: [{id: "basic", label: "Основной", variants: singleVariant("list", "List · Основной")} ]},
        {id: "table", label: "Таблица", apiName: "Table", sections: [{id: "basic", label: "Основная", variants: singleVariant("table", "Table · Основная")} ]},
        {id: "scrollbar", label: "Полоса прокрутки", apiName: "scrollbar", sections: [{id: "vertical", label: "Вертикальная", variants: singleVariant("scrollbar", "Scrollbar · Вертикальная")} ]},
        {id: "noti", label: "Уведомления", apiName: "Noti", sections: [{id: "status", label: "Статус", variants: singleVariant("noti", "Noti · Нет рабочего экспорта", "unavailable", "Не реализован")} ]},
      ],
    },
  ],
  fallback: {component: "button", section: "basic", variant: "contained"},
})

export const COMPONENT_STORY_ROUTES = Object.freeze([...COMPONENT_STORIES.declaration.routes])
export type ComponentsStoryRoute = typeof COMPONENT_STORY_ROUTES[number]

const LEGACY_COMPONENT_ROUTES: Readonly<Record<string, ComponentsStoryRoute>> = Object.freeze({
  "button/basic": "button/basic/contained",
  "button/icon": "button/icon/svg",
  "button/icon-label": "button/icon-label/left",
  "button/sizes": "button/sizes/medium",
  "button/color": "button/color/primary",
  "pane/variants": "pane/variants/glass",
  "field/values": "field/text/default",
  "field/selection": "field/boolean/switch",
  "field/composite": "field/vector/default",
  "field/reference": "field/reference/default",
  "disabled/badge": "badge/basic/default",
  "disabled/text-field": "text-field/basic/default",
  "disabled/divider": "divider/variants/full-width",
  "disabled/scrollbar": "scrollbar/vertical/default",
  "disabled/scroll-list": "list/basic/default",
  "disabled/noti-stack": "noti/status/unavailable",
})

export function normalizeComponentsPlaygroundPath(pathname: string): ComponentsStoryRoute | null {
  const route = pathname.replace(/^\/+|\/+$/g, "")
  return LEGACY_COMPONENT_ROUTES[route] ?? null
}

export function componentStoryIndex(route: ComponentsStoryRoute): PlaygroundStoryIndexItem {
  const story = COMPONENT_STORIES.find(route)
  if (story === undefined) throw new Error(`Unknown Components story: ${route}`)
  return story
}

export function componentCatalogItems(
  collapsedGroups: ReadonlySet<string>,
): readonly PlaygroundNavigationItem<ComponentsStoryRoute>[] {
  const firstByComponent = new Map<string, PlaygroundStoryIndexItem>()
  for (const story of COMPONENT_STORIES.index) {
    if (!firstByComponent.has(story.componentId)) firstByComponent.set(story.componentId, story)
  }
  return [...firstByComponent.values()].map((story) => ({
    id: story.componentId,
    label: story.componentLabel,
    route: story.route,
    group: {
      id: story.groupId,
      label: story.groupLabel,
      collapsed: collapsedGroups.has(story.groupId),
    },
    searchText: `${story.apiName} ${story.tags.join(" ")}`,
  }))
}

export function componentSectionItems(
  route: ComponentsStoryRoute,
): readonly PlaygroundNavigationItem<ComponentsStoryRoute>[] {
  const selected = componentStoryIndex(route)
  const firstBySection = new Map<string, PlaygroundStoryIndexItem>()
  for (const story of COMPONENT_STORIES.index) {
    if (story.componentId === selected.componentId && !firstBySection.has(story.sectionId)) {
      firstBySection.set(story.sectionId, story)
    }
  }
  return [...firstBySection.values()].map((story) => ({
    id: story.sectionId,
    label: story.sectionLabel,
    route: story.route,
  }))
}

export function componentVariantItems(
  route: ComponentsStoryRoute,
): readonly PlaygroundNavigationItem<ComponentsStoryRoute>[] {
  return COMPONENT_STORIES.variants(route).map((story) => ({
    id: story.variantId,
    label: story.variantLabel,
    route: story.route,
  }))
}
