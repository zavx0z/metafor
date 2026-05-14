/**
 * Component: NotiStack — controller-объект для стека тостов поверх UiCanvas.
 *
 * push(n) добавляет нотификацию в стек (растёт от bottom-right);
 * dismiss(id) и clear() прячут их; повторный push с тем же id обновляет.
 * Тема (Color/TextMaterial) передаётся через NotiStackTheme — NotiStack
 * не знает о палитре приложения.
 */

import {
  Card,
  type UiCanvas,
  palette,
  divider,
  button,
  autoButtonWidth,
  flexRow,
  NotiStack,
  type NotiStackTheme,
} from "@metafor/ui"
import {Color, TextMaterial} from "@metafor/engine"
import type {ParamsPanel} from "../params.ts"

type Accent = "cyan" | "green" | "orange" | "red" | "violet" | "blue"

const ACCENT_COLORS: Record<Accent, Color> = {
  cyan: palette.cyan,
  green: palette.green,
  orange: palette.orange,
  red: palette.red,
  violet: palette.violet,
  blue: palette.blue,
}

function buildTheme(accent: Accent): NotiStackTheme {
  const accentColor = ACCENT_COLORS[accent]
  return {
    panel: palette.bgElevated,
    accent: accentColor,
    accentBorder: accentColor,
    matTitle: new TextMaterial({color: accentColor}),
    matBody: new TextMaterial({color: palette.text}),
    matFooter: new TextMaterial({color: palette.muted}),
    // primary-кнопка имеет accent-fill → текст контрастный, тёмный.
    matPrimaryLabel: new TextMaterial({color: palette.bg}),
    // secondary-кнопка на panel → текст в цвет accent.
    matSecondaryLabel: new TextMaterial({color: accentColor}),
  }
}

/** Контрольная карточка с кнопками push/dismiss/clear. Сам NotiStack
 *  привязан к UiCanvas — он добавляет свои NotificationCard'ы рядом. */
class NotiControlCard extends Card {
  #counter = 0
  stack: NotiStack
  #ids: string[] = []

  constructor(
    private readonly p: {
      title: () => string
      body: () => string
      footer: () => string
      primaryLabel: () => string
      secondaryLabel: () => string
    },
    stack: NotiStack,
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
    this.stack = stack
  }

  protected render(): void {
    this.drawText("NotiStack controls", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    this.drawText(
      "Push — добавить тост в стек (нижний правый угол canvas). primary/secondary внутри тоста закрывают его через stack.dismiss(id). Стек растёт снизу вверх.",
      16,
      54,
      {fontPx: 11, material: this.materials.muted, maxWidthPx: this.rectW - 32},
    )

    const labels = ["Push", "Push (no buttons)", "Push (no footer)", "Dismiss last", "Clear all"]
    const widths = labels.map((l) => autoButtonWidth(this, l, 12, 14))

    flexRow({
      x: 16,
      y: 100,
      w: this.rectW - 32,
      h: 32,
      gap: 8,
      alignItems: "center",
      items: labels.map((label, i) => ({
        width: widths[i]!,
        height: 32,
        draw: (x, y, w, h) =>
          button(this, x, y, w, h, {
            label,
            tone: i === 4 ? "warn" : i === 3 ? "paused" : "live",
            fontPx: 12,
            action: () => this.#onAction(i),
          }),
      })),
    })

    this.drawText(`Active in stack: ${this.#ids.length}`, 16, 148, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: 240,
    })
  }

