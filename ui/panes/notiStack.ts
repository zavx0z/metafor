/**
 * NotiStack — generic стек тостов поверх UiRuntime.
 *
 * Архитектура (важно):
 *   • КАЖДОЕ уведомление — отдельная NotificationPane (UiSurface), которой
 *     UiRuntime даёт свой `rect` через layout-функцию. Это нужно, чтобы
 *     `cardAt` не перехватывал клики на пустом пространстве между/около
 *     уведомлений: клик попадает на NotificationPane только в её rect,
 *     иначе пробрасывается ниже (на screen-UiSurface'ы приложения).
 *   • NotiStack — controller-объект, не UiSurface. Он держит список items, их
 *     NotificationPane-инстансы и layout-функции, которые UiRuntime
 *     пересчитывает на каждом resize.
 *   • Z-уровень: каждая NotificationPane поднята `node.position.z = 1`
 *     при addSurface, чтобы depth-test ставил её перед screen-UiSurface'ами.
 *     БОЛЬШИЕ z (0.05+) ломают совпадение visual ↔ hit-rect под
 *     perspective camera: mesh масштабируется ~9%, hit остаётся в
 *     исходных pane-px → курсор реагирует «выше». 1mm даёт правильный
 *     depth-order и scale-error <0.2%.
 *
 * Tема — обязательный параметр: NotiStack не знает о цветах приложения,
 * принимает их через `NotiStackTheme`. См. demo/journal usage в main.ts.
 *
 * API:
 *   const stack = new NotiStack(ui, { theme })
 *   stack.push({id, title, body, footer?, primary?, secondary?})
 *   stack.dismiss(id)
 *   stack.clear()
 *
 * Поведение dismissed: NotificationPane остаётся attached к UiRuntime, но
 * её layout возвращает {visible:false}. Re-push с тем же id восстанавливает.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {UiSurface, Z, type UiRuntime} from "@ui/elements"
import {autoButtonWidth, Button as button, Pane} from "@ui/components"

export interface NotiAction {
  label: string
  action: () => void
}

export interface Notification {
  id: string
  title: string
  body: string
  footer?: string
  primary?: NotiAction
  secondary?: NotiAction
}

export interface NotiStackBounds {
  x: number
  y: number
  w: number
  h: number
}

export interface NotiStackViewport {
  w: number
  h: number
}

/**
 * Цветовая палитра NotiStack. Приложение передаёт свои инстансы
 * `Color` / `TextMaterial` (reuse, без GC-нагрузки на render).
 *
 * Семантика:
 *   • `panel` — фон тоста (обычно тёмная панель).
 *   • `accent` — рамка тоста и заливка primary-кнопки.
 *   • `accentBorder` — рамка primary-кнопки (обычно светлее accent).
 *     Default = accent.
 *   • `surfaceBorder` — рамка самого toast. Default = accent.
 *   • `surfaceTint` — лёгкая tint-подложка для дешёвого glass fallback без
 *     backdrop blur. Default = accent RGB.
 *   • `matTitle` — короткий заголовок (мелкий, тон accent).
 *   • `matBody` — основной текст.
 *   • `matFooter` — приглушённая подпись под body.
 *   • `matPrimaryLabel` — label primary-кнопки (контраст к accent fill,
 *     обычно тёмный текст на золоте).
 *   • `matSecondaryLabel` — label secondary-кнопки (на panel, тон accent).
 */
export interface NotiStackTheme {
  panel: Color
  accent: Color
  accentBorder?: Color
  surfaceBorder?: Color
  surfaceTint?: Color
  matTitle: TextMaterial
  matBody: TextMaterial
  matFooter: TextMaterial
  matPrimaryLabel: TextMaterial
  matSecondaryLabel: TextMaterial
}

/**
 * Геометрические настройки. Все опциональны; дефолты подобраны под
 * широкий экран desktop / tablet (журнальная вёрстка).
 */
