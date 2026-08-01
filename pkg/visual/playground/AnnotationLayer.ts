import type {StateGraphViewport} from "./StateGraphViewport.ts"
import {
  VISUAL_ANNOTATION_SCHEMA,
  type VisualAnnotationAtom,
  type VisualAnnotationDraft,
  type VisualAnnotationGraph,
  type VisualAnnotationPoint,
  type VisualAnnotationStroke,
  type VisualAnnotationSurface,
} from "./Annotation.ts"

type AnnotationContext =
  Pick<VisualAnnotationDraft, "atom" | "graph" | "surface">

export type CanvasAnnotationLayer = Readonly<{
  dispose(): void
  hide(): void
  resize(): void
  show(): void
}>

export type StateGraphAnnotationLayer = CanvasAnnotationLayer

type AnnotationViewport = Readonly<{
  capturePng(): Promise<Blob | null>
  getPose(): VisualAnnotationStroke["camera"]
}>

type MutableStroke = {
  camera: VisualAnnotationStroke["camera"]
  color: string
  points: VisualAnnotationPoint[]
  width: number
}

type FrozenAnnotationSession = {
  annotation: HTMLCanvasElement
  context: AnnotationContext
  draftViewport: VisualAnnotationDraft["viewport"]
  frame: Promise<Blob | null>
  pageUrl: string
  strokes: VisualAnnotationStroke[]
  capturedAt: string
}

const canvasPng = async (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))

const drawStroke = (
  context: CanvasRenderingContext2D,
  stroke: MutableStroke,
  width: number,
  height: number,
): void => {
  const points = stroke.points
  if (points.length === 0) return
  context.beginPath()
  context.strokeStyle = stroke.color
  context.fillStyle = stroke.color
  context.lineCap = "round"
  context.lineJoin = "round"
  context.lineWidth = stroke.width * Math.max(1, width / 640)
  const first = points[0]!
  context.moveTo(first.normalizedX * width, first.normalizedY * height)
  for (const point of points.slice(1)) {
    context.lineTo(point.normalizedX * width, point.normalizedY * height)
  }
  if (points.length === 1) {
    context.arc(
      first.normalizedX * width,
      first.normalizedY * height,
      context.lineWidth / 2,
      0,
      Math.PI * 2,
    )
    context.fill()
  } else {
    context.stroke()
  }
}