  #onAction(idx: number): void {
    const id = `n${++this.#counter}`
    const title = this.p.title()
    const body = this.p.body()
    const footer = this.p.footer()
    const primaryLabel = this.p.primaryLabel()
    const secondaryLabel = this.p.secondaryLabel()
    const stack = this.stack
    const dismiss = (toRemove: string): void => {
      stack.dismiss(toRemove)
      this.#ids = this.#ids.filter((x) => x !== toRemove)
      this.requestRender()
    }
    switch (idx) {
      case 0: {
        const n: {
          id: string
          title: string
          body: string
          footer?: string
          primary?: {label: string; action: () => void}
          secondary?: {label: string; action: () => void}
        } = {id, title, body}
        if (footer.length > 0) n.footer = footer
        if (primaryLabel.length > 0) n.primary = {label: primaryLabel, action: () => dismiss(id)}
        if (secondaryLabel.length > 0) n.secondary = {label: secondaryLabel, action: () => dismiss(id)}
        stack.push(n)
        this.#ids.push(id)
        break
      }
      case 1: {
        const n: {id: string; title: string; body: string; footer?: string} = {id, title, body}
        if (footer.length > 0) n.footer = footer
        stack.push(n)
        this.#ids.push(id)
        break
      }
      case 2: {
        const n: {
          id: string
          title: string
          body: string
          primary?: {label: string; action: () => void}
        } = {id, title, body}
        if (primaryLabel.length > 0) n.primary = {label: primaryLabel, action: () => dismiss(id)}
        stack.push(n)
        this.#ids.push(id)
        break
      }
      case 3: {
        const last = this.#ids[this.#ids.length - 1]
        if (last !== undefined) dismiss(last)
        break
      }
      case 4:
        stack.clear()
        this.#ids = []
        break
    }
    this.requestRender()
  }
}

export default function notiStackDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Noti Stack",
    description:
      "NotiStack — controller-объект (не Card) поверх UiCanvas. Пушит/прячет тосты через push(n) / dismiss(id) / clear(). Каждая нотификация — отдельная UiCard со своим rect (клики между уведомлениями пробрасываются на основные карточки). Тема передаётся через NotiStackTheme.",
    breadcrumb: "Components / Noti Stack",
  })

  params.group({title: "Theme"})
  const accent = params.select<Accent>("accent", {
    label: "accent",
    type: "palette key",
    description:
      "Цвет accent — рамка тоста, заголовок (matTitle), заливка primary-кнопки. matPrimaryLabel — тёмный для контраста с яркой заливкой.",
    default: "cyan",
    options: ["cyan", "green", "orange", "red", "violet", "blue"],
  })

  params.group({title: "Notification content"})
  const title = params.text("title", {
    label: "title",
    type: "string",
    description: "Заголовок тоста (рисуется сверху accent-цветом, fontPx=18 по умолчанию).",
    default: "НОВОЕ УВЕДОМЛЕНИЕ",
  })
  const body = params.text("body", {
    label: "body",
    type: "string",
    description: "Основной текст тоста (fontPx=22, palette.text).",
    multiline: true,
    default: "Пример нотификации поверх UiCanvas. Кнопка Push добавит ещё одну в стек.",
  })
  const footer = params.text("footer", {
    label: "footer",
    type: "string (optional)",
    description: "Опциональная мелкая подпись под body. Пустая строка → footer не рисуется.",
    default: "сегодня, 14:23",
  })

  params.group({title: "Actions"})
  const primaryLabel = params.text("primaryLabel", {
    label: "primary.label",
    type: "string (optional)",
    description: "Подпись primary-кнопки (правая, accent-fill). Пустая → кнопка не рисуется.",
    default: "Открыть",
  })
  const secondaryLabel = params.text("secondaryLabel", {
    label: "secondary.label",
    type: "string (optional)",
    description: "Подпись secondary-кнопки (левая, panel-fill с accent-рамкой). Пустая → не рисуется.",
    default: "Позже",
  })

  let currentAccent = accent()
  let stack = new NotiStack(canvas, {theme: buildTheme(currentAccent)})

  const controlCard = new NotiControlCard(
    {title, body, footer, primaryLabel, secondaryLabel},
    stack,
  )

  canvas.addCard(controlCard, ({w, h}) => ({
    x: 24,
    y: 24,
    w: Math.min(680, w - 48),
    h: 180,
  }))

  // Стартовый welcome-toast, чтобы при первом открытии demo был визуальный
  // пример.
  stack.push({
    id: "welcome",
    title: "ПРИМЕР",
    body: "Кликните Push в карточке-контроле, чтобы добавить ещё.",
    footer: "стек растёт снизу вверх",
    primary: {label: "OK", action: () => stack.dismiss("welcome")},
  })

  params.onChange(() => {
    if (accent() !== currentAccent) {
      // Theme captured при создании NotificationCard'а, поэтому смена темы
      // требует пересоздать стек (старые тосты сохранят прежнюю тему).
      currentAccent = accent()
      stack.clear()
      stack = new NotiStack(canvas, {theme: buildTheme(currentAccent)})
      controlCard.stack = stack
    }
    canvas.relayout()
  })
}
