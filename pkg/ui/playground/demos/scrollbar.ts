/**
 * Component: scrollbar.
 *
 * Вертикальный scrollbar-widget (track + thumb). Используется внутри
 * scrollList, но можно вызвать отдельно — например в кастомных карточках,
 * где scroll-state управляется руками.
 */

import {Card, type UiCanvas, palette, scrollbar, divider} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

class ScrollbarCard extends Card {
  constructor(
    private readonly p: {
      offset: () => number
      visible: () => number
      total: () => number
      trackWidth: () => number
      minThumbHeight: () => number
      trackHeight: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText("scrollbar (this, x, y, h, opts)", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const offset = this.p.offset()
    const visible = this.p.visible()
    const total = this.p.total()
    const trackWidth = this.p.trackWidth()
    const minThumbHeight = this.p.minThumbHeight()
    const trackH = this.p.trackHeight()

    this.drawText(
      `offset=${offset} visible=${visible} total=${total} trackWidth=${trackWidth} minThumbHeight=${minThumbHeight}`,
      16,
      54,
      {fontPx: 11, material: this.materials.muted, maxWidthPx: this.rectW - 32},
    )

    if (total <= visible) {
      this.drawText("⚠ total ≤ visible — scrollbar скрыт (всё помещается)", 16, 78, {
        fontPx: 11,
        material: this.materials.orange,
        maxWidthPx: this.rectW - 32,
      })
    }

    // Главный preview — рисуем 3 scrollbar'а с разным offset.
    const baseY = 100
    const labels = [
      {label: "offset = current", value: offset},
      {label: "offset = 0 (top)", value: 0},
      {label: "offset = max", value: Math.max(0, total - visible)},
    ]
    const trackX = [40, 180, 320]
    for (let i = 0; i < labels.length; i++) {
      const x = trackX[i]!
      this.drawText(labels[i]!.label, x - 24, baseY - 18, {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: 120,
      })
      scrollbar(this, x, baseY, trackH, {
        offset: labels[i]!.value,
        visible,
        total,
        trackWidth,
        minThumbHeight,
      })
    }
  }
}

export default function scrollbarDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Scrollbar",
    description:
      "scrollbar(card, x, y, h, opts) — track + thumb. Не имеет своего state, принимает offset/visible/total. Используется внутри scrollList или в кастомных списках с собственным scroll-управлением.",
    breadcrumb: "Components / Scrollbar",
  })

  params.group({title: "State"})
  const offset = params.number("offset", {
    label: "offset",
    description: "Текущая позиция прокрутки. 0 — верх; (total − visible) — низ.",
    default: 5,
    min: 0,
    max: 200,
    step: 1,
  })
  const visible = params.number("visible", {
    label: "visible",
    description: "Сколько items видно на экране.",
    default: 8,
    min: 1,
    max: 50,
    step: 1,
  })
  const total = params.number("total", {
    label: "total",
    description: "Всего items в списке. Если total ≤ visible — scrollbar не рисуется.",
    default: 40,
    min: 1,
    max: 500,
    step: 1,
  })

  params.group({title: "Geometry"})
  const trackWidth = params.number("trackWidth", {
    label: "trackWidth",
    description: "Толщина track'а в px (default 4).",
    default: 4,
    min: 2,
    max: 16,
    step: 1,
    unit: "px",
  })
  const minThumbHeight = params.number("minThumbHeight", {
    label: "minThumbHeight",
    description: "Минимальная высота thumb'а в px — чтобы при огромном total он не превращался в точку.",
    default: 16,
    min: 4,
    max: 48,
    step: 1,
    unit: "px",
  })
  const trackHeight = params.number("trackHeight", {
    label: "trackHeight",
    description: "Высота track'а в px (передаётся как 4-й аргумент функции).",
    default: 320,
    min: 80,
    max: 500,
    step: 10,
    unit: "px",
  })

  canvas.addCard(new ScrollbarCard({offset, visible, total, trackWidth, minThumbHeight, trackHeight}), ({w, h}) => ({
    x: Math.floor(w / 2 - 240),
    y: 24,
    w: 480,
    h: Math.max(480, h - 48),
  }))

  params.onChange(() => canvas.relayout())
}
