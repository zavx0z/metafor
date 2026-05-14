/**
 * Reference: Theme — palette, tones, Z-stack.
 *
 * Не интерактивный «компонент», а справочная страница по design-токенам
 * @metafor/ui: какие цвета входят в palette, как работают tone-helpers
 * (toneFill / toneBorder / MaterialPalette.toneText), какие z-уровни
 * используются для слоёв (CONTAINER → SEPARATOR → ELEMENT → ELEMENT_RULE →
 * TEXT).
 */

import {Card, type UiCanvas, palette, toneFill, toneBorder, Z, type Tone, divider} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

const PALETTE_KEYS: Array<keyof typeof palette> = [
  "bg",
  "bgElevated",
  "bgHot",
  "bgInput",
  "bgPanel",
  "bgPanelDim",
  "bgCode",
  "bgToolbar",
  "border",
  "borderDim",
  "borderRule",
  "borderBright",
  "text",
  "muted",
  "cyan",
  "green",
  "orange",
  "red",
  "blue",
  "violet",
  "liveFill",
  "pausedFill",
  "warnFill",
  "activeRowFill",
  "highlightLine",
  "warnText",
  "errorText",
]

const TONES: Tone[] = ["neutral", "live", "paused", "warn"]

class ThemeCard extends Card {
  constructor(
    private readonly p: {
      swatchSize: () => number
      showHex: () => boolean
      gap: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    const PAD = 16
    let y = 14

    this.drawText("palette", PAD, y, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - PAD * 2,
    })
    divider(this, PAD, y + 22, this.rectW - PAD * 2)
    y += 32

    const sw = this.p.swatchSize()
    const gap = this.p.gap()
    const labelW = 96
    const hexW = this.p.showHex() ? 80 : 0
    const rowH = sw + gap

    for (const key of PALETTE_KEYS) {
      if (y + sw > this.rectH - 40) {
        this.drawText("…", PAD, y, {fontPx: 11, material: this.materials.muted})
        break
      }
      const color = palette[key]
      this.drawRect(PAD, y, sw, sw, color, Z.ELEMENT)
      this.drawRect(PAD, y, sw, 1, palette.borderDim, Z.ELEMENT_RULE)
      this.drawRect(PAD, y + sw - 1, sw, 1, palette.borderDim, Z.ELEMENT_RULE)
      this.drawRect(PAD, y, 1, sw, palette.borderDim, Z.ELEMENT_RULE)
      this.drawRect(PAD + sw - 1, y, 1, sw, palette.borderDim, Z.ELEMENT_RULE)
      this.drawText(key, PAD + sw + 10, y + (sw - 11) / 2, {
        fontPx: 11,
        material: this.materials.text,
        maxWidthPx: labelW,
      })
      if (this.p.showHex()) {
        const hex = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
        this.drawText(hex, PAD + sw + 10 + labelW + 6, y + (sw - 11) / 2, {
          fontPx: 10,
          material: this.materials.muted,
          maxWidthPx: hexW,
        })
      }
      y += rowH
    }

    // Tone helpers column.
    const colX = PAD + sw + 10 + labelW + 10 + hexW + 24
    let ty = 14
    this.drawText("tone helpers", colX, ty, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - colX - PAD,
    })
    divider(this, colX, ty + 22, this.rectW - colX - PAD)
    ty += 32
    for (const tone of TONES) {
      this.drawText(`"${tone}"`, colX, ty, {
        fontPx: 11,
        material: this.materials.text,
        maxWidthPx: 120,
      })
      this.drawRect(colX + 76, ty, sw, sw, toneFill(tone), Z.ELEMENT)
      this.drawRect(colX + 76 + sw + 6, ty, sw, sw, toneBorder(tone), Z.ELEMENT)
      this.drawText("toneText", colX + 76 + sw * 2 + 16, ty, {
        fontPx: 11,
        material: this.materials.toneText(tone),
        maxWidthPx: 80,
      })
      ty += rowH
    }

    // Z-stack rendered как горизонтальные полосы с разными z.
    ty += 20
    this.drawText("Z-stack (от низа к верху)", colX, ty, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - colX - PAD,
    })
    divider(this, colX, ty + 22, this.rectW - colX - PAD)
    ty += 30
    const zEntries: Array<[string, number]> = [
      ["CONTAINER", Z.CONTAINER],
      ["SEPARATOR", Z.SEPARATOR],
      ["ELEMENT", Z.ELEMENT],
      ["ELEMENT_RULE", Z.ELEMENT_RULE],
      ["TEXT", Z.TEXT],
    ]
    for (const [name, z] of zEntries) {
      this.drawText(`Z.${name}`, colX, ty, {
        fontPx: 11,
        material: this.materials.text,
        maxWidthPx: 120,
      })
      this.drawText(z.toFixed(5), colX + 130, ty, {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: 80,
      })
      ty += 18
    }
  }
}

function toHex(c: number): string {
  return Math.round(c * 255).toString(16).padStart(2, "0")
}

export default function themeDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Theme & Palette",
    description:
      "Дизайн-токены @metafor/ui. palette содержит цвета фонов, рамок, текста и акцентов. tone-helpers (toneFill / toneBorder) + MaterialPalette.toneText дают консистентный вид для button/badge. Z-константы задают порядок отрисовки внутри Card.",
    breadcrumb: "Reference / Theme",
  })

  params.group({title: "Display"})
  const swatchSize = params.number("swatchSize", {
    label: "swatchSize",
    description: "Размер цветного квадрата в px.",
    default: 18,
    min: 12,
    max: 40,
    step: 1,
    unit: "px",
  })
  const gap = params.number("gap", {
    label: "gap",
    description: "Вертикальный gap между строками палитры.",
    default: 6,
    min: 0,
    max: 20,
    step: 1,
    unit: "px",
  })
  const showHex = params.boolean("showHex", {
    label: "showHex",
    description: "Печатать hex-код рядом с именем цвета.",
    default: true,
  })

  canvas.addCard(new ThemeCard({swatchSize, showHex, gap}), ({w, h}) => ({
    x: 24,
    y: 24,
    w: w - 48,
    h: h - 48,
  }))

  params.onChange(() => canvas.relayout())
}
