/**
 * Component: badge.
 *
 * Маленький tag/индикатор: фон + цветная верхняя линия + tone-text.
 */

import {Card, type UiCanvas, palette, badge, flexRow, divider, type Tone} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

class BadgeCard extends Card {
  constructor(
    private readonly p: {
      label: () => string
      tone: () => Tone
      fontPx: () => number
      height: () => number
      paddingX: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText("badge (this, x, y, w, h, opts)", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const label = this.p.label()
    const tone = this.p.tone()
    const fontPx = this.p.fontPx()
    const h = this.p.height()
    const padX = this.p.paddingX()
    const w = Math.ceil(this.measureText(label, fontPx)) + padX * 2

    this.drawText(`tone="${tone}" fontPx=${fontPx} height=${h} paddingX=${padX}`, 16, 52, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })

    badge(this, 16, 76, w, h, {label, tone, fontPx})

    // Все 4 tone в виде live-индикаторов.
    this.drawText("Реальные примеры использования badge:", 16, 76 + h + 18, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    const examples: Array<{label: string; tone: Tone}> = [
      {label: "ws: connected", tone: "live"},
      {label: "inspector: paused", tone: "paused"},
      {label: "run: error", tone: "warn"},
      {label: "engine: webgpu", tone: "neutral"},
    ]
    flexRow({
      x: 16,
      y: 76 + h + 36,
      w: this.rectW - 32,
      h: 22,
      gap: 8,
      alignItems: "center",
      items: examples.map((e) => ({
        width: Math.ceil(this.measureText(e.label, 11)) + 16,
        height: 22,
        draw: (x, y, ww, hh) => badge(this, x, y, ww, hh, {label: e.label, tone: e.tone}),
      })),
    })
  }
}

export default function badgeDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Badge",
    description: "Компактный индикатор статуса. Состоит из tone-fill (фон), 1-px цветной верхней линии (toneBorder) и подписи (toneText).",
    breadcrumb: "Components / Badge",
  })

  params.group({title: "Props"})
  const label = params.text("label", {
    label: "label",
    type: "string",
    description: "Текст внутри бейджа. Обрезается через maxWidthPx (ширина − 16px на padding по 8px с каждой стороны).",
    default: "ws: connected",
  })
  const tone = params.select<Tone>("tone", {
    label: "tone",
    description: "Тон бейджа: neutral, live (зелёный, успех), paused (оранжевый), warn (красный).",
    default: "live",
    options: ["neutral", "live", "paused", "warn"],
  })
  const fontPx = params.number("fontPx", {
    label: "fontPx",
    description: "Размер шрифта подписи. По умолчанию badge использует 11px.",
    default: 11,
    min: 8,
    max: 18,
    step: 1,
    unit: "px",
  })

  params.group({title: "Geometry"})
  const height = params.number("height", {
    label: "height",
    description: "Высота бейджа в px. Подпись центрируется вертикально.",
    default: 22,
    min: 16,
    max: 48,
    step: 1,
    unit: "px",
  })
  const paddingX = params.number("paddingX", {
    label: "paddingX",
    description: "Внутренний горизонтальный padding (для расчёта ширины бейджа на основе текста).",
    default: 10,
    min: 4,
    max: 32,
    step: 1,
    unit: "px",
  })

  const card = new BadgeCard({label, tone, fontPx, height, paddingX})
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: Math.floor(w / 2 - 280),
    y: 24,
    w: 560,
    h: Math.max(220, h - 48),
  }))
}
