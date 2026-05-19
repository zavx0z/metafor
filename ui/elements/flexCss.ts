/**
 * Browser-like immediate-mode layout adapter поверх flex.ts.
 *
 * Цель — удобный subset CSS Flexbox для шаблонов, журналов, presentation-режимов
 * и runtime overlay'ев: px / % / fr / grow / padding / gap / align / justify.
 * Это НЕ полный Flexbox: нет intrinsic sizing, flex-shrink, wrap, baseline,
 * min/max-content. Низкоуровневый `flexRow/flexColumn` из flex.ts остаётся
 * нетронутым низкоуровневый рендеринг — используйте его для pixel-precise controls.
 *
 * UiSize:
 *   120                  — 120 logical px
 *   { px: 120 }          — 120 logical px
 *   "42%"                — 42% от parent axis (inner после padding)
 *   { percent: 42 }      — то же
 *   { ratio: 0.42 }      — то же
 *   "1fr" / "2fr"        — доля остатка после fixed/percent/gap
 *   { fr: 1 }            — то же
 *   "grow"               — alias для "1fr"
 *   "auto"               — пока alias для "grow" (intrinsic auto-size не реализован)
 *
 * Пример:
 *   flexRowCss({
 *     x: 0, y: 0, w: page.w, h: 80, gap: 12,
 *     items: [
 *       {width: 180,   draw: drawLogo},
 *       {width: "1fr", draw: drawTitle},
 *       {width: "42%", draw: drawSubtitle},
 *       {width: 120,   draw: drawPageNumber},
 *     ],
 *   })
 */

import type {FlexAlign, FlexJustify} from "./flex.ts"

export type UiSize =
  | number
  | "grow"
  | "auto"
  | `${number}%`
  | `${number}fr`
  | {px: number}
  | {percent: number}
  | {ratio: number}
  | {fr: number}

export type FlexCssAlign = FlexAlign
export type FlexCssJustify = FlexJustify

type FlexCssBoxBase = {
  x: number
  y: number
  w: number
  h: number
  paddingX?: number
  paddingY?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  gap?: number
  alignItems?: FlexAlign
  justifyContent?: FlexJustify
}

export type FlexCssRowItem = {
  /** Main-axis size: px, "42%", "1fr", "grow", "auto" или объект. */
  width: UiSize
  /** Cross-axis size; по умолчанию stretch (innerH). */
  height?: UiSize
  alignSelf?: FlexAlign
  draw(x: number, y: number, width: number, height: number): void
}

export type FlexCssColumnItem = {
  /** Main-axis size: px, "18.5%", "1fr", "grow", "auto" или объект. */
  height: UiSize
  /** Cross-axis size; по умолчанию stretch (innerW). */
  width?: UiSize
  alignSelf?: FlexAlign
  draw(x: number, y: number, width: number, height: number): void
}

export type FlexCssRowOpts = FlexCssBoxBase & {items: Array<FlexCssRowItem | null | undefined | false>}
export type FlexCssColumnOpts = FlexCssBoxBase & {items: Array<FlexCssColumnItem | null | undefined | false>}

type Kind = {kind: "px"; value: number} | {kind: "percent"; value: number} | {kind: "fr"; value: number}

/**
 * Нормализует UiSize в один из трёх классов. Для cross-axis "auto"/"grow"/"fr"
 * означают stretch к inner box; в main-axis они распределяют остаток.
 */
export function parseUiSize(size: UiSize): Kind {
  if (typeof size === "number") return {kind: "px", value: size}
  if (typeof size === "string") {
    if (size === "grow" || size === "auto") return {kind: "fr", value: 1}
    if (size.endsWith("%")) {
      const n = Number.parseFloat(size.slice(0, -1))
      if (!Number.isFinite(n)) throw new Error(`flexCss: invalid percent size "${size}"`)
      return {kind: "percent", value: n}
    }
    if (size.endsWith("fr")) {
      const n = Number.parseFloat(size.slice(0, -2))
      if (!Number.isFinite(n)) throw new Error(`flexCss: invalid fr size "${size}"`)
      return {kind: "fr", value: n}
    }
    throw new Error(`flexCss: unknown size literal "${size}"`)
  }
  if ("px" in size) return {kind: "px", value: size.px}
  if ("percent" in size) return {kind: "percent", value: size.percent}
  if ("ratio" in size) return {kind: "percent", value: size.ratio * 100}
  if ("fr" in size) return {kind: "fr", value: size.fr}
  throw new Error(`flexCss: unsupported UiSize ${JSON.stringify(size)}`)
}

/** Разрешает main-axis размер в logical px. Для fr возвращает 0 — fr-распределение
 *  считается отдельно, после вычета fixed/percent/gap. */
function resolveMain(kind: Kind, basis: number): {px: number; frUnits: number} {
  if (kind.kind === "px") return {px: Math.max(0, kind.value), frUnits: 0}
  if (kind.kind === "percent") return {px: Math.max(0, (basis * kind.value) / 100), frUnits: 0}
  return {px: 0, frUnits: Math.max(0, kind.value)}
}

