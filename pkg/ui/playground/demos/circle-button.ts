/**
 * Component: circleButton.
 *
 * Полностью круглая кнопка. Координаты (cx, cy) — центр в card-px,
 * r — радиус. Hit-rect = описанный квадрат.
 */

import {Card, type UiCanvas, palette, circleButton, flexRow, divider, type Tone} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"
import type {Color} from "@metafor/engine"

type ColorKey =
  | "cyan" | "green" | "orange" | "red" | "blue" | "violet"
  | "bg" | "bgElevated" | "bgHot" | "border" | "borderDim" | "text"

class CircleButtonCard extends Card {
  constructor(
    private readonly p: {
      label: () => string
      tone: () => Tone
      radius: () => number
      fontPx: () => number
      labelOffsetY: () => number
      useOffset: () => boolean
      useFillOverride: () => boolean
      fillColor: () => ColorKey
      useBorderOverride: () => boolean
      borderColor: () => ColorKey
      useTextOverride: () => boolean
      textColor: () => ColorKey
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText("circleButton (this, cx, cy, r, opts)", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const label = this.p.label()
    const tone = this.p.tone()
    const r = this.p.radius()
    const fontPx = this.p.fontPx()

    this.drawText(`r=${r} tone="${tone}" fontPx=${fontPx}`, 16, 52, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })

    const cx = 16 + r + 8
    const cy = 80 + r + 8

    const overrides: {fill?: Color; border?: Color; textColor?: Color; labelOffsetY?: number} = {}
    if (this.p.useFillOverride()) overrides.fill = palette[this.p.fillColor()]
    if (this.p.useBorderOverride()) overrides.border = palette[this.p.borderColor()]
    if (this.p.useTextOverride()) overrides.textColor = palette[this.p.textColor()]
    if (this.p.useOffset()) overrides.labelOffsetY = this.p.labelOffsetY()

    circleButton(this, cx, cy, r, {
      label,
      tone,
      fontPx,
      ...overrides,
      action: () => console.log("circle clicked"),
    })

    const compareY = 80 + r * 2 + 32
    this.drawText("Сравнение размеров (r=14, 18, 22, 26):", 16, compareY, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    const sizes = [
      {r: 14, label: "+", tone: "live" as Tone},
      {r: 18, label: "‹", tone: "neutral" as Tone},
      {r: 22, label: "−", tone: "warn" as Tone},
      {r: 26, label: "✓", tone: "neutral" as Tone, fill: palette.cyan, border: palette.cyan},
    ]
    flexRow({
      x: 16,
      y: compareY + 20,
      w: this.rectW - 32,
      h: 60,
      gap: 14,
      alignItems: "center",
      items: sizes.map((s) => ({
        width: s.r * 2 + 4,
        height: s.r * 2 + 4,
        draw: (x, y, ww, hh) =>
          circleButton(this, x + ww / 2, y + hh / 2, s.r, {
            label: s.label,
            tone: s.tone,
            ...("fill" in s ? {fill: s.fill, border: s.border} : {}),
            action: () => {},
          }),
      })),
    })
  }
}

export default function circleButtonDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Circle Button",
    description:
      "Полностью круглая кнопка. (cx, cy) — центр, r — радиус. drawTextCentered учитывает реальный yMin/yMax глифа — «+», «−», «‹» центрируются визуально, а не по cap-box. fill/border/textColor можно переопределить независимо от tone.",
    breadcrumb: "Components / Circle Button",
  })

  const colorOptions: ColorKey[] = [
    "cyan", "green", "orange", "red", "blue", "violet",
    "bg", "bgElevated", "bgHot", "border", "borderDim", "text",
  ]

  params.group({title: "Props"})
  const label = params.text("label", {
    label: "label",
    type: "string",
    description: "Символ или короткая подпись. drawTextCentered центрирует по визуальному bbox глифа (font.getGlyphBounds).",
    default: "+",
  })
  const tone = params.select<Tone>("tone", {
    label: "tone",
    description: "Палитра tone. Можно override через fill/border/textColor.",
    default: "live",
    options: ["neutral", "live", "paused", "warn"],
  })
  const radius = params.number("radius", {
    label: "r",
    type: "number",
    description: "Радиус круга в px. По умолчанию fontPx ≈ r * 0.9. Hit-rect = описанный квадрат 2r×2r.",
    default: 24,
    min: 10,
    max: 48,
    step: 1,
    unit: "px",
  })
  const fontPx = params.number("fontPx", {
    label: "fontPx",
    description: "Размер шрифта подписи. По умолчанию (если не задан) ≈ Math.round(r * 0.9).",
    default: 22,
    min: 8,
    max: 40,
    step: 1,
    unit: "px",
  })

  params.group({title: "Color overrides"})
  const useFillOverride = params.boolean("useFillOverride", {
    label: "fill (override)",
    description: "Переопределить fill (заливку круга) через opts.fill вместо toneFill(tone).",
    default: false,
  })
  const fillColor = params.select<ColorKey>("fillColor", {
    label: "fillColor",
    description: "Цвет fill из palette.",
    default: "cyan",
    options: colorOptions,
  })
  const useBorderOverride = params.boolean("useBorderOverride", {
    label: "border (override)",
    description: "Переопределить рамку через opts.border вместо toneBorder(tone).",
    default: false,
  })
  const borderColor = params.select<ColorKey>("borderColor", {
    label: "borderColor",
    description: "Цвет рамки из palette.",
    default: "cyan",
    options: colorOptions,
  })
  const useTextOverride = params.boolean("useTextOverride", {
    label: "textColor (override)",
    description: "Переопределить цвет подписи через opts.textColor (Color, не material).",
    default: false,
  })
  const textColor = params.select<ColorKey>("textColor", {
    label: "textColor",
    description: "Цвет подписи из palette.",
    default: "bg",
    options: colorOptions,
  })

  params.group({title: "Legacy alignment"})
  const useOffset = params.boolean("useOffset", {
    label: "useOffset",
    description: "Если включено, используется старая cap-box-центровка через labelOffsetY вместо новой bbox-aware drawTextCentered.",
    default: false,
  })
  const labelOffsetY = params.number("labelOffsetY", {
    label: "labelOffsetY",
    description: "Сдвиг подписи по Y в долях fontPx (legacy). Отрицательное — выше центра.",
    default: -0.08,
    min: -0.5,
    max: 0.5,
    step: 0.01,
  })

  const card = new CircleButtonCard({
    label, tone, radius, fontPx, labelOffsetY, useOffset,
    useFillOverride, fillColor,
    useBorderOverride, borderColor,
    useTextOverride, textColor,
  })
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: Math.floor(w / 2 - 280),
    y: 24,
    w: 560,
    h: Math.max(240, h - 48),
  }))
}
