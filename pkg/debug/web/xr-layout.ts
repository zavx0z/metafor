/**
 * Базовый класс card на Yoga + Component-tree.
 *
 * Жизненный цикл setRect:
 * 1. unmount предыдущего root (text/mesh-геометрии возвращаются в renderer).
 * 2. build() — сабкласс возвращает component-tree.
 * 3. root.object.layout = {width: rectW, height: rectH} + LayoutManager.update.
 * 4. root.mount(ctx) — каждый component читает свой computedLayout и создаёт
 *    Text/Mesh внутри своего Object3D.
 * 5. собираем hit-rects из computed-bounds component-tree.
 *
 * Никаких ручных x/y координат — всё положение через layout-props.
 */

import {type TrueTypeFont, Object3D} from "@metafor/engine"
import type {CardRect, XrCanvas, XrCard} from "./xr-canvas.ts"
import {Component, type MountContext} from "./xr-component.ts"

export type HitBox = {
  component: Component
  cursor: string
  action(): void
  /** Computed bounds, заполняется из computedLayout после layout. */
  rect: {x: number; y: number; w: number; h: number} | null
}

export abstract class XrLayoutCard implements XrCard {
  readonly node = new Object3D()
  protected canvas: XrCanvas | null = null
  protected font: TrueTypeFont | null = null
  protected pixelScale = 0.001
  protected rectW = 1
  protected rectH = 1

  #root: Component | null = null
  #hits: HitBox[] = []
  protected hoveredHit: Component | null = null
  protected pressedHit: Component | null = null

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

  protected requestRebuild(): void {
    if (this.font === null || this.canvas === null) return
    this.#rebuild()
    this.canvas.requestRender()
  }

  #rebuild(): void {
    if (this.font === null || this.canvas === null) return

    const ctx: MountContext = {
      font: this.font,
      pixelScale: this.pixelScale,
      renderer: this.canvas.renderer,
    }
    if (this.#root !== null) {
      this.#root.unmount(ctx)
      const idx = this.node.children.indexOf(this.#root.object)
      if (idx >= 0) this.node.children.splice(idx, 1)
    }
    this.#hits = []
    this.#root = this.build()
    // Гарантируем что root знает свои внешние размеры.
    this.#root.object.layout = {
      ...(this.#root.object.layout ?? {}),
      width: this.rectW,
      height: this.rectH,
    }
    this.node.add(this.#root.object)
    this.canvas.layoutManager.update(this.#root.object, this.rectW, this.rectH, this.pixelScale)
    this.#root.mount(ctx)
    this.#resolveHits()
  }

  /** Сабкласс возвращает root component с собранным деревом. */
  protected abstract build(): Component

  protected hit(component: Component, action: () => void, cursor = "pointer"): void {
    this.#hits.push({component, action, cursor, rect: null})
  }

  #resolveHits(): void {
    if (this.#hits.length === 0 || this.#root === null) return
    // Walk: для каждого Component с зарегистрированным hit считаем
    // его TL в card-frame (сумма computedLeft + computedTop по всем предкам).
    const offsetMap = new Map<Object3D, {x: number; y: number}>()
    const walk = (obj: Object3D, parentX: number, parentY: number): void => {
      const cl = obj.computedLayout
      if (cl === undefined) return
      const x = parentX + cl.left
      const y = parentY + cl.top
      offsetMap.set(obj, {x, y})
      for (const child of obj.children) walk(child, x, y)
    }
    walk(this.#root.object, 0, 0)
    for (const hit of this.#hits) {
      const off = offsetMap.get(hit.component.object)
      const cl = hit.component.object.computedLayout
      if (off === undefined || cl === undefined) {
        hit.rect = null
        continue
      }
      hit.rect = {x: off.x, y: off.y, w: cl.width, h: cl.height}
    }
  }

  // --- pointer events ---

  onPointerMove(_event: MouseEvent, localX: number, localY: number): void {
    if (this.canvas === null) return
    const hit = this.#findHit(localX, localY)
    this.canvas.canvas.style.cursor = hit !== null ? hit.cursor : "default"
    const next = hit?.component ?? null
    if (next === this.hoveredHit) return
    this.hoveredHit = next
    this.requestRebuild()
  }

  onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    const hit = this.#findHit(localX, localY)
    if (hit === null) return
    this.pressedHit = hit.component
    this.requestRebuild()
    hit.action()
  }

  onPointerUp(_event: MouseEvent, _localX: number, _localY: number): void {
    if (this.pressedHit === null) return
    this.pressedHit = null
    this.requestRebuild()
  }

  onDeactivate(): void {
    if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
    if (this.hoveredHit !== null || this.pressedHit !== null) {
      this.hoveredHit = null
      this.pressedHit = null
      this.requestRebuild()
    }
  }

  dispose(): void {
    if (this.#root === null || this.canvas === null || this.font === null) return
    const ctx: MountContext = {
      font: this.font,
      pixelScale: this.pixelScale,
      renderer: this.canvas.renderer,
    }
    this.#root.unmount(ctx)
    this.#root = null
  }

  #findHit(x: number, y: number): HitBox | null {
    for (let i = this.#hits.length - 1; i >= 0; i--) {
      const h = this.#hits[i]!
      const r = h.rect
      if (r === null) continue
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return h
    }
    return null
  }
}
