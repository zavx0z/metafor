/**
 * Demo: scrollable list через scrollList widget из @metafor/ui.
 *
 * ScrollListState владеет scroll/scrollAccum, scrollList рисует видимые
 * rows + scrollbar, wheelScrollStep обрабатывает wheel.
 */

import {
  Card,
  type UiCanvas,
  palette,
  divider,
  ScrollListState,
  scrollList,
  wheelScrollStep,
  Z,
} from "@metafor/ui"

const ROW_H = 28
const PAD = 14

class ScrollListCard extends Card {
  #items: Array<{title: string; subtitle: string}>
  #list = new ScrollListState()
  #active = 0

  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
    this.#items = Array.from({length: 64}, (_, i) => ({
      title: `Item #${i + 1}`,
      subtitle: `subtitle for row ${i + 1} — описание чтобы видеть как обрезается длинный текст когда не хватает ширины`,
    }))
  }

  onWheel(event: WheelEvent): void {
    const visible = this.#visibleRows()
    if (wheelScrollStep(this.#list, event, ROW_H, this.#items.length, visible)) {
      this.requestRender()
    }
  }

  protected render(): void {
    // Header.
    this.drawText("Scrollable list", PAD, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - PAD * 2 - 80,
    })
    const countLabel = `${this.#items.length} items`
    const countW = this.measureText(countLabel, 11)
    this.drawText(countLabel, this.rectW - PAD - countW, 16, {
      fontPx: 11,
      material: this.materials.muted,
    })
    divider(this, PAD, 36, this.rectW - PAD * 2)

    const listTop = 46
    const listH = this.rectH - listTop - 8

    scrollList(this, {
      state: this.#list,
      items: this.#items,
      rowH: ROW_H,
      x: PAD,
      y: listTop,
      w: this.rectW - PAD * 2,
      h: listH,
      drawRow: (item, idx, x, y, w, h) => this.#drawRow(idx, item, x, y, w, h),
    })
  }

  #drawRow(
    idx: number,
    item: {title: string; subtitle: string},
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const isActive = idx === this.#active
    if (isActive) this.drawRect(x, y, w, h - 2, palette.bgHot, Z.ELEMENT)

    const numLabel = `#${idx + 1}`
    this.drawText(numLabel, x + 8, y + 5, {
      fontPx: 11,
      material: isActive ? this.materials.orange : this.materials.muted,
      maxWidthPx: 36,
    })
    this.drawText(item.title, x + 48, y + 4, {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: w - 56,
    })
    this.drawText(item.subtitle, x + 48, y + 16, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: w - 56,
    })

    this.hit(x, y, w, h, () => {
      this.#active = idx
      this.requestRender()
    })
  }

  #visibleRows(): number {
    return Math.max(1, Math.floor((this.rectH - 46 - 8) / ROW_H))
  }
}

export default function scrollDemo({canvas}: {canvas: UiCanvas}): void {
  canvas.addCard(new ScrollListCard(), ({w, h}) => ({
    x: 24,
    y: 24,
    w: Math.min(w - 48, 560),
    h: h - 48,
  }))
}
