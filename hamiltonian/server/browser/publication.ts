import {watch, type FSWatcher} from "node:fs"
import {fileURLToPath} from "node:url"
import {hamiltonianBrowserSourceRevision} from "../../update/host/browser-release.ts"
import type {HamiltonianServerObservation} from "../observation.ts"

export type HamiltonianBrowserStaticAsset =
  | "index"
  | "windowEntry"
  | "application"
  | "embodimentWorker"
  | "embodimentWorkerEntry"
  | "styles"
  | "font"
  | "runtime"
  | "releaseCache"
  | "browserControl"
  | "pageUpdate"
  | "monitor"
  | "lifecycle"
  | "orchestrationContract"

export interface HamiltonianBrowserPublicationOptions {
  identity: string
  hostEpoch: string
  version: string
  bundles?: Readonly<{
    orchestration: string | Promise<string>
    layoutWorker: string | Promise<string>
    serviceWorker: string | Promise<string>
    webPushClient?: string | Promise<string>
  }>
  observation: HamiltonianServerObservation
}

const experimentRoot = fileURLToPath(new URL("../../", import.meta.url))
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url))
const publicRoot = `${experimentRoot}/public`
const updateRoot = `${experimentRoot}/update`
const visualRoot = `${experimentRoot}/visual`
const orchestrationEntry = `${experimentRoot}/browser/orchestration.ts`
const layoutWorkerEntry = `${visualRoot}/browser/layout-worker.ts`
const serviceWorkerEntry = `${experimentRoot}/browser/service-worker.ts`
const webPushClientEntry = `${repositoryRoot}/pkg/web-push/src/client.ts`
const uiRoot = fileURLToPath(new URL("../../../pkg/ui/", import.meta.url))
const nodesRoot = fileURLToPath(new URL("../../../pkg/nodes/", import.meta.url))
const webPushRoot = fileURLToPath(new URL("../../../pkg/web-push/", import.meta.url))

