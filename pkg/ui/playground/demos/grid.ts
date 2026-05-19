/**
 * Demo: multiple cards в одном canvas, layout-функции вычисляют их rects.
 *
 * Показывает: bg/border каждой карточки управляется отдельно через
 * параметры; layout-функции получают canvas-размер и возвращают rect.
 */

import {Card, type UiCanvas, palette, divider, surface} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

type BgKey = "bg" | "bgElevated" | "bgPanel" | "bgHot"

class LabelCard extends Card {
  constructor(
    private readonly label: string,
    private readonly p: {
      bgEnabled: () => boolean
      bgColor: () => BgKey
      borderEnabled: () => boolean
      labelPrefix: () => string
      showRect: () => boolean
      caption: () => string
    },
  ) {
    super({bgColor: null, borderColor: null})
  }

  protected render(): void {
    surface(this, 0, 0, this.rectW, this.rectH, {
      fill: this.p.bgEnabled() ? palette[this.p.bgColor()] : null,
      border: this.p.borderEnabled() ? palette.borderDim : null,
      z: 0,
      borderZ: 0.00006,
    })

    const prefix = this.p.labelPrefix()
    const fullLabel = prefix.length > 0 ? `${prefix} · ${this.label}` : this.label
    this.drawText(fullLabel, 14, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 28,
    })
    divider(this, 14, 36, this.rectW - 28)

    if (this.p.showRect()) {
      this.drawText(`rect ${Math.round(this.rectW)}×${Math.round(this.rectH)}`, 14, 50, {
        fontPx: 11,
        material: this.materials.muted,
        maxWidthPx: this.rectW - 28,
      })
    }

    const caption = this.p.caption()
    if (caption.length > 0) {
      this.drawText(caption, 14, 70, {
        fontPx: 11,
        material: this.materials.text,
        maxWidthPx: this.rectW - 28,
      })
    }
  }
}

export default function gridDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Multi-Card Grid",
    description:
      "UiCanvas.addCard(card, layoutFn). layoutFn получает {w, h} канвы и возвращает {x, y, w, h}. Cards в разных углах не имеют bg-drift благодаря микро-z близкому к 0 — perspective-divide почти не отличается между карточками.",
    breadcrumb: "Layout / Multi-Card Grid",
  })

  params.group({title: "Layout"})
  const gap = params.number("gap", {
    label: "gap",
    description: "Расстояние между карточками в px. Вычисляется как часть layout-функции каждой card.",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })
  const outerMargin = params.number("outerMargin", {
    label: "outer margin",
    description: "Отступ от краёв canvas до сетки карточек.",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })

  params.group({title: "Appearance"})
  const bgEnabled = params.boolean("bgEnabled", {
    label: "show bg",
    description: "Рисовать ли background-fill через стандартный surface widget.",
    default: true,
  })
  const bgColor = params.select<BgKey>("bgColor", {
    label: "bg color",
    description: "Цвет фона из palette. Тестируйте контраст между bg/bgElevated/bgPanel/bgHot.",
    default: "bg",
    options: ["bg", "bgElevated", "bgPanel", "bgHot"],
  })
  const borderEnabled = params.boolean("borderEnabled", {
    label: "show border",
    description: "Рисовать 1-px dim-рамку (palette.borderDim).",
    default: true,
  })

  params.group({title: "Content"})
  const labelPrefix = params.text("labelPrefix", {
    label: "label prefix",
    description: "Префикс перед именем угла (top-left и т.д.).",
    default: "",
  })
  const showRect = params.boolean("showRect", {
    label: "show rect size",
    description: "Печатать актуальные rectW × rectH в каждой карточке.",
    default: true,
  })
  const caption = params.text("caption", {
    label: "caption",
    description: "Дополнительная строка под размером.",
    default: "bg/border не уплывают от позиции card.",
  })

  const pos = {bgEnabled, bgColor, borderEnabled, labelPrefix, showRect, caption}

  canvas.addCard(new LabelCard("top-left", pos), ({w, h}) => {
    const m = outerMargin()
    const g = gap()
    return {
      x: m,
      y: m,
      w: Math.floor(w / 2) - m - g / 2,
      h: Math.floor(h / 2) - m - g / 2,
    }
  })
  canvas.addCard(new LabelCard("top-right", pos), ({w, h}) => {
    const m = outerMargin()
    const g = gap()
    return {
      x: Math.floor(w / 2) + g / 2,
      y: m,
      w: Math.floor(w / 2) - m - g / 2,
      h: Math.floor(h / 2) - m - g / 2,
    }
  })
  canvas.addCard(new LabelCard("bottom-left", pos), ({w, h}) => {
    const m = outerMargin()
    const g = gap()
    return {
      x: m,
      y: Math.floor(h / 2) + g / 2,
      w: Math.floor(w / 2) - m - g / 2,
      h: Math.floor(h / 2) - m - g / 2,
    }
  })
  canvas.addCard(new LabelCard("bottom-right", pos), ({w, h}) => {
    const m = outerMargin()
    const g = gap()
    return {
      x: Math.floor(w / 2) + g / 2,
      y: Math.floor(h / 2) + g / 2,
      w: Math.floor(w / 2) - m - g / 2,
      h: Math.floor(h / 2) - m - g / 2,
    }
  })

  params.onChange(() => canvas.relayout())
}
