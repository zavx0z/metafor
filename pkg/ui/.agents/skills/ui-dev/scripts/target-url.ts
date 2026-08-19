export type PlaygroundTargetRouteMode = "none" | "path" | "hash"

export function playgroundTargetUrl(
  origin: string,
  route: string,
  mode: PlaygroundTargetRouteMode = route.startsWith("#") ? "hash" : "path",
): string {
  const root = new URL("/", origin).href
  if (mode === "none") return root
  if (mode === "hash") {
    const normalizedRoute = route.replace(/^#/, "").replace(/^\/+|\/+$/g, "")
    return `${root}#/${normalizedRoute}`
  }
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`
  return new URL(normalizedRoute, root).href
}
