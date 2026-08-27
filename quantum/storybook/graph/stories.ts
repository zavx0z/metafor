import {
  defineStorybookDomCatalog,
  type StorybookDomCatalogIndexItem,
} from "@zavx0z/storybook/catalog"
import type {GraphDomStoryFactory} from "./dom-story.ts"
import type {GraphOverviewInput} from "./overview.ts"

export type GraphStoryRoute =
  | "document/current/complete"
  | "reaction/dependencies/complete"
  | "validation/contract/closed"
  | "node-tree/projection/live"
  | "identity/same-meta/reorder"

const loadCurrentStory = async (): Promise<GraphDomStoryFactory> => {
  const {createCurrentGraphStory} = await import("./stories/current.ts")
  return createCurrentGraphStory
}

const loadValidationStory = async (): Promise<GraphDomStoryFactory> => {
  const {createValidationGraphStory} = await import("./stories/validation.ts")
  return createValidationGraphStory
}

const loadReactionStory = async (): Promise<GraphDomStoryFactory> => {
  const {createReactionGraphStory} = await import("./stories/reaction.ts")
  return createReactionGraphStory
}

const loadIdentityStory = async (): Promise<GraphDomStoryFactory> => {
  const {createIdentityGraphStory} = await import("./stories/identity.ts")
  return createIdentityGraphStory
}

const loadNodeTreeStory = async (): Promise<GraphDomStoryFactory> => {
  const {createGraphNodeTreeStory} = await import("./stories/node-tree.ts")
  return createGraphNodeTreeStory
}

/** Exact lazy DOM catalog of the five canonical Graph laboratory leaves. */
export const GRAPH_STORIES = defineStorybookDomCatalog<GraphDomStoryFactory>({
  groups: [
    {
      id: "contract",
      label: "Контракт",
      components: [
        {
          id: "document",
          label: "Документ",
          apiName: "Graph",
          tags: ["snapshot", "template", "runtime", "проекция"],
          sections: [{
            id: "current",
            label: "Текущее состояние",
            variants: [{
              id: "complete",
              label: "Полный Graph",
              title: "Graph · Текущий документ",
              load: loadCurrentStory,
            }],
          }],
        },
        {
          id: "reaction",
          label: "Reaction",
          apiName: "RuntimeReactionRelation",
          tags: ["reaction", "state", "fields", "mass", "dependencies", "lazy"],
          sections: [{
            id: "dependencies",
            label: "Зависимости",
            variants: [{
              id: "complete",
              label: "Полная связь",
              title: "Graph · зависимости Reaction",
              load: loadReactionStory,
            }],
          }],
        },
        {
          id: "validation",
          label: "Проверка",
          apiName: "validateGraph",
          tags: ["validation", "closed", "issues", "контракт"],
          sections: [{
            id: "contract",
            label: "Форма документа",
            variants: [{
              id: "closed",
              label: "Закрытая форма",
              title: "Graph · Закрытая проверка",
              load: loadValidationStory,
            }],
          }],
        },
      ],
    },
    {
      id: "experiments",
      label: "Эксперименты",
      components: [
        {
          id: "node-tree",
          label: "NodeTree",
          apiName: "createGraphNodeTree",
          tags: ["node-tree", "projection", "live", "adapter", "dom"],
          sections: [{
            id: "projection",
            label: "Проекция",
            variants: [{
              id: "live",
              label: "Живой Graph",
              title: "Graph · NodeTree projection",
              load: loadNodeTreeStory,
            }],
          }],
        },
        {
          id: "identity",
          label: "Идентичность",
          apiName: "MetaRuntimeAtomLocator",
          tags: ["identity", "path", "same-meta", "reorder"],
          sections: [{
            id: "same-meta",
            label: "Одинаковая Meta",
            variants: [{
              id: "reorder",
              label: "Вставка соседа",
              title: "Graph · Путь после вставки",
              load: loadIdentityStory,
            }],
          }],
        },
      ],
    },
  ],
  representative: {component: "document", section: "current", variant: "complete"},
  normalizeModule(_route, factory) {
    return factory
  },
})