export interface NotiStackLayout {
  /**
   * Ограничивающий rect для стека. Без bounds стек позиционируется
   * относительно всего runtime viewport.
   */
  bounds?: NotiStackBounds | ((viewport: NotiStackViewport) => NotiStackBounds)
  padTop?: number
  padBottom?: number
  padInner?: number
  stackGap?: number
  titleFontPx?: number
  bodyFontPx?: number
  footerFontPx?: number
  btnFontPx?: number
  btnH?: number
  btnGap?: number
  minHeight?: number
  minWidth?: number
  maxWidth?: number
  surfaceOpacity?: number
  surfaceTintOpacity?: number
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left"
  /** Вертикальный edge-inset стека от top/bottom edge: max(min, bounds.h * pct). */
  bottomGap?: {min: number; pct: number}
  /** Горизонтальный inset стека от side-edges: max(min, bounds.w * pct). */
  sidePad?: {min: number; pct: number}
}

interface ResolvedLayout {
  bounds?: NotiStackBounds | ((viewport: NotiStackViewport) => NotiStackBounds)
  padTop: number
  padBottom: number
  padInner: number
  stackGap: number
  titleFontPx: number
  bodyFontPx: number
  footerFontPx: number
  btnFontPx: number
  btnH: number
  btnGap: number
  minHeight: number
  minWidth: number
  maxWidth: number
  surfaceOpacity: number
  surfaceTintOpacity: number
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left"
  bottomGap: {min: number; pct: number}
  sidePad: {min: number; pct: number}
}

const DEFAULT_LAYOUT: ResolvedLayout = {
  padTop: 18,
  padBottom: 18,
  padInner: 18,
  stackGap: 12,
  titleFontPx: 18,
  bodyFontPx: 22,
  footerFontPx: 14,
  btnFontPx: 16,
  btnH: 42,
  btnGap: 10,
  minHeight: 108,
  minWidth: 320,
  maxWidth: 440,
  surfaceOpacity: 0.80,
  surfaceTintOpacity: 0.08,
  position: "bottom-right",
  bottomGap: {min: 28, pct: 0.05},
  sidePad: {min: 20, pct: 0.04},
}

export interface NotiStackOpts {
  theme: NotiStackTheme
  layout?: NotiStackLayout
}

