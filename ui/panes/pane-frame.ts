/**
 * Общая геометрия pane chrome.
 *
 * Здесь живут повторяемые отступы header/rule/viewport, чтобы EditorPane,
 * TerminalPane и следующие panes не расходились из-за локальных magic numbers.
 */

export type PaneRect = {
  x: number
  y: number
  w: number
  h: number
}

export const PANE_FRAME = {
  headerHeight: 36,
  headerTextX: 16,
  headerTextY: 11,
  bodyInsetX: 8,
  bodyTopGap: 6,
  bodyBottomInset: 6,
  ruleHeight: 1,
} as const

export function paneHeaderRuleRect(rectW: number, headerHeight = PANE_FRAME.headerHeight, insetX = PANE_FRAME.bodyInsetX): PaneRect {
  return {
    x: insetX,
    y: headerHeight,
    w: Math.max(1, rectW - insetX * 2),
    h: PANE_FRAME.ruleHeight,
  }
}

export function paneBodyRect(
  rectW: number,
  rectH: number,
  opts: {
    headerHeight?: number
    showHeader?: boolean
    insetX?: number
    topGap?: number
    bottomInset?: number
  } = {},
): PaneRect {
  const showHeader = opts.showHeader ?? true
  const insetX = opts.insetX ?? PANE_FRAME.bodyInsetX
  const topGap = opts.topGap ?? PANE_FRAME.bodyTopGap
  const bottomInset = opts.bottomInset ?? PANE_FRAME.bodyBottomInset
  const headerHeight = opts.headerHeight ?? PANE_FRAME.headerHeight
  const y = showHeader ? headerHeight + topGap : 0
  return {
    x: insetX,
    y,
    w: Math.max(1, rectW - insetX * 2),
    h: Math.max(1, rectH - y - bottomInset),
  }
}
