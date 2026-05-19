export type RouteChange<T extends string> = (route: T, previous: T) => void

export type VirtualRouterOpts = {
  prefix?: string
}

export class VirtualRouter<T extends string> {
  readonly #routes: readonly T[]
  readonly #prefix: string
  readonly #listeners = new Set<RouteChange<T>>()
  #route: T
  readonly #onHashChange = (): void => {
    const next = this.#routeFromHash()
    if (next !== null) this.#set(next)
  }

  constructor(routes: readonly T[], fallback: T, opts: VirtualRouterOpts = {}) {
    this.#routes = routes
    this.#prefix = opts.prefix ?? "#/"
    this.#route = this.#routeFromHash() ?? fallback
    window.addEventListener("hashchange", this.#onHashChange)
    if (window.location.hash.length === 0) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${this.#prefix}${this.#route}`)
    }
  }

  get current(): T {
    return this.#route
  }

  go(route: T): void {
    if (!this.#isRoute(route)) return
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

  #isRoute(value: unknown): value is T {
    return typeof value === "string" && this.#routes.includes(value as T)
  }
}