/** Cross-axis: fr/grow/auto -> stretch к innerCross. */
function resolveCross(size: UiSize | undefined, innerCross: number): number | "stretch" {
  if (size === undefined) return "stretch"
  const k = parseUiSize(size)
  if (k.kind === "px") return Math.max(0, k.value)
  if (k.kind === "percent") return Math.max(0, (innerCross * k.value) / 100)
  return "stretch"
}

function paddings(opts: FlexCssBoxBase): {padL: number; padR: number; padT: number; padB: number; gap: number} {
  return {
    padL: opts.paddingLeft ?? opts.paddingX ?? 0,
    padR: opts.paddingRight ?? opts.paddingX ?? 0,
    padT: opts.paddingTop ?? opts.paddingY ?? 0,
    padB: opts.paddingBottom ?? opts.paddingY ?? 0,
    gap: opts.gap ?? 0,
  }
}

export function flexRowCss(opts: FlexCssRowOpts): void {
  const {padL, padR, padT, padB, gap} = paddings(opts)
  const innerX = opts.x + padL
  const innerY = opts.y + padT
  const innerW = Math.max(0, opts.w - padL - padR)
  const innerH = Math.max(0, opts.h - padT - padB)
  const items = opts.items.filter((i): i is FlexCssRowItem => i !== null && i !== undefined && i !== false)
  if (items.length === 0) return

  const totalGap = gap * (items.length - 1)
  const mains = items.map((i) => resolveMain(parseUiSize(i.width), innerW))
  const fixedAndPercent = mains.reduce((s, m) => s + m.px, 0)
  const frTotal = mains.reduce((s, m) => s + m.frUnits, 0)
  const remaining = innerW - fixedAndPercent - totalGap
  const frUnitPx = frTotal > 0 ? Math.max(0, remaining / frTotal) : 0

  let startX = innerX
  let extraGap = 0
  if (frTotal === 0) {
    const slack = Math.max(0, remaining)
    if (opts.justifyContent === "center") startX += slack / 2
    else if (opts.justifyContent === "end") startX += slack
    else if (opts.justifyContent === "space-between" && items.length > 1) extraGap = slack / (items.length - 1)
    else if (opts.justifyContent === "space-around" && items.length > 0) {
      startX += slack / (items.length * 2)
      extraGap = slack / items.length
    }
  }

  let cursor = startX
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const m = mains[i]!
    const w = m.frUnits > 0 ? m.frUnits * frUnitPx : m.px
    const cross = resolveCross(item.height, innerH)
    const align = item.alignSelf ?? opts.alignItems ?? "stretch"
    let y = innerY
    let h: number
    if (cross === "stretch" || align === "stretch") {
      h = innerH
    } else {
      h = cross
      if (align === "center") y += (innerH - h) / 2
      else if (align === "end") y += innerH - h
    }
    item.draw(cursor, y, w, h)
    cursor += w + gap + extraGap
  }
}

export function flexColumnCss(opts: FlexCssColumnOpts): void {
  const {padL, padR, padT, padB, gap} = paddings(opts)
  const innerX = opts.x + padL
  const innerY = opts.y + padT
  const innerW = Math.max(0, opts.w - padL - padR)
  const innerH = Math.max(0, opts.h - padT - padB)
  const items = opts.items.filter((i): i is FlexCssColumnItem => i !== null && i !== undefined && i !== false)
  if (items.length === 0) return

  const totalGap = gap * (items.length - 1)
  const mains = items.map((i) => resolveMain(parseUiSize(i.height), innerH))
  const fixedAndPercent = mains.reduce((s, m) => s + m.px, 0)
  const frTotal = mains.reduce((s, m) => s + m.frUnits, 0)
  const remaining = innerH - fixedAndPercent - totalGap
  const frUnitPx = frTotal > 0 ? Math.max(0, remaining / frTotal) : 0

  let startY = innerY
  let extraGap = 0
  if (frTotal === 0) {
    const slack = Math.max(0, remaining)
    if (opts.justifyContent === "center") startY += slack / 2
    else if (opts.justifyContent === "end") startY += slack
    else if (opts.justifyContent === "space-between" && items.length > 1) extraGap = slack / (items.length - 1)
    else if (opts.justifyContent === "space-around" && items.length > 0) {
      startY += slack / (items.length * 2)
      extraGap = slack / items.length
    }
  }

  let cursor = startY
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const m = mains[i]!
    const h = m.frUnits > 0 ? m.frUnits * frUnitPx : m.px
    const cross = resolveCross(item.width, innerW)
    const align = item.alignSelf ?? opts.alignItems ?? "stretch"
    let x = innerX
    let w: number
    if (cross === "stretch" || align === "stretch") {
      w = innerW
    } else {
      w = cross
      if (align === "center") x += (innerW - w) / 2
      else if (align === "end") x += innerW - w
    }
    item.draw(x, cursor, w, h)
    cursor += h + gap + extraGap
  }
}
