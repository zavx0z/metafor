import {UiSurface, palette, radii, uiIcons} from "@ui/elements"
import {Button as button, Divider as divider, StatusChip as statusChip} from "@ui/components"
import type {BadgeKind} from "./interpreter-ui.ts"
import {getUiLocale} from "./i18n.ts"

export type SessionLine = {
  ts: string
  stream: "stdout" | "stderr"
  text: string
}

export type SessionPaneSnapshot = {
  id: string
  label: string
  inspectorUrl: string
  connection: {
    state: "connecting" | "connected" | "disconnected"
    error: string | null
  }
  paused: boolean
  scriptCount: number
  hasDump: boolean
  target: {
    state: "idle" | "starting" | "running" | "exited" | "failed"
    pid: number | null
    command: string[]
    cwd: string | null
    startedAt: string | null
    exitedAt: string | null
    exitCode: number | null
    signalCode: string | null
    outputLineCount: number
    output: SessionLine[]
    pauseOnStart: boolean
  }
}

export type SessionDisplayActions = {
  onPause(sessionId: string): void
  onResume(sessionId: string): void
  onStop(sessionId: string): void
}

const PAD = 22
const GAP = 10
const HEADER_H = 58
const BTN_W = 38
const BTN_H = 30
const LINE_H = 17

export class SessionDisplayPane extends UiSurface {
  #snapshot: SessionPaneSnapshot
  readonly #actions: SessionDisplayActions

  constructor(snapshot: SessionPaneSnapshot, actions: SessionDisplayActions) {
    super({
      bgColor: palette.bgCode,
      borderColor: palette.borderDim,
      borderWidthPx: 1,
      borderRadiusPx: radii.pane,
    })
    this.#snapshot = snapshot
    this.#actions = actions
    this.node.name = `SessionDisplayPane:${snapshot.id}`
  }

  setSnapshot(snapshot: SessionPaneSnapshot): void {
    this.#snapshot = snapshot
    this.requestRender()
  }

  protected render(): void {
    const s = this.#snapshot
    const title = s.label || s.id
    this.drawText(title, PAD, 16, {
      fontPx: 17,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, this.rectW - PAD * 2 - 170),
    })
    this.#drawControls()
    divider(this, PAD, HEADER_H, Math.max(1, this.rectW - PAD * 2))

    let y = HEADER_H + 18
    let x = PAD
    x = this.#chip(connectionLabel(s.connection.state), connectionKind(s.connection.state), x, y, 118)
    x = this.#chip(targetLabel(s), targetKind(s), x, y, 132)
    this.#chip(`${s.scriptCount} scripts`, "neutral", x, y, 110)

    y += 44
    this.#label("socket", s.inspectorUrl, y)
    y += 34
    this.#label("pid", s.target.pid === null ? "-" : String(s.target.pid), y)
    y += 34
    this.#label("command", shellJoin(s.target.command), y)

    y += 46
    this.drawText(getUiLocale() === "ru" ? "Лог процесса" : "Process log", PAD, y, {
      fontPx: 13,
      material: this.materials.warn,
      maxWidthPx: this.rectW - PAD * 2,
    })
    y += 24
    divider(this, PAD, y, Math.max(1, this.rectW - PAD * 2))
    y += 18

