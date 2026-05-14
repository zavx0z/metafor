/**
 * Demo: Flex row/column.
 *
 * Один интерактивный flex-блок управляется параметрами на правой панели:
 * direction (row/column), gap, alignItems, justifyContent, padding, count
 * элементов и наличие grow-spacer. Ниже — статический колонко-демо для
 * сравнения.
 */

import {
  Card,
  type UiCanvas,
  flexRow,
  flexColumn,
  palette,
  type FlexAlign,
  type FlexJustify,
} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"
import {Color} from "@metafor/engine"

type Direction = "row" | "column"

const CELL_COLORS = [palette.cyan, palette.green, palette.orange, palette.violet, palette.red, palette.blue]

class FlexCard extends Card {
  constructor(
    private readonly p: {
      direction: () => Direction
      gap: () => number
      paddingX: () => number
      paddingY: () => number
      alignItems: () => FlexAlign
      justifyContent: () => FlexJustify
      itemCount: () => number
      withGrow: () => boolean
      itemMain: () => number
      itemCross: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText("Flex row + column", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    this.drawRect(16, 36, this.rectW - 32, 1, palette.borderDim, 0.00002)

    const direction = this.p.direction()
    const gap = this.p.gap()
    const paddingX = this.p.paddingX()
    const paddingY = this.p.paddingY()
    const align = this.p.alignItems()
    const justify = this.p.justifyContent()
    const count = this.p.itemCount()
    const withGrow = this.p.withGrow()
    const itemMain = this.p.itemMain()
    const itemCross = this.p.itemCross()

    // Caption.
    const captionY = 52
    this.drawText(
      `${direction} | gap=${gap} pad=${paddingX}/${paddingY} | align=${align} justify=${justify} | items=${count}${withGrow ? " +grow" : ""}`,
      16,
      captionY,
      {fontPx: 11, material: this.materials.muted, maxWidthPx: this.rectW - 32},
    )

    // Frame для flex-области. Outer (palette.border) — границы контейнера,
    // которые получает flex (opts.x/y/w/h). Inner (palette.cyan) — фактическая
    // зона распределения items, т.е. outer минус paddingX/paddingY. Items в
    // justify=space-between/-around прижимаются к INNER границам.
    const frameX = 16
    const frameY = 76
    const frameW = this.rectW - 32
    const frameH = this.rectH - frameY - 16
    this.drawRect(frameX, frameY, frameW, 1, palette.border, 0.00002)
    this.drawRect(frameX, frameY + frameH, frameW, 1, palette.border, 0.00002)
    this.drawRect(frameX, frameY, 1, frameH, palette.border, 0.00002)
    this.drawRect(frameX + frameW - 1, frameY, 1, frameH, palette.border, 0.00002)
    if (paddingX > 0 || paddingY > 0) {
      const ix = frameX + paddingX
      const iy = frameY + paddingY
      const iw = frameW - paddingX * 2
      const ih = frameH - paddingY * 2
      this.drawRect(ix, iy, iw, 1, palette.cyan, 0.00004)
      this.drawRect(ix, iy + ih - 1, iw, 1, palette.cyan, 0.00004)
      this.drawRect(ix, iy, 1, ih, palette.cyan, 0.00004)
      this.drawRect(ix + iw - 1, iy, 1, ih, palette.cyan, 0.00004)
    }

    const items = buildItems(count, withGrow, itemMain, itemCross, direction, (label, color, x, y, w, h) =>
      this.#cell(label, color, x, y, w, h),
    )

    if (direction === "row") {
      flexRow({
        x: frameX,
        y: frameY,
        w: frameW,
        h: frameH,
        paddingX,
        paddingY,
        gap,
        alignItems: align,
        justifyContent: justify,
        items,
      })
    } else {
      flexColumn({
        x: frameX,
        y: frameY,
        w: frameW,
        h: frameH,
        paddingX,
        paddingY,
        gap,
        alignItems: align,
        justifyContent: justify,
        items: items.map((it) => {
          const col: {
            height: number | "grow"
            width?: number
            alignSelf?: FlexAlign
            draw: (x: number, y: number, w: number, h: number) => void
          } = {
            height: it.width === "grow" ? ("grow" as const) : it.height,
            draw: it.draw,
          }
          if (it.width !== "grow") col.width = itemCross
          if (it.alignSelf !== undefined) col.alignSelf = it.alignSelf
          return col
        }),
      })
    }
  }

  #cell(label: string, color: import("@metafor/engine").Color, x: number, y: number, w: number, h: number): void {
    const fill = new Color(color.r, color.g, color.b, 0.18)
    this.drawRect(x, y, w, h, fill, 0.00004)
    this.drawRect(x, y, w, 1, color, 0.00006)
    this.drawText(label, x + 6, y + Math.max(2, (h - 11) / 2), {
      fontPx: 11,
      material: this.materials.text,
      maxWidthPx: w - 12,
    })
  }
}

function buildItems(
  count: number,
  withGrow: boolean,
  itemMain: number,
  itemCross: number,
  direction: Direction,
  draw: (
    label: string,
    color: import("@metafor/engine").Color,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void,
): Array<{
  width: number | "grow"
  height: number
  alignSelf?: FlexAlign
  draw: (x: number, y: number, w: number, h: number) => void
}> {
  const out: Array<{
    width: number | "grow"
    height: number
    alignSelf?: FlexAlign
    draw: (x: number, y: number, w: number, h: number) => void
  }> = []
  for (let i = 0; i < count; i++) {
    const color = CELL_COLORS[i % CELL_COLORS.length]!
    const label = `#${i + 1}`
    out.push({
      width: direction === "row" ? itemMain : itemCross,
      height: direction === "row" ? itemCross : itemMain,
      draw: (x, y, w, h) => draw(label, color, x, y, w, h),
    })
    if (withGrow && i === Math.floor(count / 2) - 1) {
      out.push({
        width: "grow",
        height: itemCross,
        draw: (x, y, w, h) => draw("grow", palette.muted, x, y, w, h),
      })
    }
  }
  return out
}

export default function flexDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Flex",
    description:
      "Иммедиэйт-mode flex-layout (flexRow / flexColumn). За один проход считает x/y/w/h для каждого item'а: main-axis распределяется через width/height + grow, cross-axis выравнивается через alignItems / alignSelf.",
    breadcrumb: "Layout / Flex",
  })

  params.group({title: "Direction"})
  const direction = params.select<Direction>("direction", {
    label: "direction",
    description: "row — flexRow (main = X). column — flexColumn (main = Y).",
    default: "row",
    options: ["row", "column"],
  })

  params.group({title: "Items"})
  const itemCount = params.number("itemCount", {
    label: "item count",
    description: "Количество элементов в flex-контейнере.",
    default: 3,
    min: 1,
    max: 6,
    step: 1,
  })
  const itemMain = params.number("itemMain", {
    label: "item main",
    description: "Размер каждого item'а по главной оси (width для row, height для column).",
    default: 80,
    min: 20,
    max: 200,
    step: 4,
    unit: "px",
  })
  const itemCross = params.number("itemCross", {
    label: "item cross",
    description: "Размер item'а по cross-оси (height для row, width для column).",
    default: 32,
    min: 16,
    max: 120,
    step: 2,
    unit: "px",
  })
  const withGrow = params.boolean("withGrow", {
    label: "with grow",
    description: "Добавляет item с width:'grow' посередине — растягивается на остаток main-axis.",
    default: false,
  })

  params.group({title: "Layout"})
  const gap = params.number("gap", {
    label: "gap",
    description: "Расстояние между соседними items по main-axis.",
    default: 8,
    min: 0,
    max: 40,
    step: 1,
    unit: "px",
  })
  const paddingX = params.number("paddingX", {
    label: "paddingX",
    description:
      "Горизонтальный inner-отступ flex-контейнера. При space-between/space-around — items прижимаются не к внешней границе контейнера, а к inner-границе (рамка показывается cyan, если pad > 0).",
    default: 0,
    min: 0,
    max: 48,
    step: 1,
    unit: "px",
  })
  const paddingY = params.number("paddingY", {
    label: "paddingY",
    description:
      "Вертикальный inner-отступ flex-контейнера. Аналогично paddingX — items распределяются внутри (outer − padding).",
    default: 0,
    min: 0,
    max: 48,
    step: 1,
    unit: "px",
  })

  params.group({title: "Alignment"})
  const alignItems = params.select<FlexAlign>("alignItems", {
    label: "alignItems",
    description: "Cross-axis выравнивание: start | center | end | stretch (полностью растянуть).",
    default: "center",
    options: ["start", "center", "end", "stretch"],
  })
  const justifyContent = params.select<FlexJustify>("justifyContent", {
    label: "justifyContent",
    description:
      "Main-axis распределение. space-between равномерно растягивает зазоры между элементами, space-around — добавляет половинный отступ по краям.",
    default: "start",
    options: ["start", "center", "end", "space-between", "space-around"],
  })

  const card = new FlexCard({
    direction,
    gap,
    paddingX,
    paddingY,
    alignItems,
    justifyContent,
    itemCount,
    withGrow,
    itemMain,
    itemCross,
  })
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: 24,
    y: 24,
    w: w - 48,
    h: h - 48,
  }))
}
