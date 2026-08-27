import {storybookPublicPath} from "@zavx0z/storybook/environment"
import {storybookRouteTreeUrl} from "@zavx0z/storybook/route-tree"
import {BULK_STORY_ROUTE_TREE} from "./bulk/stories.ts"
import {GRAPH_STORIES} from "./graph/stories.ts"

const rootPathname = storybookPublicPath("quantum", "/")
const graphPathname = storybookPublicPath("quantum", "/graph/")
const graphMountPath = storybookPublicPath("quantum", "/graph")
const bulkMountPath = storybookPublicPath("quantum", "/bulk")
const graphPathnames = GRAPH_STORIES.routeTree.nodes.map((node) =>
  storybookRouteTreeUrl(GRAPH_STORIES.routeTree, node.path, {basePath: graphMountPath})
)
const bulkPathnames = BULK_STORY_ROUTE_TREE.nodes.map((node) =>
  storybookRouteTreeUrl(BULK_STORY_ROUTE_TREE, node.path, {basePath: bulkMountPath})
)

if (window.location.pathname === rootPathname) {
  window.location.replace(graphPathname)
} else if (bulkPathnames.includes(window.location.pathname)) {
  await import("./bulk/entry.ts")
} else if (graphPathnames.includes(window.location.pathname)) {
  await import("./graph/entry.ts")
} else {
  throw new Error(`Unknown Quantum Storybook pathname: ${window.location.pathname}`)
}
