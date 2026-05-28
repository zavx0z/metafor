/**
 * Verbose pane на UiSurface-системе. Список + autoscroll через div-scroll.
 */

import {
  UiSurface, div, divScrollPosition, divScrollTo, palette, radii, uiIcons,
} from "@ui/elements"
import {
  Button as button, Divider as divider,
} from "@ui/components"
import {t} from "./i18n.ts"

type VerboseEntry = {
  kind: "protocol" | "interpreter"
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

export class VerbosePane extends UiSurface {
  #entries: VerboseEntry[] = []
  #autoscroll: boolean
  #copyStatusUntil = 0
  readonly #scrollKey: string
  readonly #pinStorageKey: string
  readonly #max = 300

  constructor(storageKey: string) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.#scrollKey = `${storageKey}:list`
    this.#pinStorageKey = `${storageKey}:pin`
    this.#autoscroll = localStorage.getItem(this.#pinStorageKey) !== "0"
  }

  append(kind: "protocol" | "interpreter", ts: string, name: string, payload: unknown): void {
    if (isLowValueEvent(kind, name, payload)) return
    const safePayload = summarizePayload(kind, name, payload)
    this.#entries.push({kind, ts, name, payload: safePayload})
    while (this.#entries.length > this.#max) this.#entries.shift()
    if (this.#autoscroll) this.#scrollToBottom()
    this.requestRender()
  }

  clear(): void {
    this.#entries = []
    divScrollTo(this, this.#scrollKey, {top: 0})
    this.requestRender()
  }

  override onWheel(event: WheelEvent, localX: number, localY: number): void {
    const before = divScrollPosition(this, this.#scrollKey).top
    super.onWheel(event, localX, localY)
    const after = divScrollPosition(this, this.#scrollKey).top
    if (before === after || localY < LIST_TOP) return
    if (this.#autoscroll) {
      this.#autoscroll = false
      localStorage.setItem(this.#pinStorageKey, "0")
    }
  }

  protected render(): void {
    // Header: title + count + Copy + Clear + Auto/Manual.
    this.drawText(t("verbose"), PAD_X, HEADER_Y, {
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

    const btnY = 8
    const autoLabel = this.#autoscroll ? t("auto") : t("manual")
    const autoIcon = this.#autoscroll ? uiIcons.autoscroll : uiIcons.manual
    const autoW = 32
    const clearW = 32
    const copyW = 32
    const autoX = this.rectW - PAD_X - autoW
    const clearX = autoX - 6 - clearW
    const copyX = clearX - 6 - copyW
    button(this, copyX, btnY, copyW, BTN_H, {
      label: t("copyVerbose"),
      iconSrc: uiIcons.copy,
      iconOnly: true,
      tooltip: t("copyVerbose"),
      tone: Date.now() < this.#copyStatusUntil ? "live" : "neutral",
      fontPx: 11,
      action: () => void this.#copyEntries(),
    })
    button(this, clearX, btnY, clearW, BTN_H, {
      label: t("clearVerbose"),
      iconSrc: uiIcons.clear,
      iconOnly: true,
      tooltip: t("clearVerbose"),
      tone: "neutral",
      fontPx: 11,
      action: () => this.clear(),
    })
    button(this, autoX, btnY, autoW, BTN_H, {
      label: autoLabel,
      iconSrc: autoIcon,
      iconOnly: true,
      tooltip: this.#autoscroll ? t("autoscrollOn") : t("autoscrollOff"),
      tone: this.#autoscroll ? "live" : "neutral",
      fontPx: 11,
      action: () => this.#toggleAutoscroll(),
    })

    divider(this, PAD_X, DIVIDER_Y, this.rectW - PAD_X * 2)

    if (this.#entries.length === 0) {
      this.drawText(t("verboseEmpty"), PAD_X, LIST_TOP + 4, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD_X * 2,
      })
      return
    }

    const listH = this.#listH()
    if (this.#autoscroll) this.#scrollToBottom()
    div(this, PAD_X, LIST_TOP, this.rectW - PAD_X * 2, listH, {
      key: this.#scrollKey,
      scrollContentHeight: Math.max(listH, this.#entries.length * ROW_H),
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowY: "auto",
      },
      children: (ctx) => {
        const start = Math.max(0, Math.floor(ctx.scrollTop / ROW_H) - 1)
        const end = Math.min(this.#entries.length, Math.ceil((ctx.scrollTop + ctx.viewportHeight) / ROW_H) + 1)
        for (let idx = start; idx < end; idx++) {
          const entry = this.#entries[idx]
          if (entry === undefined) continue
          this.#drawEntry(entry, PAD_X, LIST_TOP + idx * ROW_H - ctx.scrollTop, ctx.viewportWidth)
        }
      },
    })
  }

  #drawEntry(entry: VerboseEntry, x: number, y: number, w: number): void {
    this.drawText(formatTimestamp(entry.ts), x, y, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: TS_W,
    })
    const nameX = x + TS_W + 8
    const nameLabel = entry.kind === "interpreter" ? `@${entry.name}` : entry.name
    this.drawText(nameLabel, nameX, y, {
      fontPx: 10,
      material: entry.kind === "interpreter" ? this.materials.violet : this.materials.cyan,
      maxWidthPx: NAME_W,
    })
    const payloadX = nameX + NAME_W + 8
    const payloadMaxW = x + w - payloadX
    if (payloadMaxW > 20 && entry.payload.length > 0) {
      this.drawText(entry.payload, payloadX, y, {
        fontPx: 10,
        material: this.materials.text,
        maxWidthPx: payloadMaxW,
      })
    }
  }

  #toggleAutoscroll(): void {
    this.#autoscroll = !this.#autoscroll
    localStorage.setItem(this.#pinStorageKey, this.#autoscroll ? "1" : "0")
    if (this.#autoscroll) this.#scrollToBottom()
    this.requestRender()
  }

  async #copyEntries(): Promise<void> {
    const text = this.#entries.map((entry) => JSON.stringify(entry)).join("\n")
    try {
      await navigator.clipboard.writeText(text)
      this.#copyStatusUntil = Date.now() + 1400
      this.requestRender()
      window.setTimeout(() => this.requestRender(), 1500)
    } catch {
      this.#copyStatusUntil = 0
      this.requestRender()
    }
  }

  #scrollToBottom(): void {
    divScrollTo(this, this.#scrollKey, {top: Math.max(0, this.#entries.length * ROW_H - this.#listH())})
  }

  #listH(): number {
    return Math.max(1, this.rectH - LIST_TOP - 8)
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

function isLowValueEvent(kind: "protocol" | "interpreter", name: string, payload: unknown): boolean {
  if (name === "Debugger.scriptParsed") return true
  if (kind === "protocol" && (name === "Console.messageAdded" || name === "Runtime.consoleAPICalled")) return true
  if (kind === "interpreter" && (name === "interpreter.connection.idle" || name === "interpreter.connection.waiting_for_module")) return true
  if (name === "socket.close" && propString(payload, "reason") === "Connection ended") return true
  if (name === "protocol.response.ok") return true
  if (name === "http.request") {
    const path = propString(payload, "path")
    const status = propNumber(payload, "status")
    return status !== undefined && status < 400 && (
      path === "/console"
      || path === "/modules"
      || /\/modules\/[^/]+\/(?:source|breakpoints)$/.test(path ?? "")
    )
  }
  if (name === "protocol.request") {
    const method = propString(payload, "method")
    if (method === undefined) return false
    return !importantProtocolRequest(method)
  }
  return kind === "interpreter" && name === "interpreter.kick_reconnect.fired"
}

function importantProtocolRequest(method: string): boolean {
  return method === "Debugger.pause"
    || method === "Debugger.resume"
    || method === "Debugger.stepOver"
    || method === "Debugger.stepInto"
    || method === "Debugger.stepOut"
    || method === "Runtime.evaluate"
}

function summarizePayload(kind: "protocol" | "interpreter", name: string, payload: unknown): string {
  if (name === "Debugger.paused") {
    const reason = propString(payload, "reason") ?? "pause"
    const frames = arrayLength(prop(payload, "callFrames"))
    return frames === undefined ? reason : `${reason} · frames ${frames}`
  }
  if (name === "Debugger.resumed") return ""
  if (name === "Runtime.consoleAPICalled") {
    const type = propString(payload, "type") ?? "console"
    const args = arrayLength(prop(payload, "args"))
    return args === undefined ? type : `${type} · args ${args}`
  }
  if (name === "ws.command") {
    const cmd = propString(payload, "cmd") ?? "command"
    const requestId = propNumber(payload, "requestId")
    return requestId === undefined ? cmd : `${cmd} · #${requestId}`
  }
  if (name === "http.request") {
    const method = propString(payload, "method") ?? "HTTP"
    const path = propString(payload, "path") ?? ""
    const status = propNumber(payload, "status")
    const duration = propNumber(payload, "durationMs")
    return [method, path, status === undefined ? "" : String(status), duration === undefined ? "" : `${duration}ms`]
      .filter((part) => part.length > 0)
      .join(" · ")
  }
  if (name === "interpreter.dump.written") {
    const frameCount = propNumber(payload, "frameCount")
    return frameCount === undefined ? "" : `frames ${frameCount}`
  }
  if (name === "interpreter.connection.failed") {
    const attempt = propNumber(payload, "attempt")
    const hint = propString(payload, "hint") ?? propString(payload, "lastError") ?? ""
    return attempt === undefined ? hint : `attempt ${attempt} · ${hint}`
  }
  if (name === "socket.open") return propString(payload, "url") ?? ""
  if (name === "socket.close") {
    const code = propNumber(payload, "code")
    const reason = propString(payload, "reason")
    return [code === undefined ? "" : `code ${code}`, reason ?? ""].filter((part) => part.length > 0).join(" · ")
  }
  if (name === "protocol.response.error") {
    const method = propString(payload, "method")
    const error = propString(payload, "error")
    return [method ?? "", error ?? ""].filter((part) => part.length > 0).join(" · ")
  }
  if (name === "protocol.request") return propString(payload, "method") ?? ""
  const text = payload === undefined ? "" : truncateJson(payload, kind === "interpreter" ? 120 : 160)
  return text === "{}" ? "" : text
}

function prop(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined
  return (value as Record<string, unknown>)[key]
}

function propString(value: unknown, key: string): string | undefined {
  const next = prop(value, key)
  return typeof next === "string" ? next : undefined
}

function propNumber(value: unknown, key: string): number | undefined {
  const next = prop(value, key)
  return typeof next === "number" ? next : undefined
}

function arrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined
}