    const lines = s.target.output.slice(-Math.max(1, Math.floor((this.rectH - y - PAD) / LINE_H)))
    if (lines.length === 0) {
      this.drawText(getUiLocale() === "ru" ? "stdout/stderr пока пуст" : "stdout/stderr is empty", PAD, y, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD * 2,
      })
      return
    }
    for (const line of lines) {
      const prefix = line.stream === "stderr" ? "err" : "out"
      this.drawText(formatTime(line.ts), PAD, y, {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: 62,
      })
      this.drawText(prefix, PAD + 66, y, {
        fontPx: 10,
        material: line.stream === "stderr" ? this.materials.error : this.materials.cyan,
        maxWidthPx: 34,
      })
      this.drawText(line.text, PAD + 104, y, {
        fontPx: 12,
        material: line.stream === "stderr" ? this.materials.error : this.materials.text,
        maxWidthPx: Math.max(1, this.rectW - PAD * 2 - 104),
      })
      y += LINE_H
    }
  }

  #drawControls(): void {
    const s = this.#snapshot
    const y = 14
    let x = Math.max(PAD, this.rectW - PAD - BTN_W * 3 - GAP * 2)
    button(this, x, y, BTN_W, BTN_H, {
      label: getUiLocale() === "ru" ? "Пауза" : "Pause",
      iconSrc: uiIcons.pause,
      iconOnly: true,
      iconSizePx: 14,
      size: "small",
      tone: "warn",
      variant: "outlined",
      tooltip: getUiLocale() === "ru" ? "Пауза" : "Pause",
      action: () => this.#actions.onPause(s.id),
    })
    x += BTN_W + GAP
    button(this, x, y, BTN_W, BTN_H, {
      label: getUiLocale() === "ru" ? "Продолжить" : "Resume",
      iconSrc: uiIcons.resume,
      iconOnly: true,
      iconSizePx: 14,
      size: "small",
      tone: "live",
      variant: "outlined",
      tooltip: getUiLocale() === "ru" ? "Продолжить" : "Resume",
      action: () => this.#actions.onResume(s.id),
    })
    x += BTN_W + GAP
    button(this, x, y, BTN_W, BTN_H, {
      label: getUiLocale() === "ru" ? "Остановить" : "Stop",
      iconSrc: uiIcons.stop,
      iconOnly: true,
      iconSizePx: 14,
      size: "small",
      tone: "warn",
      variant: "contained",
      tooltip: getUiLocale() === "ru" ? "Остановить" : "Stop",
      action: () => this.#actions.onStop(s.id),
    })
  }

  #chip(label: string, kind: BadgeKind, x: number, y: number, w: number): number {
    statusChip(this, x, y, w, 24, {
      label,
      tone: kind,
      variant: "subtle",
      fontPx: 10,
      iconSizePx: 8,
      tooltip: label,
    })
    return x + w + GAP
  }

  #label(name: string, value: string, y: number): void {
    this.drawText(name, PAD, y, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: 88,
    })
    this.drawText(value.length === 0 ? "-" : value, PAD + 96, y - 2, {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: Math.max(1, this.rectW - PAD * 2 - 96),
    })
  }
}

function connectionLabel(state: SessionPaneSnapshot["connection"]["state"]): string {
  if (state === "connected") return getUiLocale() === "ru" ? "сокет подключён" : "socket connected"
  if (state === "connecting") return getUiLocale() === "ru" ? "подключение" : "connecting"
  return getUiLocale() === "ru" ? "сокет закрыт" : "socket closed"
}

function connectionKind(state: SessionPaneSnapshot["connection"]["state"]): BadgeKind {
  if (state === "connected") return "live"
  if (state === "disconnected") return "warn"
  return "neutral"
}

function targetLabel(s: SessionPaneSnapshot): string {
  if (s.paused) return getUiLocale() === "ru" ? "пауза" : "paused"
  if (s.target.state === "running") return getUiLocale() === "ru" ? "выполняется" : "running"
  if (s.target.state === "starting") return getUiLocale() === "ru" ? "старт" : "starting"
  if (s.target.state === "exited") return `exit ${s.target.exitCode ?? "-"}`
  return s.target.state
}

function targetKind(s: SessionPaneSnapshot): BadgeKind {
  if (s.paused) return "paused"
  if (s.target.state === "running") return "live"
  if (s.target.state === "exited" || s.target.state === "failed") return "warn"
  return "neutral"
}

function shellJoin(parts: string[]): string {
  return parts.map((part) => /^[A-Za-z0-9_./:=@+-]+$/.test(part) ? part : `'${part.replaceAll("'", "'\\''")}'`).join(" ")
}

function formatTime(ts: string): string {
  const t = ts.indexOf("T")
  if (t < 0) return ts
  const dot = ts.indexOf(".", t)
  return ts.slice(t + 1, dot < 0 ? undefined : dot)
}
