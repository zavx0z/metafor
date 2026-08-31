import type {
  Document as SemanticDocument,
  Element as SemanticElement,
  Event as SemanticEvent,
  HTMLElement as SemanticHTMLElement,
  Node as SemanticNode,
} from "@zavx0z/dom"
import {
  BulkCausalTimeModel,
  buildBulkCausalTimePresentation,
  type BulkCausalTimeTransport,
} from "./causal-time.ts"
import {
  createBulkHudDocument,
  type BulkHudDocumentController,
} from "./hud.tsx"

const APP_FULLSCREEN_FALLBACK_CLASS = "metafor-app-fullscreen-fallback"
let appFullscreenFallbackActive = false

export type BulkFullscreenHost = Readonly<{
  active(): boolean
  toggle(): Promise<void>
  subscribe(listener: () => void): () => void
}>

export type CreateBulkHudControllerOptions = Readonly<{
  document: SemanticDocument
  parent?: SemanticNode
  transport?: BulkCausalTimeTransport
  fullscreen?: BulkFullscreenHost
}>

export type BulkHudController = Readonly<{
  element: SemanticHTMLElement
  presentation: BulkHudDocumentController
  time: BulkCausalTimeModel
  ready: Promise<void>
  dispose(): void
}>

const bulkCausalTimeHttpTransport: BulkCausalTimeTransport = Object.freeze({
  async stack(): Promise<unknown> {
    const response = await fetch("/time/stack")
    if (!response.ok) throw new Error(await responseError(response))
    return await response.json()
  },
  async pause(): Promise<void> {
    const response = await fetch("/time/pause", {method: "POST"})
    if (!response.ok) throw new Error(await responseError(response))
  },
  async resume(): Promise<void> {
    const response = await fetch("/time/resume", {method: "POST"})
    if (!response.ok) throw new Error(await responseError(response))
  },
})

/**
 * Composes the production Bulk HUD in one caller-owned semantic Document.
 * Product actions are ordinary bubbling button events; this controller owns
 * only their fullscreen and causal-time effects.
 */
export function createBulkHudController(
  options: CreateBulkHudControllerOptions,
): BulkHudController {
  const parent = options.parent ?? options.document
  if (parent !== options.document && parent.ownerDocument !== options.document) {
    throw new Error("Bulk HUD parent belongs to another Document")
  }
  const fullscreen = options.fullscreen ?? inertFullscreenHost
  const time = new BulkCausalTimeModel(options.transport ?? bulkCausalTimeHttpTransport)
  const presentation = createBulkHudDocument(options.document, presentationProps(time, fullscreen))
  const fullscreenButton = presentation.refs.fullscreenButton
  const previousButton = presentation.controllers.playback.refs.previousButton
  const toggleButton = presentation.controllers.playback.refs.toggleButton
  const nextButton = presentation.controllers.playback.refs.nextButton
  let disposed = false

  const render = (): void => {
    if (disposed) return
    presentation.update(presentationProps(time, fullscreen))
  }
  const onFullscreen = (): void => {
    void fullscreen.toggle().then(render).catch((error) => {
      console.warn("fullscreen toggle failed:", error)
      render()
    })
  }
  const onPrevious = (): void => time.selectRelativeFrame(-1)
  const onNext = (): void => time.selectRelativeFrame(1)
  const onToggle = (): void => {
    if (time.canPause) void time.pause()
    else if (time.canResume) void time.resume()
  }
  const onFrameSelect = (event: SemanticEvent): void => {
    const id = frameIdFromTarget(event.target, event.currentTarget)
    if (id !== null) time.selectFrame(id)
  }

  const unsubscribeTime = time.subscribe(render)
  const unsubscribeFullscreen = fullscreen.subscribe(render)
  fullscreenButton.addEventListener("click", onFullscreen)
  previousButton.addEventListener("click", onPrevious)
  toggleButton.addEventListener("click", onToggle)
  nextButton.addEventListener("click", onNext)
  presentation.refs.timeline.addEventListener("click", onFrameSelect)
  presentation.refs.channels.addEventListener("click", onFrameSelect)
  parent.appendChild(presentation.element)
  render()
  const ready = time.open()

  return Object.freeze({
    element: presentation.element,
    presentation,
    time,
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      fullscreenButton.removeEventListener("click", onFullscreen)
      previousButton.removeEventListener("click", onPrevious)
      toggleButton.removeEventListener("click", onToggle)
      nextButton.removeEventListener("click", onNext)
      presentation.refs.timeline.removeEventListener("click", onFrameSelect)
      presentation.refs.channels.removeEventListener("click", onFrameSelect)
      unsubscribeTime()
      unsubscribeFullscreen()
      time.dispose()
      presentation.dispose()
      presentation.element.remove()
    },
  })
}

