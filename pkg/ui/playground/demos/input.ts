/**
 * Component: input.
 *
 * Текстовый ввод: bg/border меняются по state active. Hit-rect активирует
 * input; keyboard handler в Card.onKey обрабатывает символы и Backspace.
 */

import {Card, type UiCanvas, palette, input, divider} from "@metafor/ui"
import type {ParamsPanel} from "../params.ts"

class InputCard extends Card {
  #value: string
  #active = false
  constructor(
    private readonly p: {
      initialValue: () => string
      fontPx: () => number
      width: () => number
      height: () => number
    },
  ) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1})
    this.#value = p.initialValue()
  }

  onKey(event: KeyboardEvent): void {
    if (!this.#active) return
    if (event.key === "Backspace") {
      event.preventDefault()
      this.#value = this.#value.slice(0, -1)
      this.requestRender()
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      this.#value += event.key
      this.requestRender()
    }
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (this.#active) {
      this.#active = false
      this.requestRender()
    }
  }

  protected render(): void {
    this.drawText("input (this, x, y, w, h, opts)", 16, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - 32,
    })
    divider(this, 16, 36, this.rectW - 32)

    const fontPx = this.p.fontPx()
    const width = this.p.width()
    const height = this.p.height()

    this.drawText(`fontPx=${fontPx} width=${width} height=${height}  ·  кликни → bg сменится на bgHot, рамка cyan, появится cursor`, 16, 52, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })

    input(this, 16, 80, width, height, {
      value: this.#value,
      active: this.#active,
      fontPx,
      onActivate: () => {
        this.#active = true
        this.requestRender()
      },
    })

    this.drawText(this.#active ? "active: true — введите текст, Backspace удалит символ" : "active: false — кликни, чтобы активировать", 16, 80 + height + 12, {
      fontPx: 11,
      material: this.#active ? this.materials.cyan : this.materials.muted,
      maxWidthPx: this.rectW - 32,
    })
  }
}

export default function inputDemo({canvas, params}: {canvas: UiCanvas; params: ParamsPanel}): void {
  params.reset({
    title: "Input",
    description: "Текстовое поле с двумя состояниями. Неактивный — bgInput + muted-текст. Активный — bgHot + cyan-рамка + cursor «|». Кнопка активации — hit над всем rect.",
    breadcrumb: "Components / Input",
  })

  params.group({title: "Props"})
  const initialValue = params.text("initialValue", {
    label: "value",
    type: "string",
    description: "Начальное значение поля. После активации меняется через keyboard handler.",
    default: "click to focus",
  })
  const fontPx = params.number("fontPx", {
    label: "fontPx",
    description: "Размер шрифта значения. Default 12px.",
    default: 12,
    min: 8,
    max: 20,
    step: 1,
    unit: "px",
  })

  params.group({title: "Geometry"})
  const width = params.number("width", {
    label: "width",
    description: "Ширина поля в px.",
    default: 360,
    min: 100,
    max: 600,
    step: 10,
    unit: "px",
  })
  const height = params.number("height", {
    label: "height",
    description: "Высота поля в px. Текст центрируется по вертикали.",
    default: 32,
    min: 24,
    max: 64,
    step: 1,
    unit: "px",
  })

  const card = new InputCard({initialValue, fontPx, width, height})
  params.onChange(() => canvas.relayout())

  canvas.addCard(card, ({w, h}) => ({
    x: Math.floor(w / 2 - 300),
    y: 24,
    w: 600,
    h: Math.max(200, h - 48),
  }))
}
