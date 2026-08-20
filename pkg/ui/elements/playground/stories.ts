import {
  definePlaygroundStories,
  type PlaygroundNavigationItem,
  type PlaygroundStoryIndexItem,
  type PlaygroundStoryModule,
} from "@ui/playground"

export type PrimitiveStoryComponent = "div" | "span" | "button" | "input" | "img" | "list"
export type LayoutStoryComponent = "flex" | "flex-css"
export type StyleStoryComponent = "css" | "theme"

const loadPrimitiveStory = (
  component: PrimitiveStoryComponent,
  section: string,
  variant: string,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createPrimitiveStory} = await import("./stories/primitives.ts")
  return createPrimitiveStory({component, section, variant})
}

const loadLayoutStory = (
  component: LayoutStoryComponent,
  section: string,
  variant: string,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createLayoutStory} = await import("./stories/layout.ts")
  return createLayoutStory({component, section, variant})
}

const loadStyleStory = (
  component: StyleStoryComponent,
  section: string,
  variant: string,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createStyleStory} = await import("./stories/style.ts")
  return createStyleStory({component, section, variant})
}

const loadEventStory = (
  variant: string,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createEventStory} = await import("./stories/events.ts")
  return createEventStory(variant)
}

export const ELEMENT_STORIES = definePlaygroundStories({
  groups: [
    {
      id: "primitives",
      label: "Примитивы",
      components: [
        {
          id: "div",
          label: "Контейнер",
          apiName: "div",
          tags: ["box", "container", "scroll"],
          sections: [
            {
              id: "basic",
              label: "Оформление",
              variants: [
                {id: "background", label: "Фон", title: "div · Фон", load: loadPrimitiveStory("div", "basic", "background")},
                {id: "border", label: "Граница", title: "div · Граница", load: loadPrimitiveStory("div", "basic", "border")},
                {id: "padding", label: "Отступы", title: "div · Отступы", load: loadPrimitiveStory("div", "basic", "padding")},
                {id: "z-index", label: "Слои", title: "div · Слои", load: loadPrimitiveStory("div", "basic", "z-index")},
              ],
            },
            {
              id: "scroll",
              label: "Прокрутка",
              variants: [
                {id: "vertical", label: "Вертикальная", title: "div · Вертикальная прокрутка", load: loadPrimitiveStory("div", "scroll", "vertical")},
                {id: "horizontal", label: "Горизонтальная", title: "div · Горизонтальная прокрутка", load: loadPrimitiveStory("div", "scroll", "horizontal")},
              ],
            },
          ],
        },
        {
          id: "span",
          label: "Строка текста",
          apiName: "span",
          tags: ["text", "align"],
          sections: [{
            id: "content",
            label: "Выравнивание",
            variants: [
              {id: "left", label: "Слева", title: "span · Слева", load: loadPrimitiveStory("span", "content", "left")},
              {id: "center", label: "По центру", title: "span · По центру", load: loadPrimitiveStory("span", "content", "center")},
              {id: "right", label: "Справа", title: "span · Справа", load: loadPrimitiveStory("span", "content", "right")},
            ],
          }],
        },
        {
          id: "button",
          label: "Кнопка",
          apiName: "button",
          tags: ["action", "pointer", "disabled"],
          sections: [{
            id: "state",
            label: "Состояние",
            variants: [
              {id: "default", label: "Обычная", title: "button · Обычная", load: loadPrimitiveStory("button", "state", "default")},
              {id: "disabled", label: "Недоступная", title: "button · Недоступная", load: loadPrimitiveStory("button", "state", "disabled")},
              {id: "clickable", label: "Интерактивная", title: "button · Интерактивная", load: loadPrimitiveStory("button", "state", "clickable")},
            ],
          }],
        },
        {
          id: "input",
          label: "Текстовый ввод",
          apiName: "input",
          tags: ["keyboard", "value", "placeholder"],
          sections: [{
            id: "state",
            label: "Состояние",
            variants: [
              {id: "inactive", label: "Неактивный", title: "input · Неактивный", load: loadPrimitiveStory("input", "state", "inactive")},
              {id: "active", label: "Активный", title: "input · Активный", load: loadPrimitiveStory("input", "state", "active")},
              {id: "disabled", label: "Недоступный", title: "input · Недоступный", load: loadPrimitiveStory("input", "state", "disabled")},
            ],
          }],
        },
        {
          id: "img",
          label: "Изображение",
          apiName: "img",
          tags: ["image", "cover", "contain"],
          sections: [{
            id: "fit",
            label: "Вписывание",
            variants: [
              {id: "cover", label: "Заполнение", title: "img · Заполнение", load: loadPrimitiveStory("img", "fit", "cover")},
              {id: "contain", label: "Целиком", title: "img · Целиком", load: loadPrimitiveStory("img", "fit", "contain")},
            ],
          }],
        },
        {
          id: "list",
          label: "Список",
          apiName: "ul / li",
          tags: ["list", "rows", "scroll"],
          sections: [{
            id: "mode",
            label: "Режим",
            variants: [
              {id: "regular", label: "Обычный", title: "ul / li · Обычный", load: loadPrimitiveStory("list", "mode", "regular")},
              {id: "dense", label: "Плотный", title: "ul / li · Плотный", load: loadPrimitiveStory("list", "mode", "dense")},
              {id: "interactive", label: "Интерактивный", title: "ul / li · Интерактивный", load: loadPrimitiveStory("list", "mode", "interactive")},
              {id: "scroll", label: "С прокруткой", title: "ul / li · С прокруткой", load: loadPrimitiveStory("list", "mode", "scroll")},
            ],
          }],
        },
      ],
    },
    {
      id: "layout",
      label: "Раскладка",
      components: [
        {
          id: "flex",
          label: "Flex",
          apiName: "flexRow / flexColumn",
          tags: ["layout", "grow", "column"],
          sections: [{
            id: "direction",
            label: "Направление",
            variants: [
              {id: "row", label: "Строка", title: "Flex · Строка", load: loadLayoutStory("flex", "direction", "row")},
              {id: "column", label: "Колонка", title: "Flex · Колонка", load: loadLayoutStory("flex", "direction", "column")},
            ],
          }],
        },
        {
          id: "flex-css",
          label: "Flex CSS",
          apiName: "flexRowCss / flexColumnCss",
          tags: ["layout", "percent", "fr", "responsive"],
          sections: [{
            id: "sizes",
            label: "Единицы",
            variants: [
              {id: "pixels", label: "Пиксели", title: "Flex CSS · Пиксели", load: loadLayoutStory("flex-css", "sizes", "pixels")},
              {id: "percent", label: "Проценты", title: "Flex CSS · Проценты", load: loadLayoutStory("flex-css", "sizes", "percent")},
              {id: "fraction", label: "Доли", title: "Flex CSS · Доли", load: loadLayoutStory("flex-css", "sizes", "fraction")},
            ],
          }],
        },
      ],
    },
    {
      id: "style",
      label: "Стили",
      components: [
        {
          id: "css",
          label: "CSS-свойства",
          apiName: "StyleProps",
          tags: ["style", "padding", "border", "typography"],
          sections: [
            {id: "padding", label: "Отступы", variants: [{id: "default", label: "Основной", title: "StyleProps · Отступы", load: loadStyleStory("css", "padding", "default")}]},
            {id: "flex", label: "Flex", variants: [{id: "default", label: "Основной", title: "StyleProps · Flex", load: loadStyleStory("css", "flex", "default")}]},
            {id: "border", label: "Граница", variants: [
              {id: "rounded", label: "Скруглённая", title: "StyleProps · Скруглённая граница", load: loadStyleStory("css", "border", "rounded")},
              {id: "capsule", label: "Капсула", title: "StyleProps · Капсула", load: loadStyleStory("css", "border", "capsule")},
            ]},
            {id: "color", label: "Цвет", variants: [{id: "default", label: "Палитра", title: "StyleProps · Цвет", load: loadStyleStory("css", "color", "default")}]},
            {id: "typography", label: "Типографика", variants: [{id: "default", label: "Иерархия", title: "StyleProps · Типографика", load: loadStyleStory("css", "typography", "default")}]},
          ],
        },
        {
          id: "theme",
          label: "Тема",
          apiName: "palette",
          tags: ["theme", "tokens", "color"],
          sections: [{
            id: "tone",
            label: "Акцент",
            variants: [
              {id: "cyan", label: "Голубой", title: "Тема · Голубой", load: loadStyleStory("theme", "tone", "cyan")},
              {id: "green", label: "Зелёный", title: "Тема · Зелёный", load: loadStyleStory("theme", "tone", "green")},
              {id: "orange", label: "Оранжевый", title: "Тема · Оранжевый", load: loadStyleStory("theme", "tone", "orange")},
              {id: "red", label: "Красный", title: "Тема · Красный", load: loadStyleStory("theme", "tone", "red")},
            ],
          }],
        },
      ],
    },
    {
      id: "events",
      label: "События",
      components: [{
        id: "pointer",
        label: "Указатель",
        apiName: "InteractiveElementProps",
        tags: ["pointer", "hover", "press", "click"],
        sections: [{
          id: "state",
          label: "Состояние",
          variants: [
            {id: "idle", label: "Ожидание", title: "События · Ожидание", load: loadEventStory("idle")},
            {id: "hover", label: "Наведение", title: "События · Наведение", load: loadEventStory("hover")},
            {id: "press", label: "Нажатие", title: "События · Нажатие", load: loadEventStory("press")},
            {id: "release", label: "Отпускание", title: "События · Отпускание", load: loadEventStory("release")},
            {id: "click", label: "Клик", title: "События · Клик", load: loadEventStory("click")},
            {id: "disabled", label: "Недоступно", title: "События · Недоступно", load: loadEventStory("disabled")},
          ],
        }],
      }],
    },
  ],
  fallback: {component: "div", section: "basic", variant: "background"},
})

