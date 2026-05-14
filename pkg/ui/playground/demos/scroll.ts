/**
 * Component: scrollList — scrollable list через scrollList widget.
 *
 * ScrollListState владеет scroll/scrollAccum, scrollList рисует видимые
 * rows + scrollbar, applyWheel обрабатывает wheel-события. Поддерживает
 * rowGap, кастомизацию scrollbar'а и edgeFade — мягкое растворение
 * частично видимых строк сверху/снизу.
 */

import {Card, type UiCanvas, palette, divider, ScrollListState, scrollList, Z} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

const PAD = 14

class ScrollListCard extends Card {
  #items: Array<{title: string; subtitle: string}> = []
  #list: ScrollListState
  #active = 0
  #cachedCount = -1

  constructor(
    private readonly p: {
      itemCount: () => number
      rowH: () => number
      rowGap: () => number
      titleFontPx: () => number
      subtitleFontPx: () => number
      showSubtitle: () => boolean
      title: () => string
      scrollbarWidth: () => number
      scrollbarGap: () => number
      hideScrollbarWhenFits: () => boolean
      useEdgeFade: () => boolean
      edgeFadeSize: () => number
      edgeFadeAlpha: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
    this.#list = new ScrollListState({onChange: () => this.requestRender()})
  }

  onWheel(event: WheelEvent): void {
    this.#list.applyWheel(event, this.p.rowH() + this.p.rowGap(), this.#items.length, this.#visibleRows())
  }

  protected render(): void {
    this.#syncItems()
    const rowH = this.p.rowH()

    this.drawText(this.p.title(), PAD, 14, {
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
    if (listH < rowH) return

    scrollList(this, {
      state: this.#list,
      items: this.#items,
      rowH,
      rowGap: this.p.rowGap(),
      x: PAD,
      y: listTop,
      w: this.rectW - PAD * 2,
      h: listH,
      scrollbarWidth: this.p.scrollbarWidth(),
      scrollbarGap: this.p.scrollbarGap(),
      hideScrollbarWhenFits: this.p.hideScrollbarWhenFits(),
      ...(this.p.useEdgeFade()
        ? {
            edgeFade: {
              color: palette.bg,
              sizePx: this.p.edgeFadeSize(),
              maxAlpha: this.p.edgeFadeAlpha(),
              top: true,
              bottom: true,
            },
          }
        : {}),
      drawRow: (item, idx, x, y, w, h) => this.#drawRow(idx, item, x, y, w, h),
    })
  }

  #syncItems(): void {
    const want = this.p.itemCount()
    if (want === this.#cachedCount) return
    this.#cachedCount = want
    this.#items = Array.from({length: want}, (_, i) => ({
      title: `Item #${i + 1}`,
      subtitle: `subtitle for row ${i + 1} — описание чтобы видеть обрезание длинных строк`,
    }))
    if (this.#active >= want) this.#active = Math.max(0, want - 1)
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
    const showSubtitle = this.p.showSubtitle()
    const titleFontPx = this.p.titleFontPx()
    const subtitleFontPx = this.p.subtitleFontPx()

    this.drawText(numLabel, x + 8, y + 5, {
      fontPx: 11,
      material: isActive ? this.materials.orange : this.materials.muted,
      maxWidthPx: 36,
    })
    this.drawText(item.title, x + 48, y + 4, {
      fontPx: titleFontPx,
      material: this.materials.text,
      maxWidthPx: w - 56,
    })
    if (showSubtitle) {
      this.drawText(item.subtitle, x + 48, y + 4 + titleFontPx + 2, {
        fontPx: subtitleFontPx,
        material: this.materials.muted,
        maxWidthPx: w - 56,
      })
    }

    this.hit(x, y, w, h, () => {
      this.#active = idx
      this.requestRender()
    })
  }

  #visibleRows(): number {
    return Math.max(1, Math.floor((this.rectH - 46 - 8) / (this.p.rowH() + this.p.rowGap())))
  }
}

