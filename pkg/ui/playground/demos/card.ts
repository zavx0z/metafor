/**
 * Demo: Card basics.
 *
 * Простая карточка по центру canvas. Показывает: bg, border, header,
 * текст с автотуркацией, divider.
 */

import {Card, type UiCanvas, palette} from "@metafor/ui"

class HelloCard extends Card {
  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    // Title.
    this.drawText("Card basics", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    // Divider.
    this.drawRect(16, 36, this.rectW - 32, 1, palette.borderDim, 0.00002)
    // Body text — длинный, специально длиннее карточки чтобы видеть ellipsis.
    const long = "Этот текст специально длиннее карточки чтобы показать что Card.drawText обрезает его через измерение шрифт-метрик и добавляет многоточие — никаких overflow."
    this.drawText(long, 16, 50, {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: this.rectW - 32,
    })
    // Caption.
    this.drawText("bg/border managed by Card; drawText fits via font.getHMetric", 16, this.rectH - 24, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
  }
}

export default function cardDemo({canvas}: {canvas: UiCanvas}): void {
  canvas.addCard(new HelloCard(), ({w, h}) => ({
    x: Math.floor(w / 2 - 200),
    y: Math.floor(h / 2 - 80),
    w: 400,
    h: 160,
  }))
}
