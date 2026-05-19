/**
 * Component: flexRowCss / flexColumnCss.
 *
 * Browser-like иммедиэйт-mode flex с поддержкой px / % / fr / grow / auto.
 * Удобный subset CSS Flexbox: subset без intrinsic sizing, flex-shrink и wrap —
 * pixel-precise layouts строй на flex.ts, а сложные шаблоны (журналы,
 * presentation-режимы) — на flexCss.
 */

import {
  Card,
  type UiCanvas,
  flexRowCss,
  flexColumnCss,
  palette,
  divider,
  frame,
  surface,
  type UiSize,
  type FlexAlign,
  type FlexJustify,
} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"
import {Color} from "@metafor/engine"

type Direction = "row" | "column"
type Preset = "px-only" | "fr-mix" | "percent-mix" | "grow-spacer"

const CELL_COLORS = [palette.cyan, palette.green, palette.orange, palette.violet, palette.red, palette.blue]

class FlexCssCard extends Card {
  constructor(
    private readonly p: {
      direction: () => Direction
      preset: () => Preset
      gap: () => number
      paddingX: () => number
      paddingY: () => number
      alignItems: () => FlexAlign
      justifyContent: () => FlexJustify
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  protected render(): void {
    const direction = this.p.direction()
    const preset = this.p.preset()
    const gap = this.p.gap()
    const paddingX = this.p.paddingX()
    const paddingY = this.p.paddingY()
    const align = this.p.alignItems()
    const justify = this.p.justifyContent()

    this.drawText("flexRowCss / flexColumnCss", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const captionParts = describeSizes(preset)
    this.drawText(
      `${direction === "row" ? "flexRowCss" : "flexColumnCss"} ({${captionParts.join(", ")}}) gap=${gap} align=${align} justify=${justify}`,
      16,
      52,
      {fontPx: 11, material: this.materials.muted, maxWidthPx: this.rectW - 32},
    )

    const frameX = 16
    const frameY = 76
    const frameW = this.rectW - 32
    const frameH = this.rectH - frameY - 16
    frame(this, frameX, frameY, frameW, frameH, {color: palette.borderRule, z: 0.00002})

    const items = presetItems(preset, direction, (label, color, x, y, w, h) =>
      this.#cell(label, color, x, y, w, h),
    )

    if (direction === "row") {
      flexRowCss({
        x: frameX,
        y: frameY,
        w: frameW,
        h: frameH,
        paddingX,
        paddingY,
        gap,
        alignItems: align,
        justifyContent: justify,
        items: items.map((it) => ({
          width: it.size,
          height: 40,
          draw: it.draw,
        })),
      })
    } else {
      flexColumnCss({
        x: frameX,
        y: frameY,
        w: frameW,
        h: frameH,
        paddingX,
        paddingY,
        gap,
        alignItems: align,
        justifyContent: justify,
        items: items.map((it) => ({
          height: it.size,
          width: 240,
          draw: it.draw,
        })),
      })
    }
  }

  #cell(label: string, color: import("@metafor/engine").Color, x: number, y: number, w: number, h: number): void {
    const fill = new Color(color.r, color.g, color.b, 0.18)
    surface(this, x, y, w, h, {fill, border: color, z: 0.00004, borderZ: 0.00006})
    this.drawText(label, x + 6, y + Math.max(2, (h - 12) / 2), {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: w - 12,
    })
    // Подпись размера снизу.
    this.drawText(`${Math.round(w)}×${Math.round(h)}`, x + 6, y + h - 14, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: w - 12,
    })
  }
}

function presetItems(
  preset: Preset,
  direction: Direction,
  draw: (label: string, color: import("@metafor/engine").Color, x: number, y: number, w: number, h: number) => void,
): Array<{size: UiSize; draw: (x: number, y: number, w: number, h: number) => void}> {
  const sizes = presetSizes(preset)
  void direction
  return sizes.map((size, i) => {
    const color = CELL_COLORS[i % CELL_COLORS.length]!
    const label = stringifySize(size)
    return {
      size,
      draw: (x: number, y: number, w: number, h: number) => draw(label, color, x, y, w, h),
    }
  })
}

function presetSizes(preset: Preset): UiSize[] {
  if (preset === "px-only") return [80, 120, 160]
  if (preset === "fr-mix") return [80, "1fr", "2fr", 60]
  if (preset === "percent-mix") return [100, "40%", "25%"]
  return [80, "grow", 60]
}

function describeSizes(preset: Preset): string[] {
  return presetSizes(preset).map((s) => stringifySize(s))
}

function stringifySize(s: UiSize): string {
  if (typeof s === "number") return `${s}px`
  if (typeof s === "string") return s
  if ("px" in s) return `${s.px}px`
  if ("percent" in s) return `${s.percent}%`
  if ("ratio" in s) return `${(s.ratio * 100).toFixed(0)}%`
  if ("fr" in s) return `${s.fr}fr`
  return "?"
}

export default function flexCssDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Flex CSS",
    description:
      "Browser-like flex с поддержкой смешанных размеров: px, percent (\"42%\"), fr (\"1fr\"), grow, auto. Удобно для journal-templates и presentation-mode, где основные дорожки — относительные.",
    breadcrumb: "Layout / Flex CSS",
  })

  params.group({title: "Direction & Items"})
  const direction = params.select<Direction>("direction", {
    label: "direction",
    description: "row — flexRowCss (main = X). column — flexColumnCss (main = Y).",
    default: "row",
    options: ["row", "column"],
  })
  const preset = params.select<Preset>("preset", {
    label: "items preset",
    type: "preset",
    description:
      "Готовые наборы items: px-only (80, 120, 160) · fr-mix (80, 1fr, 2fr, 60) · percent-mix (100, 40%, 25%) · grow-spacer (80, grow, 60).",
    default: "fr-mix",
    options: ["px-only", "fr-mix", "percent-mix", "grow-spacer"],
  })

  params.group({title: "Layout"})
  const gap = params.number("gap", {
    label: "gap",
    description: "Расстояние между items по main-axis.",
    default: 12,
    min: 0,
    max: 40,
    step: 1,
    unit: "px",
  })
  const paddingX = params.number("paddingX", {
    label: "paddingX",
    description: "Горизонтальный padding контейнера.",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })
  const paddingY = params.number("paddingY", {
    label: "paddingY",
    description: "Вертикальный padding контейнера.",
    default: 16,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  })

  params.group({title: "Alignment"})
  const alignItems = params.select<FlexAlign>("alignItems", {
    label: "alignItems",
    description: "Cross-axis выравнивание.",
    default: "center",
    options: ["start", "center", "end", "stretch"],
  })
  const justifyContent = params.select<FlexJustify>("justifyContent", {
    label: "justifyContent",
    description:
      "Main-axis распределение. Применяется только если нет fr/grow items (иначе они заполняют остаток).",
    default: "start",
    options: ["start", "center", "end", "space-between", "space-around"],
  })

  canvas.addCard(
    new FlexCssCard({direction, preset, gap, paddingX, paddingY, alignItems, justifyContent}),
    ({w, h}) => ({x: 24, y: 24, w: w - 48, h: h - 48}),
  )

  params.onChange(() => canvas.relayout())
}
