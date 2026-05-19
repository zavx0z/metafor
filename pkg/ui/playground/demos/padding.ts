/**
 * Demo: Card.padding (моделируется вручную) + drawTextCentered.
 *
 * Card.padding в библиотеке задаётся в конструкторе и не меняется
 * на лету. В demo'шке для интерактивности padding моделируется руками:
 * cyan-рамка очерчивает inner-rect, текст и контент рисуются с offsetX/Y.
 * Это эквивалентно тому, что делает Card.padding внутри.
 *
 * Низ — сравнение drawText (cap-box центр) и drawTextCentered (bbox-центр
 * через font.getGlyphBounds yMin/yMax) для асимметричных глифов.
 */

import {Card, type UiCanvas, palette, divider, frame, surface} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

const PADDING_FRAME_Z = 0.00006

class InteractivePaddedCard extends Card {
  constructor(
    private readonly p: {
      padTop: () => number
      padRight: () => number
      padBottom: () => number
      padLeft: () => number
      showInnerFrame: () => boolean
      title: () => string
      bodyText: () => string
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    const padT = this.p.padTop()
    const padR = this.p.padRight()
    const padB = this.p.padBottom()
    const padL = this.p.padLeft()
    const innerX = padL
    const innerY = padT
    const innerW = Math.max(0, this.rectW - padL - padR)
    const innerH = Math.max(0, this.rectH - padT - padB)

    // Cyan inner-rect frame.
    if (this.p.showInnerFrame() && innerW > 0 && innerH > 0) {
      frame(this, innerX, innerY, innerW, innerH, {color: palette.cyan, z: PADDING_FRAME_Z})
    }

    if (innerW <= 0 || innerH <= 0) return

    // Title.
    this.drawText(this.p.title(), innerX + 4, innerY + 4, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: innerW - 8,
    })

    // Inner-size индикатор.
    this.drawText(`inner ${Math.round(innerW)}×${Math.round(innerH)}px`, innerX + 4, innerY + 24, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: innerW - 8,
    })
    this.drawText(`pad: T${padT} R${padR} B${padB} L${padL}`, innerX + 4, innerY + 40, {
      fontPx: 11,
      material: this.materials.orange,
      maxWidthPx: innerW - 8,
    })

    // Body.
    const lines = this.p.bodyText().split("\n")
    let y = innerY + 60
    for (const line of lines) {
      if (y + 12 > innerY + innerH) break
      this.drawText(line, innerX + 4, y, {
        fontPx: 11,
        material: this.materials.text,
        maxWidthPx: innerW - 8,
      })
      y += 16
    }
  }
}

class CenteredTextCard extends Card {
  constructor(
    private readonly p: {
      symbols: () => string
      fontPx: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    let y = 12
    this.drawText("drawText vs drawTextCentered", 14, y, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 28,
    })
    y += 22
    divider(this, 14, y, this.rectW - 28)
    y += 8

    this.drawText(
      "drawTextCentered измеряет реальный bbox через font.getGlyphBounds(yMin/yMax) и центрирует по визуальной середине, а не cap-box. Линия = cy; совпадение глифа с линией = точная центровка.",
      14,
      y,
      {fontPx: 10, material: this.materials.muted, maxWidthPx: this.rectW - 28},
    )
    y += 24

    const symbols = [...this.p.symbols()]
    if (symbols.length === 0) return
    const cellW = (this.rectW - 28) / symbols.length
    const labelH = 14
    const sectionGap = 10
    const remaining = Math.max(60, this.rectH - y - 6)
    // 2 секции: каждая = label (labelH) + cells (cellH). Делим оставшееся пополам.
    const cellH = Math.max(32, Math.floor((remaining - labelH * 2 - sectionGap) / 2))
    // Подстраиваем шрифт под высоту ячейки, не больше параметра.
    const fontPx = Math.min(this.p.fontPx(), Math.max(14, Math.floor(cellH * 0.7)))

    const drawSection = (
      label: string,
      labelY: number,
      cellsY: number,
      ruleColor: import("@metafor/engine").Color,
      method: "raw" | "centered",
    ): void => {
      this.drawText(label, 14, labelY, {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: this.rectW - 28,
      })
      for (let i = 0; i < symbols.length; i++) {
        const slotX = 14 + cellW * i + 8
        const slotW = cellW - 16
        const cx = slotX + slotW / 2
        const cy = cellsY + cellH / 2
        surface(this, slotX, cellsY, slotW, cellH, {fill: palette.bgPanel, z: 0.00002})
        divider(this, slotX, cy, slotW, {color: ruleColor, z: 0.00006})
        if (method === "raw") {
          const labelW = this.measureText(symbols[i]!, fontPx)
          this.drawText(symbols[i]!, cx - labelW / 2, cy - fontPx / 2, {
            fontPx,
            material: this.materials.text,
          })
        } else {
          this.drawTextCentered(symbols[i]!, cx, cy, {fontPx, material: this.materials.text})
        }
      }
    }

    const rawLabelY = y
    const rawCellsY = rawLabelY + labelH
    const centeredLabelY = rawCellsY + cellH + sectionGap
    const centeredCellsY = centeredLabelY + labelH
    drawSection(
      "drawText — cap-box центр (cyan line):",
      rawLabelY,
      rawCellsY,
      palette.cyan,
      "raw",
    )
    drawSection(
      "drawTextCentered — визуальный bbox (green line):",
      centeredLabelY,
      centeredCellsY,
      palette.green,
      "centered",
    )
  }
}

