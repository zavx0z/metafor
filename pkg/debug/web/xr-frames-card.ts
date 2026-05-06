/**
 * Frames card. Layout — flexRow/flexColumn из @metafor/ui.
 */

import {Color} from "@metafor/engine"
import {Card, Z, flexRow, flexColumn, palette, divider, scrollbar} from "./xr-card.ts"
import type {XrFrameSnapshot} from "./xr-debug-ui.ts"

const ACTIVE_FILL = new Color(43 / 255, 73 / 255, 117 / 255, 0.95)

const PAD = 14
const HEADER_H = 22
const ROW_H = 32
const ROW_GAP = 2
const SCROLLBAR_W = 4

export class XrFramesCard extends Card {
  #frames: XrFrameSnapshot[] = []
  #active = 0
  #scroll = 0
  readonly #onSelect: (index: number) => void

  constructor(onSelect: (index: number) => void) {
    super({bgColor: palette.bg, borderColor: null})
    this.#onSelect = onSelect
  }

  setFrames(frames: XrFrameSnapshot[], active: number): void {
    this.#frames = frames
    this.#active = active
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, frames.length - 1)))
    this.requestRender()
  }

  onWheel(event: WheelEvent): void {
    const delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 20
    const visible = this.#visibleRows()
    const max = Math.max(0, this.#frames.length - visible)
    const next = Math.max(0, Math.min(max, this.#scroll + Math.trunc(delta)))
    if (next === this.#scroll) return
    this.#scroll = next
    this.requestRender()
  }

  protected render(): void {
    // Header: title слева, count справа.
    const titleW = this.measureText("Frames", 13)
    const countLabel = `${this.#frames.length}`
    const countW = this.measureText(countLabel, 11)
    flexRow({
      x: 0, y: 8,
      w: this.rectW, h: HEADER_H,
      paddingX: PAD,
      alignItems: "center",
      justifyContent: "space-between",
      items: [
        {
          width: titleW, height: 13,
          draw: (x, y) => this.drawText("Frames", x, y, {fontPx: 13, material: this.materials.cyan}),
        },
        {
          width: countW, height: 11,
          draw: (x, y) => this.drawText(countLabel, x, y, {fontPx: 11, material: this.materials.muted}),
        },
      ],
    })

    divider(this, PAD, HEADER_H + 12, this.rectW - PAD * 2)

    const listTop = HEADER_H + 22
    const listH = Math.max(0, this.rectH - listTop - 8)

    // Empty state.
    if (this.#frames.length === 0) {
      this.drawText("waiting for paused frame", PAD + 4, listTop + 6, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD * 2 - 8,
      })
      return
    }

    const visible = this.#visibleRows()
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#frames.length - visible)))
    const rowItems = []
    for (let i = 0; i < visible; i++) {
      const frame = this.#frames[this.#scroll + i]
      if (frame === undefined) break
      rowItems.push({
        height: ROW_H,
        draw: (x: number, y: number, w: number, h: number) => this.#drawRow(frame, x, y, w, h),
      })
    }
    flexColumn({
      x: 0, y: listTop,
      w: this.rectW, h: listH,
      paddingLeft: PAD,
      paddingRight: PAD + SCROLLBAR_W + 4,
      gap: ROW_GAP,
      items: rowItems,
    })

    scrollbar(this, this.rectW - PAD - SCROLLBAR_W, listTop, listH, {
      offset: this.#scroll, visible, total: this.#frames.length, trackWidth: SCROLLBAR_W,
    })
  }

  #drawRow(frame: XrFrameSnapshot, x: number, y: number, w: number, h: number): void {
    const isActive = frame.index === this.#active

    if (isActive) this.drawRect(x, y, w, h - 4, ACTIVE_FILL, Z.ELEMENT)

    const idLabel = `#${frame.index}`
    const idW = 28
    const fnLabel = frame.function || "<anonymous>"
    const locLabel = frame.url ? `${shortenUrl(frame.url)}:${frame.line}` : `(scriptId ?):${frame.line}`

    flexRow({
      x, y, w, h: h - 4,
      paddingX: 10,
      gap: 8,
      alignItems: "center",
      items: [
        {
          width: idW, height: 11,
          draw: (cx, cy) => this.drawText(idLabel, cx, cy, {
            fontPx: 11,
            material: isActive ? this.materials.orange : this.materials.muted,
            maxWidthPx: idW,
          }),
        },
        {
          width: "grow", height: 28,
          draw: (cx, cy, cw, _ch) => {
            flexColumn({
              x: cx, y: cy,
              w: cw, h: 28,
              gap: 2,
              items: [
                {
                  height: 13,
                  draw: (tx, ty, tw) => this.drawText(fnLabel, tx, ty, {
                    fontPx: 12,
                    material: this.materials.text,
                    maxWidthPx: tw,
                  }),
                },
                {
                  height: 10,
                  draw: (tx, ty, tw) => this.drawText(locLabel, tx, ty, {
                    fontPx: 9,
                    material: this.materials.muted,
                    maxWidthPx: tw,
                  }),
                },
              ],
            })
          },
        },
      ],
    })

    this.hit(x, y, w, h - 4, () => this.#onSelect(frame.index))
  }

  #visibleRows(): number {
    const listH = Math.max(0, this.rectH - (HEADER_H + 22) - 8)
    return Math.max(1, Math.floor((listH + ROW_GAP) / (ROW_H + ROW_GAP)))
  }
}

function shortenUrl(url: string): string {
  if (url.length <= 60) return url
  const parts = url.split("/")
  return `.../${parts.slice(-2).join("/")}`
}
