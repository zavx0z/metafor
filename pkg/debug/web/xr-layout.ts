/**
 * Yoga-based layout primitives для debug-карточек.
 *
 * Принцип: каждая карточка строит дерево Object3D с .layout props
 * (flex/padding/gap), LayoutManager считает позиции и заливает их в
 * Object3D.position. Карточка кладёт в layout-боксы Text/Mesh БЕЗ ручных
 * x/y координат — они автоматически встают в TL родительского бокса.
 *
 * Конвенция: размеры в layout — logical пиксели от card-rect (0,0 = TL
 * card'а). После update LayoutManager выставит position в world через
 * умножение на pixelScale.
 */

import {
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Text,
  TextMaterial,
  TrueTypeFont,
  type LayoutProps,
} from "@metafor/engine"
import type {CardRect, XrCanvas, XrCard} from "./xr-canvas.ts"

export type LayoutTextOpts = {
  fontPx: number
  material: TextMaterial
  /** Высота бокса; default = fontPx + 4 (descender + small pad). */
  boxHeight?: number
  layout?: Omit<LayoutProps, "width" | "height">
  /** Ширина в logical px. Если undefined — оценивается как `text.length * fontPx * 0.62` (bold mono). */
  width?: number
}

export type LayoutRectOpts = {
  color: Color
  layout: LayoutProps
  z?: number
}

export type HitBox = {
  x: number
  y: number
  w: number
  h: number
  cursor?: string
  action(): void
}

export abstract class XrLayoutCard implements XrCard {
  readonly node = new Object3D()
  protected canvas: XrCanvas | null = null
  protected font: TrueTypeFont | null = null
  protected pixelScale = 0.001
  protected rectW = 1
  protected rectH = 1
  /** Текущий root, который мы добавили в node — нужен для повторного rebuild. */
  #root: Object3D | null = null
  #disposeRegistry: Mesh[] = []
  #fillBgRegistry: Array<{mesh: Mesh; parent: Object3D}> = []
  #hits: HitBox[] = []

  protected hoveredHitIdx = -1
  protected pressedHitIdx = -1

  attachCanvas(canvas: XrCanvas): void {
    this.canvas = canvas
  }

  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void {
    this.font = font
    this.pixelScale = pixelScale
    this.rectW = rect.w
    this.rectH = rect.h
    this.#rebuild()
  }

  protected rebuild(): void {
    if (this.font === null || this.canvas === null) return
    this.#rebuild()
    this.canvas.requestRender()
  }

  #rebuild(): void {
    if (this.font === null || this.canvas === null) return
    if (this.#root !== null) this.#disposeRoot()
    this.#hits = []
    this.#disposeRegistry = []
    this.#fillBgRegistry = []
    const root = this.build()
    root.layout = {...(root.layout ?? {}), width: this.rectW, height: this.rectH}
    this.node.add(root)
    this.#root = root
    this.canvas.layoutManager.update(root, this.rectW, this.rectH, this.pixelScale)
    this.afterLayout()
  }

