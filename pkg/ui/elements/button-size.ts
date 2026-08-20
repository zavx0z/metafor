import {boxPadding, px, type StyleProps} from "./style.ts"

export type ButtonElementSize = "small" | "medium" | "large"

export type ButtonSizeMetrics = Readonly<{
  height: number
  paddingX: number
  iconPx: number
  fontPx: number
  radius: number
  gap: number
  borderWidth: number
}>

export type ButtonSizePlan = Readonly<{
  chrome: Readonly<{x: number; y: number; width: number; height: number}>
  hit: Readonly<{x: number; y: number; width: number; height: number}>
  content: Readonly<{x: number; y: number; width: number; height: number}>
  fontPx: number
  iconPx: number
  gap: number
  radius: number
  borderWidth: number
}>

/**
 * MetaFor's named Button tiers. Blender 4.5.5 owns the medium base
 * (`UI_UNIT_Y`, widget text/icon/margin and `.2` roundness), but exposes only
 * arbitrary `UILayout.scale_y/ui_units_y`, not semantic small/medium/large
 * tiers. The named tier API and its full-geometry scaling are project-owned.
 */
export const buttonSizeMetrics = Object.freeze({
  small: Object.freeze({height: 18, paddingX: 5, iconPx: 12, fontPx: 10, radius: 3, gap: 2, borderWidth: 1}),
  medium: Object.freeze({height: 22, paddingX: 6, iconPx: 14, fontPx: 11, radius: 4, gap: 3, borderWidth: 1}),
  large: Object.freeze({height: 28, paddingX: 8, iconPx: 18, fontPx: 14, radius: 5, gap: 4, borderWidth: 1}),
}) satisfies Readonly<Record<ButtonElementSize, ButtonSizeMetrics>>

/** Plans one Button's visible chrome, matching hit target and content geometry. */
export function planButtonSize(
  x: number,
  y: number,
  width: number,
  height: number,
  size: ButtonElementSize | undefined,
  style: StyleProps,
): ButtonSizePlan {
  const metrics = buttonSizeMetrics[size ?? "medium"]
  const availableHeight = Math.max(0, height)
  const visibleHeight = Math.min(availableHeight, Math.max(0, px(style.height, metrics.height)))
  const chrome = Object.freeze({
    x,
    y: y + (height - visibleHeight) / 2,
    width: Math.max(0, width),
    height: visibleHeight,
  })
  const padding = buttonPadding(style, metrics.paddingX)
  const content = Object.freeze({
    x: chrome.x + padding.left,
    y: chrome.y + padding.top,
    width: Math.max(0, chrome.width - padding.left - padding.right),
    height: Math.max(0, chrome.height - padding.top - padding.bottom),
  })
  return Object.freeze({
    chrome,
    hit: chrome,
    content,
    fontPx: px(style.fontSize, metrics.fontPx),
    iconPx: Math.min(metrics.iconPx, content.width, content.height),
    gap: px(style.gap, metrics.gap),
    radius: px(style.borderRadius, metrics.radius),
    borderWidth: px(style.borderWidth, metrics.borderWidth),
  })
}

function buttonPadding(
  style: StyleProps,
  defaultInline: number,
): Readonly<{top: number; right: number; bottom: number; left: number}> {
  const padding = boxPadding(style)
  const explicitInline = style.padding !== undefined || style.paddingX !== undefined
  const explicitBlock = style.padding !== undefined || style.paddingY !== undefined
  return {
    top: style.paddingTop !== undefined || explicitBlock ? padding.top : 0,
    right: style.paddingRight !== undefined || explicitInline ? padding.right : defaultInline,
    bottom: style.paddingBottom !== undefined || explicitBlock ? padding.bottom : 0,
    left: style.paddingLeft !== undefined || explicitInline ? padding.left : defaultInline,
  }
}
