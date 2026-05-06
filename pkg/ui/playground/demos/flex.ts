/**
 * Demo: Flex row/column.
 *
 * 3 области: top — flexRow со space-between, mid — flexRow с grow,
 * bottom — flexColumn со stretch.
 */

import {Card, type UiCanvas, flexRow, flexColumn, palette} from "@metafor/ui"

class FlexCard extends Card {
  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText("Flex row + column", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    this.drawRect(16, 36, this.rectW - 32, 1, palette.borderDim, 0.00002)

    // Top: flexRow space-between.
    this.drawText("flexRow space-between, alignItems center:", 16, 56, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    flexRow({
      x: 16, y: 76, w: this.rectW - 32, h: 40,
      paddingX: 8,
      gap: 12,
      alignItems: "center",
      justifyContent: "space-between",
      items: [
        this.#colorCell("A", palette.cyan, 60, 30),
        this.#colorCell("B", palette.green, 80, 30),
        this.#colorCell("C", palette.orange, 100, 30),
      ],
    })

    // Mid: flexRow with grow.
    this.drawText("flexRow gap=8, middle item grow:", 16, 132, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    flexRow({
      x: 16, y: 152, w: this.rectW - 32, h: 40,
      gap: 8,
      alignItems: "center",
      items: [
        this.#colorCell("fixed 80", palette.cyan, 80, 30),
        {width: "grow", height: 30, draw: (x, y, w, h) => this.#colorCellRaw("grow", palette.violet, x, y, w, h)},
        this.#colorCell("fixed 60", palette.green, 60, 30),
      ],
    })

    // Bottom: flexColumn stretch.
    this.drawText("flexColumn stretch:", 16, 208, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    flexColumn({
      x: 16, y: 228, w: this.rectW - 32, h: this.rectH - 244,
      gap: 6,
      alignItems: "stretch",
      items: [
        {height: 28, draw: (x, y, w, h) => this.#colorCellRaw("row 1", palette.cyan, x, y, w, h)},
        {height: 28, draw: (x, y, w, h) => this.#colorCellRaw("row 2", palette.green, x, y, w, h)},
        {height: "grow", draw: (x, y, w, h) => this.#colorCellRaw("grow row", palette.violet, x, y, w, h)},
        {height: 28, draw: (x, y, w, h) => this.#colorCellRaw("row 4", palette.orange, x, y, w, h)},
      ],
    })
  }

  #colorCell(label: string, color: import("@metafor/engine").Color, w: number, h: number): {
    width: number
    height: number
    draw: (x: number, y: number, ww: number, hh: number) => void
  } {
    return {
      width: w,
      height: h,
      draw: (x, y, ww, hh) => this.#colorCellRaw(label, color, x, y, ww, hh),
    }
  }

  #colorCellRaw(label: string, color: import("@metafor/engine").Color, x: number, y: number, w: number, h: number): void {
    // Translucent цветная плашка с label поверх.
    const fill = new (color.constructor as typeof import("@metafor/engine").Color)(color.r, color.g, color.b, 0.18)
    this.drawRect(x, y, w, h, fill, 0.00004)
    this.drawRect(x, y, w, 1, color, 0.00006)
    this.drawText(label, x + 8, y + (h - 11) / 2, {
      fontPx: 11,
      material: this.materials.text,
      maxWidthPx: w - 16,
    })
  }
}

export default function flexDemo({canvas}: {canvas: UiCanvas}): void {
  canvas.addCard(new FlexCard(), ({w, h}) => ({
    x: 24,
    y: 24,
    w: w - 48,
    h: h - 48,
  }))
}
