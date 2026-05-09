/**
 * Иммедиэйт-mode flex layout. Чистая математика, без Yoga / WASM /
 * tree-build'ов: за один проход считает x/y/w/h каждого item'а и
 * вызывает item.draw().
 *
 * Использование:
 *   flexRow({x, y, w, h, paddingX, gap, alignItems, justifyContent, items})
 *   flexColumn({...})
 *
 * Item имеет фикс-размер по main-axis ИЛИ "grow" (распределяется поровну).
 * cross-axis выравнивается через alignItems / item.alignSelf.
 *
 * Удобный паттерн с Card: используйте `Card.padding` как outer-отступ от
 * canvas-краёв, а flex как inner-распределение items. Внутри Card.render():
 *
 *   flexRow({
 *     x: 0, y: 0, w: this.rectW, h: this.rectH,         // rectW/rectH уже без Card.padding
 *     justifyContent: "space-between",
 *     alignItems: "center",
 *     gap: 12,
 *     items: [
 *       {width: 32, height: 32, draw: (x, y, w, h) => circleButton(this, ...)},
 *       {width: "grow", height: 0, draw: () => {}},     // spacer
 *       {width: 32, height: 32, draw: (x, y, w, h) => circleButton(this, ...)},
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

export type FlexRowItem = {
  /** Фиксированная ширина в logical px, или "grow". */
  width: number | "grow"
  /** Высота для alignItems-вычислений. */
  height: number
  alignSelf?: FlexAlign
  /** Получает computed-slot (x, y, width, height). */
  draw(x: number, y: number, width: number, height: number): void
}

export type FlexColumnItem = {
  /** Фиксированная высота, или "grow". */
  height: number | "grow"
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
  const fixedSum = items.reduce((s, i) => s + (i.width === "grow" ? 0 : i.width), 0)
  const growCount = items.filter((i) => i.width === "grow").length
  const remaining = innerW - fixedSum - totalGap
  const growSize = growCount > 0 ? Math.max(0, remaining / growCount) : 0

  let startX = innerX
  let extraGap = 0
  if (growCount === 0) {
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
    const w = item.width === "grow" ? growSize : item.width
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
  const fixedSum = items.reduce((s, i) => s + (i.height === "grow" ? 0 : i.height), 0)
  const growCount = items.filter((i) => i.height === "grow").length
  const remaining = innerH - fixedSum - totalGap
  const growSize = growCount > 0 ? Math.max(0, remaining / growCount) : 0

  let startY = innerY
  let extraGap = 0
  if (growCount === 0) {
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
    const h = item.height === "grow" ? growSize : item.height
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
