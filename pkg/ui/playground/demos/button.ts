/**
 * Component: button.
 *
 * Кнопка и HTML-like события. Demo собирается из стандартных UI-компонентов:
 * Card / button / badge / divider.
 */

import {Color} from "@metafor/engine"
import {Card, type UiCanvas, button, autoButtonWidth, badge, flexRow, divider, type Tone} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

type ButtonEventKind = "hover" | "leave" | "press" | "release" | "click"
type ButtonStatus = "idle" | "hover" | "active" | "clicked" | "disabled"

const glassShell = new Color(0.055, 0.075, 0.11, 0.56)
const glassBorder = new Color(0.82, 0.91, 1, 0.20)
const eventShell = new Color(0.012, 0.017, 0.026, 0.96)

class ButtonSpecCard extends Card {
  constructor(
    private readonly p: {
      tone: () => Tone
      fontPx: () => number
      paddingX: () => number
      height: () => number
      radius: () => number
      disabled: () => boolean
    },
  ) {
    super({bgColor: glassShell, borderColor: glassBorder, borderWidthPx: 1, borderRadiusPx: 24})
  }

  protected render(): void {
    const x = 24
    const w = Math.max(1, this.rectW - x * 2)

    this.drawText("button (this, x, y, w, h, opts)", x, 16, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: w,
    })
    this.drawText("HTML-like states: hover, active press, click, disabled", x, 36, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: w,
    })
    divider(this, x, 58, w, {color: glassBorder})

    this.drawText(
      `tone="${this.p.tone()}" fontPx=${this.p.fontPx()} paddingX=${this.p.paddingX()} height=${this.p.height()} radius=${this.p.radius()} disabled=${this.p.disabled()}`,
      x,
      68,
      {
        fontPx: 11,
        material: this.materials.muted,
        maxWidthPx: w,
      },
    )
  }
}

class ButtonControlsCard extends Card {
  constructor(
    private readonly p: {
      label: () => string
      tone: () => Tone
      fontPx: () => number
      paddingX: () => number
      height: () => number
      radius: () => number
      disabled: () => boolean
    },
    private readonly events: ButtonEventsCard,
  ) {
    super({bgColor: glassShell, borderColor: glassBorder, borderWidthPx: 1, borderRadiusPx: 28})
  }

  protected render(): void {
    const label = this.p.label()
    const tone = this.p.tone()
    const fontPx = this.p.fontPx()
    const padX = this.p.paddingX()
    const h = this.p.height()
    const radius = this.p.radius()
    const disabled = this.p.disabled()
    const contentX = 24
    const contentW = Math.max(1, this.rectW - 48)

    this.drawText("Configured button + tone variants + disabled:", contentX, 18, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: contentW,
    })
    const rowFontPx = Math.min(fontPx, 14)
    const rowPadX = Math.min(padX, 20)
    const rowH = Math.min(h, 52)
    const rowRadius = Math.min(radius, rowH / 2)
    const tones: Tone[] = [tone, "live", "paused", "warn", "warn"]
    const labels = [label, "Run", "Pause", "Stop", "Forbidden"]
    flexRow({
      x: contentX,
      y: 42,
      w: contentW,
      h: rowH,
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
      items: tones.map((t, i) => ({
        width: autoButtonWidth(this, labels[i]!, rowFontPx, rowPadX),
        height: rowH,
        draw: (x, y, ww, hh) => {
          const rowDisabled = labels[i] === "Forbidden"
          button(this, x, y, ww, hh, {
            label: labels[i]!,
            tone: t,
            fontPx: rowFontPx,
            radius: rowRadius,
            disabled: rowDisabled,
            ...(rowDisabled ? {tooltip: "disabled: no click event"} : {}),
            onHover: () => this.#record("hover", labels[i]!, rowDisabled),
            onLeave: () => this.#record("leave", labels[i]!, rowDisabled),
            onPress: () => this.#record("press", labels[i]!, rowDisabled),
            onRelease: () => this.#record("release", labels[i]!, rowDisabled),
            action: () => this.#record("click", labels[i]!, rowDisabled),
          })
        },
      })),
    })
  }

  #record(kind: ButtonEventKind, label: string, disabled = false): void {
    this.events.record(kind, label, disabled)
    this.requestRender()
  }
}

class ButtonEventsCard extends Card {
  #status: ButtonStatus = "idle"
  #clicks = 0
  #events: string[] = ["ready: hover, press, release, click"]

  constructor() {
    super({bgColor: eventShell, borderColor: glassBorder, borderWidthPx: 1, borderRadiusPx: 22})
  }

  record(kind: ButtonEventKind, label: string, disabled = false): void {
    if (kind === "click") this.#clicks += 1
    if (disabled) this.#status = "disabled"
    else if (kind === "press") this.#status = "active"
    else if (kind === "hover" || kind === "release") this.#status = "hover"
    else if (kind === "click") this.#status = "clicked"
    else this.#status = "idle"