  #disposeRoot(): void {
    if (this.#root === null) return
    const renderer = this.canvas?.renderer
    const stack: Object3D[] = [this.#root]
    while (stack.length > 0) {
      const obj = stack.pop()!
      for (const child of obj.children) stack.push(child)
      const t = obj as Text
      if (t.isText === true && renderer !== undefined) {
        if (t.stencilGeometry !== undefined) renderer.invalidateGeometry(t.stencilGeometry)
        if (t.coverGeometry !== undefined) renderer.invalidateGeometry(t.coverGeometry)
      }
      const m = obj as Mesh
      if (m.geometry !== undefined && renderer !== undefined && t.isText !== true) {
        renderer.invalidateGeometry(m.geometry)
      }
    }
    const idx = this.node.children.indexOf(this.#root)
    if (idx >= 0) this.node.children.splice(idx, 1)
    this.#root = null
    this.#disposeRegistry = []
  }

  /** Сабкласс возвращает root-Object3D с .layout заполненным. */
  protected abstract build(): Object3D

  // --- Builders ---

  protected box(props: LayoutProps & {children?: Object3D[]}): Object3D {
    const node = new Object3D()
    node.layout = stripChildren(props)
    for (const c of props.children ?? []) node.add(c)
    return node
  }

  protected column(props: LayoutProps & {children?: Object3D[]}): Object3D {
    return this.box({...props, flexDirection: "column"})
  }

  protected row(props: LayoutProps & {children?: Object3D[]}): Object3D {
    return this.box({...props, flexDirection: "row"})
  }

  protected text(value: string, opts: LayoutTextOpts): Object3D {
    if (this.font === null) throw new Error("text(): font not ready")
    const fontPx = opts.fontPx
    const boxH = opts.boxHeight ?? fontPx + 4
    const estW = opts.width ?? Math.ceil(value.length * fontPx * 0.62)
    const wrapper = new Object3D()
    wrapper.layout = {...(opts.layout ?? {}), width: estW, height: boxH}
    const t = new Text(value, this.font, fontPx * this.pixelScale, opts.material)
    // Baseline at boxH-2 px from TL → cap-top at boxH-2-cap_height ~ boxH/2 -> visually centered.
    t.position.y = -(boxH - 2) * this.pixelScale
    t.position.x = 0
    wrapper.add(t)
    return wrapper
  }

  protected rect(opts: LayoutRectOpts): Mesh {
    const mesh = new Mesh(new PlaneGeometry({width: 1, height: 1}), new MeshBasicMaterial({color: opts.color}))
    mesh.layout = opts.layout
    if (opts.z !== undefined) mesh.position.z = opts.z
    // Mesh.geometry будет пересоздана в afterLayout — мы не знаем computed
    // размер пока LayoutManager не отработал.
    this.#disposeRegistry.push(mesh)
    return mesh
  }

  /**
   * Заливка фона parent-бокса. Mesh добавляется как child parent'а БЕЗ
   * .layout — Yoga его игнорирует, не отнимает место у layout-children.
   * После layout мы читаем parent.computedLayout и подгоняем размер.
   */
  protected fillBg(parent: Object3D, color: Color, z = -0.001): Mesh {
    const mesh = new Mesh(new PlaneGeometry({width: 1, height: 1}), new MeshBasicMaterial({color}))
    mesh.position.z = z
    parent.add(mesh)
    this.#fillBgRegistry.push({mesh, parent})
    return mesh
  }

  /** Регистрирует hit-box в layout-координатах (в card-frame). */
  protected hit(node: Object3D, action: () => void, cursor = "pointer"): void {
    // Hit-rect посчитаем после layout (в #afterLayout) — node.computedLayout
    // уже будет заполнен.
    this.#hits.push({x: 0, y: 0, w: 0, h: 0, action, cursor})
    // Свяжем hit с node через ленивое обновление.
    ;(node as Object3D & {__hitIndex?: number}).__hitIndex = this.#hits.length - 1
  }

  /** Вызвать после layout: обновить размеры Mesh-rect'ов и hit-box'ов. */
  protected afterLayout(): void {
    for (const mesh of this.#disposeRegistry) {
      const cl = mesh.computedLayout
      if (cl === undefined || cl.width <= 0 || cl.height <= 0) continue
      mesh.geometry = new PlaneGeometry({
        width: cl.width * this.pixelScale,
        height: cl.height * this.pixelScale,
      })
      // Mesh origin в Object3D-frame = TL бокса (LayoutManager так выставил).
      // PlaneGeometry центрирована в (0,0), сдвигаем в TL: +width/2, -height/2.
      mesh.position.x = (cl.width / 2) * this.pixelScale
      mesh.position.y = -(cl.height / 2) * this.pixelScale
      mesh.updateMatrix()
    }
    // fillBg: размер от parent.computedLayout, центр в parent-frame.
    for (const {mesh, parent} of this.#fillBgRegistry) {
      const cl = parent.computedLayout
      if (cl === undefined || cl.width <= 0 || cl.height <= 0) continue
      mesh.geometry = new PlaneGeometry({
        width: cl.width * this.pixelScale,
        height: cl.height * this.pixelScale,
      })
      mesh.position.x = (cl.width / 2) * this.pixelScale
      mesh.position.y = -(cl.height / 2) * this.pixelScale
      mesh.updateMatrix()
    }
    // Resolve hit-rects (в card-frame): пройтись по дереву и для каждого node
    // с __hitIndex прописать его computed bounds в global-card-coords.
    if (this.#hits.length > 0 && this.#root !== null) {
      this.#walkComputed(this.#root, 0, 0)
    }
  }

  #walkComputed(node: Object3D, parentX: number, parentY: number): void {
    const cl = node.computedLayout
    if (cl === undefined) return
    const myX = parentX + cl.left
    const myY = parentY + cl.top
    const idx = (node as Object3D & {__hitIndex?: number}).__hitIndex
    if (idx !== undefined && this.#hits[idx] !== undefined) {
      this.#hits[idx]!.x = myX
      this.#hits[idx]!.y = myY
      this.#hits[idx]!.w = cl.width
      this.#hits[idx]!.h = cl.height
    }
    for (const child of node.children) this.#walkComputed(child, myX, myY)
  }

  // --- Pointer events (re-render on hover/press changes) ---

  onPointerMove(_event: MouseEvent, localX: number, localY: number): void {
    if (this.canvas === null) return
    const idx = this.#findHit(localX, localY)
    const cursor = idx >= 0 ? this.#hits[idx]!.cursor ?? "pointer" : "default"
    this.canvas.canvas.style.cursor = cursor
    if (idx === this.hoveredHitIdx) return
    this.hoveredHitIdx = idx
    this.rebuild()
  }

  onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    const idx = this.#findHit(localX, localY)
    if (idx < 0) return
    this.pressedHitIdx = idx
    this.rebuild()
    this.#hits[idx]!.action()
  }

  onPointerUp(_event: MouseEvent, _localX: number, _localY: number): void {
    if (this.pressedHitIdx < 0) return
    this.pressedHitIdx = -1
    this.rebuild()
  }

  onDeactivate(): void {
    if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
    if (this.hoveredHitIdx >= 0 || this.pressedHitIdx >= 0) {
      this.hoveredHitIdx = -1
      this.pressedHitIdx = -1
      this.rebuild()
    }
  }

  dispose(): void {
    this.#disposeRoot()
  }

  #findHit(x: number, y: number): number {
    // Перебираем в обратном порядке чтобы вложенные hit'ы выигрывали.
    for (let i = this.#hits.length - 1; i >= 0; i--) {
      const h = this.#hits[i]!
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return i
    }
    return -1
  }
}

function stripChildren<T extends {children?: unknown}>(props: T): Omit<T, "children"> {
  const {children, ...rest} = props
  void children
  return rest
}
