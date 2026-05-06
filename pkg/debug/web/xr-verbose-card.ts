/**
 * Verbose card на Card-системе.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {Card} from "./xr-card.ts"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

const UI = {
  bg: rgb(18, 23, 32, 0.94),
  borderDim: rgb(62, 74, 92, 1),
  bgElevated: rgb(27, 34, 45, 0.98),
  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),
  cyan: rgb(111, 211, 255, 1),
  violet: rgb(197, 151, 255, 1),
  green: rgb(82, 196, 123, 1),
  greenFill: rgb(21, 50, 37, 1),
  border: rgb(116, 130, 151, 1),
}

type VerboseEntry = {
  kind: "inspector" | "agent"
  ts: string
  name: string
  payload: string
}

const PAD_X = 14
const HEADER_Y = 12
const TITLE_FONT = 13
const COUNT_FONT = 11
const DIVIDER_Y = 34
const LIST_TOP = 44
const ROW_H = 18
const TS_W = 56
const NAME_W = 132
const BTN_H = 24
const BTN_PAD = 10

export class XrVerboseCard extends Card {
  #entries: VerboseEntry[] = []
  #scroll = 0
  #autoscroll = localStorage.getItem("bd:verbose:pin") !== "0"
  readonly #max = 1000

  readonly #cyanMat = new TextMaterial({color: UI.cyan})
  readonly #mutedMat = new TextMaterial({color: UI.muted})
  readonly #textMat = new TextMaterial({color: UI.text})
  readonly #violetMat = new TextMaterial({color: UI.violet})
  readonly #greenMat = new TextMaterial({color: UI.green})

  constructor() {
    super({bgColor: UI.bg, borderColor: null})
  }

  append(kind: "inspector" | "agent", ts: string, name: string, payload: unknown): void {
    const safePayload = payload === undefined ? "" : truncateJson(payload, 220)
    this.#entries.push({kind, ts, name, payload: safePayload})
    while (this.#entries.length > this.#max) this.#entries.shift()
    if (this.#autoscroll) this.#scrollToBottom()
    this.requestRender()
  }

  clear(): void {
    this.#entries = []
    this.#scroll = 0
    this.requestRender()
  }

  onWheel(event: WheelEvent): void {
    const delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 18
    const visible = this.#visibleRows()
    const max = Math.max(0, this.#entries.length - visible)
    const next = Math.max(0, Math.min(max, this.#scroll + Math.trunc(delta)))
    if (next === this.#scroll) return
    this.#autoscroll = false
    localStorage.setItem("bd:verbose:pin", "0")
    this.#scroll = next
    this.requestRender()
  }

  protected render(): void {
    // Header: title + count + Clear + Auto/Manual.
    this.drawText("Verbose", PAD_X, HEADER_Y, {
      fontPx: TITLE_FONT,
      material: this.#cyanMat,
      maxWidthPx: 90,
    })
    const countX = PAD_X + 80
    this.drawText(`${this.#entries.length}`, countX, HEADER_Y + 2, {
      fontPx: COUNT_FONT,
      material: this.#mutedMat,
      maxWidthPx: 60,
    })

    // Buttons (Clear, Auto/Manual) — справа.
    const btnY = 8
    const autoLabel = this.#autoscroll ? "Auto" : "Manual"
    const autoW = Math.ceil(this.measureText(autoLabel, 11)) + BTN_PAD * 2
    const clearW = Math.ceil(this.measureText("Clear", 11)) + BTN_PAD * 2
    const autoX = this.rectW - PAD_X - autoW
    const clearX = autoX - 6 - clearW
    this.#button("Clear", clearX, btnY, clearW, BTN_H, false, () => this.clear())
    this.#button(autoLabel, autoX, btnY, autoW, BTN_H, this.#autoscroll, () => this.#toggleAutoscroll())

    // Divider.
    this.drawRect(PAD_X, DIVIDER_Y, this.rectW - PAD_X * 2, 1, UI.borderDim, 0.001)

    // Empty state.
    if (this.#entries.length === 0) {
      this.drawText("inspector and agent event stream", PAD_X, LIST_TOP + 4, {
        fontPx: 12,
        material: this.#mutedMat,
        maxWidthPx: this.rectW - PAD_X * 2,
      })
      return
    }

    // Rows.
    const visible = this.#visibleRows()
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#entries.length - visible)))
    for (let i = 0; i < visible; i++) {
      const entry = this.#entries[this.#scroll + i]
      if (entry === undefined) break
      const y = LIST_TOP + i * ROW_H
      this.#drawEntry(entry, y)
    }
  }

  #drawEntry(entry: VerboseEntry, y: number): void {
    const tsX = PAD_X
    this.drawText(formatTimestamp(entry.ts), tsX, y, {
      fontPx: 10,
      material: this.#mutedMat,
      maxWidthPx: TS_W,
    })
    const nameX = tsX + TS_W + 8
    const nameLabel = entry.kind === "agent" ? `@${entry.name}` : entry.name
    this.drawText(nameLabel, nameX, y, {
      fontPx: 10,
      material: entry.kind === "agent" ? this.#violetMat : this.#cyanMat,
      maxWidthPx: NAME_W,
    })
    const payloadX = nameX + NAME_W + 8
    const payloadMaxW = this.rectW - PAD_X - payloadX
    if (payloadMaxW > 20) {
      this.drawText(entry.payload, payloadX, y, {
        fontPx: 10,
        material: this.#textMat,
        maxWidthPx: payloadMaxW,
      })
    }
  }

  #button(label: string, x: number, y: number, w: number, h: number, active: boolean, action: () => void): void {
    const fill = active ? UI.greenFill : UI.bgElevated
    this.drawRect(x, y, w, h, fill, -0.001)
    this.drawRect(x, y, w, 1, active ? UI.green : UI.border, 0.001)
    this.drawRect(x, y + h - 1, w, 1, UI.border, 0.001)
    this.drawRect(x, y, 1, h, UI.border, 0.001)
    this.drawRect(x + w - 1, y, 1, h, UI.border, 0.001)
    const labelW = this.measureText(label, 11)
    const labelX = x + (w - labelW) / 2
    this.drawText(label, labelX, y + (h - 11) / 2, {
      fontPx: 11,
      material: active ? this.#greenMat : this.#textMat,
      maxWidthPx: w - 6,
    })
    this.hit(x, y, w, h, action)
  }

  #toggleAutoscroll(): void {
    this.#autoscroll = !this.#autoscroll
    localStorage.setItem("bd:verbose:pin", this.#autoscroll ? "1" : "0")
    if (this.#autoscroll) this.#scrollToBottom()
    this.requestRender()
  }

  #scrollToBottom(): void {
    const visible = this.#visibleRows()
    this.#scroll = Math.max(0, this.#entries.length - visible)
  }

  #visibleRows(): number {
    return Math.max(1, Math.floor((this.rectH - LIST_TOP - 8) / ROW_H))
  }
}

function formatTimestamp(ts: string): string {
  const t = ts.indexOf("T")
  if (t < 0) return ts
  const dot = ts.indexOf(".", t)
  return ts.slice(t + 1, dot < 0 ? undefined : dot)
}

function truncateJson(value: unknown, max: number): string {
  let text = ""
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}
