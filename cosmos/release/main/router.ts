import type {JsonValue} from "@metafor/types/metafor/graph"
import {parseProductRoute, productRoutePath, resolveProductRoute, type ProductRoute, type ProductRouteContext, type ProductRouteResolution} from "../shared/product-route"

/** Window History contract; injectable для тестов без browser runtime. */
export interface ProductRouterPlatform {
  location: Pick<Location, "pathname"> & Partial<Pick<Location, "search" | "hash">>
  history: Pick<History, "pushState" | "replaceState" | "state">
  events: Pick<EventTarget, "addEventListener" | "removeEventListener">
}

/** Причина применения отделяет адресный выбор от обновления наблюдения и перемещения камеры. */
export interface ProductRouteApplication {
  cause: "initial" | "navigate" | "history" | "source" | "presentation"
  presentation: JsonValue | null
}

export interface ProductRouterOptions {
  source: {getSnapshot(): ProductRouteContext; subscribe(listener: () => void): () => void}
  applyRoute(resolution: ProductRouteResolution, application: ProductRouteApplication): void
  platform?: ProductRouterPlatform
}

const stateKey = "metafor.product-route.v1"
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * Владеет адресным выбором внутри одного Window document. Native History меняет
 * только product URL и принадлежащее release presentation state. Source updates
 * не создают history entries; root canonicalization ждёт фактический корневой Atom.
 * Camera state сохраняется через replaceState с тем же URL. start/dispose управляют
 * только подписками; canonical state, Chat и пользовательский draft не изменяются.
 * @see ../README.md — адрес выбранного Atom; ../spec/product-router.spec.ts.
 */
export function createProductRouter(options: ProductRouterOptions) {
  const platform = options.platform ?? {location: window.location, history: window.history, events: window}
  const listeners = new Set<() => void>()
  let active = false, disposed = false
  let unsubscribe: (() => void) | undefined
  let snapshot: ProductRouteResolution = {kind: "loading"}
  const currentUrl = () => `${platform.location.pathname}${platform.location.search ?? ""}${platform.location.hash ?? ""}`
  const presentation = (): JsonValue | null => {
    const state: unknown = platform.history.state
    if (!object(state)) return null
    const owned = state[stateKey]
    return object(owned) && owned.pathname === platform.location.pathname ? owned.presentation as JsonValue ?? null : null
  }
  const state = (pathname: string, value: JsonValue | null) => {
    const current: unknown = platform.history.state
    return {...(object(current) ? current : {}), [stateKey]: {pathname, presentation: value}}
  }
  function apply(cause: ProductRouteApplication["cause"]) {
    if (!active) return
    const path = platform.location.pathname, route = parseProductRoute(path)
    snapshot = resolveProductRoute(route, options.source.getSnapshot(), path)
    if (route?.kind === "root" && snapshot.kind === "atom") {
      const next = productRoutePath(snapshot)
      platform.history.replaceState(state(next, presentation()), "", `${next}${platform.location.search ?? ""}${platform.location.hash ?? ""}`)
    }
    options.applyRoute(snapshot, {cause, presentation: presentation()})
    for (const listener of listeners) listener()
  }
  const popstate = () => apply("history")
  const dispose = () => {
    if (disposed) return
    disposed = true; active = false
    unsubscribe?.(); unsubscribe = undefined
    platform.events.removeEventListener("popstate", popstate)
    listeners.clear()
  }
  return {
    start() {
      if (disposed) throw new Error("Product router is disposed")
      if (active) return dispose
      active = true
      platform.events.addEventListener("popstate", popstate)
      unsubscribe = options.source.subscribe(() => apply("source"))
      apply("initial")
      return dispose
    },
    navigate(route: ProductRoute, {replace = false}: {replace?: boolean} = {}) {
      if (!active) throw new Error("Product router is not started")
      const path = productRoutePath(route)
      if (path !== platform.location.pathname) {
        const next = state(path, null)
        if (replace) platform.history.replaceState(next, "", path)
        else platform.history.pushState(next, "", path)
      }
      apply("navigate")
    },
    setPresentation(value: JsonValue | null) {
      if (!active) throw new Error("Product router is not started")
      const path = platform.location.pathname
      platform.history.replaceState(state(path, value), "", currentUrl())
      apply("presentation")
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    dispose,
  }
}
