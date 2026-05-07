/**
 * Frames card. Layout — flexRow/flexColumn + scrollList из @metafor/ui.
 */

import {
  Card, Z, flexRow, flexColumn, palette, divider,
  ScrollListState, scrollList,
} from "./xr-card.ts"
import type {XrFrameSnapshot} from "./xr-debug-ui.ts"

const PAD = 14
const HEADER_H = 22
const ROW_H = 32
const ROW_GAP = 2

export class XrFramesCard extends Card {
  #frames: XrFrameSnapshot[] = []
  #active = 0
  readonly #list: ScrollListState
  readonly #onSelect: (index: number) => void

  constructor(onSelect: (index: number) => void) {
    super({bgColor: palette.bg, borderColor: null})
    this.#list = new ScrollListState({onChange: () => this.requestRender()})
    this.#onSelect = onSelect
  }

  setFrames(frames: XrFrameSnapshot[], active: number): void {
    this.#frames = frames
    this.#active = active
    this.requestRender()
  }

  onWheel(event: WheelEvent): void {
    this.#list.applyWheel(event, ROW_H + ROW_GAP, this.#frames.length, this.#visibleRows())
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

    if (this.#frames.length === 0) {
      this.drawText("waiting for paused frame", PAD + 4, listTop + 6, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD * 2 - 8,
      })
      return
    }

    scrollList(this, {
      state: this.#list,
      items: this.#frames,
      rowH: ROW_H,
      rowGap: ROW_GAP,
      x: PAD,
      y: listTop,
      w: this.rectW - PAD * 2,
      h: listH,
      edgeFade: {color: palette.bg, sizePx: 20},
      drawRow: (frame, _idx, x, y, w, h) => this.#drawRow(frame, x, y, w, h),
    })
  }

  #drawRow(frame: XrFrameSnapshot, x: number, y: number, w: number, h: number): void {
    const isActive = frame.index === this.#active

    if (isActive) this.drawRect(x, y, w, h - 4, palette.activeRowFill, Z.ELEMENT)

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
          draw: (cx, cy, cw) => {
            flexColumn({
              x: cx, y: cy, w: cw, h: 28, gap: 2,
              items: [
                {
                  height: 13,
                  draw: (tx, ty, tw) => this.drawText(fnLabel, tx, ty, {
                    fontPx: 12, material: this.materials.text, maxWidthPx: tw,
                  }),
                },
                {
                  height: 10,
                  draw: (tx, ty, tw) => this.drawText(locLabel, tx, ty, {
                    fontPx: 9, material: this.materials.muted, maxWidthPx: tw,
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
