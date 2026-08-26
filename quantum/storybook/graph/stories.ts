import {
  defineStorybookStories,
  type StorybookStoryIndexItem,
  type StorybookStoryModule,
} from "@zavx0z/storybook/stories"
import type {StorybookNavigationItem} from "@zavx0z/storybook/workbench"

export type GraphStoryRoute =
  | "document/current/complete"
  | "reaction/dependencies/complete"
  | "validation/contract/closed"
  | "node-tree/projection/live"
  | "identity/same-meta/reorder"

const loadCurrentStory = async (): Promise<StorybookStoryModule> => {
  const {createCurrentGraphStory} = await import("./stories/current.ts")
  return createCurrentGraphStory()
}

const loadValidationStory = async (): Promise<StorybookStoryModule> => {
  const {createValidationGraphStory} = await import("./stories/validation.ts")
  return createValidationGraphStory()
}

const loadReactionStory = async (): Promise<StorybookStoryModule> => {
  const {createReactionGraphStory} = await import("./stories/reaction.ts")
  return createReactionGraphStory()
}

const loadIdentityStory = async (): Promise<StorybookStoryModule> => {
  const {createIdentityGraphStory} = await import("./stories/identity.ts")
  return createIdentityGraphStory()
}

const loadNodeTreeStory = async (): Promise<StorybookStoryModule> => {
  const {createGraphNodeTreeStory} = await import("./stories/node-tree.ts")
  return createGraphNodeTreeStory()
}

/** Единый typed catalog Graph laboratory: route, source, controls и preview. */
export const GRAPH_STORIES = defineStorybookStories({
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
          tags: ["node-tree", "projection", "node-editor", "live", "adapter"],
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
})

/** Выбирает сценарий представления только для зарегистрированного листа или обзора. */
export function graphStorybookPresentationRoute(path: string): GraphStoryRoute {
  const node = GRAPH_STORIES.routeTree.find(path)
  if (node === undefined) throw new Error(`Неизвестный путь лаборатории Graph: ${path}`)
  if (node.kind === "leaf") return node.path as GraphStoryRoute
  const prefix = node.path.length === 0 ? "" : `${node.path}/`
  if (GRAPH_STORIES.representative.startsWith(prefix)) {
    return GRAPH_STORIES.representative as GraphStoryRoute
  }
  const route = GRAPH_STORIES.routeTree.leaves.find((candidate) => candidate.startsWith(prefix))
  if (route === undefined) throw new Error(`Обзор не содержит сценарий Graph: ${node.path}`)
  return route as GraphStoryRoute
}

export function graphStoryIndex(route: GraphStoryRoute): StorybookStoryIndexItem {
  const story = GRAPH_STORIES.find(route)
  if (story === undefined) throw new Error(`Неизвестный Graph story: ${route}`)
  return story
}

export function graphCatalogItems(
  collapsedGroups: ReadonlySet<string>,
): readonly StorybookNavigationItem<string>[] {
  const firstByComponent = new Map<string, StorybookStoryIndexItem>()
  for (const story of GRAPH_STORIES.index) {
    if (!firstByComponent.has(story.componentId)) firstByComponent.set(story.componentId, story)
  }
  return [...firstByComponent.values()].map((story) => ({
    id: story.componentId,
    label: story.componentLabel,
    route: story.componentId,
    group: {
      id: story.groupId,
      label: story.groupLabel,
      collapsed: collapsedGroups.has(story.groupId),
    },
    searchText: `${story.apiName} ${story.tags.join(" ")}`,
  }))
}

export function graphSectionItems(
  route: GraphStoryRoute,
): readonly StorybookNavigationItem<string>[] {
  const selected = graphStoryIndex(route)
  const firstBySection = new Map<string, StorybookStoryIndexItem>()
  for (const story of GRAPH_STORIES.index) {
    if (story.componentId === selected.componentId && !firstBySection.has(story.sectionId)) {
      firstBySection.set(story.sectionId, story)
    }
  }
  return [...firstBySection.values()].map((story) => ({
    id: story.sectionId,
    label: story.sectionLabel,
    route: `${story.componentId}/${story.sectionId}`,
  }))
}

export function graphVariantItems(
  route: GraphStoryRoute,
): readonly StorybookNavigationItem<GraphStoryRoute>[] {
  return GRAPH_STORIES.variants(route).map((story) => ({
    id: story.variantId,
    label: story.variantLabel,
    route: story.route as GraphStoryRoute,
  }))
}