export const createCanvasAnnotationLayer = ({
  context,
  sourceCanvas,
  viewer,
  viewport,
}: {
  context(): AnnotationContext
  sourceCanvas: HTMLCanvasElement
  viewer: HTMLElement
  viewport: AnnotationViewport
}): CanvasAnnotationLayer => {
  const overlay = document.createElement("canvas")
  overlay.className = "state-annotation-canvas"
  const controls = document.createElement("div")
  controls.className = "state-annotation-controls"
  const pencil = document.createElement("button")
  pencil.type = "button"
  pencil.className = "state-annotation-button pencil"
  pencil.title = "Рисовать аннотацию"
  pencil.setAttribute("aria-label", "Рисовать аннотацию")
  pencil.setAttribute("aria-pressed", "false")
  pencil.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L19.5 8.5l-4-4L4 16Zm13-13 4 4 1-1a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0l-1 1Z"/></svg>'
  const clear = document.createElement("button")
  clear.type = "button"
  clear.className = "state-annotation-button clear"
  clear.title = "Очистить аннотацию"
  clear.setAttribute("aria-label", "Очистить аннотацию")
  clear.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10l-1 14H8L7 7Zm2-4h6l1 2h4v2H4V5h4l1-2Z"/></svg>'
  const status = document.createElement("span")
  status.className = "state-annotation-status"
  controls.append(pencil, clear, status)
  viewer.append(overlay, controls)

  const strokes: MutableStroke[] = []
  let activeStroke: MutableStroke | null = null
  let drawing = false
  let disposed = false
  let saveQueue = Promise.resolve()

  const overlayContext = overlay.getContext("2d")
  if (overlayContext === null) {
    controls.remove()
    overlay.remove()
    return {
      dispose() {},
      hide() {},
      resize() {},
      show() {},
    }
  }

  const redraw = (): void => {
    overlayContext.clearRect(0, 0, overlay.width, overlay.height)
    for (const stroke of strokes) {
      drawStroke(overlayContext, stroke, overlay.width, overlay.height)
    }
  }

  const resize = (): void => {
    const nextWidth = Math.max(1, sourceCanvas.width)
    const nextHeight = Math.max(1, sourceCanvas.height)
    if (overlay.width === nextWidth && overlay.height === nextHeight) return
    overlay.width = nextWidth
    overlay.height = nextHeight
    redraw()
  }
  resize()

  const pointFromEvent = (event: PointerEvent): VisualAnnotationPoint => {
    const rect = overlay.getBoundingClientRect()
    const screenX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const screenY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    return {
      normalizedX: rect.width === 0 ? 0 : screenX / rect.width,
      normalizedY: rect.height === 0 ? 0 : screenY / rect.height,
      screenX,
      screenY,
      timeMs: performance.now(),
    }
  }

  const composedPng = async (
    rendered: Blob | null,
    annotation: HTMLCanvasElement,
  ): Promise<Blob | null> => {
    if (rendered === null) return null
    const bitmap = await createImageBitmap(rendered)
    try {
      const composite = document.createElement("canvas")
      composite.width = annotation.width
      composite.height = annotation.height
      const compositeContext = composite.getContext("2d")
      if (compositeContext === null) return null
      compositeContext.drawImage(bitmap, 0, 0, composite.width, composite.height)
      compositeContext.drawImage(annotation, 0, 0)
      return await canvasPng(composite)
    } finally {
      bitmap.close()
    }
  }

  const persist = async (session: FrozenAnnotationSession): Promise<void> => {
    status.textContent = "сохранение…"
    status.classList.remove("error", "saved")
    try {
      const image = await composedPng(await session.frame, session.annotation)
      if (image === null) throw new Error("Viewport PNG is unavailable")
      const draft: VisualAnnotationDraft = {
        schema: VISUAL_ANNOTATION_SCHEMA,
        clientId: crypto.randomUUID(),
        capturedAt: session.capturedAt,
        pageUrl: session.pageUrl,
        ...session.context,
        strokes: session.strokes,
        viewport: session.draftViewport,
      }
      const form = new FormData()
      form.set("metadata", JSON.stringify(draft))
      form.set("image", image, "annotation.png")
      const response = await fetch("/api/annotations", {method: "POST", body: form})
      if (!response.ok) throw new Error(`Annotation save failed: ${response.status}`)
      const stored = await response.json() as {id?: string}
      status.textContent = stored.id ? `сохранено ${stored.id}` : "сохранено"
      status.classList.add("saved")
    } catch {
      status.textContent = "ошибка сохранения"
      status.classList.add("error")
    }
  }

  const enqueuePersist = (): void => {
    const rect = sourceCanvas.getBoundingClientRect()
    const annotation = document.createElement("canvas")
    annotation.width = overlay.width
    annotation.height = overlay.height
    annotation.getContext("2d")?.drawImage(overlay, 0, 0)
    const session: FrozenAnnotationSession = {
      annotation,
      context: structuredClone(context()),
      draftViewport: {
        camera: viewport.getPose(),
        cssWidth: rect.width,
        cssHeight: rect.height,
        pixelWidth: sourceCanvas.width,
        pixelHeight: sourceCanvas.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
      frame: viewport.capturePng(),
      pageUrl: window.location.href,
      strokes: structuredClone(strokes),
      capturedAt: new Date().toISOString(),
    }
    saveQueue = saveQueue.then(
      () => persist(session),
      () => persist(session),
    )
  }

  const handlePointerDown = (event: PointerEvent): void => {
    if (!pencil.classList.contains("active")) return
    event.preventDefault()
    drawing = true
    overlay.setPointerCapture(event.pointerId)
    activeStroke = {
      camera: viewport.getPose(),
      color: "#ffbf3f",
      width: 3.2,
      points: [pointFromEvent(event)],
    }
    strokes.push(activeStroke)
    redraw()
  }
  const handlePointerMove = (event: PointerEvent): void => {
    if (!drawing || activeStroke === null) return
    event.preventDefault()
    activeStroke.points.push(pointFromEvent(event))
    redraw()
  }
  const finishStroke = (event: PointerEvent): void => {
    if (!drawing) return
    event.preventDefault()
    drawing = false
    activeStroke = null
    if (overlay.hasPointerCapture(event.pointerId)) {
      overlay.releasePointerCapture(event.pointerId)
    }
  }
  const togglePencil = (): void => {
    const active = !pencil.classList.contains("active")
    if (active) {
      strokes.splice(0)
      activeStroke = null
      drawing = false
      redraw()
      status.textContent = "режим аннотации"
      status.classList.remove("error", "saved")
    }
    pencil.classList.toggle("active", active)
    pencil.setAttribute("aria-pressed", String(active))
    overlay.classList.toggle("active", active)
    if (!active) {
      status.textContent = ""
      if (strokes.length > 0) enqueuePersist()
    }
  }
  const clearDrawing = (): void => {
    strokes.splice(0)
    activeStroke = null
    drawing = false
    redraw()
    status.textContent = pencil.classList.contains("active")
      ? "режим аннотации"
      : ""
  }

  pencil.addEventListener("click", togglePencil)
  clear.addEventListener("click", clearDrawing)
  overlay.addEventListener("pointerdown", handlePointerDown)
  overlay.addEventListener("pointermove", handlePointerMove)
  overlay.addEventListener("pointerup", finishStroke)
  overlay.addEventListener("pointercancel", finishStroke)

  return {
    dispose() {
      if (disposed) return
      disposed = true
      pencil.removeEventListener("click", togglePencil)
      clear.removeEventListener("click", clearDrawing)
      overlay.removeEventListener("pointerdown", handlePointerDown)
      overlay.removeEventListener("pointermove", handlePointerMove)
      overlay.removeEventListener("pointerup", finishStroke)
      overlay.removeEventListener("pointercancel", finishStroke)
      controls.remove()
      overlay.remove()
    },
    hide() {
      if (pencil.classList.contains("active")) togglePencil()
      controls.hidden = true
      overlay.hidden = true
    },
    resize,
    show() {
      controls.hidden = false
      overlay.hidden = false
      resize()
    },
  }
}

export const createStateGraphAnnotationLayer = ({
  context,
  sourceCanvas,
  viewer,
  viewport,
}: {
  context(): Readonly<{
    atom: VisualAnnotationAtom
    graph: VisualAnnotationGraph
  }>
  sourceCanvas: HTMLCanvasElement
  viewer: HTMLElement
  viewport: StateGraphViewport
}): StateGraphAnnotationLayer =>
  createCanvasAnnotationLayer({
    sourceCanvas,
    viewer,
    viewport,
    context: () => {
      const stateGraph = context()
      return {
        ...stateGraph,
        surface: {
          canvasId: sourceCanvas.id ||
            `state-graph-card-${stateGraph.graph.cardIndex}`,
          kind: "state-graph-card",
          route: window.location.hash,
          slug: "state-graph",
          title: stateGraph.graph.rootStateLabel,
        },
      }
    },
  })

export const createPageAnnotationLayer = ({
  capturePng,
  sourceCanvas,
  surface,
  viewer,
}: {
  capturePng(): Promise<Blob | null>
  sourceCanvas: HTMLCanvasElement
  surface(): VisualAnnotationSurface
  viewer: HTMLElement
}): CanvasAnnotationLayer =>
  createCanvasAnnotationLayer({
    sourceCanvas,
    viewer,
    viewport: {
      capturePng,
      getPose: () => null,
    },
    context: () => ({
      atom: null,
      graph: null,
      surface: surface(),
    }),
  })
