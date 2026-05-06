/**
 * Demo: button / badge / input — все доступные tone-варианты.
 */

import {
  Card,
  type UiCanvas,
  flexRow,
  flexColumn,
  badge,
  button,
  input,
  divider,
  autoButtonWidth,
  palette,
  type Tone,
} from "@metafor/ui"

class WidgetsCard extends Card {
  #inputValue = "click to focus"
  #inputActive = false

  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
  }

  onKey(event: KeyboardEvent): void {
    if (!this.#inputActive) return
    if (event.key === "Backspace") {
      event.preventDefault()
      this.#inputValue = this.#inputValue.slice(0, -1)
      this.requestRender()
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      this.#inputValue += event.key
      this.requestRender()
    }
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (this.#inputActive) {
      this.#inputActive = false
      this.requestRender()
    }
  }

  protected render(): void {
    this.drawText("Widgets", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    // Buttons row, разные tones.
    this.drawText("buttons (tone neutral / live / paused / warn):", 16, 54, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    const tones: Tone[] = ["neutral", "live", "paused", "warn"]
    const labels = ["Cancel", "Run", "Pause", "Stop"]
    flexRow({
      x: 16, y: 76, w: this.rectW - 32, h: 32,
      gap: 8, alignItems: "center",
      items: tones.map((tone, i) => ({
        width: autoButtonWidth(this, labels[i]!, 12, 14),
        height: 28,
        draw: (x, y, w, h) => button(this, x, y, w, h, {
          label: labels[i]!,
          tone,
          action: () => console.log(`clicked ${labels[i]}`),
        }),
      })),
    })

    // Badges row.
    this.drawText("badges:", 16, 124, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    const badges: Array<{label: string; tone: Tone}> = [
      {label: "ws: connected", tone: "live"},
      {label: "inspector: paused", tone: "paused"},
      {label: "run: error", tone: "warn"},
      {label: "engine: webgpu", tone: "neutral"},
    ]
    flexRow({
      x: 16, y: 144, w: this.rectW - 32, h: 28,
      gap: 8, alignItems: "center",
      items: badges.map((b) => ({
        width: Math.ceil(this.measureText(b.label, 11)) + 16,
        height: 22,
        draw: (x, y, w, h) => badge(this, x, y, w, h, {label: b.label, tone: b.tone}),
      })),
    })

    // Input.
    this.drawText("input (click to activate, type / backspace):", 16, 196, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    input(this, 16, 218, this.rectW - 32, 32, {
      value: this.#inputValue,
      active: this.#inputActive,
      onActivate: () => {
        this.#inputActive = true
        this.requestRender()
      },
    })

    // Tone fills swatches.
    this.drawText("tone fills:", 16, 268, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
    flexColumn({
      x: 16, y: 286, w: this.rectW - 32, h: this.rectH - 302,
      gap: 4,
      items: tones.map((tone) => ({
        height: 22,
        draw: (x, y, w, h) => badge(this, x, y, w, h, {label: tone, tone}),
      })),
    })
  }
}

export default function widgetsDemo({canvas}: {canvas: UiCanvas}): void {
  canvas.addCard(new WidgetsCard(), ({w, h}) => ({
    x: 24,
    y: 24,
    w: Math.min(w - 48, 720),
    h: h - 48,
  }))
}
