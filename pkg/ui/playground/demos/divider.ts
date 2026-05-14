/**
 * Component: divider.
 *
 * Горизонтальная разделительная линия. Координата y — центр линии,
 * y нарисуется в y − thickness/2 для нечётного thickness.
 */

import {Card, type UiCanvas, palette, divider, Z} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

type ColorKey = "borderDim" | "border" | "borderBright" | "cyan" | "green" | "orange" | "red" | "violet"
type ZKey = "CONTAINER" | "SEPARATOR" | "ELEMENT" | "ELEMENT_RULE" | "TEXT"

class DividerCard extends Card {
  constructor(
    private readonly p: {
      thickness: () => number
      color: () => ColorKey
      widthPercent: () => number
      zKey: () => ZKey
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText("divider (this, x, y, w, opts)", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })

    const t = this.p.thickness()
    const colorKey = this.p.color()
    const pct = this.p.widthPercent()
    const zKey = this.p.zKey()
    const w = Math.round((this.rectW - 32) * (pct / 100))
    const x = 16 + ((this.rectW - 32) - w) / 2

    this.drawText(`thickness=${t} color="${colorKey}" width=${pct}% z=Z.${zKey}`, 16, 36, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })

    // Главный preview.
    divider(this, x, 80, w, {color: palette[colorKey], thickness: t, z: Z[zKey]})

    // Сравнение всех вариантов.
    this.drawText("Сравнение thickness 1, 2, 4 и цветов:", 16, 110, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    const samples: Array<{label: string; t: number; color: ColorKey}> = [
      {label: "thickness=1 borderDim", t: 1, color: "borderDim"},
      {label: "thickness=2 border", t: 2, color: "border"},
      {label: "thickness=4 cyan", t: 4, color: "cyan"},
      {label: "thickness=1 orange", t: 1, color: "orange"},
    ]
    let y = 140
    for (const s of samples) {
      this.drawText(s.label, 16, y, {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: this.rectW - 32,
      })
      divider(this, 16, y + 18, this.rectW - 32, {color: palette[s.color], thickness: s.t})
      y += 36
    }
  }
}

export default function dividerDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Divider",
    description: "Горизонтальная разделительная линия. Минимальный widget — обёртка над drawRect, позволяющая управлять цветом, толщиной и z-уровнем.",
    breadcrumb: "Components / Divider",
  })

  params.group({title: "Props"})
  const thickness = params.number("thickness", {
    label: "thickness",
    description: "Толщина линии в px. Default 1. Линия рисуется в y − thickness/2 для центрирования.",
    default: 1,
    min: 1,
    max: 10,
    step: 1,
    unit: "px",
  })
  const color = params.select<ColorKey>("color", {
    label: "color",
    description: "Цвет линии из palette. Default — palette.borderDim.",
    default: "borderDim",
    options: ["borderDim", "border", "borderBright", "cyan", "green", "orange", "red", "violet"],
  })

  params.group({title: "Geometry"})
  const widthPercent = params.number("widthPercent", {
    label: "width",
    type: "% of canvas",
    description: "Ширина линии в процентах от внутренней ширины карточки.",
    default: 100,
    min: 10,
    max: 100,
    step: 5,
    unit: "%",
  })

  params.group({title: "Z-stack"})
  const zKey = params.select<ZKey>("zKey", {
    label: "z",
    type: "Z constant",
    description:
      "Z-уровень из constants Z: CONTAINER < SEPARATOR < ELEMENT < ELEMENT_RULE < TEXT. По умолчанию divider использует Z.SEPARATOR.",
    default: "SEPARATOR",
    options: ["CONTAINER", "SEPARATOR", "ELEMENT", "ELEMENT_RULE", "TEXT"],
  })

  const card = new DividerCard({thickness, color, widthPercent, zKey})
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: Math.floor(w / 2 - 300),
    y: 24,
    w: 600,
    h: Math.max(320, h - 48),
  }))
}
