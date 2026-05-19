/**
 * Component: button.
 *
 * Прямоугольная кнопка с фоном, рамкой и подписью. Параметры на правой
 * панели позволяют переключать tone, размер шрифта и текст label.
 */

import {Color} from "@metafor/engine"
import {Card, type UiCanvas, palette, button, autoButtonWidth, flexRow, divider, type Tone, Z} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

type ButtonEventKind = "hover" | "leave" | "press" | "release" | "click"
type ButtonStatus = "idle" | "hover" | "active" | "clicked" | "disabled"

const glassShell = new Color(0.055, 0.075, 0.11, 0.56)
const glassBorder = new Color(0.82, 0.91, 1, 0.20)
const glassSoft = new Color(1, 1, 1, 0.055)

class ButtonCard extends Card {
  #status: ButtonStatus = "idle"
  #clicks = 0
  #events: string[] = ["ready: hover, press, release, click"]

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
  ) {
    super({bgColor: glassShell, borderColor: glassBorder, borderWidthPx: 1, borderRadiusPx: 28})
  }

  protected render(): void {
    const contentW = Math.min(560, Math.max(1, this.rectW - 48))
    const contentX = Math.floor((this.rectW - contentW) / 2)
    const textX = contentX + 16
    const textW = Math.max(1, contentW - 32)

    this.#drawAtmosphere(contentX, contentW)

    this.drawText("button (this, x, y, w, h, opts)", textX, 20, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: textW,
    })
    this.drawText("HTML-like states: hover, active press, click, disabled", textX, 40, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: textW,
    })
    divider(this, textX, 62, textW, {color: glassBorder})

    const label = this.p.label()
    const tone = this.p.tone()
    const fontPx = this.p.fontPx()
    const padX = this.p.paddingX()
    const h = this.p.height()
    const radius = this.p.radius()
    const disabled = this.p.disabled()

    this.drawText(`tone="${tone}" fontPx=${fontPx} paddingX=${padX} height=${h} radius=${radius} disabled=${disabled}`, textX, 70, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: textW,
    })

    const rowY = 106
    this.drawText("Configured button + tone variants + disabled:", contentX, rowY, {
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
      y: rowY + 18,
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

    const panelY = rowY + rowH + 46
    this.#drawEventPanel(contentX, panelY, contentW, 112)
  }

  #record(kind: ButtonEventKind, label: string, disabled = false): void {
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

  #drawAtmosphere(x: number, w: number): void {
    this.drawRoundedRect(x, 14, w, 76, {
      radius: 24,
      fill: glassSoft,
      border: new Color(1, 1, 1, 0.08),
      borderWidth: 1,
      z: Z.CONTAINER,
    })
  }

  #drawEventPanel(x: number, y: number, w: number, h: number): void {
    this.drawRoundedRect(x, y, w, h, {
      radius: 20,
      fill: new Color(0.03, 0.045, 0.065, 0.62),
      border: glassBorder,
      borderWidth: 1,
      z: Z.ELEMENT,
    })
    this.drawText("Event visualization", x + 14, y + 12, {
      fontPx: 12,
      material: this.materials.cyan,
      maxWidthPx: w - 20,
    })
    this.drawText(`state=${this.#status} clicks=${this.#clicks}`, x + 14, y + 34, {
      fontPx: 11,
      material: this.#status === "disabled" ? this.materials.red : this.materials.muted,
      maxWidthPx: w - 20,
    })

    const states: Array<{label: ButtonStatus; active: boolean}> = [
      {label: "idle", active: this.#status === "idle"},
      {label: "hover", active: this.#status === "hover"},
      {label: "active", active: this.#status === "active"},
      {label: "clicked", active: this.#status === "clicked"},
      {label: "disabled", active: this.#status === "disabled"},
    ]
    let cx = x + 14
    for (const s of states) {
      const chipW = Math.max(62, this.measureText(s.label, 10) + 18)
      this.drawRoundedRect(cx, y + 60, chipW, 24, {
        radius: 12,
        fill: s.active ? new Color(0.38, 0.78, 1, 0.18) : new Color(1, 1, 1, 0.045),
        border: s.active ? palette.cyan : new Color(1, 1, 1, 0.12),
        borderWidth: 1,
        z: Z.ELEMENT,
      })
      this.drawTextCentered(s.label, cx + chipW / 2, y + 72, {
        fontPx: 10,
        material: s.active ? this.materials.cyan : this.materials.muted,
        maxWidthPx: chipW - 8,
      })
      cx += chipW + 6
    }

    const logX = x + Math.min(362, w - 230)
    for (let i = 0; i < this.#events.length; i++) {
      this.drawText(this.#events[i]!, logX, y + 13 + i * 17, {
        fontPx: 10,
        material: i === 0 ? this.materials.text : this.materials.muted,
        maxWidthPx: x + w - logX - 10,
      })
    }
  }
}

export default function buttonDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Button",
    description: "VisionOS-like glass button: hover/active/click/disabled отображаются визуально и регистрируются через hit-rect внутри Card.",
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

  const card = new ButtonCard({label, tone, fontPx, paddingX, height, radius, disabled})
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: Math.floor(w / 2 - 320),
    y: 24,
    w: 640,
    h: Math.min(340, Math.max(300, h - 48)),
  }))
}
