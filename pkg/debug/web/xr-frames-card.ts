/**
 * Frames card на компонентной модели + Yoga.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {XrLayoutCard} from "./xr-layout.ts"
import {Box, Component, FilledBox, Rect, TextBox} from "./xr-component.ts"
import type {XrFrameSnapshot} from "./xr-debug-ui.ts"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

const UI = {
  bg: rgb(18, 23, 32, 0.94),
  borderDim: rgb(62, 74, 92, 1),
  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),
  cyan: rgb(111, 211, 255, 1),
  orange: rgb(255, 190, 111, 1),
  active: rgb(43, 73, 117, 0.95),
  activeHover: rgb(58, 92, 144, 0.98),
  rowHover: rgb(28, 36, 50, 0.9),
}

const ROW_H = 32
const HEADER_H = 28
const PAD = 14

export class XrFramesCard extends XrLayoutCard {
  #frames: XrFrameSnapshot[] = []
  #active = 0
  #scroll = 0
  readonly #onSelect: (index: number) => void

  readonly #cyanMat = new TextMaterial({color: UI.cyan})
  readonly #mutedMat = new TextMaterial({color: UI.muted})
  readonly #textMat = new TextMaterial({color: UI.text})
  readonly #orangeMat = new TextMaterial({color: UI.orange})

  constructor(onSelect: (index: number) => void) {
    super()
    this.#onSelect = onSelect
  }

  setFrames(frames: XrFrameSnapshot[], active: number): void {
    this.#frames = frames
    this.#active = active
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, frames.length - 1)))
    this.requestRebuild()
  }

  onWheel(event: WheelEvent): void {
    const delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 20
    const visible = Math.max(1, Math.floor((this.rectH - HEADER_H - PAD * 2) / ROW_H))
    const max = Math.max(0, this.#frames.length - visible)
    const next = Math.max(0, Math.min(max, this.#scroll + Math.trunc(delta)))
    if (next === this.#scroll) return
    this.#scroll = next
    this.requestRebuild()
  }

  protected build(): Component {
    const root = new FilledBox(
      {flexDirection: "column", padding: PAD, gap: 8},
      UI.bg,
      -0.02,
    )

    // header: row, "Frames" слева, count справа.
    const header = new Box({flexDirection: "row", height: HEADER_H, justifyContent: "space-between", alignItems: "center"})
    header.add(
      new TextBox("Frames", {fontPx: 13, material: this.#cyanMat, boxHeight: 18}),
      new TextBox(`${this.#frames.length}`, {fontPx: 11, material: this.#mutedMat, boxHeight: 14}),
    )

    // divider 1px растянут по ширине.
    const divider = new Rect(UI.borderDim, {height: 1, alignSelf: "stretch"})

    // list — растёт на всё оставшееся пространство.
    const list = new Box({flexDirection: "column", flexGrow: 1, gap: 2})
    if (this.#frames.length === 0) {
      list.add(new TextBox("waiting for paused frame", {
        fontPx: 12,
        material: this.#mutedMat,
        boxHeight: 16,
        layout: {marginTop: 4},
      }))
    } else {
      const visible = Math.max(1, Math.floor((this.rectH - HEADER_H - PAD * 2 - 1) / ROW_H))
      this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#frames.length - visible)))
      for (let i = 0; i < visible; i++) {
        const frame = this.#frames[this.#scroll + i]
        if (frame === undefined) break
        list.add(this.#frameRow(frame))
      }
    }

    root.add(header, divider, list)
    return root
  }

  #frameRow(frame: XrFrameSnapshot): Component {
    const isActive = frame.index === this.#active
    const fill = isActive ? UI.active : null

    const row = fill !== null
      ? new FilledBox(
          {flexDirection: "row", height: ROW_H, paddingLeft: 8, paddingRight: 8, alignItems: "center", gap: 10},
          fill,
          -0.001,
        )
      : new Box({flexDirection: "row", height: ROW_H, paddingLeft: 8, paddingRight: 8, alignItems: "center", gap: 10})

    row.add(
      new TextBox(`#${frame.index}`, {
        fontPx: 11,
        material: isActive ? this.#orangeMat : this.#mutedMat,
        boxHeight: 14,
        minWidth: 24,
      }),
      this.#frameInfo(frame),
    )
    this.hit(row, () => this.#onSelect(frame.index))
    return row
  }

  #frameInfo(frame: XrFrameSnapshot): Component {
    const fnText = frame.function || "<anonymous>"
    const locText = frame.url ? `${shortenUrl(frame.url)}:${frame.line}` : `(scriptId ?):${frame.line}`
    const info = new Box({flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 2})
    info.add(
      new TextBox(fnText, {fontPx: 12, material: this.#textMat, boxHeight: 14}),
      new TextBox(locText, {fontPx: 9, material: this.#mutedMat, boxHeight: 11}),
    )
    return info
  }
}

function shortenUrl(url: string): string {
  if (url.length <= 60) return url
  const parts = url.split("/")
  return `.../${parts.slice(-2).join("/")}`
}
