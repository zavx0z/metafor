import {defineStorybookRouteTree} from "@zavx0z/storybook/route-tree"
import {BULK_HUD_STORY_ROUTE} from "./bulk/stories.ts"
import {GRAPH_STORIES} from "./graph/stories.ts"

/** Public delivery routes; domain entries keep their own unprefixed trees. */
export const QUANTUM_STORY_ROUTE_TREE = defineStorybookRouteTree({
  leaves: Object.freeze([
    ...GRAPH_STORIES.routeTree.leaves.map((route) => `graph/${route}`),
    `bulk/${BULK_HUD_STORY_ROUTE}`,
  ]),
})
