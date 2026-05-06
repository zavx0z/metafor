/**
 * Demo: scrollable list.
 *
 * Демонстрирует Card с длинным списком rows. Wheel-event скроллит.
 * Active row highlight + hit-test для select.
 */

import {Card, type UiCanvas, flexColumn, palette, divider, scrollbar, Z} from "@metafor/ui"

const ROW_H = 28
const PAD = 14
const SCROLLBAR_W = 6

class ScrollListCard extends Card {
  #items: Array<{title: string; subtitle: string}>
  #scroll = 0
  #scrollAccum = 0
  #active = 0

  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
    this.#items = Array.from({length: 64}, (_, i) => ({
      title: `Item #${i + 1}`,
      subtitle: `subtitle for row ${i + 1} — описание чтобы видеть как обрезается длинный текст когда не хватает ширины`,
    }))
  }

  // event.deltaY на тачпаде обычно 0.5–3 в pixel-mode, поэтому
  // event.deltaY/20 < 1 → Math.trunc = 0 → шаг не делается. Накапливаем
  // дробную часть в #scrollAccum и отщипываем целые row-step'ы.
  onWheel(event: WheelEvent): void {
    const visible = this.#visibleRows()
    const max = Math.max(0, this.#items.length - visible)
    const linesDelta = event.deltaMode === 1
      ? event.deltaY
      : event.deltaMode === 2
        ? event.deltaY * visible
        : (this.#scrollAccum + event.deltaY) / ROW_H
    const stepLines = Math.trunc(linesDelta)
    if (event.deltaMode === 0) {
      this.#scrollAccum = (this.#scrollAccum + event.deltaY) - stepLines * ROW_H
    } else {
      this.#scrollAccum = 0
    }
    if (stepLines === 0) return
    const next = Math.max(0, Math.min(max, this.#scroll + stepLines))
    if (next === this.#scroll) return
    this.#scroll = next
    this.requestRender()
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

    // Body — flexColumn с rows.
    const listTop = 46
    const listH = this.rectH - listTop - 8
    const visible = this.#visibleRows()
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#items.length - visible)))

    const rows = []
    for (let i = 0; i < visible; i++) {
      const idx = this.#scroll + i
      const item = this.#items[idx]
      if (item === undefined) break
      rows.push({
        height: ROW_H,
        draw: (x: number, y: number, w: number, _h: number) => this.#drawRow(idx, item, x, y, w),
      })
    }
    // Список занимает rectW минус scrollbar gutter справа.
    // paddingRight включает место под scrollbar (6px) + сам scrollbar (SCROLLBAR_W) + правый PAD —
    // иначе row.w заходит ПОД scrollbar и highlight перекрывает thumb.
    flexColumn({
      x: 0, y: listTop, w: this.rectW, h: listH,
      paddingLeft: PAD, paddingRight: PAD + SCROLLBAR_W + 6,
      gap: 0,
      items: rows,
    })

    // Scrollbar справа.
    scrollbar(this, this.rectW - PAD - SCROLLBAR_W, listTop, listH, {
      offset: this.#scroll,
      visible,
      total: this.#items.length,
      trackWidth: SCROLLBAR_W,
    })
  }

  #drawRow(idx: number, item: {title: string; subtitle: string}, x: number, y: number, w: number): void {
    const isActive = idx === this.#active
    if (isActive) this.drawRect(x, y, w, ROW_H - 2, palette.bgHot, Z.ELEMENT)

    // #N в gutter.
    const numLabel = `#${idx + 1}`
    this.drawText(numLabel, x + 8, y + 5, {
      fontPx: 11,
      material: isActive ? this.materials.orange : this.materials.muted,
      maxWidthPx: 36,
    })
    // title.
    this.drawText(item.title, x + 48, y + 4, {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: w - 56,
    })
    // subtitle (smaller).
    this.drawText(item.subtitle, x + 48, y + 16, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: w - 56,
    })

    this.hit(x, y, w, ROW_H, () => {
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
