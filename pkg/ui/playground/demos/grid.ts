/**
 * Demo: multiple cards в одном canvas, layout-функции вычисляют их rects.
 * Показывает что parallax / containment работают для cards в разных
 * частях canvas (cards в углах не имеют bg-drift).
 */

import {Card, type UiCanvas, palette} from "@metafor/ui"

class LabelCard extends Card {
  constructor(private label: string, bg = palette.bg) {
    super({bgColor: bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText(this.label, 14, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 28,
    })
    this.drawRect(14, 36, this.rectW - 28, 1, palette.borderDim, 0.00002)
    this.drawText(`rect ${Math.round(this.rectW)}×${Math.round(this.rectH)}`, 14, 50, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 28,
    })
    this.drawText("bg/border не уплывают независимо от позиции card на canvas — z близок к layer.z, perspective-divide почти не отличается.", 14, 70, {
      fontPx: 11,
      material: this.materials.text,
      maxWidthPx: this.rectW - 28,
    })
  }
}

export default function gridDemo({canvas}: {canvas: UiCanvas}): void {
  // Topleft.
  canvas.addCard(new LabelCard("top-left"), ({w, h}) => ({
    x: 16, y: 16,
    w: Math.floor(w / 2) - 24, h: Math.floor(h / 2) - 24,
  }))
  // Topright.
  canvas.addCard(new LabelCard("top-right"), ({w, h}) => ({
    x: Math.floor(w / 2) + 8, y: 16,
    w: Math.floor(w / 2) - 24, h: Math.floor(h / 2) - 24,
  }))
  // Bottomleft.
  canvas.addCard(new LabelCard("bottom-left"), ({w, h}) => ({
    x: 16, y: Math.floor(h / 2) + 8,
    w: Math.floor(w / 2) - 24, h: Math.floor(h / 2) - 24,
  }))
  // Bottomright.
  canvas.addCard(new LabelCard("bottom-right"), ({w, h}) => ({
    x: Math.floor(w / 2) + 8, y: Math.floor(h / 2) + 8,
    w: Math.floor(w / 2) - 24, h: Math.floor(h / 2) - 24,
  }))
}
