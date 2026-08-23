export function playgroundTargetUrl(
  origin: string,
  route: string,
): string {
  const root = new URL("/", origin).href
  if (route === "/") return root
  const routeId = route.replace(/^\/+/, "")
  if (routeId.length === 0 || routeId.endsWith("/") || routeId.includes("//") || /[?#]/.test(routeId)) {
    throw new Error(`playground route must be a normalized pathname: ${route}`)
  }
  return new URL(`/${routeId}`, root).href
}
