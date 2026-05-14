/**
 * Demo: Card basics.
 *
 * Простая карточка по центру canvas. Все примитивы Card (drawText, drawRect,
 * divider, materials) управляются параметрами на правой панели. Bg/border
 * рисуются вручную через drawRect, чтобы их можно было менять без пересоздания
 * Card (Card.bgColor / borderColor задаются только в конструкторе).
 */

import {Card, type UiCanvas, palette, divider, Z} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"
import type {TextMaterial} from "@metafor/engine"

type ToneKey = "text" | "muted" | "cyan" | "green" | "orange" | "red" | "blue" | "violet"
type BgKey = "bg" | "bgElevated" | "bgPanel" | "bgHot" | "bgInput"
type BorderKey = "border" | "borderDim" | "borderBright" | "cyan" | "green" | "orange"

class HelloCard extends Card {
  constructor(
    private readonly p: {
      title: () => string
      body: () => string
      titleFontPx: () => number
      bodyFontPx: () => number
      titleTone: () => ToneKey
      bodyTone: () => ToneKey
      showBg: () => boolean
      bgColor: () => BgKey
      showBorder: () => boolean
      borderColor: () => BorderKey
      borderWidth: () => number
      showDivider: () => boolean
      dividerThickness: () => number
      dividerColor: () => BorderKey
      contentPadX: () => number
      contentPadY: () => number
    },
  ) {
    // bg/border полностью отключены — рисуем их сами через drawRect, чтобы
    // менять цвета на лету без recreate.
    super({bgColor: null, borderColor: null})
  }

  protected render(): void {
    const padX = this.p.contentPadX()
    const padY = this.p.contentPadY()
    const titleFontPx = this.p.titleFontPx()
    const bodyFontPx = this.p.bodyFontPx()

    // Background и border. Bg на z=CONTAINER (под всем контентом).
    if (this.p.showBg()) {
      this.drawRect(0, 0, this.rectW, this.rectH, palette[this.p.bgColor()], Z.CONTAINER)
    }
    if (this.p.showBorder()) {
      const bw = Math.max(0, this.p.borderWidth())
      const bc = palette[this.p.borderColor()]
      if (bw > 0) {
        this.drawRect(0, 0, this.rectW, bw, bc, Z.ELEMENT_RULE)
        this.drawRect(0, this.rectH - bw, this.rectW, bw, bc, Z.ELEMENT_RULE)
        this.drawRect(0, 0, bw, this.rectH, bc, Z.ELEMENT_RULE)
        this.drawRect(this.rectW - bw, 0, bw, this.rectH, bc, Z.ELEMENT_RULE)
      }
    }

    // Title.
    const titleY = padY
    this.drawText(this.p.title(), padX, titleY, {
      fontPx: titleFontPx,
      material: toneMaterial(this.materials, this.p.titleTone()),
      maxWidthPx: this.rectW - padX * 2,
    })

    // Divider.
    let bodyY = titleY + titleFontPx + 6
    if (this.p.showDivider()) {
      divider(this, padX, bodyY, this.rectW - padX * 2, {
        color: palette[this.p.dividerColor()],
        thickness: this.p.dividerThickness(),
      })
      bodyY += 10
    }

    // Body text (с переносом строк по \n внутри значения).
    const body = this.p.body()
    const lineHeight = bodyFontPx + 4
    const lines = body.split("\n")
    let y = bodyY
    for (const line of lines) {
      if (y + bodyFontPx > this.rectH - padY) break
      this.drawText(line, padX, y, {
        fontPx: bodyFontPx,
        material: toneMaterial(this.materials, this.p.bodyTone()),
        maxWidthPx: this.rectW - padX * 2,
      })
      y += lineHeight
    }
  }
}

function toneMaterial(materials: HelloCard["materials"], tone: ToneKey): TextMaterial {
  return materials[tone]
}

