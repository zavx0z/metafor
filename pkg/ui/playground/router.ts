export type PlaygroundRouteDeclaration<Route extends string> = Readonly<{
  location: "pathname"
  routes: readonly Route[]
  fallback: Route
}>

export type PlaygroundRouteDeclarationInput<Routes extends readonly string[]> = Readonly<{
  routes: Routes
  fallback: Routes[number]
}>

export type PlaygroundRouteChange<Route extends string> = (route: Route, previous: Route) => void

export type PlaygroundRouterOptions = Readonly<{
  basePath?: string
}>

export function definePlaygroundRoutes<const Routes extends readonly string[]>(
  input: PlaygroundRouteDeclarationInput<Routes>,
): PlaygroundRouteDeclaration<Routes[number]> {
  if (input.routes.length === 0) throw new Error("Playground routes must not be empty")
  const routes = Object.freeze(input.routes.map((route) => validateRouteId(route)))
  if (new Set(routes).size !== routes.length) throw new Error("Playground routes must be unique")
  if (!routes.includes(input.fallback)) {
    throw new Error(`Playground fallback route is not registered: ${input.fallback}`)
  }
  return Object.freeze({location: "pathname" as const, routes, fallback: input.fallback})
}

export function resolvePlaygroundRoute<Route extends string>(
  declaration: PlaygroundRouteDeclaration<Route>,
  location: Readonly<{pathname: string}>,
  options: PlaygroundRouterOptions = {},
): Route {
  const route = routeWithinBasePath(location.pathname, normalizeBasePath(options.basePath))
  if (route === null) return declaration.fallback
  return declaration.routes.includes(route as Route) ? route as Route : declaration.fallback
}

export function playgroundRouteUrl(route: string, options: PlaygroundRouterOptions = {}): string {
  const basePath = normalizeBasePath(options.basePath)
  return `${basePath}/${validateRouteId(route)}`
}

export class PlaygroundRouter<Route extends string> {
  readonly #declaration: PlaygroundRouteDeclaration<Route>
  readonly #basePath: string
  readonly #listeners = new Set<PlaygroundRouteChange<Route>>()
  #route: Route
  readonly #onLocationChange = (): void => this.#set(this.#read())

  constructor(
    declaration: PlaygroundRouteDeclaration<Route>,
    options: PlaygroundRouterOptions = {},
  ) {
    if (declaration.location !== "pathname") throw new Error("Playground routes must use pathname")
    this.#declaration = declaration
    this.#basePath = normalizeBasePath(options.basePath)
    this.#route = this.#read()
    window.addEventListener("popstate", this.#onLocationChange)
  }

  get current(): Route {
    return this.#route
  }

  go(route: Route): void {
    if (!this.#declaration.routes.includes(route)) return
    const url = playgroundRouteUrl(route, {basePath: this.#basePath})
    if (window.location.pathname !== url) history.pushState(null, "", url)
    this.#set(route)
  }

  subscribe(listener: PlaygroundRouteChange<Route>): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  dispose(): void {
    window.removeEventListener("popstate", this.#onLocationChange)
    this.#listeners.clear()
  }

  #read(): Route {
    return resolvePlaygroundRoute(this.#declaration, window.location, {basePath: this.#basePath})
  }

  #set(route: Route): void {
    if (route === this.#route) return
    const previous = this.#route
    this.#route = route
    for (const listener of this.#listeners) listener(route, previous)
  }
}

function normalizeBasePath(basePath: string | undefined): string {
  if (basePath === undefined || basePath === "" || basePath === "/") return ""
  const route = basePath.replace(/^\/+|\/+$/g, "")
  if (route.length === 0) return ""
  try {
    return `/${validateRouteId(route)}`
  } catch {
    throw new Error(`Playground basePath must be a normalized pathname mount: ${basePath}`)
  }
}

function routeWithinBasePath(pathname: string, basePath: string): string | null {
  if (basePath === "") return pathname.replace(/^\/+|\/+$/g, "")
  const path = pathname.replace(/\/+$/g, "") || "/"
  if (path === basePath) return ""
  const prefix = `${basePath}/`
  if (!path.startsWith(prefix)) return null
  const route = path.slice(prefix.length)
  if (route.startsWith("/")) return null
  return route
}

function validateRouteId(route: string): string {
  if (route.length === 0 || route.startsWith("/") || route.endsWith("/") || route.includes("//") || /[?#]/.test(route)) {
    throw new Error(`Playground route must be a normalized pathname id: ${route}`)
  }
  return route
}
