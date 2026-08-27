import type {
  Renderer,
  TrueTypeFont,
} from "@engine/core"
import {hudCss} from "@ui/components/hud"
import {createDocument} from "@zavx0z/dom"
import {
  createDocumentInteractionController,
  createDocumentRenderer,
  hitTest,
  type DocumentInteractionController,
  type DocumentRenderer,
  type PointerInput,
  type RenderFrame,
  type RenderViewport,
  type WheelInput,
} from "@zavx0z/renderer"
import {
  RendererWebGpuBackend,
  RendererWebGpuScreenOverlay,
} from "@zavx0z/renderer-webgpu"
import {bulkHudDocumentCss} from "./hud.ts"

export type CreateBulkDomOverlayRuntimeOptions = Readonly<{
  canvas: HTMLCanvasElement
  renderer: Pick<Renderer, "invalidateGeometry">
  font: TrueTypeFont
  width: number
  height: number
  requestFrame(): void
  touchEventTarget?: EventTarget
}>

export type BulkDomOverlayRuntime = Readonly<{
  document: ReturnType<typeof createDocument>
  overlay: RendererWebGpuScreenOverlay
  backend: RendererWebGpuBackend
  interaction: DocumentInteractionController
  frame: RenderFrame
  flush(): RenderFrame
  resize(width: number, height: number): RenderFrame
  dispose(): void
}>

/**
 * Projects one semantic Bulk HUD Document into the existing 3D viewport
 * renderer and screen overlay. It owns DOM layout/input resources, not the
 * canvas, Engine renderer, Space, ViewPoint or render loop.
 */