    const suffix = disabled ? " / disabled" : ""
    this.#events = [`${kind}: ${label}${suffix}`, ...this.#events].slice(0, 5)
    this.requestRender()
  }

  protected render(): void {
    const x = 24
    const w = Math.max(1, this.rectW - 48)
    this.drawText("Event visualization", x, 18, {
      fontPx: 12,
      material: this.materials.cyan,
      maxWidthPx: w,
    })
    this.drawText("ready: hover, press, release, click", x + Math.max(300, w - 230), 18, {
      fontPx: 10,
      material: this.materials.text,
      maxWidthPx: 230,
    })
    this.drawText(`state=${this.#status} clicks=${this.#clicks}`, x, 42, {
      fontPx: 11,
      material: this.#status === "disabled" ? this.materials.red : this.materials.muted,
      maxWidthPx: w,
    })

    const states: Array<{label: ButtonStatus; active: boolean; tone: Tone}> = [
      {label: "idle", active: this.#status === "idle", tone: "neutral"},
      {label: "hover", active: this.#status === "hover", tone: "live"},
      {label: "active", active: this.#status === "active", tone: "paused"},
      {label: "clicked", active: this.#status === "clicked", tone: "live"},
      {label: "disabled", active: this.#status === "disabled", tone: "warn"},
    ]
    let cx = x
    for (const s of states) {
      const chipW = Math.max(62, this.measureText(s.label, 10) + 18)
      badge(this, cx, 72, chipW, 24, {
        label: s.label,
        tone: s.active ? s.tone : "neutral",
        fontPx: 10,
      })
      cx += chipW + 6
    }

    const logX = x + Math.max(300, w - 230)
    for (let i = 0; i < this.#events.length; i++) {
      this.drawText(this.#events[i]!, logX, 42 + i * 17, {
        fontPx: 10,
        material: i === 0 ? this.materials.text : this.materials.muted,
        maxWidthPx: Math.max(1, x + w - logX),
      })
    }
  }
}

export default function buttonDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Button",
    description: "VisionOS-like glass button: hover/active/click/disabled отображаются визуально. Demo собрано из Card / button / badge / divider.",
    breadcrumb: "Components / Button",
  })

  params.group({title: "Props"})
  const label = params.text("label", {
    label: "label",
    type: "string",
    description: "Текст на кнопке. Центрируется через measureText + автообрезание по maxWidthPx.",
    default: "Save changes",
  })
  const tone = params.select<Tone>("tone", {
    label: "tone",
    description:
      "Палитра tone: neutral — bgElevated/border/text, live — green-fill+border+text, paused — orange, warn — red.",
    default: "neutral",
    options: ["neutral", "live", "paused", "warn"],
  })
  const fontPx = params.number("fontPx", {
    label: "fontPx",
    description: "Размер шрифта подписи в logical-px. Влияет также на autoButtonWidth.",
    default: 14,
    min: 8,
    max: 24,
    step: 1,
    unit: "px",
  })

  params.group({title: "Geometry"})
  const paddingX = params.number("paddingX", {
    label: "paddingX",
    description: "Горизонтальный padding кнопки в px. autoButtonWidth(label, fontPx, paddingX) → ширина кнопки.",
    default: 28,
    min: 0,
    max: 40,
    step: 1,
    unit: "px",
  })
  const height = params.number("height", {
    label: "height",
    description: "Высота кнопки в px. Для visionOS regular/large ориентир — 44/52 pt.",
    default: 52,
    min: 18,
    max: 64,
    step: 1,
    unit: "px",
  })
  const radius = params.number("radius", {
    label: "radius",
    description: "Скругление кнопки в px. Значение выше height/2 автоматически клампится в capsule.",
    default: 999,
    min: 0,
    max: 999,
    step: 1,
    unit: "px",
  })
  const disabled = params.boolean("disabled", {
    label: "disabled",
    description: "Включает запрещённое состояние: визуально muted/not-allowed, click/action не вызывается.",
    default: false,
  })

  const specCard = new ButtonSpecCard({tone, fontPx, paddingX, height, radius, disabled})
  const eventCard = new ButtonEventsCard()
  const controlsCard = new ButtonControlsCard({label, tone, fontPx, paddingX, height, radius, disabled}, eventCard)
  params.onChange(() => canvas.relayout())

  const cardWidth = (w: number): number => Math.min(640, Math.max(280, w - 32))
  const centeredX = (w: number): number => Math.floor((w - cardWidth(w)) / 2)
  const gap = 12
  const top = 24
  const specH = 96
  const controlsH = 126
  const eventsH = 142

  canvas.addCard(specCard, ({w}) => ({x: centeredX(w), y: top, w: cardWidth(w), h: specH}))
  canvas.addCard(controlsCard, ({w}) => ({x: centeredX(w), y: top + specH + gap, w: cardWidth(w), h: controlsH}))
  canvas.addCard(eventCard, ({w}) => ({
    x: centeredX(w),
    y: top + specH + gap + controlsH + gap,
    w: cardWidth(w),
    h: eventsH,
  }))
}
