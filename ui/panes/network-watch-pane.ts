import {Color, TextMaterial} from "@metafor/engine"
import {Button, Switcher, uiIcons} from "@ui/components"
import {UiSurface, Z, palette} from "@ui/elements"

export type NetworkWatchServiceKey = "tls" | "redirect"

export type NetworkWatchSections = {
  time: string
  listen: string[]
  tmux: string[]
  other: string[]
}

export type NetworkWatchPaneSnapshot = {
  actionStatus: string
  services: Record<NetworkWatchServiceKey, boolean>
  autoRefresh: boolean
  autoRefreshActive: boolean
  refreshing: boolean
  updatedAt: Date | null
  sections: NetworkWatchSections
}

export type NetworkWatchPaneActions = {
  setTlsEnabled(enabled: boolean): void
  setRedirectEnabled(enabled: boolean): void
  setAutoRefreshEnabled(enabled: boolean): void
  rebuildLayout(): void
  clearPanes(): void
  refresh(): void
}

export type NetworkWatchPaneOpts = {
  title?: string
  sessionLabel?: string
  actions?: NetworkWatchPaneActions
}

type ListenEntry = {
  address: string
  command: string
  pid: string
  protocol: string
}

type PaneEntry = {
  target: string
  state: string
  title: string
  command: string
}

const NETWORK_PANEL_BG = withAlpha(palette.bg, 0.68)
const NETWORK_STATUS_BG = new Color(0.02, 0.04, 0.07, 0.52)
const NETWORK_SECTION_BG = new Color(0.01, 0.02, 0.04, 0.36)
const EMPTY_SECTIONS: NetworkWatchSections = {time: "--", listen: [], tmux: [], other: []}