function resolveLayout(layout: NotiStackLayout | undefined): ResolvedLayout {
  if (!layout) return DEFAULT_LAYOUT
  return {
    ...DEFAULT_LAYOUT,
    ...layout,
    bottomGap: {...DEFAULT_LAYOUT.bottomGap, ...(layout.bottomGap ?? {})},
    sidePad: {...DEFAULT_LAYOUT.sidePad, ...(layout.sidePad ?? {})},
  }
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function resolveBounds(L: ResolvedLayout, W: number, H: number): NotiStackBounds {
  const raw = typeof L.bounds === "function" ? L.bounds({w: W, h: H}) : L.bounds
  if (raw === undefined) return {x: 0, y: 0, w: W, h: H}
  const x = finiteNumber(raw.x, 0)
  const y = finiteNumber(raw.y, 0)
  const maxW = Math.max(1, W - x)
  const maxH = Math.max(1, H - y)
  return {
    x,
    y,
    w: Math.max(1, Math.min(finiteNumber(raw.w, maxW), maxW)),
    h: Math.max(1, Math.min(finiteNumber(raw.h, maxH), maxH)),
  }
}

function notifHeight(n: Notification, L: ResolvedLayout): number {
  // Вертикальный layout: текст сверху, кнопки снизу.
  const bodyLines = n.body.length > 52 ? 2 : 1
  const textH = L.titleFontPx + 8 + Math.ceil(L.bodyFontPx * 1.25) * bodyLines + (n.footer ? 8 + L.footerFontPx : 0)
  const btnsH = (n.primary || n.secondary) ? L.btnGap + L.btnH : 0
  return Math.max(L.minHeight, L.padTop + textH + btnsH + L.padBottom)
}

/**
 * UiSurface для одного уведомления. Размер берётся из настроек notification.
 * Layout-функция в UiRuntime даёт ему конкретный rect (x, y, w, h, visible).
 */
class NotificationPane extends UiSurface {
  private n: Notification
  private dismissed = false
  private readonly theme: NotiStackTheme
  private readonly L: ResolvedLayout
  private readonly surfaceTint: Color

  constructor(n: Notification, theme: NotiStackTheme, L: ResolvedLayout) {
    super({bgColor: null, borderColor: null, padding: 0})
    this.n = n
    this.theme = theme
    this.L = L
    this.surfaceTint = theme.surfaceTint ?? new Color(theme.accent.r, theme.accent.g, theme.accent.b, 1)
  }

  update(n: Notification): void {
    this.n = n
    this.dismissed = false
    this.requestRender()
  }

  setDismissed(v: boolean): void {
    if (this.dismissed === v) return
    this.dismissed = v
    this.requestRender()
  }

  isDismissed(): boolean {
    return this.dismissed
  }

  getNotification(): Notification {
    return this.n
  }

  protected render(): void {
    if (this.dismissed) return
    const W = this.rectW
    const H = this.rectH
    const n = this.n
    const {panel, accent, matTitle, matBody, matFooter, matPrimaryLabel, matSecondaryLabel} = this.theme
    const accentBorder = this.theme.accentBorder ?? accent
    const surfaceBorder = this.theme.surfaceBorder ?? accent
    const L = this.L

    Pane(this, 0, 0, W, H, {
      variant: "outlined",
      sx: {
        background: "glass",
        glassFill: panel,
        glassTint: this.surfaceTint,
        glassTintOpacity: L.surfaceTintOpacity,
        borderColor: surfaceBorder,
        borderRadius: 18,
        opacity: L.surfaceOpacity,
        padding: 0,
        zIndex: Z.CONTAINER,
      },
    })

    // Вертикальный layout: текст сверху, кнопки снизу — полная ширина для текста.
    const textW = W - L.padInner * 2
    const buttonAreaH = n.primary || n.secondary ? L.btnGap + L.btnH : 0
    const footerH = n.footer ? L.footerFontPx + 8 : 0
    const bodyY = L.padTop + L.titleFontPx + 8
    const bodyH = Math.max(20, H - bodyY - L.padBottom - buttonAreaH - footerH)
    this.drawText(n.title, L.padInner, L.padTop - 2, {
      fontPx: L.titleFontPx,
      material: matTitle,
      maxWidthPx: textW,
    })
    this.drawTextBlock(n.body, L.padInner, bodyY, textW, bodyH, {
      fontPx: L.bodyFontPx,
      material: matBody,
      lineHeight: 1.25,
      wrap: true,
      fit: "shrink",
      maxLines: 2,
      minFontPx: 11,
    })
    if (n.footer) {
      this.drawText(n.footer, L.padInner, H - L.padBottom - buttonAreaH - L.footerFontPx, {
        fontPx: L.footerFontPx,
        material: matFooter,
        maxWidthPx: textW,
      })
    }

    // Кнопки снизу: secondary слева, primary справа.
    const measure = (label: string) => Math.max(120, autoButtonWidth(this, label, L.btnFontPx, 28))
    const primaryW = n.primary ? measure(n.primary.label) : 0
    const secondaryW = n.secondary ? measure(n.secondary.label) : 0
    const totalBtnsW = primaryW + secondaryW + (n.primary && n.secondary ? L.btnGap : 0)
    if (totalBtnsW > 0) {
      const btnsY = H - L.padBottom - L.btnH
      let btnX = W - L.padInner - totalBtnsW
      if (n.secondary) {
        button(this, btnX, btnsY, secondaryW, L.btnH, {
          label: n.secondary.label,
          fontPx: L.btnFontPx,
          fill: panel,
          border: accent,
          textMaterial: matSecondaryLabel,
          action: n.secondary.action,
          radius: Math.min(14, L.btnH / 2),
        })
        btnX += secondaryW + L.btnGap
      }
      if (n.primary) {
        button(this, btnX, btnsY, primaryW, L.btnH, {
          label: n.primary.label,
          fontPx: L.btnFontPx,
          fill: accent,
          border: accentBorder,
          textMaterial: matPrimaryLabel,
          action: n.primary.action,
          radius: Math.min(14, L.btnH / 2),
        })
      }
    }
  }
}

interface StackItem {
  n: Notification
  pane: NotificationPane
}

export class NotiStack {
  private readonly ui: UiRuntime
  private readonly theme: NotiStackTheme
  private readonly layout: ResolvedLayout
  private items: StackItem[] = []

  constructor(ui: UiRuntime, opts: NotiStackOpts) {
    this.ui = ui
    this.theme = opts.theme
    this.layout = resolveLayout(opts.layout)
  }

  push(n: Notification): void {
    const existing = this.items.find((it) => it.n.id === n.id)
    if (existing) {
      existing.n = n
      existing.pane.update(n)
      this.ui.relayout()
      this.ui.requestRender()
      return
    }
    const pane = new NotificationPane(n, this.theme, this.layout)
    const item: StackItem = {n, pane}
    this.items.push(item)
    this.ui.addSurface(pane, ({w, h}) => this.computeRect(item, w, h))
    // См. JSDoc заголовка про выбор z = 1.
    pane.node.position.z = 1
    pane.node.updateMatrix()
    this.ui.relayout()
    this.ui.requestRender()
  }

  dismiss(id: string): void {
    const it = this.items.find((x) => x.n.id === id)
    if (!it) return
    it.pane.setDismissed(true)
    this.ui.relayout()
    this.ui.requestRender()
  }

  clear(): void {
    for (const it of this.items) it.pane.setDismissed(true)
    this.ui.relayout()
    this.ui.requestRender()
  }

  /** Layout одного notification-pane: пересчитывается UiRuntime-ом на resize. */
  private computeRect(target: StackItem, W: number, H: number) {
    if (target.pane.isDismissed()) {
      return {x: 0, y: 0, w: 0, h: 0, visible: false}
    }
    const L = this.layout
    const bounds = resolveBounds(L, W, H)
    const padX = Math.max(L.sidePad.min, Math.round(bounds.w * L.sidePad.pct))
    const edgeGap = Math.max(L.bottomGap.min, Math.round(bounds.h * L.bottomGap.pct))
    const availableW = Math.max(1, bounds.w - padX * 2)
    const paneW = Math.max(Math.min(L.minWidth, availableW), Math.min(L.maxWidth, availableW))
    const x = L.position.endsWith("right") ? bounds.x + bounds.w - padX - paneW : bounds.x + padX
    // Считаем суммарную высоту всех ВИДИМЫХ предыдущих уведомлений
    // (тех, что выше в стеке = добавлены раньше).
    const visibleItems = this.items.filter((x) => !x.pane.isDismissed())
    const idxFromTop = visibleItems.indexOf(target)
    if (idxFromTop < 0) return {x: 0, y: 0, w: 0, h: 0, visible: false}

    // Первое (самое раннее) уведомление выше, последнее — у самого низа.
    // Считаем offset снизу = sum heights моих младших + gaps.
    const reverseIdx = visibleItems.length - 1 - idxFromTop
    let offset = 0
    for (let i = 0; i < reverseIdx; i++) {
      offset += notifHeight(visibleItems[visibleItems.length - 1 - i]!.n, L) + L.stackGap
    }
    const paneH = notifHeight(target.n, L)
    const y = L.position.startsWith("top")
      ? bounds.y + edgeGap + offset
      : bounds.y + bounds.h - edgeGap - offset - paneH
    return {x, y, w: paneW, h: paneH, visible: true}
  }
}
