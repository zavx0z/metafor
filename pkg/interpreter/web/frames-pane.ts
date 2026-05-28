/**
 * Frames pane. Layout — flexRow/flexColumn/div из @ui/elements.
 */

import {
  UiSurface, Z, div, flexRow, flexColumn, palette, radii,
} from "@ui/elements"
import {
  Divider as divider,
} from "@ui/components"
import type {FrameSnapshot} from "./interpreter-ui.ts"
import {t} from "./i18n.ts"

const PAD = 14
const TAB_H = 24
const HEADER_Y = 8
const ROW_H = 32
const ROW_GAP = 2

export class FramesPane extends UiSurface {
  #frames: FrameSnapshot[] = []
  #active = 0
  readonly #onSelect: (index: number) => void

  constructor(onSelect: (index: number) => void) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.#onSelect = onSelect
  }

  setFrames(frames: FrameSnapshot[], active: number): void {
    this.#frames = frames
    this.#active = active
    this.requestRender()
  }

  protected render(): void {
    this.#drawHeader()
    divider(this, PAD, HEADER_Y + TAB_H + 10, this.rectW - PAD * 2)

    const listTop = HEADER_Y + TAB_H + 20
    const listH = Math.max(0, this.rectH - listTop - 8)

    if (this.#frames.length === 0) {
      this.drawText(t("waitingFrames"), PAD + 4, listTop + 6, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD * 2 - 8,
      })
      return
    }

    const rowStride = ROW_H + ROW_GAP
    const listW = this.rectW - PAD * 2
    div(this, PAD, listTop, listW, listH, {
      key: "interpreter:frames:list",
      scrollContentHeight: Math.max(listH, this.#frames.length * rowStride - ROW_GAP),
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowY: "auto",
      },
      children: (ctx) => {
        const start = Math.max(0, Math.floor(ctx.scrollTop / rowStride) - 1)
        const end = Math.min(this.#frames.length, Math.ceil((ctx.scrollTop + ctx.viewportHeight) / rowStride) + 1)
        for (let idx = start; idx < end; idx++) {
          const frame = this.#frames[idx]
          if (frame === undefined) continue
          const rowY = listTop + idx * rowStride - ctx.scrollTop
          this.#drawRow(frame, PAD, rowY, ctx.viewportWidth, ROW_H)
        }
      },
    })
  }

  #drawHeader(): void {
    const countPad = 18
    const stackLabel = t("frames")
    const stackW = Math.max(74, this.measureText(stackLabel, 12) + this.measureText(String(this.#frames.length), 10) + countPad + 18)

    this.#drawTab(PAD, HEADER_Y, stackW, TAB_H, stackLabel, this.#frames.length)
  }

  #drawTab(x: number, y: number, w: number, h: number, label: string, count: number): void {
    this.drawRoundedRect(x, y, w, h, {
      radius: 7,
      fill: palette.bgHot,
      border: palette.border,
      borderWidth: 1,
      z: Z.ELEMENT,
    })

    const countLabel = String(count)
    const countW = this.measureText(countLabel, 10)
    this.drawText(label, x + 9, y + 6, {
      fontPx: 12,
      material: this.materials.cyan,
      maxWidthPx: Math.max(10, w - countW - 24),
    })
    this.drawText(countLabel, x + w - countW - 9, y + 7, {
      fontPx: 10,
      material: this.materials.text,
      maxWidthPx: countW + 1,
    })
  }

  #drawRow(frame: FrameSnapshot, x: number, y: number, w: number, h: number): void {
    const isActive = frame.index === this.#active

    if (isActive) {
      this.drawRoundedRect(x, y, w, h - 4, {
        radius: 6,
        fill: palette.activeRowFill,
        z: Z.ELEMENT,
      })
    }

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

}

function shortenUrl(url: string): string {
  const clean = displayUrl(url)
  if (clean.length <= 60) return clean
  const parts = clean.split("/")
  return `.../${parts.slice(-2).join("/")}`
}

function displayUrl(url: string): string {
  return urlPath(url)
    .replace(/^(?:\.\.\/)+/, "")
    .replace(/^\.\//, "")
    .replace(/^r\//, "")
}

function urlPath(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "file:" || parsed.protocol === "http:" || parsed.protocol === "https:") {
      return decodeURIComponent(parsed.pathname)
    }
  } catch {}
  return url
}
