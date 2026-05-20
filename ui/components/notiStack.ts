/**
 * NotiStack — generic стек тостов поверх UiCanvas.
 *
 * Архитектура (важно):
 *   • КАЖДОЕ уведомление — отдельная NotificationPane (Pane), которой
 *     UiCanvas даёт свой `rect` через layout-функцию. Это нужно, чтобы
 *     `cardAt` не перехватывал клики на пустом пространстве между/около
 *     уведомлений: клик попадает на NotificationPane только в её rect,
 *     иначе пробрасывается ниже (на screen-Pane'ы приложения).
 *   • NotiStack — controller-объект, не Pane. Он держит список items, их
 *     NotificationPane-инстансы и layout-функции, которые UiCanvas
 *     пересчитывает на каждом resize.
 *   • Z-уровень: каждая NotificationPane поднята `node.position.z = 0.001`
 *     при addPane, чтобы depth-test ставил её перед screen-Pane'ами.
 *     БОЛЬШИЕ z (0.05+) ломают совпадение visual ↔ hit-rect под
 *     perspective camera: mesh масштабируется ~9%, hit остаётся в
 *     исходных pane-px → курсор реагирует «выше». 0.001 даёт правильный
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
 * Поведение dismissed: NotificationPane остаётся attached к UiCanvas, но
 * её layout возвращает {visible:false}. Re-push с тем же id восстанавливает.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {Pane, flexRow, type UiCanvas} from "@metafor/elements"
import {autoButtonWidth, Button as button} from "./Button.ts"

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

/**
 * Цветовая палитра NotiStack. Приложение передаёт свои инстансы
 * `Color` / `TextMaterial` (reuse, без GC-нагрузки на render).
 *
 * Семантика:
 *   • `panel` — фон тоста (обычно тёмная панель).
 *   • `accent` — рамка тоста и заливка primary-кнопки.
 *   • `accentBorder` — рамка primary-кнопки (обычно светлее accent).
 *     Default = accent.
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
  /** Нижний отступ стека от bottom-edge: max(min, H * pct). */
  bottomGap?: {min: number; pct: number}
  /** Горизонтальный inset стека от side-edges: max(min, W * pct). */
  sidePad?: {min: number; pct: number}
}

interface ResolvedLayout {
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
  minHeight: 96,
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

function notifHeight(n: Notification, L: ResolvedLayout): number {
  // Вертикальный layout: текст сверху, кнопки снизу.
  const textH = L.titleFontPx + 10 + L.bodyFontPx + (n.footer ? 10 + L.footerFontPx : 0)
  const btnsH = (n.primary || n.secondary) ? L.btnGap + L.btnH : 0
  return Math.max(L.minHeight, L.padTop + textH + btnsH + L.padBottom)
}

/**
 * Pane для одного уведомления. Размер берётся из настроек notification.
 * Layout-функция в UiCanvas даёт ему конкретный rect (x, y, w, h, visible).
 */
class NotificationPane extends Pane {
  private n: Notification
  private dismissed = false
  private readonly theme: NotiStackTheme
  private readonly L: ResolvedLayout

  constructor(n: Notification, theme: NotiStackTheme, L: ResolvedLayout) {
    super({bgColor: null, borderColor: null, padding: 0})
    this.n = n
    this.theme = theme
    this.L = L
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
    const L = this.L

    // Фон + accent-рамка.
    this.drawRect(0, 0, W, H, panel)
    this.drawRect(0, 0, W, 1, accent)
    this.drawRect(0, H - 1, W, 1, accent)
    this.drawRect(0, 0, 1, H, accent)
    this.drawRect(W - 1, 0, 1, H, accent)

    // Вертикальный layout: текст сверху, кнопки снизу — полная ширина для текста.
    const textW = W - L.padInner * 2
    let curY = L.padTop - 4
    this.drawText(n.title, L.padInner, curY, {
      fontPx: L.titleFontPx,
      material: matTitle,
      maxWidthPx: textW,
    })
    curY += L.titleFontPx + 10
    this.drawText(n.body, L.padInner, curY, {
      fontPx: L.bodyFontPx,
      material: matBody,
      maxWidthPx: textW,
    })
    curY += L.bodyFontPx
    if (n.footer) {
      curY += 10
      this.drawText(n.footer, L.padInner, curY, {
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
      flexRow({
        x: W - L.padInner - totalBtnsW,
        y: btnsY,
        w: totalBtnsW,
        h: L.btnH,
        gap: L.btnGap,
        alignItems: "center",
        items: [
          n.secondary
            ? {
                width: secondaryW,
                height: L.btnH,
                draw: (bx, by, bw, bh) =>
                  button(this, bx, by, bw, bh, {
                    label: n.secondary!.label,
                    fontPx: L.btnFontPx,
                    fill: panel,
                    border: accent,
                    textMaterial: matSecondaryLabel,
                    action: n.secondary!.action,
                  }),
              }
            : null,
          n.primary
            ? {
                width: primaryW,
                height: L.btnH,
                draw: (bx, by, bw, bh) =>
                  button(this, bx, by, bw, bh, {
                    label: n.primary!.label,
                    fontPx: L.btnFontPx,
                    fill: accent,
                    border: accentBorder,
                    textMaterial: matPrimaryLabel,
                    action: n.primary!.action,
                  }),
              }
            : null,
        ],
      })
    }
  }
}

interface StackItem {
  n: Notification
  pane: NotificationPane
}

export class NotiStack {
  private readonly ui: UiCanvas
  private readonly theme: NotiStackTheme
  private readonly layout: ResolvedLayout
  private items: StackItem[] = []

  constructor(ui: UiCanvas, opts: NotiStackOpts) {
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
    this.ui.addPane(pane, ({w, h}) => this.computeRect(item, w, h))
    // См. JSDoc заголовка про выбор z = 0.001.
    pane.node.position.z = 0.001
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

  /** Layout одного notification-pane: пересчитывается UiCanvas-ом на resize. */
  private computeRect(target: StackItem, W: number, H: number) {
    if (target.pane.isDismissed()) {
      return {x: 0, y: 0, w: 0, h: 0, visible: false}
    }
    const L = this.layout
    const padX = Math.max(L.sidePad.min, Math.round(W * L.sidePad.pct))
    const bottomGap = Math.max(L.bottomGap.min, Math.round(H * L.bottomGap.pct))
    const paneW = W - padX * 2
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
    const y = H - bottomGap - offset - paneH
    return {x: padX, y, w: paneW, h: paneH, visible: true}
  }
}