const STATIC_ASSETS: Readonly<Record<HamiltonianBrowserStaticAsset, {path: string; type: string}>> = Object.freeze({
  index: {path: `${publicRoot}/index.html`, type: "text/html; charset=utf-8"},
  windowEntry: {path: `${publicRoot}/window-entry.js`, type: "text/javascript; charset=utf-8"},
  application: {path: `${publicRoot}/app.js`, type: "text/javascript; charset=utf-8"},
  embodimentWorker: {path: `${publicRoot}/embodiment-worker.js`, type: "text/javascript; charset=utf-8"},
  embodimentWorkerEntry: {path: `${publicRoot}/embodiment-worker-entry.js`, type: "text/javascript; charset=utf-8"},
  styles: {path: `${visualRoot}/browser/styles.css`, type: "text/css; charset=utf-8"},
  font: {path: fileURLToPath(new URL("../../../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url)), type: "font/ttf"},
  runtime: {path: `${experimentRoot}/core/runtime.js`, type: "text/javascript; charset=utf-8"},
  releaseCache: {path: `${updateRoot}/browser/release-cache.js`, type: "text/javascript; charset=utf-8"},
  browserControl: {path: `${experimentRoot}/core/browser-control.js`, type: "text/javascript; charset=utf-8"},
  pageUpdate: {path: `${updateRoot}/browser/page-update.js`, type: "text/javascript; charset=utf-8"},
  monitor: {path: `${experimentRoot}/core/monitor.js`, type: "text/javascript; charset=utf-8"},
  lifecycle: {path: `${experimentRoot}/core/lifecycle.js`, type: "text/javascript; charset=utf-8"},
  orchestrationContract: {path: `${experimentRoot}/core/orchestration.js`, type: "text/javascript; charset=utf-8"},
})

export function hamiltonianSecurityHeaders(contentType: string): HeadersInit {
  return {
    "cache-control": "no-store",
    "content-type": contentType,
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  }
}

export class HamiltonianBrowserPublication {
  readonly #options: HamiltonianBrowserPublicationOptions
  readonly #watchers: FSWatcher[] = []
  #orchestrationBundle: Promise<string> | null = null
  #layoutWorkerBundle: Promise<string> | null = null
  #serviceWorkerBundle: Promise<string> | null = null
  #webPushClientBundle: Promise<string> | null = null
  #sourceUpdateTimer: ReturnType<typeof setTimeout> | null = null
  #sourceUpdateGeneration = 0
  #stopping = false
  #onSourceUpdate: ((revision: string, serviceWorkerSource: string) => void | Promise<void>) | null = null

  constructor(options: HamiltonianBrowserPublicationOptions) {
    this.#options = options
    this.#resetBundles()
    if (options.bundles === undefined && Bun.env.NODE_ENV !== "test") {
      void Promise.all([
        this.orchestrationBundle(),
        this.layoutWorkerBundle(),
        this.serviceWorkerBundle(),
        this.webPushClientBundle(),
      ]).catch(() => {})
    }
  }

  onSourceUpdate(listener: (revision: string, serviceWorkerSource: string) => void | Promise<void>): void {
    this.#onSourceUpdate = listener
  }

  orchestrationBundle(): Promise<string> {
    this.#orchestrationBundle ??= this.#build(orchestrationEntry, "orchestration", {".wgsl": "text"})
    return this.#orchestrationBundle
  }

  layoutWorkerBundle(): Promise<string> {
    this.#layoutWorkerBundle ??= this.#build(layoutWorkerEntry, "layout Worker")
    return this.#layoutWorkerBundle
  }

  serviceWorkerBundle(): Promise<string> {
    this.#serviceWorkerBundle ??= this.#build(serviceWorkerEntry, "Service Worker")
    return this.#serviceWorkerBundle
  }

  webPushClientBundle(): Promise<string> {
    this.#webPushClientBundle ??= this.#build(webPushClientEntry, "Web Push client")
    return this.#webPushClientBundle
  }

  staticAsset(asset: HamiltonianBrowserStaticAsset): Response {
    const entry = STATIC_ASSETS[asset]
    const headers = new Headers(hamiltonianSecurityHeaders(entry.type))
    headers.set("content-security-policy", "default-src 'self'; connect-src 'self' ws: wss: data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'")
    return new Response(Bun.file(entry.path), {headers})
  }

  async navigation(localJoinToken = ""): Promise<Response> {
    const servedAt = Date.now()
    const navigationId = crypto.randomUUID()
    const revision = await this.sourceRevision()
    const html = (await Bun.file(STATIC_ASSETS.index.path).text())
      .replaceAll("__HAMILTONIAN_HOST_IDENTITY__", escapeHtmlAttribute(this.#options.identity))
      .replaceAll("__HAMILTONIAN_HOST_EPOCH__", escapeHtmlAttribute(this.#options.hostEpoch))
      .replaceAll("__HAMILTONIAN_HOST_VERSION__", escapeHtmlAttribute(this.#options.version))
      .replaceAll("__HAMILTONIAN_NAVIGATION_ID__", escapeHtmlAttribute(navigationId))
      .replaceAll("__HAMILTONIAN_SERVED_AT__", String(servedAt))
      .replaceAll("__HAMILTONIAN_BROWSER_SOURCE_REVISION__", escapeHtmlAttribute(revision))
      .replaceAll("__HAMILTONIAN_LOCAL_JOIN_TOKEN__", escapeHtmlAttribute(localJoinToken))
    const headers = new Headers(hamiltonianSecurityHeaders("text/html; charset=utf-8"))
    headers.set("content-security-policy", "default-src 'self'; connect-src 'self' ws: wss: data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'")
    return new Response(html, {headers})
  }

  async sourceRevision(): Promise<string> {
    const direct = await Promise.all([
      ["/", "index"],
      ["/index.html", "index"],
      ["/window-entry.js", "windowEntry"],
      ["/app.js", "application"],
      ["/embodiment-worker.js", "embodimentWorker"],
      ["/embodiment-worker-entry.js", "embodimentWorkerEntry"],
      ["/styles.css", "styles"],
      ["/core/runtime.js", "runtime"],
      ["/core/cache.js", "releaseCache"],
      ["/core/browser-control.js", "browserControl"],
      ["/update/page-update.js", "pageUpdate"],
      ["/core/monitor.js", "monitor"],
      ["/core/lifecycle.js", "lifecycle"],
      ["/core/orchestration.js", "orchestrationContract"],
    ].map(async ([pathname, asset]) => [
      pathname,
      await Bun.file(STATIC_ASSETS[asset as HamiltonianBrowserStaticAsset].path).text(),
    ] as const))
    return await hamiltonianBrowserSourceRevision({
      orchestrationBundle: await this.orchestrationBundle(),
      layoutWorkerBundle: await this.layoutWorkerBundle(),
      serviceWorkerBundle: await this.serviceWorkerBundle(),
      webPushClientBundle: await this.webPushClientBundle(),
      directlyServedText: Object.fromEntries(direct),
    })
  }

  startWatching(): void {
    if (Bun.env.NODE_ENV === "test") return
    for (const root of [
      `${experimentRoot}/browser`, publicRoot, `${experimentRoot}/core`, updateRoot,
      visualRoot, uiRoot, nodesRoot, webPushRoot,
    ]) {
      try {
        this.#watchers.push(watch(root, {recursive: true}, (_event, filename) => this.#scheduleSourceUpdate(filename)))
      } catch (error) {
        this.#options.observation.record({
          at: Date.now(),
          kind: "source-watch-failed",
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  stop(): void {
    this.#stopping = true
    if (this.#sourceUpdateTimer !== null) clearTimeout(this.#sourceUpdateTimer)
    this.#sourceUpdateTimer = null
    for (const watcher of this.#watchers) watcher.close()
    this.#watchers.length = 0
  }

  #resetBundles(): void {
    const bundles = this.#options.bundles
    this.#orchestrationBundle = bundles ? Promise.resolve(bundles.orchestration) : null
    this.#layoutWorkerBundle = bundles ? Promise.resolve(bundles.layoutWorker) : null
    this.#serviceWorkerBundle = bundles ? Promise.resolve(bundles.serviceWorker) : null
    this.#webPushClientBundle = bundles?.webPushClient === undefined
      ? null
      : Promise.resolve(bundles.webPushClient)
  }

  #build(entrypoint: string, label: string, loader?: Record<string, Bun.Loader>): Promise<string> {
    return Bun.build({
      root: repositoryRoot,
      entrypoints: [entrypoint],
      target: "browser",
      format: "esm",
      ...(loader === undefined ? {} : {loader}),
      minify: false,
      sourcemap: "inline",
    }).then(async (result) => {
      if (!result.success || result.outputs.length === 0) {
        const detail = result.logs.map((log) => log.message).join("\n")
        throw new Error(`Hamiltonian ${label} bundle failed${detail ? `: ${detail}` : ""}`)
      }
      return await result.outputs[0]!.text()
    }).catch((error: unknown) => {
      throw new Error(`Hamiltonian ${label} bundle failed: ${browserBuildError(error)}`)
    })
  }

  #scheduleSourceUpdate(filename: string | Buffer | null): void {
    if (!isReloadableSource(filename) || this.#stopping) return
    const generation = ++this.#sourceUpdateGeneration
    this.#orchestrationBundle = null
    this.#layoutWorkerBundle = null
    this.#serviceWorkerBundle = null
    this.#webPushClientBundle = null
    if (this.#sourceUpdateTimer !== null) clearTimeout(this.#sourceUpdateTimer)
    this.#sourceUpdateTimer = setTimeout(() => {
      this.#sourceUpdateTimer = null
      void Promise.all([this.sourceRevision(), this.serviceWorkerBundle()]).then(async ([revision, source]) => {
        if (generation !== this.#sourceUpdateGeneration || this.#stopping) return
        this.#options.observation.record({at: Date.now(), kind: "source-update", detail: revision})
        await this.#onSourceUpdate?.(revision, source)
      }).catch((error: unknown) => {
        if (generation !== this.#sourceUpdateGeneration || this.#stopping) return
        this.#options.observation.record({
          at: Date.now(),
          kind: "source-update-failed",
          detail: error instanceof Error ? error.message : String(error),
        })
      })
    }, 120)
  }
}

function browserBuildError(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error)
  const message = "message" in error ? String(error.message) : String(error)
  const logs = "logs" in error && Array.isArray(error.logs)
    ? error.logs.map((log) => typeof log === "object" && log !== null && "message" in log
      ? String(log.message)
      : String(log)).filter(Boolean)
    : []
  return logs.length === 0 ? message : `${message}: ${logs.join("\n")}`
}

function isReloadableSource(filename: string | Buffer | null): boolean {
  if (filename === null) return false
  const value = String(filename)
  return /\.(?:html|css|js|ts|wgsl)$/.test(value) && !/\.(?:spec|test)\.(?:js|ts)$/.test(value)
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
