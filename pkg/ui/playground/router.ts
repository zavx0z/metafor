import {
  playgroundRouteTreeUrl,
  resolvePlaygroundRouteTree,
  type PlaygroundRouteTree,
  type PlaygroundRouteTreeNode,
  type PlaygroundRouteTreeOptions,
} from "./route-tree.ts"

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

export type PlaygroundRouteTreeChange<Leaf extends string> = (
  node: PlaygroundRouteTreeNode<Leaf>,
  previous: PlaygroundRouteTreeNode<Leaf>,
) => void

export type PlaygroundRouteTreeRouterOptions = PlaygroundRouteTreeOptions & Readonly<{
  onNotFound?(error: PlaygroundRouteTreeNotFoundError): void
}>

export class PlaygroundRouteTreeNotFoundError extends Error {
  constructor(readonly pathname: string) {
    super(`Playground route tree path is not registered: ${pathname}`)
    this.name = "PlaygroundRouteTreeNotFoundError"
  }
}

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

/** Browser history owner for overview and leaf nodes of one exact route-tree mount. */
export class PlaygroundRouteTreeRouter<Leaf extends string> {
  readonly #tree: PlaygroundRouteTree<Leaf>
  readonly #options: PlaygroundRouteTreeRouterOptions
  readonly #listeners = new Set<PlaygroundRouteTreeChange<Leaf>>()
  #node: PlaygroundRouteTreeNode<Leaf>
  readonly #onLocationChange = (): void => {
    const node = this.#read(false)
    if (node !== null) this.#set(node)
  }

  constructor(
    tree: PlaygroundRouteTree<Leaf>,
    options: PlaygroundRouteTreeRouterOptions = {},
  ) {
    this.#tree = tree
    this.#options = Object.freeze({...options})
    const node = this.#read(true)
    if (node === null) throw new PlaygroundRouteTreeNotFoundError(window.location.pathname)
    this.#node = node
    window.addEventListener("popstate", this.#onLocationChange)
  }

  get current(): PlaygroundRouteTreeNode<Leaf> {
    return this.#node
  }

  go(path: string): boolean {
    const node = this.#tree.find(path)
    if (node === undefined) return false
    const url = playgroundRouteTreeUrl(this.#tree, node.path, this.#options)
    if (window.location.pathname !== url) history.pushState(null, "", url)
    this.#set(node)
    return true
  }

  subscribe(listener: PlaygroundRouteTreeChange<Leaf>): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  dispose(): void {
    window.removeEventListener("popstate", this.#onLocationChange)
    this.#listeners.clear()
  }

  #read(initial: boolean): PlaygroundRouteTreeNode<Leaf> | null {
    const resolution = resolvePlaygroundRouteTree(this.#tree, window.location, this.#options)
    if (resolution.kind === "not-found") {
      const error = new PlaygroundRouteTreeNotFoundError(window.location.pathname)
      if (initial || this.#options.onNotFound === undefined) throw error
      this.#options.onNotFound(error)
      return null
    }
    if (resolution.redirect) history.replaceState(null, "", resolution.canonicalPath)
    return resolution.node
  }

  #set(node: PlaygroundRouteTreeNode<Leaf>): void {
    if (node === this.#node) return
    const previous = this.#node
    this.#node = node
    for (const listener of [...this.#listeners]) listener(node, previous)
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
