import type {DisplayElement, Presentation} from "@zavx0z/immersive"
import {ViewPoint} from "@zavx0z/immersive/engine"
import type {SpatialTreeState} from "@zavx0z/immersive/nodes/spatial/tree"

type Viewport = Readonly<{width: number; height: number}>
type Root = Pick<Presentation, "document" | "viewPoint">
const fittedAttribute = "data-metafor-display-fitted"

/**
 * Consumer policy выбранного Atom Display. Читает существующие SpatialTree и
 * Presentation, помечает доступные собственные Display для аннотации и включает
 * blur только при точной focus-позе public ViewPoint.fitPoseForBounds.
 * displayFor возвращает уже материализованный Display; binding не нарушает LOD,
 * не создаёт canvas/frame loop и не изменяет адрес или semantic Document.
 * @see ../README.md; atom-display-glass.spec.ts.
 */
export function bindAtomDisplayGlass(options: Readonly<{
  root: Root
  source: Pick<SpatialTreeState, "getSnapshot" | "subscribe">
  displayFor(id: string): DisplayElement | null
}>) {
  let viewport: Viewport | null = null, active: DisplayElement | null = null, disposed = false
  const owned = new Map<DisplayElement, string>()
  const mark = (display: DisplayElement | null) => {
    if (active === display) return
    active?.removeAttribute(fittedAttribute)
    active = display
    active?.setAttribute(fittedAttribute, "true")
  }
  const update = () => {
    if (disposed) return
    const snapshot = options.source.getSnapshot()
    const available = new Set<DisplayElement>()
    for (const node of snapshot?.nodes ?? []) {
      if (!node.id.startsWith("atom:") || node.id.length <= 5) continue
      const display = options.displayFor(node.id)
      if (!display) continue
      available.add(display); owned.set(display, node.id)
      if (display.getAttribute("data-atom-ref") !== node.id) display.setAttribute("data-atom-ref", node.id)
    }
    for (const [display, ref] of owned) if (!available.has(display)) {
      if (display.getAttribute("data-atom-ref") === ref) display.removeAttribute("data-atom-ref")
      owned.delete(display)
    }
    const node = snapshot?.nodes.find(node => node.id === snapshot.selectedId)
    const display = node && node.id.startsWith("atom:") ? options.displayFor(node.id) : null
    if (!node || !display || display.hidden || !viewport) {mark(null); return}
    const r = node.rect, viewPoint = options.root.viewPoint
    if (![r.x, r.y, r.z, r.width, r.height, viewPoint.fov].every(Number.isFinite) || r.width <= 0 || r.height <= 0 || viewPoint.fov <= 0 || viewPoint.fov >= Math.PI) {mark(null); return}
    const expected = ViewPoint.fitPoseForBounds({min: {x: r.x, y: r.y, z: r.z - .001}, max: {x: r.x + r.width, y: r.y + r.height, z: r.z}},
      {x: 0, y: 0, z: 1}, {fov: viewPoint.fov, aspect: viewport.width / viewport.height})
    const epsilon = Math.max(1, r.width, r.height) * 1e-4
    const matches = Math.hypot(viewPoint.x - expected.position.x, viewPoint.y - expected.position.y, viewPoint.z - expected.position.z) <= epsilon &&
      Math.hypot(viewPoint.targetX - expected.target.x, viewPoint.targetY - expected.target.y, viewPoint.targetZ - expected.target.z) <= epsilon
    mark(matches ? display : null)
  }
  const unsubscribeState = options.source.subscribe(update)
  const unsubscribeCamera = options.root.document.subscribeMutations(batch => {
    if (batch.records.some(record => record.target === options.root.viewPoint || owned.has(record.target as DisplayElement))) update()
  })
  return {
    update,
    updateViewport(next: Viewport) {
      if (disposed) return
      if (!Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width <= 0 || next.height <= 0) {viewport = null; mark(null); return}
      if (viewport?.width === next.width && viewport.height === next.height) return
      const first = viewport === null
      viewport = {width: next.width, height: next.height}
      mark(null)
      if (first) update()
    },
    dispose() {
      if (disposed) return
      disposed = true; unsubscribeState(); unsubscribeCamera(); mark(null)
      for (const [display, ref] of owned) if (display.getAttribute("data-atom-ref") === ref) display.removeAttribute("data-atom-ref")
      owned.clear()
    },
  }
}
