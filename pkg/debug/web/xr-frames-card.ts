/**
 * Frames card — список call-frames в paused state.
 *
 * Pilot для Yoga-layout миграции: layout-tree вместо ручных x/y координат
 * в drawText/drawRect.
 */

import {Color, type Object3D, TextMaterial} from "@metafor/engine"
import {XrLayoutCard} from "./xr-layout.ts"
import type {XrFrameSnapshot} from "./xr-debug-ui.ts"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

const UI = {
  bg: rgb(18, 23, 32, 0.94),
  bgElevated: rgb(27, 34, 45, 0.96),
  border: rgb(116, 130, 151, 1),
  borderDim: rgb(62, 74, 92, 1),
  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),
  cyan: rgb(111, 211, 255, 1),
  orange: rgb(255, 190, 111, 1),
  active: rgb(43, 73, 117, 0.95),
}

const ROW_H = 32
const HEADER_H = 28
const PAD = 14

export class XrFramesCard extends XrLayoutCard {
  #frames: XrFrameSnapshot[] = []
  #active = 0
  #scroll = 0
  readonly #onSelect: (index: number) => void

  readonly #cyanMat = new TextMaterial({color: UI.cyan})
  readonly #mutedMat = new TextMaterial({color: UI.muted})
  readonly #textMat = new TextMaterial({color: UI.text})
  readonly #orangeMat = new TextMaterial({color: UI.orange})

  constructor(onSelect: (index: number) => void) {
    super()
    this.#onSelect = onSelect
  }

  setFrames(frames: XrFrameSnapshot[], active: number): void {
    this.#frames = frames
    this.#active = active
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, frames.length - 1)))
    this.rebuild()
  }

  onWheel(event: WheelEvent): void {
    const delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 20
    const next = this.#scroll + Math.trunc(delta)
    const visible = Math.max(1, Math.floor((this.rectH - HEADER_H - PAD * 2) / ROW_H))
    const max = Math.max(0, this.#frames.length - visible)
    const clamped = Math.max(0, Math.min(max, next))
    if (clamped === this.#scroll) return
    this.#scroll = clamped
    this.rebuild()
  }

  protected build(): Object3D {
    // root: card-bg + border + content в одном column.
    const root = this.column({
      padding: PAD,
      gap: 8,
    })
    // card background + border (под content'ом).
    this.fillBg(root, UI.bg, -0.02)
    this.#addBorder(root)

    // Header: title + subtitle.
    const header = this.row({
      height: HEADER_H,
      justifyContent: "space-between",
      alignItems: "center",
    })
    header.add(this.text("Frames", {fontPx: 13, material: this.#cyanMat, boxHeight: 18}))
    header.add(this.text(`${this.#frames.length}`, {fontPx: 11, material: this.#mutedMat, boxHeight: 14}))

    // Title divider.
    const divider = this.rect({color: UI.borderDim, layout: {height: 1}, z: 0})

    // Content list.
    const list = this.column({flexGrow: 1, gap: 2})
    if (this.#frames.length === 0) {
      list.add(this.text("waiting for paused frame", {
        fontPx: 12,
        material: this.#mutedMat,
        boxHeight: 16,
        layout: {marginTop: 6},
      }))
    } else {
      const visible = Math.max(1, Math.floor((this.rectH - HEADER_H - PAD * 2 - 1) / ROW_H))
      this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#frames.length - visible)))
      for (let i = 0; i < visible; i++) {
        const frame = this.#frames[this.#scroll + i]
        if (frame === undefined) break
        list.add(this.#frameRow(frame))
      }
    }

    root.add(header)
    root.add(divider)
    root.add(list)
    return root
  }

  #frameRow(frame: XrFrameSnapshot): Object3D {
    const isActive = frame.index === this.#active
    const row = this.row({
      height: ROW_H,
      paddingLeft: 6,
      paddingRight: 6,
      alignItems: "center",
      gap: 8,
    })
    if (isActive) this.fillBg(row, UI.active, -0.001)

    const num = this.text(`#${frame.index}`, {
      fontPx: 11,
      material: isActive ? this.#orangeMat : this.#mutedMat,
      boxHeight: 14,
      width: 24,
    })

    const fnText = frame.function || "<anonymous>"
    const locText = frame.url ? `${shortenUrl(frame.url)}:${frame.line}` : `(scriptId ?):${frame.line}`
    const info = this.column({flexGrow: 1, justifyContent: "center", gap: 2})
    info.add(this.text(fnText, {
      fontPx: 12,
      material: this.#textMat,
      boxHeight: 14,
    }))
    info.add(this.text(locText, {
      fontPx: 9,
      material: this.#mutedMat,
      boxHeight: 11,
    }))

    row.add(num)
    row.add(info)
    this.hit(row, () => this.#onSelect(frame.index))
    return row
  }

  #addBorder(root: Object3D): void {
    // 4 mesh-полосы по периметру card-rect. Без layout — позиции
    // выставляются вручную после первого rebuild.
    // Для PoC: оставляем XrPanelCard-стиль, выставляем вручную в afterLayout
    // — но проще иметь cards без border (Yoga-стиль с padding достаточно
    // визуально отделяет). Пока опускаем border, если потом понадобится —
    // добавим overlay через node.add(...).
    void root
  }
}

function shortenUrl(url: string): string {
  if (url.length <= 60) return url
  const parts = url.split("/")
  return `.../${parts.slice(-2).join("/")}`
}
