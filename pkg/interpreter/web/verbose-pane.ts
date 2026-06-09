import {
  uiIcons,
} from "@ui/components"
import {
  LogViewerPane,
  PANE_FRAME,
} from "@ui/panes"
import {t} from "./i18n.ts"

type VerboseEntry = {
  kind: "protocol" | "interpreter"
  ts: string
  name: string
  payload: string
}

const VERBOSE_LINE_PX = 18
const VERBOSE_NAME_W = 28

export class VerbosePane extends LogViewerPane {
  #entries: VerboseEntry[] = []
  #autoscroll: boolean
  #copyStatusUntil = 0
  readonly #pinStorageKey: string
  readonly #max = 300
  #headerSignature = ""

  constructor(storageKey: string) {
    super({
      title: t("verbose"),
      status: "",
      statusKind: "idle",
      maxScrollback: 300,
      fontPx: 10,
      linePx: VERBOSE_LINE_PX,
      wrapLines: false,
      scrollX: false,
      scrollY: true,
    })
    this.#pinStorageKey = `${storageKey}:pin`
    this.#autoscroll = localStorage.getItem(this.#pinStorageKey) !== "0"
    this.node.name = "VerbosePane"
    this.#syncHeader()
  }

  append(kind: "protocol" | "interpreter", ts: string, name: string, payload: unknown): void {
    if (isLowValueEvent(kind, name, payload)) return
    const safePayload = summarizePayload(kind, name, payload)
    const entry = {kind, ts, name, payload: safePayload}
    this.#entries.push(entry)
    while (this.#entries.length > this.#max) this.#entries.shift()
    const scrollBefore = this.#autoscroll ? null : this.outputScrollPosition()
    this.writeln(formatVerboseLine(entry))
    if (this.#autoscroll) this.scrollToBottom()
    else if (scrollBefore !== null) this.outputScrollTo(scrollBefore)
    this.#syncHeader()
  }

  override clear(): void {
    this.#entries = []
    super.clear()
    this.#syncHeader()
  }

  override onWheel(event: WheelEvent, _localX: number, localY: number): void {
    const before = this.outputScrollPosition().top
    super.onWheel(event, _localX, localY)
    const after = this.outputScrollPosition().top
    if (localY <= PANE_FRAME.headerHeight || before === after || !this.#autoscroll) return
    this.#autoscroll = false
    localStorage.setItem(this.#pinStorageKey, "0")
    this.#syncHeader()
  }

  protected override render(): void {
    this.#syncHeader()
    super.render()
  }

  #toggleAutoscroll(): void {
    this.#autoscroll = !this.#autoscroll
    localStorage.setItem(this.#pinStorageKey, this.#autoscroll ? "1" : "0")
    if (this.#autoscroll) this.scrollToBottom()
    this.#syncHeader()
  }

  async #copyEntries(): Promise<void> {
    const text = this.#entries.map((entry) => JSON.stringify(entry)).join("\n")
    try {
      await navigator.clipboard.writeText(text)
      this.#copyStatusUntil = Date.now() + 1400
      this.#syncHeader()
      this.requestRender()
      window.setTimeout(() => {
        this.#syncHeader()
        this.requestRender()
      }, 1500)
    } catch {
      this.#copyStatusUntil = 0
      this.#syncHeader()
      this.requestRender()
    }
  }

  #syncHeader(): void {
    const copyLive = Date.now() < this.#copyStatusUntil
    const signature = [
      t("verbose"),
      t("copyVerbose"),
      t("clearVerbose"),
      this.#autoscroll ? t("autoscrollOn") : t("autoscrollOff"),
      this.#autoscroll ? "auto" : "manual",
      copyLive ? "copied" : "copy",
    ].join("|")
    this.setTitle(t("verbose"))
    this.setStatus("idle", "")
    if (signature === this.#headerSignature) return
    this.#headerSignature = signature
    this.setHeaderControls({
      secondary: [
        {
          label: t("copyVerbose"),
          iconSrc: uiIcons.copy,
          tone: copyLive ? "live" : "neutral",
          action: () => void this.#copyEntries(),
        },
        {
          label: t("clearVerbose"),
          iconSrc: uiIcons.clear,
          tone: "neutral",
          action: () => this.clear(),
        },
        {
          label: this.#autoscroll ? t("auto") : t("manual"),
          iconSrc: this.#autoscroll ? uiIcons.autoscroll : uiIcons.manual,
          tone: this.#autoscroll ? "live" : "neutral",
          action: () => this.#toggleAutoscroll(),
        },
      ],
    })
  }
}

function formatVerboseLine(entry: VerboseEntry): string {
  const time = ansi("90", fitText(formatTimestamp(entry.ts), 8))
  const name = entry.kind === "interpreter" ? `@${entry.name}` : entry.name
  const coloredName = ansi(entry.kind === "interpreter" ? "35" : "36", fitText(name, VERBOSE_NAME_W))
  return `${time} ${coloredName} ${terminalSafeText(entry.payload)}`
}

function fitText(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width, " ")
  return `${value.slice(0, Math.max(0, width - 1))}…`
}

function ansi(code: string, text: string): string {
  return `\x1b[${code}m${text}\x1b[0m`
}

function terminalSafeText(value: string): string {
  return value.replace(/\x1b/g, "")
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
      || path === "/processes"
      || /\/processes\/[^/]+\/(?:modules|source|breakpoints)$/.test(path ?? "")
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
