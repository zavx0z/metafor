import {defineStorybookRouteTree} from "@zavx0z/storybook/route-tree"

export const BULK_HUD_STORY_ROUTE = "hud/default" as const

export type BulkStoryRoute = typeof BULK_HUD_STORY_ROUTE

export const BULK_STORY_ROUTE_TREE = defineStorybookRouteTree({
  leaves: [BULK_HUD_STORY_ROUTE],
})

export function isBulkStoryRoute(route: string): route is BulkStoryRoute {
  return route === BULK_HUD_STORY_ROUTE
}