/** Standard browser fullscreen adapter used by the production Bulk canvas. */
export function createBrowserBulkFullscreenHost(preferredTarget: Element): BulkFullscreenHost {
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  const onChange = (): void => {
    if (appFullscreenElement() !== null && appFullscreenFallbackActive) {
      setAppFullscreenFallback(false)
    }
    notify()
  }
  document.addEventListener("fullscreenchange", onChange)
  document.addEventListener("webkitfullscreenchange", onChange)
  let disposed = false

  return Object.freeze({
    active: appFullscreenActive,
    async toggle() {
      if (disposed) throw new Error("Bulk fullscreen host is disposed")
      if (appFullscreenActive()) {
        await exitAppFullscreen()
      } else {
        try {
          await requestAppFullscreen(preferredTarget)
        } catch (error) {
          console.warn("fullscreen request failed, using viewport fallback:", error)
          setAppFullscreenFallback(true)
        }
      }
      notify()
    },
    subscribe(listener) {
      if (disposed) throw new Error("Bulk fullscreen host is disposed")
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size !== 0 || disposed) return
        disposed = true
        document.removeEventListener("fullscreenchange", onChange)
        document.removeEventListener("webkitfullscreenchange", onChange)
      }
    },
  })
}

const inertFullscreenHost: BulkFullscreenHost = Object.freeze({
  active: () => false,
  async toggle() {},
  subscribe: () => () => {},
})

const presentationProps = (
  time: BulkCausalTimeModel,
  fullscreen: BulkFullscreenHost,
) => Object.freeze({
  title: "Bulk Visual",
  subtitle: time.message,
  fullscreen: fullscreen.active(),
  fullscreenDisabled: false,
  causalTime: buildBulkCausalTimePresentation(
    time.frames,
    time.playhead,
    time.state,
  ),
})

const frameIdFromTarget = (target: unknown, boundary: unknown): number | null => {
  let element = semanticElement(target)
  const boundaryElement = semanticElement(boundary)
  while (element !== null) {
    const key = element.getAttribute("data-keyframe-key") ??
      element.getAttribute("data-marker-key") ??
      element.getAttribute("data-channel-point-key")
    if (key !== null) {
      const match = /^frame-([1-9][0-9]*)$/.exec(key)
      if (match !== null) {
        const id = Number(match[1])
        return Number.isSafeInteger(id) ? id : null
      }
    }
    if (element === boundaryElement) break
    element = element.parentElement
  }
  return null
}

const semanticElement = (value: unknown): SemanticElement | null =>
  value !== null && typeof value === "object" && "getAttribute" in value
    ? value as SemanticElement
    : null

const responseError = async (response: Response): Promise<string> => {
  const text = await response.text()
  try {
    const value = JSON.parse(text) as {error?: unknown}
    if (typeof value.error === "string" && value.error.length > 0) return value.error
    return `HTTP ${response.status}`
  } catch {
    return text || `HTTP ${response.status}`
  }
}

function appFullscreenElement(): Element | null {
  const webkitDocument = document as Document & {webkitFullscreenElement?: Element | null}
  return document.fullscreenElement ?? webkitDocument.webkitFullscreenElement ?? null
}

function appFullscreenActive(): boolean {
  return appFullscreenElement() !== null || appFullscreenFallbackActive
}

async function requestAppFullscreen(preferredTarget: Element): Promise<void> {
  let lastError: unknown = null
  for (const target of fullscreenTargetCandidates(preferredTarget)) {
    try {
      await requestElementFullscreen(target)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error("fullscreen request failed")
}

async function requestElementFullscreen(target: Element): Promise<void> {
  const webkitTarget = target as Element & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  const request = target.requestFullscreen ?? webkitTarget.webkitRequestFullscreen
  if (request === undefined) {
    throw new Error(`fullscreen is not available on ${target.tagName.toLowerCase()}`)
  }
  await Promise.resolve(request.call(target))
}

async function exitAppFullscreen(): Promise<void> {
  setAppFullscreenFallback(false)
  const fullscreenDocument = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void
  }
  if (document.exitFullscreen !== undefined && document.fullscreenElement !== null) {
    await document.exitFullscreen()
  } else if (
    fullscreenDocument.webkitExitFullscreen !== undefined &&
    appFullscreenElement() !== null
  ) {
    await Promise.resolve(fullscreenDocument.webkitExitFullscreen())
  }
}

function setAppFullscreenFallback(active: boolean): void {
  appFullscreenFallbackActive = active
  document.documentElement.classList.toggle(APP_FULLSCREEN_FALLBACK_CLASS, active)
}

function fullscreenTargetCandidates(preferredTarget: Element): Element[] {
  const candidates = [preferredTarget, preferredTarget.parentElement, document.documentElement]
  const seen = new Set<Element>()
  const result: Element[] = []
  for (const candidate of candidates) {
    if (candidate === null || seen.has(candidate)) continue
    seen.add(candidate)
    result.push(candidate)
  }
  return result
}
