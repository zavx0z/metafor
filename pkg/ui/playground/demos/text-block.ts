/**
 * Component: drawTextBlock — deterministic multi-line text inside a fixed box.
 *
 * drawText рисует одну строку с обрезанием. drawTextBlock — про вёрстку:
 * перенос по словам, выбор размера шрифта под высоту, выравнивание,
 * максимальное число строк, заглавные буквы.
 */

import {Card, type UiCanvas, palette, divider, type TextBlockAlign, type TextBlockVAlign} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

type FitMode = "none" | "shrink"

class TextBlockCard extends Card {
  constructor(
    private readonly p: {
      text: () => string
      fontPx: () => number
      lineHeight: () => number
      align: () => TextBlockAlign
      vAlign: () => TextBlockVAlign
      padX: () => number
      padY: () => number
      wrap: () => boolean
      fit: () => FitMode
      upper: () => boolean
      maxLines: () => number
      blockW: () => number
      blockH: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    this.drawText("drawTextBlock (value, x, y, w, h, opts)", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const w = Math.min(this.p.blockW(), this.rectW - 32)
    const h = Math.min(this.p.blockH(), this.rectH - 76)
    const x = 16
    const y = 60

    // Рамка для визуализации границ блока.
    this.drawRect(x, y, w, 1, palette.cyan, 0.00006)
    this.drawRect(x, y + h - 1, w, 1, palette.cyan, 0.00006)
    this.drawRect(x, y, 1, h, palette.cyan, 0.00006)
    this.drawRect(x + w - 1, y, 1, h, palette.cyan, 0.00006)

    const maxLines = this.p.maxLines()
    const metrics = this.drawTextBlock(this.p.text(), x, y, w, h, {
      fontPx: this.p.fontPx(),
      material: this.materials.text,
      lineHeight: this.p.lineHeight(),
      align: this.p.align(),
      vAlign: this.p.vAlign(),
      padX: this.p.padX(),
      padY: this.p.padY(),
      wrap: this.p.wrap(),
      fit: this.p.fit(),
      upper: this.p.upper(),
      ...(maxLines > 0 ? {maxLines} : {}),
    })

    // Метрики снизу.
    const metricsY = Math.min(this.rectH - 18, y + h + 10)
    this.drawText(
      `lines=${metrics.lines.length} fontPx=${metrics.fontPx} lineHeight=${metrics.lineHeightPx}px totalH=${metrics.totalHeightPx}px maxLineW=${Math.round(metrics.maxLineWidthPx)}px`,
      16,
      metricsY,
      {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: this.rectW - 32,
      },
    )
  }
}

export default function textBlockDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Text Block",
    description:
      "drawTextBlock — deterministic многострочный текст в фиксированном боксе. Поддерживает перенос по словам (wrap), автоподгон размера шрифта (fit=\"shrink\"), горизонтальное/вертикальное выравнивание, padding и uppercase. Возвращает TextBlockMetrics — длину строк, итоговый fontPx и высоту.",
    breadcrumb: "Typography / Text Block",
  })

  params.group({title: "Content"})
  const text = params.text("text", {
    label: "value",
    type: "string | string[]",
    description: "Текст блока. Перевод строки \\n — explicit break. Если wrap=true, длинные строки переносятся по словам.",
    multiline: true,
    default:
      "drawTextBlock рисует deterministic многострочный текст в боксе.\nЕсли включён wrap — длинные строки переносятся по словам.\nfit=shrink уменьшает шрифт, пока текст не поместится по высоте и ширине.",
  })

  params.group({title: "Typography"})
  const fontPx = params.number("fontPx", {
    label: "fontPx",
    description: "Базовый размер шрифта (если не задан — вычисляется по высоте бокса). При fit=shrink — стартовый размер.",
    default: 18,
    min: 8,
    max: 64,
    step: 1,
    unit: "px",
  })
  const lineHeight = params.number("lineHeight", {
    label: "lineHeight",
    type: "ratio of fontPx",
    description: "Множитель межстрочного расстояния. 1.25 — компактно, 1.5 — комфортно.",
    default: 1.3,
    min: 0.9,
    max: 2.4,
    step: 0.05,
  })
  const upper = params.boolean("upper", {
    label: "upper",
    description: "Перевести весь текст в верхний регистр перед раскладкой.",
    default: false,
  })

  params.group({title: "Alignment"})
  const align = params.select<TextBlockAlign>("align", {
    label: "align",
    description: "Горизонтальное выравнивание строк внутри бокса.",
    default: "left",
    options: ["left", "center", "right"],
  })
  const vAlign = params.select<TextBlockVAlign>("vAlign", {
    label: "vAlign",
    description: "Вертикальное выравнивание блока строк в боксе.",
    default: "top",
    options: ["top", "middle", "bottom"],
  })

  params.group({title: "Padding"})
  const padX = params.number("padX", {
    label: "padX",
    description: "Горизонтальный padding внутри бокса.",
    default: 12,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })
  const padY = params.number("padY", {
    label: "padY",
    description: "Вертикальный padding внутри бокса.",
    default: 12,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })

  params.group({title: "Fit & Wrap"})
  const wrap = params.boolean("wrap", {
    label: "wrap",
    description: "Переносить длинные строки по словам, чтобы они помещались в (w - padX*2).",
    default: true,
  })
  const fit = params.select<FitMode>("fit", {
    label: "fit",
    description:
      "none — рисовать с fontPx как есть (overflow возможен). shrink — итеративно уменьшать fontPx пока текст не поместится по ширине и высоте.",
    default: "shrink",
    options: ["none", "shrink"],
  })
  const maxLines = params.number("maxLines", {
    label: "maxLines",
    description: "Жёсткий лимит строк (0 = без лимита). Лишние обрезаются с многоточием в конце.",
    default: 0,
    min: 0,
    max: 20,
    step: 1,
  })

  params.group({title: "Box geometry"})
  const blockW = params.number("blockW", {
    label: "blockW",
    description: "Ширина бокса в px.",
    default: 500,
    min: 100,
    max: 900,
    step: 10,
    unit: "px",
  })
  const blockH = params.number("blockH", {
    label: "blockH",
    description: "Высота бокса в px.",
    default: 220,
    min: 60,
    max: 600,
    step: 10,
    unit: "px",
  })

  canvas.addCard(
    new TextBlockCard({
      text,
      fontPx,
      lineHeight,
      align,
      vAlign,
      padX,
      padY,
      wrap,
      fit,
      upper,
      maxLines,
      blockW,
      blockH,
    }),
    ({w, h}) => ({x: 24, y: 24, w: w - 48, h: Math.max(360, h - 48)}),
  )

  params.onChange(() => canvas.relayout())
}
