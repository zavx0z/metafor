/**
 * Frames pane. Layout — flexRow/flexColumn/div из @metafor/elements.
 */

import {
  UiSurface, Z, div, flexRow, flexColumn, palette, radii,
} from "@metafor/elements"
import {
  Divider as divider,
} from "@metafor/components"
import type {DebugModuleSnapshot, FrameSnapshot} from "./debug-ui.ts"
import {t} from "./i18n.ts"

const PAD = 14
const TAB_H = 24
const HEADER_Y = 8
const ROW_H = 32
const MODULE_ROW_H = 38
const ROW_GAP = 2
type FramesTab = "stack" | "modules"

export class FramesPane extends UiSurface {
  #frames: FrameSnapshot[] = []
  #modules: DebugModuleSnapshot[] = []
  #active = 0
  #tab: FramesTab = "stack"
  readonly #onSelect: (index: number) => void
  readonly #onModuleSelect: (module: DebugModuleSnapshot) => void

  constructor(onSelect: (index: number) => void, onModuleSelect: (module: DebugModuleSnapshot) => void = () => {}) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.#onSelect = onSelect
    this.#onModuleSelect = onModuleSelect
  }

  setFrames(frames: FrameSnapshot[], active: number): void {
    this.#frames = frames
    this.#active = active
    this.requestRender()
  }

  setModules(modules: DebugModuleSnapshot[]): void {
    this.#modules = modules
    this.requestRender()
  }

  protected render(): void {
    this.#drawTabs()
    divider(this, PAD, HEADER_Y + TAB_H + 10, this.rectW - PAD * 2)

    const listTop = HEADER_Y + TAB_H + 20
    const listH = Math.max(0, this.rectH - listTop - 8)

    if (this.#tab === "modules") {
      this.#drawModules(listTop, listH)
      return
    }

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
      key: "debug:frames:list",
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

  #drawTabs(): void {
    const gap = 6
    const countPad = 18
    const stackLabel = t("frames")
    const modulesLabel = t("modules")
    const stackW = Math.max(74, this.measureText(stackLabel, 12) + this.measureText(String(this.#frames.length), 10) + countPad + 18)
    const modulesW = Math.max(88, this.measureText(modulesLabel, 12) + this.measureText(String(this.#modules.length), 10) + countPad + 18)

    let x = PAD
    this.#drawTab("stack", x, HEADER_Y, stackW, TAB_H, stackLabel, this.#frames.length)
    x += stackW + gap
    this.#drawTab("modules", x, HEADER_Y, modulesW, TAB_H, modulesLabel, this.#modules.length)
  }

  #drawTab(tab: FramesTab, x: number, y: number, w: number, h: number, label: string, count: number): void {
    const active = this.#tab === tab
    this.drawRoundedRect(x, y, w, h, {
      radius: 7,
      fill: active ? palette.bgHot : palette.transparent,
      border: active ? palette.border : palette.borderDim,
      borderWidth: 1,
      z: Z.ELEMENT,
    })

    const labelMaterial = active ? this.materials.cyan : this.materials.muted
    const countLabel = String(count)
    const countW = this.measureText(countLabel, 10)
    this.drawText(label, x + 9, y + 6, {
      fontPx: 12,
      material: labelMaterial,
      maxWidthPx: Math.max(10, w - countW - 24),
    })
    this.drawText(countLabel, x + w - countW - 9, y + 7, {
      fontPx: 10,
      material: active ? this.materials.text : this.materials.muted,
      maxWidthPx: countW + 1,
    })
    this.hit(x, y, w, h, () => {
      if (this.#tab === tab) return
      this.#tab = tab
      this.requestRender()
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

  #drawModules(listTop: number, listH: number): void {
    if (this.#modules.length === 0) {
      this.drawText(t("modulesEmpty"), PAD + 4, listTop + 6, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD * 2 - 8,
      })
      return
    }

    const rowStride = MODULE_ROW_H + ROW_GAP
    const listW = this.rectW - PAD * 2
    div(this, PAD, listTop, listW, listH, {
      key: "debug:modules:list",
      scrollContentHeight: Math.max(listH, this.#modules.length * rowStride - ROW_GAP),
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowY: "auto",
      },
      children: (ctx) => {
        const start = Math.max(0, Math.floor(ctx.scrollTop / rowStride) - 1)
        const end = Math.min(this.#modules.length, Math.ceil((ctx.scrollTop + ctx.viewportHeight) / rowStride) + 1)
        for (let idx = start; idx < end; idx++) {
          const module = this.#modules[idx]
          if (module === undefined) continue
          const rowY = listTop + idx * rowStride - ctx.scrollTop
          this.#drawModuleRow(module, PAD, rowY, ctx.viewportWidth, MODULE_ROW_H)
        }
      },
    })
  }

  #drawModuleRow(module: DebugModuleSnapshot, x: number, y: number, w: number, h: number): void {
    const label = moduleDisplayName(module.url)
    const detail = shortenUrl(module.url)
    const bpLabel = module.breakpointCount > 0 ? `bp ${module.breakpointCount}` : ""
    const bpW = bpLabel.length === 0 ? 0 : this.measureText(bpLabel, 9) + 10

    this.drawRoundedRect(x, y, w, h - 4, {
      radius: 6,
      fill: palette.transparent,
      border: palette.borderRule,
      borderWidth: 1,
      opacity: 0.64,
      z: Z.ELEMENT,
    })

    flexRow({
      x, y, w, h: h - 4,
      paddingX: 10,
      gap: 8,
      alignItems: "center",
      items: [
        {
          width: "grow", height: 30,
          draw: (cx, cy, cw) => {
            flexColumn({
              x: cx, y: cy, w: cw, h: 30, gap: 3,
              items: [
                {
                  height: 13,
                  draw: (tx, ty, tw) => this.drawText(label, tx, ty, {
                    fontPx: 12, material: this.materials.text, maxWidthPx: tw,
                  }),
                },
                {
                  height: 10,
                  draw: (tx, ty, tw) => this.drawText(detail, tx, ty, {
                    fontPx: 9, material: this.materials.muted, maxWidthPx: tw,
                  }),
                },
              ],
            })
          },
        },
        {
          width: bpW, height: 10,
          draw: (cx, cy, cw) => {
            if (bpLabel.length === 0) return
            this.drawText(bpLabel, cx, cy + 1, {
              fontPx: 9,
              material: this.materials.orange,
              maxWidthPx: cw,
            })
          },
        },
      ],
    })

    this.hit(x, y, w, h - 4, () => this.#onModuleSelect(module))
  }

}

function shortenUrl(url: string): string {
  if (url.length <= 60) return url
  const parts = url.split("/")
  return `.../${parts.slice(-2).join("/")}`
}

function moduleDisplayName(url: string): string {
  const clean = urlPath(url)
  const parts = clean.split(/[\\/]/).filter((part) => part.length > 0 && part !== ".")
  if (parts.length === 0) return clean || "module"
  return parts.slice(-2).join("/")
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
