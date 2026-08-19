export type RouteChange<T extends string> = (route: T, previous: T) => void

export type VirtualRouterOpts = {
  mode?: "hash" | "path"
  prefix?: string
}

export class VirtualRouter<T extends string> {
  readonly #routes: readonly T[]
  readonly #mode: "hash" | "path"
  readonly #prefix: string
  readonly #listeners = new Set<RouteChange<T>>()
  #route: T
  readonly #onHashChange = (): void => {
    const next = this.#routeFromHash()
    if (next !== null) this.#set(next)
  }
  readonly #onPopState = (): void => {
    const next = this.#routeFromPath()
    if (next !== null) this.#set(next)
  }

  constructor(routes: readonly T[], fallback: T, opts: VirtualRouterOpts = {}) {
    this.#routes = routes
    this.#mode = opts.mode ?? "hash"
    this.#prefix = opts.prefix ?? (this.#mode === "hash" ? "#/" : "/")
    this.#route = (this.#mode === "hash" ? this.#routeFromHash() : this.#routeFromPath()) ?? fallback
    if (this.#mode === "hash") {
      window.addEventListener("hashchange", this.#onHashChange)
    } else {
      window.addEventListener("popstate", this.#onPopState)
    }
    if (this.#mode === "hash" && window.location.hash.length === 0) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${this.#prefix}${this.#route}`)
    }
  }

  get current(): T {
    return this.#route
  }

  go(route: T): void {
    if (!this.#isRoute(route)) return
    if (this.#mode === "path") {
      const nextPath = this.#pathForRoute(route)
      if (window.location.pathname === nextPath) {
        this.#set(route)
        return
      }
      history.pushState(null, "", nextPath)
      this.#set(route)
      return
    }
    const nextHash = `${this.#prefix}${route}`
    if (window.location.hash === nextHash) {
      this.#set(route)
      return
    }
    window.location.hash = nextHash
  }

  subscribe(listener: RouteChange<T>): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  dispose(): void {
    window.removeEventListener("hashchange", this.#onHashChange)
    window.removeEventListener("popstate", this.#onPopState)
    this.#listeners.clear()
  }

  #set(route: T): void {
    if (route === this.#route) return
    const previous = this.#route
    this.#route = route
    for (const listener of this.#listeners) listener(route, previous)
  }

  #routeFromHash(): T | null {
    const raw = window.location.hash
    const value = raw.startsWith(this.#prefix) ? raw.slice(this.#prefix.length) : raw.replace(/^#\/?/, "")
    const route = value.split(/[/?]/)[0]
    return this.#isRoute(route) ? route : null
  }

  #routeFromPath(): T | null {
    const prefix = this.#prefix.startsWith("/") ? this.#prefix : `/${this.#prefix}`
    const raw = window.location.pathname
    const value = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw.replace(/^\/+/, "")
    const route = value.replace(/^\/+/, "").replace(/\/+$/, "")
    return this.#isRoute(route) ? route : null
  }

  #pathForRoute(route: T): string {
    const prefix = this.#prefix.startsWith("/") ? this.#prefix : `/${this.#prefix}`
    const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix
    return `${base}/${route}`.replace(/\/{2,}/g, "/")
  }

  #isRoute(value: unknown): value is T {
    return typeof value === "string" && this.#routes.includes(value as T)
  }
}
