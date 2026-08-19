export type PlaygroundRouteMode = "hash" | "path"

export type PlaygroundRouterOptions = Readonly<{
  mode?: PlaygroundRouteMode
  prefix?: string
}>

export type PlaygroundRouteChange<Route extends string> = (route: Route, previous: Route) => void

export function resolvePlaygroundRoute<Route extends string>(
  routes: readonly Route[],
  fallback: Route,
  location: Readonly<{pathname: string; hash: string}>,
  options: PlaygroundRouterOptions = {},
): Route {
  const mode = options.mode ?? "hash"
  const prefix = options.prefix ?? (mode === "hash" ? "#/" : "/")
  const raw = mode === "hash" ? location.hash : location.pathname
  const value = stripRoutePrefix(raw, prefix, mode)
  return routes.includes(value as Route) ? value as Route : fallback
}

export function playgroundRouteUrl(route: string, options: PlaygroundRouterOptions = {}): string {
  const mode = options.mode ?? "hash"
  const prefix = options.prefix ?? (mode === "hash" ? "#/" : "/")
  if (mode === "hash") return `${prefix}${route}`.replace(/#{2,}/g, "#")
  const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`
  const base = normalizedPrefix.endsWith("/") ? normalizedPrefix.slice(0, -1) : normalizedPrefix
  return `${base}/${route}`.replace(/\/{2,}/g, "/")
}

export class PlaygroundRouter<Route extends string> {
  readonly #routes: readonly Route[]
  readonly #fallback: Route
  readonly #options: PlaygroundRouterOptions
  readonly #listeners = new Set<PlaygroundRouteChange<Route>>()
  #route: Route
  readonly #onLocationChange = (): void => this.#set(this.#read())

  constructor(routes: readonly Route[], fallback: Route, options: PlaygroundRouterOptions = {}) {
    if (!routes.includes(fallback)) throw new Error(`Playground fallback route is not registered: ${fallback}`)
    this.#routes = routes
    this.#fallback = fallback
    this.#options = options
    this.#route = this.#read()
    if ((options.mode ?? "hash") === "hash") window.addEventListener("hashchange", this.#onLocationChange)
    else window.addEventListener("popstate", this.#onLocationChange)
    if ((options.mode ?? "hash") === "hash" && window.location.hash.length === 0) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${playgroundRouteUrl(this.#route, options)}`)
    }
  }

  get current(): Route {
    return this.#route
  }

  go(route: Route): void {
    if (!this.#routes.includes(route)) return
    const mode = this.#options.mode ?? "hash"
    const url = playgroundRouteUrl(route, this.#options)
    if (mode === "hash") {
      if (window.location.hash === url) this.#set(route)
      else window.location.hash = url
      return
    }
    if (window.location.pathname !== url) history.pushState(null, "", url)
    this.#set(route)
  }

  subscribe(listener: PlaygroundRouteChange<Route>): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  dispose(): void {
    window.removeEventListener("hashchange", this.#onLocationChange)
    window.removeEventListener("popstate", this.#onLocationChange)
    this.#listeners.clear()
  }

  #read(): Route {
    return resolvePlaygroundRoute(this.#routes, this.#fallback, window.location, this.#options)
  }

  #set(route: Route): void {
    if (route === this.#route) return
    const previous = this.#route
    this.#route = route
    for (const listener of this.#listeners) listener(route, previous)
  }
}

function stripRoutePrefix(raw: string, prefix: string, mode: PlaygroundRouteMode): string {
  if (mode === "hash") {
    const normalizedPrefix = prefix.startsWith("#") ? prefix : `#${prefix}`
    const value = raw.startsWith(normalizedPrefix) ? raw.slice(normalizedPrefix.length) : raw.replace(/^#\/?/, "")
    return value.replace(/^\/+|\/+$/g, "")
  }
  const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`
  const value = raw.startsWith(normalizedPrefix) ? raw.slice(normalizedPrefix.length) : raw
  return value.replace(/^\/+|\/+$/g, "")
}