export default function scrollDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Scroll List",
    description:
      "scrollList(card, opts) рисует видимые rows + scrollbar; ScrollListState хранит scroll-offset + inertia; applyWheel(event, rowH, total, visibleRows) сглаживает wheel-события. Поддерживает rowGap, edgeFade (мягкое растворение края), кастомный scrollbar.",
    breadcrumb: "Components / Scroll List",
  })

  params.group({title: "List"})
  const title = params.text("title", {
    label: "title",
    description: "Заголовок списка над divider'ом.",
    default: "Scrollable list",
  })
  const itemCount = params.number("itemCount", {
    label: "items",
    type: "number",
    description: "Количество элементов в списке. Scrollbar отображается только если total > visible.",
    default: 64,
    min: 1,
    max: 500,
    step: 1,
  })

  params.group({title: "Row"})
  const rowH = params.number("rowH", {
    label: "rowH",
    description: "Высота одной row в px. Используется при отрисовке и в applyWheel для шага колеса.",
    default: 28,
    min: 16,
    max: 80,
    step: 1,
    unit: "px",
  })
  const rowGap = params.number("rowGap", {
    label: "rowGap",
    description: "Расстояние между rows в px. Стрид = rowH + rowGap.",
    default: 0,
    min: 0,
    max: 24,
    step: 1,
    unit: "px",
  })
  const titleFontPx = params.number("titleFontPx", {
    label: "title fontPx",
    description: "Размер шрифта title в каждом item.",
    default: 12,
    min: 8,
    max: 20,
    step: 1,
    unit: "px",
  })
  const subtitleFontPx = params.number("subtitleFontPx", {
    label: "subtitle fontPx",
    description: "Размер шрифта subtitle (если включён).",
    default: 9,
    min: 7,
    max: 16,
    step: 1,
    unit: "px",
  })
  const showSubtitle = params.boolean("showSubtitle", {
    label: "showSubtitle",
    description: "Рисовать вторую строку с описанием.",
    default: true,
  })

  params.group({title: "Scrollbar"})
  const scrollbarWidth = params.number("scrollbarWidth", {
    label: "scrollbarWidth",
    description: "Толщина track'а в px (default 4).",
    default: 4,
    min: 2,
    max: 16,
    step: 1,
    unit: "px",
  })
  const scrollbarGap = params.number("scrollbarGap", {
    label: "scrollbarGap",
    description: "Расстояние между правым краем items и scrollbar'ом (default 6).",
    default: 6,
    min: 0,
    max: 24,
    step: 1,
    unit: "px",
  })
  const hideScrollbarWhenFits = params.boolean("hideScrollbarWhenFits", {
    label: "hideScrollbarWhenFits",
    description: "Скрывать scrollbar если все items помещаются. По умолчанию true.",
    default: true,
  })

  params.group({title: "Edge fade"})
  const useEdgeFade = params.boolean("useEdgeFade", {
    label: "useEdgeFade",
    description: "Мягко растворять частично видимые строки сверху/снизу полупрозрачным overlay'ем.",
    default: false,
  })
  const edgeFadeSize = params.number("edgeFadeSize", {
    label: "sizePx",
    description: "Высота fade-зоны у каждого края в px (default 18).",
    default: 24,
    min: 4,
    max: 60,
    step: 1,
    unit: "px",
  })
  const edgeFadeAlpha = params.number("edgeFadeAlpha", {
    label: "maxAlpha",
    description: "Максимальная плотность overlay у самого края (0..1, default 0.86).",
    default: 0.86,
    min: 0.1,
    max: 1,
    step: 0.02,
  })

  const card = new ScrollListCard({
    itemCount, rowH, rowGap, titleFontPx, subtitleFontPx, showSubtitle, title,
    scrollbarWidth, scrollbarGap, hideScrollbarWhenFits,
    useEdgeFade, edgeFadeSize, edgeFadeAlpha,
  })
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: 24,
    y: 24,
    w: Math.min(w - 48, 560),
    h: h - 48,
  }))
}