export default function paddingDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Card Padding & Centered Text",
    description:
      "CardOpts.padding — per-side отступ от bg/border до контента. rectW/rectH видны subclass'у как inner-размер. drawTextCentered учитывает реальный bbox глифа через font.getGlyphBounds.",
    breadcrumb: "Layout / Padding",
  })

  params.group({title: "Padding (sides)"})
  const padTop = params.number("padTop", {
    label: "top",
    description: "Внутренний отступ сверху — расстояние от border до контента.",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })
  const padRight = params.number("padRight", {
    label: "right",
    description: "Внутренний отступ справа.",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })
  const padBottom = params.number("padBottom", {
    label: "bottom",
    description: "Внутренний отступ снизу.",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })
  const padLeft = params.number("padLeft", {
    label: "left",
    description: "Внутренний отступ слева.",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })

  params.group({title: "Visual"})
  const showInnerFrame = params.boolean("showInnerFrame", {
    label: "show inner frame",
    description: "Cyan-рамка обводит inner-rect (то, что subclass видит как rectW × rectH).",
    default: true,
  })

  params.group({title: "Content"})
  const title = params.text("title", {
    label: "title",
    description: "Заголовок внутри padded-card.",
    default: "Padded card",
  })
  const bodyText = params.text("bodyText", {
    label: "body",
    description: "Тело card — рисуется line-by-line внутри inner-rect.",
    multiline: true,
    default:
      "text / surface / hit / flex живут внутри inner-rect.\nbg + border рисуются по полному card-rect.",
  })

  params.group({title: "drawTextCentered demo"})
  const symbols = params.text("symbols", {
    label: "symbols",
    description: "Набор символов для сравнения drawText (cap-box) vs drawTextCentered (визуальный bbox).",
    default: "+−‹›±A",
  })
  const centeredFontPx = params.number("centeredFontPx", {
    label: "fontPx",
    description: "Размер шрифта в demo-сетке символов.",
    default: 30,
    min: 14,
    max: 60,
    step: 1,
    unit: "px",
  })

  const TOP_H = 220
  const GAP = 16

  canvas.addCard(
    new InteractivePaddedCard({padTop, padRight, padBottom, padLeft, showInnerFrame, title, bodyText}),
    ({w}) => ({x: GAP, y: GAP, w: w - GAP * 2, h: TOP_H}),
  )

  canvas.addCard(new CenteredTextCard({symbols, fontPx: centeredFontPx}), ({w, h}) => ({
    x: GAP,
    y: GAP + TOP_H + GAP,
    w: w - GAP * 2,
    h: h - GAP * 3 - TOP_H,
  }))

  params.onChange(() => canvas.relayout())
}
