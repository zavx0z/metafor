import {
  METAFOR_PROTOCOL_KIND,
  openGravityBroadcastChannel,
  openElectromagnetismBroadcastChannel,
  openGluonBroadcastChannel,
  openHiggsBroadcastChannel,
  openWeakWBroadcastChannel,
  openWeakZBroadcastChannel,
  isGravitonMessage,
  isPhotonMessage,
  isGluonMessage,
  isHiggsMessage,
  isZMessage,
  isWMessage,
  type GravitonMessage,
  type PhotonMessage,
  type GluonMessage,
  type HiggsMessage,
  type ZMessage,
  type WMessage,
} from "../../shared/protocol"

type ProtocolMessage = GravitonMessage | PhotonMessage | GluonMessage | HiggsMessage | ZMessage | WMessage

interface LogEntry {
  timestamp: number
  channel: string
  boson: string
  source: string
  target: string
  payload: ProtocolMessage
  isValid: boolean
}

const CHANNEL_CONFIG = [
  { name: "metafor.gravity", validator: isGravitonMessage },
  { name: "metafor.electromagnetism", validator: isPhotonMessage },
  { name: "metafor.gluon", validator: isGluonMessage },
  { name: "metafor.higgs", validator: isHiggsMessage },
  { name: "metafor.weak.z", validator: isZMessage },
  { name: "metafor.weak.w", validator: isWMessage },
] as const

const MAX_LOG_ENTRIES = 100

let logEntries: LogEntry[] = []
let logContainer: HTMLElement | null = null
let isInitialized = false

const serializePayload = (payload: unknown): string => {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

const createLogEntry = (channel: string, data: unknown): LogEntry => {
  const isValid = typeof data === "object" && data !== null && "protocol" in data && "boson" in data && "source" in data && "target" in data

  const entry: LogEntry = {
    timestamp: Date.now(),
    channel,
    boson: isValid && typeof data === "object" && data !== null && "boson" in data ? String(data.boson) : "unknown",
    source: isValid && typeof data === "object" && data !== null && "source" in data ? String(data.source) : "unknown",
    target: isValid && typeof data === "object" && data !== null && "target" in data ? String(data.target) : "unknown",
    payload: isValid ? (data as ProtocolMessage) : (data as ProtocolMessage),
    isValid,
  }

  return entry
}

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toTimeString().split(" ")[0] + "." + String(date.getMilliseconds()).padStart(3, "0")
}

const renderLogEntry = (entry: LogEntry): string => {
  const time = formatTimestamp(entry.timestamp)
  const validityMarker = entry.isValid ? "✓" : "✗"
  const validityClass = entry.isValid ? "valid" : "invalid"

  return `
    <div class="log-entry ${validityClass}">
      <span class="log-time">${time}</span>
      <span class="log-channel">${entry.channel}</span>
      <span class="log-boson">${entry.boson}</span>
      <span class="log-source">${entry.source}</span>
      <span class="log-target">${entry.target}</span>
      <span class="log-marker">${validityMarker}</span>
      <pre class="log-payload">${serializePayload(entry.payload)}</pre>
    </div>
  `
}

const updateLogUI = () => {
  if (!logContainer) return
  logContainer.innerHTML = logEntries.map(renderLogEntry).join("")
  logContainer.scrollTop = logContainer.scrollHeight
}

const addLogEntry = (channel: string, data: unknown) => {
  const entry = createLogEntry(channel, data)

  logEntries.push(entry)
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries = logEntries.slice(-MAX_LOG_ENTRIES)
  }

  console.log(`[Protocol:${channel}]`, entry.boson, `from ${entry.source} to ${entry.target}`, entry.payload)
  if (!entry.isValid) {
    console.warn(`[Protocol:${channel}] Invalid message structure:`, data)
  }

  updateLogUI()
}

const setupChannelListener = (channelName: string, validator: (data: unknown) => boolean) => {
  const channel = new BroadcastChannel(channelName)

  channel.onmessage = (event) => {
    const data = event.data
    if (validator(data)) {
      addLogEntry(channelName, data)
    } else {
      addLogEntry(channelName, data)
    }
  }

  return channel
}

const createLogContainer = (): HTMLElement => {
  const container = document.createElement("div")
  container.id = "protocol-log"
  container.innerHTML = `
    <style>
      #protocol-log {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 40vh;
        background: #0d1117;
        border-top: 1px solid #30363d;
        font-family: "IBM Plex Mono", Menlo, monospace;
        font-size: 11px;
        overflow-y: auto;
        padding: 8px;
        z-index: 9999;
      }
      #protocol-log-header {
        position: sticky;
        top: 0;
        background: #161b22;
        padding: 4px 8px;
        border-bottom: 1px solid #30363d;
        font-weight: bold;
        color: #58a6ff;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #protocol-log-header span {
        font-size: 12px;
      }
      #clear-log-btn {
        background: #21262d;
        border: 1px solid #30363d;
        color: #c9d1d9;
        padding: 2px 8px;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
        border-radius: 4px;
      }
      #clear-log-btn:hover {
        background: #30363d;
      }
      .log-entry {
        display: grid;
        grid-template-columns: 80px 1fr 60px 50px 50px 20px;
        gap: 4px;
        padding: 4px 0;
        border-bottom: 1px solid #161b22;
        align-items: start;
      }
      .log-entry:last-child {
        border-bottom: none;
      }
      .log-entry.valid {
        color: #c9d1d9;
      }
      .log-entry.invalid {
        color: #f85149;
        background: rgba(248, 81, 73, 0.1);
      }
      .log-time {
        color: #8b949e;
      }
      .log-channel {
        color: #58a6ff;
        font-weight: bold;
      }
      .log-boson {
        color: #d2a8ff;
      }
      .log-source {
        color: #7ee787;
      }
      .log-target {
        color: #ffa657;
      }
      .log-marker {
        text-align: center;
        font-weight: bold;
      }
      .log-payload {
        grid-column: 1 / -1;
        margin: 4px 0 0 0;
        padding: 4px;
        background: #0a0f14;
        border-radius: 3px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 150px;
        overflow-y: auto;
        color: #8b949e;
      }
    </style>
    <div id="protocol-log-header">
      <span>📡 Protocol Log</span>
      <button id="clear-log-btn">Clear</button>
    </div>
    <div id="protocol-log-content"></div>
  `

  const clearBtn = container.querySelector("#clear-log-btn")
  clearBtn?.addEventListener("click", () => {
    logEntries = []
    updateLogUI()
  })

  return container
}

export const initProtocolLogger = () => {
  if (isInitialized) return

  isInitialized = true

  logContainer = createLogContainer()
  document.body.appendChild(logContainer)

  const channels = CHANNEL_CONFIG.map(({ name, validator }) => setupChannelListener(name, validator))

  window.addEventListener("beforeunload", () => {
    channels.forEach((channel) => channel.close())
  })
}

export const clearProtocolLog = () => {
  logEntries = []
  updateLogUI()
}

export const getProtocolLog = (): LogEntry[] => [...logEntries]