export function isGraphStoryRoute(route: string): route is GraphStoryRoute {
  return GRAPH_STORIES.find(route) !== undefined
}

export function graphStoryIndex(route: GraphStoryRoute): StorybookDomCatalogIndexItem {
  const story = GRAPH_STORIES.find(route)
  if (story === undefined) throw new Error(`Неизвестный Graph story: ${route}`)
  return story
}

/** One catalog item per component, preserving the domain-owned group metadata. */
export function graphCatalogItems(): readonly Readonly<{
  id: string
  label: string
  route: string
  title: string
}>[] {
  const firstByComponent = new Map<string, StorybookDomCatalogIndexItem>()
  for (const story of GRAPH_STORIES.index) {
    if (!firstByComponent.has(story.componentId)) firstByComponent.set(story.componentId, story)
  }
  return Object.freeze([...firstByComponent.values()].map((story) => Object.freeze({
    id: story.componentId,
    label: story.componentLabel,
    route: story.componentId,
    title: `${story.groupLabel} · ${story.apiName} · ${story.tags.join(" · ")}`,
  })))
}

export function graphSectionItems(route: string): readonly Readonly<{
  id: string
  label: string
  route: string
}>[] {
  const componentId = route.split("/")[0] ?? ""
  if (componentId.length === 0) return Object.freeze([])
  const firstBySection = new Map<string, StorybookDomCatalogIndexItem>()
  for (const story of GRAPH_STORIES.index) {
    if (story.componentId === componentId && !firstBySection.has(story.sectionId)) {
      firstBySection.set(story.sectionId, story)
    }
  }
  return Object.freeze([...firstBySection.values()].map((story) => Object.freeze({
    id: `${story.componentId}/${story.sectionId}`,
    label: story.sectionLabel,
    route: `${story.componentId}/${story.sectionId}`,
  })))
}

export function graphVariantItems(route: string): readonly Readonly<{
  id: string
  label: string
}>[] {
  const [componentId = "", sectionId = ""] = route.split("/")
  if (componentId.length === 0 || sectionId.length === 0) return Object.freeze([])
  return Object.freeze(GRAPH_STORIES.index
    .filter((story) => story.componentId === componentId && story.sectionId === sectionId)
    .map((story) => Object.freeze({id: story.route, label: story.variantLabel})))
}

/** Builds a presentation descriptor only for an actual route-tree overview. */
export function graphOverviewInput(route: string): GraphOverviewInput {
  const node = GRAPH_STORIES.routeTree.find(route)
  if (node === undefined || node.kind !== "overview") {
    throw new Error(`Graph overview route is not registered: ${route}`)
  }
  const parts = route.length === 0 ? [] : route.split("/")
  if (parts.length === 0) {
    return Object.freeze({
      route,
      title: "Graph · Обзор лаборатории",
      summary: "Публичный Graph, его validation, Reaction, identity и производная NodeTree остаются независимыми проверяемыми представлениями.",
      items: graphCatalogItems().map(({route: itemRoute, label, title}) => ({
        route: itemRoute,
        label,
        detail: title,
      })),
    })
  }
  if (parts.length === 1) {
    const items = graphSectionItems(route)
    const example = GRAPH_STORIES.index.find(({componentId}) => componentId === parts[0])
    return Object.freeze({
      route,
      title: `${example?.componentLabel ?? route} · Обзор`,
      summary: `${example?.apiName ?? route} сохраняет собственные разделы и не подставляет detail scenario вместо обзора.`,
      items: items.map((item) => ({route: item.route, label: item.label, detail: "Раздел Graph laboratory"})),
    })
  }
  const items = graphVariantItems(route)
  const [componentId, sectionId] = parts
  const example = GRAPH_STORIES.index.find((item) =>
    item.componentId === componentId && item.sectionId === sectionId)
  return Object.freeze({
    route,
    title: `${example?.sectionLabel ?? route} · Обзор`,
    summary: "Все варианты раздела показаны явно; ни один detail leaf не выбирается скрыто.",
    items: items.map((item) => ({route: item.id, label: item.label, detail: "Точный Graph scenario"})),
  })
}