export default function cardDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Card",
    description:
      "Card — корневой контейнер UI. Гарантирует, что bg/border всегда внутри rect, drawText обрезается через измерение font-метрик, drawRect клампится к bounds. Базовый класс для всех виджетов.",
    breadcrumb: "Layout / Card",
  })

  params.group({title: "Content"})
  const title = params.text("title", {
    label: "title",
    description: "Заголовок карточки. drawText обрезает строку через измерение font-метрик + многоточие.",
    default: "Card basics",
  })
  const body = params.text("body", {
    label: "body",
    description: "Тело карточки. Каждая строка (по \\n) рисуется отдельным drawText'ом — обрезание идёт по maxWidthPx.",
    multiline: true,
    default:
      "Card.drawText обрезает текст через измерение font.getHMetric.\nЕсли строка не помещается — в конце ставится многоточие.\nНикакого overflow за границы карточки не будет.",
  })
  const titleFontPx = params.number("titleFontPx", {
    label: "title fontPx",
    description: "Размер шрифта заголовка в logical-px.",
    default: 16,
    min: 10,
    max: 40,
    step: 1,
    unit: "px",
  })
  const bodyFontPx = params.number("bodyFontPx", {
    label: "body fontPx",
    description: "Размер шрифта тела карточки.",
    default: 12,
    min: 8,
    max: 24,
    step: 1,
    unit: "px",
  })
  const titleTone = params.select<ToneKey>("titleTone", {
    label: "title tone",
    description: "TextMaterial из палитры — окрашивает заголовок.",
    default: "cyan",
    options: ["text", "muted", "cyan", "green", "orange", "red", "blue", "violet"],
  })
  const bodyTone = params.select<ToneKey>("bodyTone", {
    label: "body tone",
    description: "TextMaterial из палитры для тела карточки.",
    default: "text",
    options: ["text", "muted", "cyan", "green", "orange", "red", "blue", "violet"],
  })

  params.group({title: "Background"})
  const showBg = params.boolean("showBg", {
    label: "show bg",
    description: "Включает фоновую заливку. Card.bgColor=null по умолчанию (прозрачная) — здесь bg рисуется через drawRect.",
    default: true,
  })
  const bgColor = params.select<BgKey>("bgColor", {
    label: "bg color",
    description: "Цвет фона из palette. bg — основной, bgElevated — приподнятые слои, bgPanel — холодный тёмный.",
    default: "bg",
    options: ["bg", "bgElevated", "bgPanel", "bgHot", "bgInput"],
  })

  params.group({title: "Border"})
  const showBorder = params.boolean("showBorder", {
    label: "show border",
    description: "Включает рамку. Card.borderColor=null по умолчанию — рамка тут рисуется через drawRect.",
    default: true,
  })
  const borderColor = params.select<BorderKey>("borderColor", {
    label: "border color",
    description: "Цвет рамки из palette. borderDim — тонкая dim-рамка, cyan/green/orange — акцентные.",
    default: "borderDim",
    options: ["border", "borderDim", "borderBright", "cyan", "green", "orange"],
  })
  const borderWidth = params.number("borderWidth", {
    label: "border width",
    description: "Толщина рамки в px.",
    default: 1,
    min: 0,
    max: 6,
    step: 1,
    unit: "px",
  })

  params.group({title: "Divider"})
  const showDivider = params.boolean("showDivider", {
    label: "show divider",
    description: "Горизонтальная линия между title и body через widget divider(card, x, y, w, opts).",
    default: true,
  })
  const dividerThickness = params.number("dividerThickness", {
    label: "divider thickness",
    description: "Толщина divider в px (opts.thickness).",
    default: 1,
    min: 1,
    max: 6,
    step: 1,
    unit: "px",
  })
  const dividerColor = params.select<BorderKey>("dividerColor", {
    label: "divider color",
    description: "Цвет divider из palette (opts.color).",
    default: "borderDim",
    options: ["border", "borderDim", "borderBright", "cyan", "green", "orange"],
  })

  params.group({title: "Layout"})
  const contentPadX = params.number("contentPadX", {
    label: "content padX",
    description: "Горизонтальный отступ от рамки до контента в px (демо-параметр — реализован через offset в render).",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })
  const contentPadY = params.number("contentPadY", {
    label: "content padY",
    description: "Вертикальный отступ от рамки до контента в px.",
    default: 14,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })

  const card = new HelloCard({
    title,
    body,
    titleFontPx,
    bodyFontPx,
    titleTone,
    bodyTone,
    showBg,
    bgColor,
    showBorder,
    borderColor,
    borderWidth,
    showDivider,
    dividerThickness,
    dividerColor,
    contentPadX,
    contentPadY,
  })
  // На любое изменение параметра — relayout канвы (это передёргивает setRect
  // у каждой карточки → срабатывает rerender).
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: Math.floor(w / 2 - 220),
    y: Math.floor(h / 2 - 110),
    w: 440,
    h: 220,
  }))
}
