/**
 * Component: roundedButton.
 *
 * Кнопка со скруглением border-radius (вплоть до capsule). Скругление
 * рисуется через 1-px horizontal strips с косинусным insetом — без шейдеров.
 */

import {Card, type UiCanvas, palette, roundedButton, flexRow, divider, type Tone} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"
import {TextMaterial, type Color} from "@metafor/engine"

type ColorKey = "cyan" | "green" | "orange" | "red" | "blue" | "violet" | "bg" | "bgElevated" | "bgHot" | "border" | "borderDim"

class RoundedButtonCard extends Card {
  #fillMaterials = new Map<string, TextMaterial>()

  constructor(
    private readonly p: {
      label: () => string
      tone: () => Tone
      fontPx: () => number
      radius: () => number
      width: () => number
      height: () => number
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
    this.drawText("roundedButton (this, x, y, w, h, opts)", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const label = this.p.label()
    const tone = this.p.tone()
    const fontPx = this.p.fontPx()
    const radius = this.p.radius()
    const w = this.p.width()
    const h = this.p.height()

    const overrides: {fill?: Color; border?: Color; textMaterial?: TextMaterial} = {}
    if (this.p.useFillOverride()) overrides.fill = palette[this.p.fillColor()]
    if (this.p.useBorderOverride()) overrides.border = palette[this.p.borderColor()]
    if (this.p.useTextOverride()) overrides.textMaterial = this.#materialFor(this.p.textColor())

    this.drawText(`radius=${radius} tone="${tone}" fontPx=${fontPx} w=${w} h=${h}`, 16, 52, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })

    roundedButton(this, 16, 76, w, h, {
      label,
      tone,
      fontPx,
      radius,
      ...overrides,
      action: () => console.log("rounded clicked"),
    })

    this.drawText("Сравнение radius (0, 4, 8, capsule = min(w,h)/2):", 16, 76 + h + 18, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    const compare = [
      {label: "r=0", radius: 0, tone: "neutral" as Tone},
      {label: "r=4", radius: 4, tone: "neutral" as Tone},
      {label: "r=8", radius: 8, tone: "live" as Tone},
      {label: "capsule", tone: "warn" as Tone},
    ]
    flexRow({
      x: 16,
      y: 76 + h + 36,
      w: this.rectW - 32,
      h: 32,
      gap: 8,
      alignItems: "center",
      items: compare.map((c) => ({
        width: 100,
        height: 32,
        draw: (x, y, ww, hh) =>
          roundedButton(this, x, y, ww, hh, {
            label: c.label,
            tone: c.tone,
            fontPx,
            ...("radius" in c ? {radius: c.radius} : {}),
            action: () => {},
          }),
      })),
    })
  }

  #materialFor(key: ColorKey): TextMaterial {
    let mat = this.#fillMaterials.get(key)
    if (mat === undefined) {
      mat = new TextMaterial({color: palette[key]})
      this.#fillMaterials.set(key, mat)
    }
    return mat
  }
}

export default function roundedButtonDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Rounded Button",
    description:
      "Кнопка с настраиваемым border-radius. При radius = min(w,h)/2 превращается в capsule. fill/border/textMaterial можно переопределить независимо от tone — полезно для брендовых акцентов поверх стандартной палитры.",
    breadcrumb: "Components / Rounded Button",
  })

  const colorOptions: ColorKey[] = [
    "cyan", "green", "orange", "red", "blue", "violet",
    "bg", "bgElevated", "bgHot", "border", "borderDim",
  ]

  params.group({title: "Props"})
  const label = params.text("label", {
    label: "label",
    type: "string",
    description: "Текст на кнопке. Центрируется через drawTextCentered (по визуальному bbox глифа).",
    default: "Confirm",
  })
  const tone = params.select<Tone>("tone", {
    label: "tone",
    description: "Палитра tone — если override'ы выключены, заполнение/рамка/текст берутся из неё.",
    default: "live",
    options: ["neutral", "live", "paused", "warn"],
  })
  const radius = params.number("radius", {
    label: "radius",
    description: "Border-radius в px. 0 — острые углы, min(w,h)/2 — полная capsule-форма.",
    default: 8,
    min: 0,
    max: 40,
    step: 1,
    unit: "px",
  })
  const fontPx = params.number("fontPx", {
    label: "fontPx",
    description: "Размер шрифта подписи в logical-px.",
    default: 12,
    min: 8,
    max: 24,
    step: 1,
    unit: "px",
  })

  params.group({title: "Geometry"})
  const width = params.number("width", {
    label: "width",
    description: "Ширина кнопки в px (4-й аргумент функции).",
    default: 140,
    min: 40,
    max: 320,
    step: 2,
    unit: "px",
  })
  const height = params.number("height", {
    label: "height",
    description: "Высота кнопки в px.",
    default: 36,
    min: 20,
    max: 80,
    step: 1,
    unit: "px",
  })

  params.group({title: "Color overrides"})
  const useFillOverride = params.boolean("useFillOverride", {
    label: "fill (override)",
    description: "Переопределить fill через opts.fill вместо toneFill(tone).",
    default: false,
  })
  const fillColor = params.select<ColorKey>("fillColor", {
    label: "fillColor",
    description: "Цвет fill из palette. Активен если fill override включён.",
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
    label: "textMaterial (override)",
    description: "Переопределить материал текста подписи через opts.textMaterial.",
    default: false,
  })
  const textColor = params.select<ColorKey>("textColor", {
    label: "textColor",
    description: "Цвет подписи из palette.",
    default: "bg",
    options: colorOptions,
  })

  const card = new RoundedButtonCard({
    label,
    tone,
    fontPx,
    radius,
    width,
    height,
    useFillOverride,
    fillColor,
    useBorderOverride,
    borderColor,
    useTextOverride,
    textColor,
  })
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: Math.floor(w / 2 - 300),
    y: 24,
    w: 600,
    h: Math.max(220, h - 48),
  }))
}