export class NetworkWatchPane extends UiSurface {
  #title: string
  #sessionLabel: string
  #actions: NetworkWatchPaneActions | null
  #snapshot: NetworkWatchPaneSnapshot = {
    actionStatus: "ready",
    services: {tls: true, redirect: true},
    autoRefresh: true,
    autoRefreshActive: false,
    refreshing: false,
    updatedAt: null,
    sections: EMPTY_SECTIONS,
  }

  constructor(opts: NetworkWatchPaneOpts = {}) {
    super({bgColor: NETWORK_PANEL_BG, borderColor: withAlpha(palette.border, 0.72)})
    this.node.name = "NetworkWatchPane"
    this.#title = opts.title ?? "NetworkMux"
    this.#sessionLabel = opts.sessionLabel ?? "network"
    this.#actions = opts.actions ?? null
  }

  setSnapshot(snapshot: NetworkWatchPaneSnapshot): void {
    this.#snapshot = {
      actionStatus: snapshot.actionStatus,
      services: {...snapshot.services},
      autoRefresh: snapshot.autoRefresh,
      autoRefreshActive: snapshot.autoRefreshActive,
      refreshing: snapshot.refreshing,
      updatedAt: snapshot.updatedAt,
      sections: cloneSections(snapshot.sections),
    }
    this.requestRender()
  }

  setActions(actions: NetworkWatchPaneActions | null): void {
    this.#actions = actions
    this.requestRender()
  }

  protected render(): void {
    const w = Math.max(1, this.rectW)
    const h = Math.max(1, this.rectH)
    const pad = 14
    const compact = w < 760
    const narrow = w < 600
    const headerH = narrow ? 154 : compact ? 124 : 88

    this.drawRoundedRect(0, 0, w, h, {
      radius: 0,
      fill: NETWORK_PANEL_BG,
      border: withAlpha(palette.border, 0.74),
      borderWidth: 1,
      opacity: 0.98,
      z: Z.CONTAINER,
    })

    this.#drawHeader(pad, w, compact, narrow)
    this.#drawNetworkStatus(pad, headerH, Math.max(1, w - pad * 2), Math.max(1, h - headerH - 12))
  }

  #drawHeader(pad: number, w: number, compact: boolean, narrow: boolean): void {
    const statusMaterial = this.#snapshot.actionStatus.includes("failed") ? this.materials.orange : this.materials.muted
    this.drawText(this.#title, pad, 12, {
      fontPx: 16,
      material: this.materials.cyan,
      maxWidthPx: compact ? Math.max(1, w - pad * 2) : 220,
    })
    this.drawText(this.#sessionLabel, pad, 36, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: compact ? Math.max(1, w - pad * 2) : 360,
    })
    const autoLabel = this.#snapshot.autoRefresh
      ? this.#snapshot.autoRefreshActive
        ? "stats auto active"
        : "stats auto paused"
      : "stats auto off"
    this.drawText(`${this.#snapshot.actionStatus} | ${autoLabel}`, pad, 58, {
      fontPx: 11,
      material: statusMaterial,
      maxWidthPx: compact ? Math.max(1, w - pad * 2) : 360,
    })

    const controlsX = compact ? pad : Math.min(Math.max(390, w * 0.33), Math.max(pad, w - 560))
    const switchY = compact ? 84 : 12
    let x = controlsX
    x = this.#switchRow(x, switchY, "TLS", this.#snapshot.services.tls, "app/web HTTPS pane", (checked) => {
      this.#actions?.setTlsEnabled(checked)
    }) + 20
    x = this.#switchRow(x, switchY, "80", this.#snapshot.services.redirect, "HTTP to HTTPS redirect pane", (checked) => {
      this.#actions?.setRedirectEnabled(checked)
    }) + 20
    x = this.#switchRow(x, switchY, "Stats", this.#snapshot.autoRefresh, "Auto-refresh port statistics while Network display is fullscreen", (checked) => {
      this.#actions?.setAutoRefreshEnabled(checked)
    }) + 20

    const buttonY = narrow ? 116 : compact ? 84 : 54
    const buttonX = narrow ? pad : compact ? Math.min(x + 4, Math.max(pad, w - 236)) : controlsX
    let bx = buttonX
    bx = this.#button(bx, buttonY, 84, "Layout", "Rebuild panes", uiIcons.restart, () => {
      this.#actions?.rebuildLayout()
    }) + 10
    bx = this.#button(bx, buttonY, 64, "Clear", "Clear scrollback", uiIcons.clear, () => {
      this.#actions?.clearPanes()
    }) + 10
    this.#button(bx, buttonY, 78, "Refresh", "Refresh status", uiIcons.restart, () => {
      this.#actions?.refresh()
    })

    if (!compact) {
      const metaX = Math.max(controlsX + 420, w - 290)
      if (metaX + 260 <= w - pad) {
        this.#drawServicePill(metaX, 16, 114, "TLS 443", this.#snapshot.services.tls)
        this.#drawServicePill(metaX + 126, 16, 114, "HTTP 80", this.#snapshot.services.redirect)
        this.drawText("panes: app-web tls | http redirect", metaX, 48, {
          fontPx: 10,
          material: this.materials.muted,
          maxWidthPx: Math.max(1, w - metaX - pad),
        })
      }
    }
  }

  #drawNetworkStatus(x: number, y: number, w: number, h: number): void {
    this.drawRoundedRect(x, y, w, h, {
      radius: 6,
      fill: NETWORK_STATUS_BG,
      border: withAlpha(palette.border, 0.46),
      borderWidth: 1,
      z: Z.ELEMENT,
    })
    const sections = this.#snapshot.sections
    const updated = this.#snapshot.updatedAt === null ? "loading" : formatPaneTime(this.#snapshot.updatedAt)
    const suffix = this.#snapshot.refreshing ? "updating" : "stable"
    const countsX = Math.max(x + 10, x + w - 214)
    const showCounts = countsX > x + 260
    this.drawText(`Network Watch | ${sections.time} | updated ${updated} | ${suffix}`, x + 10, y + 8, {
      fontPx: 10,
      material: this.materials.cyan,
      maxWidthPx: showCounts ? Math.max(1, countsX - x - 20) : Math.max(1, w - 20),
    })

    if (showCounts) {
      this.#drawCountPill(countsX, y + 7, 92, "LISTEN", sections.listen.length)
      this.#drawCountPill(countsX + 102, y + 7, 92, "PANES", sections.tmux.length)
    }

    const bodyX = x + 10
    const bodyY = y + 30
    const bodyW = Math.max(1, w - 20)
    const bodyH = Math.max(1, h - 40)
    const gap = 10
    if (bodyW >= 760) {
      const columnW = Math.max(1, Math.floor((bodyW - gap) / 2))
      this.#drawNetworkSection("Ports & processes", "listen", sections.listen, bodyX, bodyY, columnW, bodyH)
      this.#drawNetworkSection("Network panes", "tmux", sections.tmux, bodyX + columnW + gap, bodyY, Math.max(1, bodyW - columnW - gap), bodyH)
      return
    }

    const topH = Math.max(1, Math.floor((bodyH - gap) * 0.56))
    this.#drawNetworkSection("Ports & processes", "listen", sections.listen, bodyX, bodyY, bodyW, topH)
    this.#drawNetworkSection("Network panes", "tmux", sections.tmux, bodyX, bodyY + topH + gap, bodyW, Math.max(1, bodyH - topH - gap))
  }

  #drawNetworkSection(title: string, kind: "listen" | "tmux", lines: string[], x: number, y: number, w: number, h: number): void {
    this.drawRoundedRect(x, y, w, h, {
      radius: 5,
      fill: NETWORK_SECTION_BG,
      border: withAlpha(palette.border, 0.34),
      borderWidth: 1,
      z: Z.ELEMENT + 0.01,
    })
    this.drawText(`${title} | ${lines.length}`, x + 8, y + 7, {
      fontPx: 10,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, w - 16),
    })

    const content = lines.length > 0 ? lines : ["no entries"]
    const lineH = 18
    const maxLines = Math.max(1, Math.floor((h - 31) / lineH))
    const visible = content.slice(0, maxLines)
    let lineY = y + 25
    for (let index = 0; index < visible.length; index += 1) {
      const line = visible[index] ?? ""
      const rowY = lineY - 3
      if (index % 2 === 1) {
        this.drawRoundedRect(x + 5, rowY, Math.max(1, w - 10), 16, {
          radius: 4,
          fill: withAlpha(palette.bgInput, 0.22),
          border: null,
          z: Z.ELEMENT + 0.015,
        })
      }
      if (kind === "listen") {
        this.#drawListenRow(line, x + 8, lineY, Math.max(1, w - 16))
      } else {
        this.#drawPaneRow(line, x + 8, lineY, Math.max(1, w - 16))
      }
      lineY += lineH
    }
    const hidden = content.length - visible.length
    if (hidden > 0) {
      this.drawText(`+${hidden} more`, x + 8, Math.max(y + 24, y + h - 15), {
        fontPx: 9,
        material: this.materials.orange,
        maxWidthPx: Math.max(1, w - 16),
      })
    }
  }

  #drawListenRow(line: string, x: number, y: number, w: number): void {
    const entry = parseListenEntry(line)
    if (entry === null) {
      this.drawText(line, x, y, {
        fontPx: 9,
        material: this.#networkLineMaterial(line),
        maxWidthPx: w,
      })
      return
    }

    const addressW = Math.min(148, Math.max(76, Math.floor(w * 0.34)))
    const commandW = Math.min(110, Math.max(58, Math.floor(w * 0.22)))
    const pidW = Math.min(86, Math.max(58, Math.floor(w * 0.18)))
    this.drawText(entry.address, x, y, {
      fontPx: 9,
      material: this.#networkLineMaterial(entry.address),
      maxWidthPx: addressW,
    })
    this.drawText(entry.command, x + addressW + 8, y, {
      fontPx: 9,
      material: this.materials.text,
      maxWidthPx: commandW,
    })
    this.drawText(entry.pid, x + addressW + commandW + 16, y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: pidW,
    })
    this.drawText(entry.protocol, x + addressW + commandW + pidW + 24, y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, w - addressW - commandW - pidW - 24),
    })
  }

  #drawPaneRow(line: string, x: number, y: number, w: number): void {
    const entry = parsePaneEntry(line)
    if (entry === null) {
      this.drawText(line, x, y, {
        fontPx: 9,
        material: this.#networkLineMaterial(line),
        maxWidthPx: w,
      })
      return
    }

    const stateW = 46
    const targetW = Math.min(210, Math.max(104, Math.floor(w * 0.46)))
    const commandW = Math.min(76, Math.max(44, Math.floor(w * 0.16)))
    this.#drawStateBadge(x, y - 2, stateW, entry.state)
    this.drawText(entry.target, x + stateW + 8, y, {
      fontPx: 9,
      material: this.materials.text,
      maxWidthPx: targetW,
    })
    this.drawText(entry.title, x + stateW + targetW + 16, y, {
      fontPx: 9,
      material: this.#networkLineMaterial(entry.state),
      maxWidthPx: Math.max(1, w - stateW - targetW - commandW - 26),
    })
    this.drawText(entry.command, x + w - commandW, y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: commandW,
    })
  }

  #drawStateBadge(x: number, y: number, w: number, label: string): void {
    const active = label === "active"
    this.drawRoundedRect(x, y, w, 14, {
      radius: 7,
      fill: withAlpha(active ? palette.green : palette.bgInput, active ? 0.18 : 0.54),
      border: withAlpha(active ? palette.green : palette.borderDim, active ? 0.46 : 0.62),
      borderWidth: 1,
      z: Z.ELEMENT + 0.02,
    })
    this.drawText(label, x + 6, y + 2, {
      fontPx: 8,
      material: active ? this.materials.green : this.materials.muted,
      maxWidthPx: Math.max(1, w - 12),
    })
  }

  #drawServicePill(x: number, y: number, w: number, label: string, enabled: boolean): void {
    this.drawRoundedRect(x, y, w, 22, {
      radius: 11,
      fill: withAlpha(enabled ? palette.green : palette.bgInput, enabled ? 0.13 : 0.42),
      border: withAlpha(enabled ? palette.green : palette.borderDim, enabled ? 0.42 : 0.72),
      borderWidth: 1,
      z: Z.ELEMENT,
    })
    this.drawText(`${label} ${enabled ? "on" : "off"}`, x + 10, y + 5, {
      fontPx: 9,
      material: enabled ? this.materials.green : this.materials.muted,
      maxWidthPx: Math.max(1, w - 20),
    })
  }

  #drawCountPill(x: number, y: number, w: number, label: string, count: number): void {
    this.drawRoundedRect(x, y, w, 16, {
      radius: 8,
      fill: withAlpha(palette.bgInput, 0.34),
      border: withAlpha(palette.borderDim, 0.68),
      borderWidth: 1,
      z: Z.ELEMENT + 0.02,
    })
    this.drawText(`${label} ${count}`, x + 8, y + 3, {
      fontPx: 8,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, w - 16),
    })
  }

  #networkLineMaterial(line: string): TextMaterial {
    const trimmed = line.trim()
    if (trimmed.includes("failed") || trimmed.includes("no entries") || trimmed.includes("no interesting")) return this.materials.orange
    if (trimmed.includes("active") || trimmed.includes(":443") || trimmed.includes(":80")) return this.materials.green
    if (trimmed.includes("idle")) return this.materials.muted
    return this.materials.text
  }

  #switchRow(x: number, y: number, label: string, checked: boolean, tooltip: string, onChange: (checked: boolean) => void): number {
    const labelW = Math.max(34, Math.ceil(this.measureText(label, 11)) + 2)
    this.drawText(label, x, y + 5, {
      fontPx: 11,
      material: checked ? this.materials.text : this.materials.muted,
      maxWidthPx: labelW,
    })
    const switchX = x + labelW + 7
    Switcher(this, switchX, y + 3, 38, 18, {
      checked,
      color: "success",
      tooltip,
      onChange,
    })
    return switchX + 42
  }

  #button(x: number, y: number, w: number, label: string, tooltip: string, iconSrc: string, action: () => void): number {
    Button(this, x, y, w, 26, {
      label,
      variant: "outlined",
      color: "neutral",
      size: "small",
      radius: 7,
      iconSrc,
      tooltip,
      action,
    })
    return x + w
  }
}

