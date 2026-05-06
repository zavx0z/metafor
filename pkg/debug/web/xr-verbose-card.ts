/**
 * Verbose card на Card-системе. Кнопки/divider/scrollbar — widget'ы из @metafor/ui.
 */

import {Card, palette, button, divider, scrollbar, autoButtonWidth} from "./xr-card.ts"

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
const SCROLLBAR_W = 4

export class XrVerboseCard extends Card {
  #entries: VerboseEntry[] = []
  #scroll = 0
  #autoscroll = localStorage.getItem("bd:verbose:pin") !== "0"
  readonly #max = 1000

  constructor() {
    super({bgColor: palette.bg, borderColor: null})
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
      material: this.materials.cyan,
      maxWidthPx: 90,
    })
    const countX = PAD_X + 80
    this.drawText(`${this.#entries.length}`, countX, HEADER_Y + 2, {
      fontPx: COUNT_FONT,
      material: this.materials.muted,
      maxWidthPx: 60,
    })

    // Buttons (Clear, Auto/Manual) — справа.
    const btnY = 8
    const autoLabel = this.#autoscroll ? "Auto" : "Manual"
    const autoW = autoButtonWidth(this, autoLabel, 11, 10)
    const clearW = autoButtonWidth(this, "Clear", 11, 10)
    const autoX = this.rectW - PAD_X - autoW
    const clearX = autoX - 6 - clearW
    button(this, clearX, btnY, clearW, BTN_H, {label: "Clear", tone: "neutral", fontPx: 11, action: () => this.clear()})
    button(this, autoX, btnY, autoW, BTN_H, {label: autoLabel, tone: this.#autoscroll ? "live" : "neutral", fontPx: 11, action: () => this.#toggleAutoscroll()})

    divider(this, PAD_X, DIVIDER_Y, this.rectW - PAD_X * 2)

    // Empty state.
    if (this.#entries.length === 0) {
      this.drawText("inspector and agent event stream", PAD_X, LIST_TOP + 4, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD_X * 2,
      })
      return
    }

    // Rows.
    const listH = this.rectH - LIST_TOP - 8
    const visible = this.#visibleRows()
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#entries.length - visible)))
    for (let i = 0; i < visible; i++) {
      const entry = this.#entries[this.#scroll + i]
      if (entry === undefined) break
      const y = LIST_TOP + i * ROW_H
      this.#drawEntry(entry, y)
    }

    scrollbar(this, this.rectW - PAD_X - SCROLLBAR_W, LIST_TOP, listH, {
      offset: this.#scroll, visible, total: this.#entries.length, trackWidth: SCROLLBAR_W,
    })
  }

  #drawEntry(entry: VerboseEntry, y: number): void {
    const tsX = PAD_X
    this.drawText(formatTimestamp(entry.ts), tsX, y, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: TS_W,
    })
    const nameX = tsX + TS_W + 8
    const nameLabel = entry.kind === "agent" ? `@${entry.name}` : entry.name
    this.drawText(nameLabel, nameX, y, {
      fontPx: 10,
      material: entry.kind === "agent" ? this.materials.violet : this.materials.cyan,
      maxWidthPx: NAME_W,
    })
    const payloadX = nameX + NAME_W + 8
    const payloadMaxW = this.rectW - PAD_X - SCROLLBAR_W - 6 - payloadX
    if (payloadMaxW > 20) {
      this.drawText(entry.payload, payloadX, y, {
        fontPx: 10,
        material: this.materials.text,
        maxWidthPx: payloadMaxW,
      })
    }
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