export function createBulkDomOverlayRuntime(
  options: CreateBulkDomOverlayRuntimeOptions,
): BulkDomOverlayRuntime {
  const document = createDocument()
  const styleSheets = Object.freeze([hudCss, bulkHudDocumentCss])
  let viewport = readViewport(options.width, options.height)
  let documentRenderer: DocumentRenderer = createDocumentRenderer({
    document,
    root: document,
    viewport,
    styleSheets,
  })
  let requestPresentation = (): void => {}
  const backend = new RendererWebGpuBackend({
    font: options.font,
    invalidateGeometry: (geometry) => options.renderer.invalidateGeometry(geometry),
    requestPresentation: () => requestPresentation(),
  })
  const overlay = new RendererWebGpuScreenOverlay({
    content: backend.root,
    viewport,
    distance: 600,
  })
  const interaction = createDocumentInteractionController({
    document,
    tooltipDelayMs: 500,
  })
  const touchEventTarget = options.touchEventTarget ??
    (typeof window === "undefined" ? options.canvas : window)
  const capturedPointers = new Set<number>()
  const capturedTouches = new Set<number>()
  let currentFrame = interaction.composeFrame(documentRenderer.flush())
  let disposed = false

  const requestFrame = (): void => {
    if (!disposed) options.requestFrame()
  }
  requestPresentation = requestFrame
  const unsubscribeMutations = document.subscribeMutations(requestFrame)
  const unsubscribeStateChanges = document.subscribeStateChanges(requestFrame)

  const flush = (): RenderFrame => {
    assertActive(disposed)
    currentFrame = interaction.composeFrame(documentRenderer.flush(), performance.now())
    backend.applyFrame(currentFrame)
    return currentFrame
  }

  const resize = (width: number, height: number): RenderFrame => {
    assertActive(disposed)
    const next = readViewport(width, height)
    if (next.width !== viewport.width || next.height !== viewport.height) {
      const previous = documentRenderer
      viewport = next
      documentRenderer = createDocumentRenderer({
        document,
        root: document,
        viewport,
        styleSheets,
      })
      overlay.resize(viewport)
      previous.dispose()
    }
    return flush()
  }

  const pointerInput = (event: PointerEvent): PointerInput => {
    const point = localPoint(options.canvas, event.clientX, event.clientY, viewport)
    return Object.freeze({
      clientX: point.x,
      clientY: point.y,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      pressure: event.pressure,
      isPrimary: event.isPrimary,
      timeStamp: event.timeStamp,
    })
  }
  const wheelInput = (event: WheelEvent): WheelInput => {
    const point = localPoint(options.canvas, event.clientX, event.clientY, viewport)
    return Object.freeze({
      clientX: point.x,
      clientY: point.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    })
  }
  const hitAt = (clientX: number, clientY: number): boolean => {
    const point = localPoint(options.canvas, clientX, clientY, viewport)
    return hitTest(documentRenderer.flush(), point.x, point.y) !== null
  }
  const claim = (event: Event): void => {
    if (event.cancelable) event.preventDefault()
    event.stopImmediatePropagation()
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (disposed) return
    const target = interaction.pointerMove(documentRenderer.flush(), pointerInput(event))
    if (target !== null) claim(event)
    requestFrame()
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (disposed) return
    const target = interaction.pointerDown(documentRenderer.flush(), pointerInput(event))
    if (target === null) return
    claim(event)
    options.canvas.setPointerCapture?.(event.pointerId)
    capturedPointers.add(event.pointerId)
    requestFrame()
  }
  const releasePointer = (pointerId: number): void => {
    if (options.canvas.hasPointerCapture?.(pointerId)) {
      options.canvas.releasePointerCapture(pointerId)
    }
    capturedPointers.delete(pointerId)
  }
  const onPointerUp = (event: PointerEvent): void => {
    if (disposed) return
    const target = interaction.pointerUp(documentRenderer.flush(), pointerInput(event))
    if (target !== null || capturedPointers.has(event.pointerId)) claim(event)
    releasePointer(event.pointerId)
    requestFrame()
  }
  const onPointerCancel = (event: PointerEvent): void => {
    if (disposed) return
    const claimed = capturedPointers.has(event.pointerId)
    interaction.pointerCancel(documentRenderer.flush(), pointerInput(event))
    if (claimed) claim(event)
    releasePointer(event.pointerId)
    requestFrame()
  }
  const onWheel = (event: WheelEvent): void => {
    if (disposed) return
    const target = interaction.wheel(documentRenderer.flush(), wheelInput(event))
    if (target === null) return
    claim(event)
    requestFrame()
  }
  const blockMouseIfHud = (event: MouseEvent): void => {
    if (!disposed && hitAt(event.clientX, event.clientY)) claim(event)
  }
  const onTouchStart = (event: TouchEvent): void => {
    if (disposed) return
    let claimed = false
    for (const touch of Array.from(event.changedTouches)) {
      if (!hitAt(touch.clientX, touch.clientY)) continue
      capturedTouches.add(touch.identifier)
      claimed = true
    }
    if (claimed) claim(event)
  }
  const onWindowTouchMove = (event: TouchEvent): void => {
    if (!disposed && Array.from(event.changedTouches).some(({identifier}) =>
      capturedTouches.has(identifier))) claim(event)
  }
  const onWindowTouchEnd = (event: TouchEvent): void => {
    if (disposed) return
    let claimed = false
    for (const touch of Array.from(event.changedTouches)) {
      if (!capturedTouches.delete(touch.identifier)) continue
      claimed = true
    }
    if (claimed) claim(event)
  }

  options.canvas.addEventListener("pointermove", onPointerMove, true)
  options.canvas.addEventListener("pointerdown", onPointerDown, true)
  options.canvas.addEventListener("pointerup", onPointerUp, true)
  options.canvas.addEventListener("pointercancel", onPointerCancel, true)
  options.canvas.addEventListener("wheel", onWheel, {capture: true, passive: false})
  options.canvas.addEventListener("mousemove", blockMouseIfHud, true)
  options.canvas.addEventListener("mousedown", blockMouseIfHud, true)
  options.canvas.addEventListener("mouseup", blockMouseIfHud, true)
  options.canvas.addEventListener("click", blockMouseIfHud, true)
  options.canvas.addEventListener("contextmenu", blockMouseIfHud, true)
  options.canvas.addEventListener("touchstart", onTouchStart, {capture: true, passive: false})
  touchEventTarget.addEventListener("touchmove", onWindowTouchMove as EventListener, {capture: true, passive: false})
  touchEventTarget.addEventListener("touchend", onWindowTouchEnd as EventListener, {capture: true, passive: false})
  touchEventTarget.addEventListener("touchcancel", onWindowTouchEnd as EventListener, {capture: true, passive: false})
  flush()

  return Object.freeze({
    document,
    overlay,
    backend,
    interaction,
    get frame() { return currentFrame },
    flush,
    resize,
    dispose() {
      if (disposed) return
      disposed = true
      options.canvas.removeEventListener("pointermove", onPointerMove, true)
      options.canvas.removeEventListener("pointerdown", onPointerDown, true)
      options.canvas.removeEventListener("pointerup", onPointerUp, true)
      options.canvas.removeEventListener("pointercancel", onPointerCancel, true)
      options.canvas.removeEventListener("wheel", onWheel, true)
      options.canvas.removeEventListener("mousemove", blockMouseIfHud, true)
      options.canvas.removeEventListener("mousedown", blockMouseIfHud, true)
      options.canvas.removeEventListener("mouseup", blockMouseIfHud, true)
      options.canvas.removeEventListener("click", blockMouseIfHud, true)
      options.canvas.removeEventListener("contextmenu", blockMouseIfHud, true)
      options.canvas.removeEventListener("touchstart", onTouchStart, true)
      touchEventTarget.removeEventListener("touchmove", onWindowTouchMove as EventListener, true)
      touchEventTarget.removeEventListener("touchend", onWindowTouchEnd as EventListener, true)
      touchEventTarget.removeEventListener("touchcancel", onWindowTouchEnd as EventListener, true)
      for (const pointerId of capturedPointers) releasePointer(pointerId)
      capturedPointers.clear()
      capturedTouches.clear()
      unsubscribeMutations()
      unsubscribeStateChanges()
      interaction.dispose()
      documentRenderer.dispose()
      backend.dispose()
    },
  })
}

const localPoint = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  viewport: RenderViewport,
): Readonly<{x: number; y: number}> => {
  const rect = canvas.getBoundingClientRect()
  return Object.freeze({
    x: (clientX - rect.left) * viewport.width / positiveExtent(rect.width),
    y: (clientY - rect.top) * viewport.height / positiveExtent(rect.height),
  })
}

const readViewport = (width: number, height: number): RenderViewport => Object.freeze({
  width: positiveExtent(width),
  height: positiveExtent(height),
})

const positiveExtent = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1

const assertActive = (disposed: boolean): void => {
  if (disposed) throw new Error("Bulk DOM overlay runtime is disposed")
}