export function networkWatchSectionsFromLines(lines: readonly string[]): NetworkWatchSections {
  const sections: NetworkWatchSections = {time: "--", listen: [], tmux: [], other: []}
  let section: keyof Pick<NetworkWatchSections, "listen" | "tmux" | "other"> = "other"
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("[TIME]")) {
      sections.time = trimmed.replace(/^\[TIME\]\s*/, "")
      continue
    }
    if (trimmed === "[LISTEN]") {
      section = "listen"
      continue
    }
    if (trimmed === "[TMUX]") {
      section = "tmux"
      continue
    }
    sections[section].push(trimmed)
  }
  if (sections.listen.length === 0 && sections.tmux.length === 0 && sections.other.length > 0) {
    sections.listen = sections.other
    sections.other = []
  }
  return sections
}

function cloneSections(sections: NetworkWatchSections): NetworkWatchSections {
  return {
    time: sections.time,
    listen: [...sections.listen],
    tmux: [...sections.tmux],
    other: [...sections.other],
  }
}

function parseListenEntry(line: string): ListenEntry | null {
  const parts = line.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 3) return null
  const pidToken = parts.find((part) => part.startsWith("pid="))
  return {
    address: parts[0] ?? line,
    command: parts[1] ?? "",
    pid: pidToken?.replace(/^pid=/, "") ?? "--",
    protocol: parts[parts.length - 1] ?? "",
  }
}

function parsePaneEntry(line: string): PaneEntry | null {
  const parts = line.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 3) return null
  const target = parts[0] ?? line
  const state = parts[1] ?? ""
  const command = parts.length > 3 ? parts[parts.length - 1] ?? "" : ""
  const titleEnd = command.length > 0 ? parts.length - 1 : parts.length
  return {
    target,
    state,
    title: parts.slice(2, titleEnd).join(" "),
    command,
  }
}

function formatPaneTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0")
  const m = String(date.getMinutes()).padStart(2, "0")
  const s = String(date.getSeconds()).padStart(2, "0")
  return `${h}:${m}:${s}`
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}