export const ELEMENT_STORY_ROUTES = Object.freeze([...ELEMENT_STORIES.declaration.routes])
export type ElementsStoryRoute = typeof ELEMENT_STORY_ROUTES[number]

export const ELEMENT_LEGACY_ROUTES = Object.freeze([
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
] as const)

const LEGACY_ELEMENT_ROUTES: Readonly<Record<typeof ELEMENT_LEGACY_ROUTES[number], ElementsStoryRoute>> = Object.freeze({
  div: "div/basic/background",
  "div/scroll": "div/scroll/vertical",
  span: "span/content/left",
  button: "button/state/default",
  input: "input/state/inactive",
  img: "img/fit/cover",
  ul: "list/mode/regular",
  "layout/flex": "flex/direction/row",
  "layout/flex-css": "flex-css/sizes/fraction",
  "style/css": "css/padding/default",
  "style/theme": "theme/tone/cyan",
  events: "pointer/state/idle",
})

export function normalizeElementsPlaygroundPath(pathname: string): ElementsStoryRoute | null {
  const route = pathname.replace(/^\/+|\/+$/g, "")
  return LEGACY_ELEMENT_ROUTES[route as typeof ELEMENT_LEGACY_ROUTES[number]] ?? null
}

export function elementStoryIndex(route: ElementsStoryRoute): PlaygroundStoryIndexItem {
  const story = ELEMENT_STORIES.find(route)
  if (story === undefined) throw new Error(`Unknown Elements story: ${route}`)
  return story
}

export function elementCatalogItems(
  collapsedGroups: ReadonlySet<string>,
): readonly PlaygroundNavigationItem<ElementsStoryRoute>[] {
  const firstByComponent = new Map<string, PlaygroundStoryIndexItem>()
  for (const story of ELEMENT_STORIES.index) {
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

export function elementSectionItems(
  route: ElementsStoryRoute,
): readonly PlaygroundNavigationItem<ElementsStoryRoute>[] {
  const selected = elementStoryIndex(route)
  const firstBySection = new Map<string, PlaygroundStoryIndexItem>()
  for (const story of ELEMENT_STORIES.index) {
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

export function elementVariantItems(
  route: ElementsStoryRoute,
): readonly PlaygroundNavigationItem<ElementsStoryRoute>[] {
  return ELEMENT_STORIES.variants(route).map((story) => ({
    id: story.variantId,
    label: story.variantLabel,
    route: story.route,
  }))
}
