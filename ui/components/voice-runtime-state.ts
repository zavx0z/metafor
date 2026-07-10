export type VoiceOperatingMode = "activation" | "continuous"
export type VoiceRuntimeTransport = "off" | "connecting" | "webrtc" | "websocket" | "failed"
export type VoiceRuntimeStatus = "idle" | "connecting" | "waitingWake" | "listening" | "committing" | "processing" | "error"

export const VOICE_ENGINE_VERSION = "2.0.0"

export type VoiceRuntimeSnapshot = {
  mode: VoiceOperatingMode
  continuousSuspended: boolean
  status: VoiceRuntimeStatus
  transport: VoiceRuntimeTransport
  transportDetail: string
  speechActive: boolean
  level: number
  detail: string
  sessionPhase: string
  queuedChunks: number
  processingChunks: number
  failedChunks: number
  journalBackend: "indexeddb" | "memory" | "unknown"
  journalPendingWrites: number
  journalError: string
  updatedAt: number
}

export type VoiceRuntimeListener = (snapshot: VoiceRuntimeSnapshot, previous: VoiceRuntimeSnapshot) => void

const VOICE_CONTINUOUS_MODE_STORAGE_KEY = "metafor.interpreter.voice.continuousMode:v1"
const listeners = new Set<VoiceRuntimeListener>()

let runtime: VoiceRuntimeSnapshot = {
  mode: readStoredContinuousMode() ? "continuous" : "activation",
  continuousSuspended: false,
  status: "idle",
  transport: "off",
  transportDetail: "",
  speechActive: false,
  level: 0,
  detail: "",
  sessionPhase: "idle",
  queuedChunks: 0,
  processingChunks: 0,
  failedChunks: 0,
  journalBackend: "unknown",
  journalPendingWrites: 0,
  journalError: "",
  updatedAt: Date.now(),
}

export function readVoiceRuntimeState(): VoiceRuntimeSnapshot {
  return {...runtime}
}

export function updateVoiceRuntimeState(patch: Partial<VoiceRuntimeSnapshot>): VoiceRuntimeSnapshot {
  const previous = runtime
  const next: VoiceRuntimeSnapshot = {...runtime, ...patch, updatedAt: Date.now()}
  if (sameRuntime(previous, next)) return {...runtime}
  runtime = next
  for (const listener of listeners) listener({...runtime}, {...previous})
  return {...runtime}
}

export function subscribeVoiceRuntimeState(listener: VoiceRuntimeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readVoiceContinuousModeEnabled(): boolean {
  const stored = readStoredContinuousMode()
  if ((stored ? "continuous" : "activation") !== runtime.mode) {
    runtime = {...runtime, mode: stored ? "continuous" : "activation", updatedAt: Date.now()}
  }
  return runtime.mode === "continuous"
}

export function writeVoiceContinuousModeEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(VOICE_CONTINUOUS_MODE_STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Storage can be unavailable in private contexts.
  }
  updateVoiceRuntimeState({
    mode: enabled ? "continuous" : "activation",
    continuousSuspended: false,
  })
}

export function setVoiceContinuousSuspended(suspended: boolean): void {
  updateVoiceRuntimeState({continuousSuspended: runtime.mode === "continuous" && suspended})
}

export function voiceRuntimeTransportFromInput(value: "idle" | "connecting" | "ws" | "p2p"): VoiceRuntimeTransport {
  if (value === "p2p") return "webrtc"
  if (value === "ws") return "websocket"
  if (value === "connecting") return "connecting"
  return "off"
}

function readStoredContinuousMode(): boolean {
  try {
    if (typeof localStorage === "undefined") return false
    return localStorage.getItem(VOICE_CONTINUOUS_MODE_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function sameRuntime(a: VoiceRuntimeSnapshot, b: VoiceRuntimeSnapshot): boolean {
  return a.mode === b.mode
    && a.continuousSuspended === b.continuousSuspended
    && a.status === b.status
    && a.transport === b.transport
    && a.transportDetail === b.transportDetail
    && a.speechActive === b.speechActive
    && a.level === b.level
    && a.detail === b.detail
    && a.sessionPhase === b.sessionPhase
    && a.queuedChunks === b.queuedChunks
    && a.processingChunks === b.processingChunks
    && a.failedChunks === b.failedChunks
    && a.journalBackend === b.journalBackend
    && a.journalPendingWrites === b.journalPendingWrites
    && a.journalError === b.journalError
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== VOICE_CONTINUOUS_MODE_STORAGE_KEY) return
    updateVoiceRuntimeState({
      mode: event.newValue === "1" ? "continuous" : "activation",
      continuousSuspended: false,
    })
  })
}