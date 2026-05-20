/**
 * Иммедиэйт-mode flex layout. Чистая математика, без Yoga / WASM /
 * tree-build'ов: за один проход считает x/y/w/h каждого item'а и
 * вызывает item.draw().
 *
 * Использование:
 *   flexRow({x, y, w, h, paddingX, gap, alignItems, justifyContent, items})
 *   flexColumn({...})
 *
 * Item имеет фикс-размер по main-axis ИЛИ "grow"/"Nfr".
 * "grow" = 1fr. Несколько fr-элементов делят остаток пропорционально весу.
 * cross-axis выравнивается через alignItems / item.alignSelf.
 *
 * Удобный паттерн с Pane: используйте `Pane.padding` как outer-отступ от
 * canvas-краёв, а flex как inner-распределение items. Внутри Pane.render():
 *
 *   flexRow({
 *     x: 0, y: 0, w: this.rectW, h: this.rectH,         // rectW/rectH уже без Pane.padding
 *     justifyContent: "space-between",
 *     alignItems: "center",
 *     gap: 12,
 *     items: [
 *       {width: 32, height: 32, draw: (x, y, w, h) => button(this, x, y, w, h, {label: "‹", radius: w / 2, action})},
 *       {width: "grow", height: 0, draw: () => {}},     // spacer
 *       {width: 32, height: 32, draw: (x, y, w, h) => button(this, x, y, w, h, {label: "›", radius: w / 2, action})},
 *     ],
 *   })
 *
 * null/undefined/false items автоматически фильтруются — удобно для
 * условного отображения (`zoomMode === "spread" && {width:..., draw:...}`).
 */

export type FlexAlign = "start" | "center" | "end" | "stretch"
export type FlexJustify = "start" | "center" | "end" | "space-between" | "space-around"

type FlexBoxBase = {
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

type FlexMainSize = number | "grow" | `${number}fr`

export type FlexRowItem = {
  /** Фиксированная ширина в logical px, или "grow"/"Nfr". */
  width: FlexMainSize
  /** Высота для alignItems-вычислений. */
  height: number
  alignSelf?: FlexAlign
  /** Получает computed-slot (x, y, width, height). */
  draw(x: number, y: number, width: number, height: number): void
}

export type FlexColumnItem = {
  /** Фиксированная высота, или "grow"/"Nfr". */
  height: FlexMainSize
  /** Опциональная фикс-ширина (для alignSelf != stretch). */
  width?: number
  alignSelf?: FlexAlign
  draw(x: number, y: number, width: number, height: number): void
}

export type FlexRowOpts = FlexBoxBase & {items: Array<FlexRowItem | null | undefined | false>}
export type FlexColumnOpts = FlexBoxBase & {items: Array<FlexColumnItem | null | undefined | false>}

export function flexRow(opts: FlexRowOpts): void {
  const {padL, padR, padT, padB, gap} = paddings(opts)
  const innerX = opts.x + padL
  const innerY = opts.y + padT
  const innerW = Math.max(0, opts.w - padL - padR)
  const innerH = Math.max(0, opts.h - padT - padB)
  const items = opts.items.filter((i): i is FlexRowItem => i !== null && i !== undefined && i !== false)
  if (items.length === 0) return

  const totalGap = gap * (items.length - 1)
  const fixedSum = items.reduce((s, i) => s + (isFlexGrow(i.width) ? 0 : i.width), 0)
  const growFr = items.reduce((s, i) => s + flexFr(i.width), 0)
  const remaining = innerW - fixedSum - totalGap
  const frUnit = growFr > 0 ? Math.max(0, remaining / growFr) : 0

  let startX = innerX
  let extraGap = 0
  if (growFr === 0) {
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
  for (const item of items) {
    const w = isFlexGrow(item.width) ? frUnit * flexFr(item.width) : item.width
    let y = innerY
    let h = item.height
    const align = item.alignSelf ?? opts.alignItems ?? "start"
    if (align === "stretch") h = innerH
    else if (align === "center") y += (innerH - item.height) / 2
    else if (align === "end") y += innerH - item.height
    item.draw(cursor, y, w, h)
    cursor += w + gap + extraGap
  }
}

export function flexColumn(opts: FlexColumnOpts): void {
  const {padL, padR, padT, padB, gap} = paddings(opts)
  const innerX = opts.x + padL
  const innerY = opts.y + padT
  const innerW = Math.max(0, opts.w - padL - padR)
  const innerH = Math.max(0, opts.h - padT - padB)
  const items = opts.items.filter((i): i is FlexColumnItem => i !== null && i !== undefined && i !== false)
  if (items.length === 0) return

  const totalGap = gap * (items.length - 1)
  const fixedSum = items.reduce((s, i) => s + (isFlexGrow(i.height) ? 0 : i.height), 0)
  const growFr = items.reduce((s, i) => s + flexFr(i.height), 0)
  const remaining = innerH - fixedSum - totalGap
  const frUnit = growFr > 0 ? Math.max(0, remaining / growFr) : 0

  let startY = innerY
  let extraGap = 0
  if (growFr === 0) {
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
  for (const item of items) {
    const h = isFlexGrow(item.height) ? frUnit * flexFr(item.height) : item.height
    let x = innerX
    let w = innerW
    const align = item.alignSelf ?? opts.alignItems ?? "stretch"
    if (align !== "stretch" && item.width !== undefined) {
      w = Math.min(innerW, item.width)
      if (align === "center") x += (innerW - w) / 2
      else if (align === "end") x += innerW - w
    }
    item.draw(x, cursor, w, h)
    cursor += h + gap + extraGap
  }
}

function paddings(opts: FlexBoxBase): {padL: number; padR: number; padT: number; padB: number; gap: number} {
  return {
    padL: opts.paddingLeft ?? opts.paddingX ?? 0,
    padR: opts.paddingRight ?? opts.paddingX ?? 0,
    padT: opts.paddingTop ?? opts.paddingY ?? 0,
    padB: opts.paddingBottom ?? opts.paddingY ?? 0,
    gap: opts.gap ?? 0,
  }
}

function isFlexGrow(value: FlexMainSize): value is "grow" | `${number}fr` {
  return value === "grow" || (typeof value === "string" && value.endsWith("fr"))
}

function flexFr(value: FlexMainSize): number {
  if (value === "grow") return 1
  if (typeof value === "string" && value.endsWith("fr")) {
    const parsed = Number.parseFloat(value.slice(0, -2))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  return 0
}
