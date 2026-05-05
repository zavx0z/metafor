/**
 * Verbose-card на Yoga: header с counter + Clear/Auto buttons, scrollable
 * список событий inspector/agent.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {XrLayoutCard} from "./xr-layout.ts"
import {Box, CardHeader, Component, FilledBox, TextBox} from "./xr-component.ts"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

const UI = {
  bg: rgb(18, 23, 32, 0.94),
  bgElevated: rgb(27, 34, 45, 0.96),
  bgHot: rgb(38, 49, 66, 0.98),
  borderDim: rgb(62, 74, 92, 1),
  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),
  cyan: rgb(111, 211, 255, 1),
  violet: rgb(197, 151, 255, 1),
  green: rgb(82, 196, 123, 1),
  greenFill: rgb(21, 50, 37, 0.98),
}

type VerboseEntry = {
  kind: "inspector" | "agent"
  ts: string
  name: string
  payload: string
}

const ROW_H = 18
const PAD = 14
const HEADER_H = 32

export class XrVerboseCard extends XrLayoutCard {
  #entries: VerboseEntry[] = []
  #scroll = 0
  #autoscroll = localStorage.getItem("bd:verbose:pin") !== "0"
  readonly #max = 1000

  readonly #cyanMat = new TextMaterial({color: UI.cyan})
  readonly #mutedMat = new TextMaterial({color: UI.muted})
  readonly #textMat = new TextMaterial({color: UI.text})
  readonly #violetMat = new TextMaterial({color: UI.violet})
  readonly #greenMat = new TextMaterial({color: UI.green})

  append(kind: "inspector" | "agent", ts: string, name: string, payload: unknown): void {
    const safePayload = payload === undefined ? "" : truncateJson(payload, 220)
    this.#entries.push({kind, ts, name, payload: safePayload})
    while (this.#entries.length > this.#max) this.#entries.shift()
    if (this.#autoscroll) this.#scrollToBottom()
    this.requestRebuild()
  }

  clear(): void {
    this.#entries = []
    this.#scroll = 0
    this.requestRebuild()
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
    this.requestRebuild()
  }

  protected build(): Component {
    const root = new FilledBox(
      {flexDirection: "column", padding: PAD, gap: 6},
      UI.bg,
      -0.02,
    )

    // Header row: title + count + Clear button + Auto/Manual button.
    const header = new Box({flexDirection: "row", height: HEADER_H, alignItems: "center", gap: 8})
    header.add(
      new TextBox("Verbose", {fontPx: 13, material: this.#cyanMat, boxHeight: 18}),
      new TextBox(`${this.#entries.length}`, {fontPx: 11, material: this.#mutedMat, boxHeight: 14, layout: {flexGrow: 1}}),
    )
    header.add(this.#button("Clear", () => this.clear(), false))
    header.add(this.#button(this.#autoscroll ? "Auto" : "Manual", () => this.#toggleAutoscroll(), this.#autoscroll))

    // Divider.
    const divider = new (class extends Component {
      protected paint(): void {}
    })()
    void divider

    // Content list.
    const list = new Box({flexDirection: "column", flexGrow: 1, gap: 0})
    if (this.#entries.length === 0) {
      list.add(new TextBox("inspector and agent event stream", {
        fontPx: 12,
        material: this.#mutedMat,
        boxHeight: 16,
        layout: {marginTop: 4},
      }))
    } else {
      const visible = this.#visibleRows()
      this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#entries.length - visible)))
      for (let i = 0; i < visible; i++) {
        const entry = this.#entries[this.#scroll + i]
        if (entry === undefined) break
        list.add(this.#entryRow(entry))
      }
    }

    root.add(header, list)
    return root
  }

  #entryRow(entry: VerboseEntry): Component {
    const row = new Box({flexDirection: "row", height: ROW_H, alignItems: "center", gap: 8})
    row.add(
      new TextBox(formatTimestamp(entry.ts), {fontPx: 10, material: this.#mutedMat, boxHeight: 12, minWidth: 56}),
      new TextBox(entry.kind === "agent" ? `@${entry.name}` : entry.name, {
        fontPx: 10,
        material: entry.kind === "agent" ? this.#violetMat : this.#cyanMat,
        boxHeight: 12,
        minWidth: 140,
      }),
      new TextBox(entry.payload, {fontPx: 10, material: this.#textMat, boxHeight: 12, layout: {flexGrow: 1, flexShrink: 1}}),
    )
    return row
  }

  #button(label: string, action: () => void, active: boolean): Component {
    const fill = active ? UI.greenFill : UI.bgElevated
    const btn = new FilledBox(
      {paddingLeft: 8, paddingRight: 8, height: 22, justifyContent: "center", alignItems: "center", flexShrink: 0},
      fill,
      -0.001,
    )
    btn.add(new TextBox(label, {
      fontPx: 11,
      material: active ? this.#greenMat : this.#textMat,
      boxHeight: 14,
    }))
    this.hit(btn, action)
    return btn
  }

  #toggleAutoscroll(): void {
    this.#autoscroll = !this.#autoscroll
    localStorage.setItem("bd:verbose:pin", this.#autoscroll ? "1" : "0")
    if (this.#autoscroll) this.#scrollToBottom()
    this.requestRebuild()
  }

  #scrollToBottom(): void {
    const visible = this.#visibleRows()
    this.#scroll = Math.max(0, this.#entries.length - visible)
  }

  #visibleRows(): number {
    return Math.max(1, Math.floor((this.rectH - HEADER_H - PAD * 2 - 6) / ROW_H))
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
