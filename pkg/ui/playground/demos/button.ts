/**
 * Component: button.
 *
 * Прямоугольная кнопка с фоном, рамкой и подписью. Параметры на правой
 * панели позволяют переключать tone, размер шрифта и текст label.
 */

import {Card, type UiCanvas, palette, button, autoButtonWidth, flexRow, divider, type Tone} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

class ButtonCard extends Card {
  constructor(
    private readonly p: {
      label: () => string
      tone: () => Tone
      fontPx: () => number
      paddingX: () => number
      height: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText("button (this, x, y, w, h, opts)", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const label = this.p.label()
    const tone = this.p.tone()
    const fontPx = this.p.fontPx()
    const padX = this.p.paddingX()
    const h = this.p.height()
    const w = autoButtonWidth(this, label, fontPx, padX)

    this.drawText(`tone="${tone}" fontPx=${fontPx} paddingX=${padX} height=${h}`, 16, 52, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })

    // Главный preview.
    button(this, 16, 76, w, h, {label, tone, fontPx, action: () => console.log("clicked", label)})

    // Tone-сравнение.
    this.drawText("Все 4 tone-варианта:", 16, 76 + h + 18, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    const tones: Tone[] = ["neutral", "live", "paused", "warn"]
    const labels = ["Cancel", "Run", "Pause", "Stop"]
    flexRow({
      x: 16,
      y: 76 + h + 36,
      w: this.rectW - 32,
      h,
      gap: 8,
      alignItems: "center",
      items: tones.map((t, i) => ({
        width: autoButtonWidth(this, labels[i]!, fontPx, padX),
        height: h,
        draw: (x, y, ww, hh) =>
          button(this, x, y, ww, hh, {label: labels[i]!, tone: t, fontPx, action: () => {}}),
      })),
    })
  }
}

export default function buttonDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Button",
    description: "Прямоугольная кнопка с фоном (toneFill), 1-px рамкой (toneBorder) и центрированной подписью (toneText). Регистрирует hit-rect внутри Card.",
    breadcrumb: "Components / Button",
  })

  params.group({title: "Props"})
  const label = params.text("label", {
    label: "label",
    type: "string",
    description: "Текст на кнопке. Центрируется через measureText + автообрезание по maxWidthPx.",
    default: "Save changes",
  })
  const tone = params.select<Tone>("tone", {
    label: "tone",
    description:
      "Палитра tone: neutral — bgElevated/border/text, live — green-fill+border+text, paused — orange, warn — red.",
    default: "neutral",
    options: ["neutral", "live", "paused", "warn"],
  })
  const fontPx = params.number("fontPx", {
    label: "fontPx",
    description: "Размер шрифта подписи в logical-px. Влияет также на autoButtonWidth.",
    default: 12,
    min: 8,
    max: 24,
    step: 1,
    unit: "px",
  })

  params.group({title: "Geometry"})
  const paddingX = params.number("paddingX", {
    label: "paddingX",
    description: "Горизонтальный padding кнопки в px. autoButtonWidth(label, fontPx, paddingX) → ширина кнопки.",
    default: 14,
    min: 0,
    max: 40,
    step: 1,
    unit: "px",
  })
  const height = params.number("height", {
    label: "height",
    description: "Высота кнопки в px. Подпись центрируется по вертикали.",
    default: 28,
    min: 18,
    max: 64,
    step: 1,
    unit: "px",
  })

  const card = new ButtonCard({label, tone, fontPx, paddingX, height})
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: Math.floor(w / 2 - 280),
    y: 24,
    w: 560,
    h: Math.max(220, h - 48),
  }))
}
