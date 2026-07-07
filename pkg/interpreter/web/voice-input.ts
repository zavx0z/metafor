import {DEFAULT_VOICE_SESSION_TIMINGS, VoiceSessionManager, type VoiceChunk, type VoiceSessionDebugSnapshot, type VoiceSessionTimings} from "./voice-session-manager.ts"
import {VoiceSileroVad, type VoiceSileroVadDebugSnapshot} from "./voice-silero-vad.ts"
import {postInterpreterClientEvent} from "./remote-desktop-rtc-helpers.ts"

export type VoiceInputStatus = "idle" | "connecting" | "waitingWake" | "listening" | "committing" | "processing" | "error"

export type VoiceInputSegment = {
  start?: number
  end?: number
  text?: string
}

export type VoiceInputChunk = {
  text: string
  messages: string[]
  segments: VoiceInputSegment[]
}

export type VoiceInputSignalTone = "activation" | "deactivation" | "stop"
export type VoiceInputPhraseGroupId = "activation" | "deactivation" | "stop"
export type VoiceDeactivationMode = "phrase" | "timeout" | "phrase-timeout"
export type VoiceInputTransport = "idle" | "connecting" | "ws" | "p2p"
export type VoiceInputTraceSnapshot = {at: number; label: string; detail: string}

export type VoiceInputDebugSnapshot = {
  status: VoiceInputStatus
  active: boolean
  session: VoiceSessionDebugSnapshot
  sileroVad: VoiceSileroVadDebugSnapshot | null
  audioContextState: AudioContextState | null
  audioSampleRate: number
  streamActive: boolean
  trackStates: Array<{kind: string; label: string; enabled: boolean; muted: boolean; readyState: MediaStreamTrackState}>
  commandReadyState: number | null
  asrReadyState: number | null
  asrEnabled: boolean
  asrTransport: VoiceInputTransport
  audioFrameCount: number
  lastAudioFrameAt: number
  lastInputRms: number
  lastInputPeak: number
  commandBytesSent: number
  asrBytesQueued: number
  asrBytesSent: number
  trace: VoiceInputTraceSnapshot[]
}

type VoiceInputClientOptions = {
  url(): string
  wakeUrl(): string
  activationPhrases(): readonly string[]
  deactivationPhrases(): readonly string[]
  stopPhrases(): readonly string[]
  deactivationMode(): VoiceDeactivationMode
  recognitionTimeoutMs(): number
  language: string
  context(): string
  wakeEnabled?(): boolean
  createAsrSocket?: (url: string, context: VoiceInputAsrSocketContext) => VoiceInputSocket | null
  createCommandSocket?: (url: string, context: VoiceInputAsrSocketContext) => VoiceInputSocket | null
  onTransport?(transport: VoiceInputTransport): void
  onStatus(status: VoiceInputStatus, detail?: string): void
  onWake(text: string): void
  onCommandText(text: string, final: boolean): boolean | void
  onPartial(text: string): void
  onChunk(chunk: VoiceInputChunk): void
  onLevel(level: number): void
}

export type VoiceInputAsrSocketContext = {
  stream: MediaStream
  sampleRate: number
  language: string
  context: string
  onTransport(transport: VoiceInputTransport): void
}

export type VoiceInputSocket = {
  readonly keepAlive?: boolean
  readonly readyState: number
  readonly url: string
  binaryType: BinaryType
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  close(): void
  send(data: string | ArrayBuffer | Blob | ArrayBufferView<ArrayBuffer>): void
}

export function voiceInputWebSocketUrl(rawUrl: string): string {
  try {
    const url = typeof location === "undefined" ? new URL(rawUrl) : new URL(rawUrl, location.href)
    if (url.protocol === "http:") url.protocol = "ws:"
    else if (url.protocol === "https:") url.protocol = "wss:"
    return url.toString()
  } catch {
    return rawUrl
  }
}

type AsrMessage = {
  type?: string
  text?: string
  json?: unknown
  config?: unknown
  messages?: unknown
  segments?: unknown
  result?: unknown
  words?: unknown
  error?: string
}

type VoiceWakeAudioCutoff = {
  at: number
  source: "absoluteWords" | "relativeWords" | "fallback"
  phrase: string
  wordEndMs: number | null
}

export type VoiceCommandPhraseGroups = {
  activation: readonly string[]
  deactivation: readonly string[]
  stop: readonly string[]
}
type VoiceControlCommand = "deactivation" | "stop"
type VoiceControlText = {
  text: string
  command: VoiceControlCommand | null
}
type VoiceControlChunk = {
  chunk: VoiceInputChunk
  command: VoiceControlCommand | null
}

const TARGET_SAMPLE_RATE = 16_000
const WAKE_WORD = "завхоз"
export const VOICE_STOP_COMMAND_DETAIL = "voice stop command"
export const DEFAULT_VOICE_ACTIVATION_PHRASES = [
  "завхоз",
  "зав хоз",
  "запхоз",
  "зап хоз",
  "метафор",
  "метафора",
  "квин",
  "куэн",
  "qwen",
  "дипсик",
  "дип сик",
  "deepseek",
  "deep seek",
] as const
export const DEFAULT_VOICE_WAKE_PHRASES = DEFAULT_VOICE_ACTIVATION_PHRASES
const DEFAULT_VOICE_WAKE_CONFUSER_PHRASES = [
  "зав",
  "завтра",
  "завтрак",
  "за вход",
  "завуси",
  "завася",
  "заваня",
] as const
export const DEFAULT_VOICE_DEACTIVATION_PHRASES = [
  "выключи микрофон",
  "выключим микрофон",
  "выключу микрофон",
  "отключи микрофон",
  "отключим микрофон",
  "отключу микрофон",
  "выруби микрофон",
  "вырубим микрофон",
  "вырублю микрофон",
  "останови голосовой ввод",
  "Засыпай",
  "Режим ожидания",
  "Жди команду",
] as const
export const DEFAULT_VOICE_STOP_PHRASES = [
  "полная остановка",
  "полностью выключи микрофон",
  "полностью отключи микрофон",
  "выключи голосовой ввод полностью",
  "заверши голосовой ввод",
  "не подслушивай",
  "совсем выруби микрофон",
] as const
const VOICE_WAKE_TARGET_RMS = 0.08
const VOICE_WAKE_GAIN_START_RMS = 0.035
const VOICE_WAKE_HIGH_PEAK = 0.42
const VOICE_WAKE_HEADROOM_PEAK = 0.86
const VOICE_WAKE_MAX_GAIN = 6
const MAX_SIGNAL_TONE_VOLUME = 3
const COMMIT_TIMEOUT_MS = 15_000
const FINAL_SETTLE_MS = 450
const STOP_COMMAND_ARM_DELAY_MS = 1_800
const ASR_RECONNECT_DELAY_MS = 900
const PCM_FLUSH_BYTES = 4096
const PCM_FLUSH_MS = 120
const VOICE_AUDIO_PREROLL_MS = 2_400
const VOICE_AUDIO_WATCHDOG_CHECK_MS = 1_500
const VOICE_AUDIO_WATCHDOG_STALL_MS = 3_800
const VOICE_AUDIO_WATCHDOG_START_GRACE_MS = 2_500
const VOICE_DICTATION_MEDIUM_CHARS = 100
const VOICE_DICTATION_LONG_CHARS = 160
const VOICE_DICTATION_VERY_LONG_CHARS = 260
const VOICE_DICTATION_MEDIUM_AUDIO_MS = 6_500
const VOICE_DICTATION_LONG_AUDIO_MS = 10_000
const VOICE_DICTATION_VERY_LONG_AUDIO_MS = 18_000
const VOICE_DICTATION_MEDIUM_TIMEOUT_MS = 2_800
const VOICE_DICTATION_LONG_TIMEOUT_MS = 3_500
const VOICE_DICTATION_VERY_LONG_TIMEOUT_MS = 4_000
const VOICE_ACTIVATION_PREROLL_BUFFER_MS = 12_000
const VOICE_ACTIVATION_PREROLL_PAD_MS = 180
const VOICE_ACTIVATION_PREROLL_RMS = 0.018
const VOICE_ACTIVATION_PREROLL_PEAK = 0.026
const VOICE_ACTIVATION_PREROLL_STRONG_RMS = 0.055
const VOICE_ACTIVATION_PREROLL_STRONG_PEAK = 0.09
const VOICE_COMMAND_AUDIO_GATE_RMS = 0.006
const VOICE_COMMAND_AUDIO_GATE_PEAK = 0.010
const VOICE_WAKE_WORD_AUDIO_PADDING_MS = 120
const VOICE_WAKE_RESULT_LATENCY_GUARD_MS = 260
const VOICE_WAKE_FALLBACK_AUDIO_PREROLL_MS = 260
const MAX_DELIVERED_TRANSCRIPT_CHARS = 8_000
const MAX_REPEATED_VOICE_TOKEN_RUN = 120

export type VoiceInputDeliveryState = {
  transcript: string
  lastCommitId: number
  lastSignature: string
}

type VoiceAudioPrerollFrame = {
  at: number
  pcm: ArrayBuffer
  rms: number
  peak: number
  clippingRatio: number
  speechProbability: number | null
  speechProbabilityAt: number
}

export class VoiceInputClient {
  #sessionTimings: VoiceSessionTimings = {...DEFAULT_VOICE_SESSION_TIMINGS}
  #session = new VoiceSessionManager(this.#sessionTimings)
  #sileroVad: VoiceSileroVad | null = null
  #commandWs: VoiceInputSocket | null = null
  #asrWs: VoiceInputSocket | null = null
  #asrConnectPromise: Promise<void> | null = null
  #asrReconnectTimer: number | null = null
  #asrTransport: VoiceInputTransport = "idle"
  #stream: MediaStream | null = null
  #audioContext: AudioContext | null = null
  #sourceNode: MediaStreamAudioSourceNode | null = null
  #captureNode: AudioWorkletNode | null = null
  #sinkNode: GainNode | null = null
  #workletUrl: string | null = null
  #status: VoiceInputStatus = "idle"
  #stopRequested = false
  #wakeMatched = false
  #asrEnabled = false
  #asrActivatedAt = 0
  #wakeRecognizerStartedAt = 0
  #wakeAudioCutoff: VoiceWakeAudioCutoff | null = null

  #commitPending = false
  #commitTimer: number | null = null
  #lastVoiceActivityAt = 0
  #recognitionTimeoutTimer: number | null = null
  #pendingCommittedChunk: VoiceInputChunk | null = null
  #pendingCommittedChunkCommitId = 0
  #lastPartialChunk: VoiceInputChunk | null = null
  #pendingChunkFlushTimer: number | null = null
  #commitGeneration = 0
  #processingChunkId: string | null = null
  #finalSilenceRequested = false
  #observedDictationChars = 0
  #deliveredVoiceChunkCount = 0
  #lastDynamicRecognitionTimeoutMs = -1
  #commitWaiters: Array<() => void> = []
  #deliveryState = createVoiceInputDeliveryState()
  #audioPreroll: VoiceAudioPrerollFrame[] = []
  #firstChunkPrerollArmed = false
  #liveAsrChunkId: string | null = null
  #liveAsrPcm: ArrayBuffer[] = []
  #liveAsrBytes = 0
  #liveAsrFlushTimer: number | null = null
  #liveAsrChunkBytesSent = new Map<string, number>()
  #debugAudioFrameCount = 0
  #debugLastAudioFrameAt = 0
  #debugLastInputRms = 0
  #debugLastInputPeak = 0
  #debugCommandBytesSent = 0
  #debugAsrBytesSent = 0
  #traceSeq = 0
  #traceLog: VoiceInputTraceSnapshot[] = []
  #lastAudioTraceAt = 0
  #lastVadTraceAt = 0
  #audioStartedAt = 0
  #audioWatchdogTimer: number | null = null
  #audioRestarting = false

  constructor(private readonly options: VoiceInputClientOptions) {}

  get status(): VoiceInputStatus {
    return this.#status
  }

  get active(): boolean {
    return this.#status === "connecting" || this.#status === "waitingWake" || this.#status === "listening" || this.#status === "committing" || this.#status === "processing"
  }

  debugSnapshot(): VoiceInputDebugSnapshot {
    const session = this.#session.debugSnapshot()
    return {
      status: this.#status,
      active: this.active,
      session,
      sileroVad: this.#sileroVad?.debugSnapshot() ?? null,
      audioContextState: this.#audioContext?.state ?? null,
      audioSampleRate: this.#audioContext?.sampleRate ?? 0,
      streamActive: this.#stream?.active === true,
      trackStates: [...(this.#stream?.getTracks() ?? [])].map((track) => ({
        kind: track.kind,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      })),
      commandReadyState: this.#commandWs?.readyState ?? null,
      asrReadyState: this.#asrWs?.readyState ?? null,
      asrEnabled: this.#asrEnabled,
      asrTransport: this.#asrTransport,
      audioFrameCount: this.#debugAudioFrameCount,
      lastAudioFrameAt: this.#debugLastAudioFrameAt,
      lastInputRms: this.#debugLastInputRms,
      lastInputPeak: this.#debugLastInputPeak,
      commandBytesSent: this.#debugCommandBytesSent,
      asrBytesQueued: session.outboundPcmBytes + session.queuedPcmBytes,
      asrBytesSent: this.#debugAsrBytesSent,
      trace: this.#traceLog.slice(-12),
    }
  }

  reset(): void {
    this.#cleanup()
    this.#setStatus("idle")
  }

  prewarmDictation(): void {
    if (this.#status === "connecting" || this.#status === "listening" || this.#status === "committing" || this.#status === "processing") return
    if (this.#asrWs !== null || this.#asrEnabled) return
    void this.#connectAsr(this.options.url()).catch(() => {
      if (this.#status !== "idle" || this.#asrEnabled) return
      this.#disconnectAsrSocket()
    })
  }

  async reconnectWaitingWake(): Promise<void> {
    if (this.#status !== "waitingWake") return
    this.#stopRequested = false
    this.#wakeMatched = false
    try {
      if (this.#stream === null) await this.#startAudio()
      await this.#startCommandRecognizer()
    } catch (error) {
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
      throw error
    }
  }

  async start(): Promise<void> {
    this.#trace("start.request")
    if (this.active) return
    this.#stopRequested = false
    this.#wakeMatched = false
    this.#resetCommitState()
    this.#session.startReady()
    const wakeEnabled = this.#wakeEnabled()
    this.#setStatus("connecting", wakeEnabled ? this.options.wakeUrl() : this.options.url())

    try {
      await this.#startAudio()
      if (wakeEnabled) await this.#startCommandRecognizer()
      else this.#setStatus("idle")
      this.#trace("start.ready", {wakeEnabled})
    } catch (error) {
      this.#trace("start.error", {error: error instanceof Error ? error.message : String(error)})
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
      throw error
    }
  }

  stop(detail = ""): void {
    this.#trace("stop.request", {detail})
    if (!this.active) return
    this.#stopRequested = true
    this.#sendCommand({type: "stop"})
    this.#sendAsr({type: "stop"})
    this.#setStatus("idle", detail)
    this.#cleanup(detail === VOICE_STOP_COMMAND_DETAIL ? 420 : 0)
  }

  playSignalTone(kind: VoiceInputSignalTone, volume: number, onResult?: (kind: VoiceInputSignalTone, method: string, error?: unknown) => void): boolean {
    const context = this.#audioContext
    if (context === null || context.state === "closed") return false
    const signalVolume = Math.min(MAX_SIGNAL_TONE_VOLUME, Math.max(0, volume))
    if (signalVolume <= 0) {
      onResult?.(kind, "capture muted")
      return true
    }
    const play = (): void => {
      try {
        const spec = voiceInputSignalTone(kind)
        const start = context.currentTime + 0.005
        const end = start + spec.duration
        const gain = context.createGain()
        const oscillator = context.createOscillator()
        oscillator.type = spec.type
        oscillator.frequency.setValueAtTime(spec.startHz, start)
        oscillator.frequency.exponentialRampToValueAtTime(spec.endHz, end)
        const peakGain = spec.gain * signalVolume
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), start + 0.018)
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain * 0.4), start + spec.duration * 0.45)
        gain.gain.exponentialRampToValueAtTime(0.0001, end)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(start)
        oscillator.stop(end + 0.03)
        oscillator.addEventListener("ended", () => {
          oscillator.disconnect()
          gain.disconnect()
        }, {once: true})
        onResult?.(kind, `capture webaudio · ${context.state}`)
      } catch (error) {
        onResult?.(kind, "capture webaudio failed", error)
      }
    }
    if (context.state === "suspended") {
      let settled = false
      const fallbackTimer = window.setTimeout(() => {
        if (settled) return
        settled = true
        onResult?.(kind, "capture resume timeout")
      }, 180)
      void context.resume()
        .then(() => {
          if (settled) return
          settled = true
          window.clearTimeout(fallbackTimer)
          if (context.state !== "running") {
            onResult?.(kind, `capture context ${context.state}`)
            return
          }
          play()
        })
        .catch((error) => {
          if (settled) return
          settled = true
          window.clearTimeout(fallbackTimer)
          onResult?.(kind, "capture resume blocked", error)
        })
      return true
    }
    play()
    return true
  }

  async sleepToWake(): Promise<void> {
    this.#trace("draft.request")
    if (!this.active) return
    this.#stopRequested = false
    this.#session.enterDraftMode()
    this.#session.cancelAutoSend()
    this.#finalSilenceRequested = false
    this.#session.closeCurrentChunk(performance.now(), "draft mode")
    this.#trace("draft.entered")
    this.#flushPendingCommittedChunk()
    this.#sendCommand({type: "stop"})
    this.#stopAudioOnly()
    this.options.onLevel(0)
    if (!this.#asrEnabled) {
      this.#setStatus("idle", "draft")
      return
    }
    this.#setStatus(this.#session.hasPendingChunks() || this.#commitPending ? "processing" : "idle", "draft")
    this.#pumpAsrQueue()
    this.#clearAsrReconnectTimer()
    if (!this.#session.hasPendingChunks() && !this.#commitPending) {
      this.#sendAsr({type: "stop"})
      this.#pauseAsrSocketForWake()
      this.#asrEnabled = false
    } else if (this.#asrWs?.readyState !== WebSocket.OPEN) {
      this.#scheduleAsrReconnect()
    }
    this.#asrActivatedAt = 0
    this.#clearRecognitionTimeoutTimer()
    this.#wakeMatched = false
  }

  async startDictation(): Promise<void> {
    this.#trace("dictation.request")
    if (!this.active) {
      await this.#startDictationFromIdle()
      return
    }
    if (this.#status === "processing") {
      this.#trace("dictation.skip.processing")
      return
    }
    if (this.#stream === null) {
      await this.#startDictationFromIdle()
      return
    }
    if (this.#status === "waitingWake") {
      this.#stopRequested = false
      this.#wakeMatched = false
      this.#finalSilenceRequested = false
    } else if (this.#asrEnabled) {
      this.#trace("dictation.skip.asr-enabled")
      return
    }
    try {
      await this.#activateAsr("", "manual")
    } catch (error) {
      this.#trace("dictation.error", {error: error instanceof Error ? error.message : String(error)})
      this.#recoverAsrFailure(error)
    }
  }

  async #startDictationFromIdle(): Promise<void> {
    this.#trace("dictation.idle-start")
    this.#stopRequested = false
    this.#wakeMatched = false
    this.#resetCommitState()
    if (!this.#commitPending && !this.#session.hasPendingChunks()) this.#session.reset()
    this.#session.startRecording(true)
    this.#setStatus("connecting", this.options.url())
    try {
      await this.#startAudio()
      await this.#activateAsr("", "manual")
    } catch (error) {
      this.#trace("dictation.idle-error", {error: error instanceof Error ? error.message : String(error)})
      if (this.#stream !== null && this.#asrEnabled) {
        this.#recoverAsrFailure(error)
        return
      }
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
      throw error
    }
  }

  refreshDeactivationSettings(): void {
    this.#syncSessionTimings()
    this.#scheduleRecognitionTimeoutCheck()
  }

  async #startCommandRecognizer(): Promise<void> {
    if (!this.#wakeEnabled()) {
      this.#setStatus("idle")
      return
    }
    const phraseGroups = this.#commandPhrases()
    this.#trace("wake.connect", {url: this.options.wakeUrl()})
    await this.#connectCommand(this.options.wakeUrl())
    this.#wakeRecognizerStartedAt = performance.now()
    this.#sendCommand({
      type: "start",
      sampleRate: this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE,
      useGrammar: true,
      grammar: createWakeRecognitionGrammar(phraseGroups),
      words: true,
    })
    this.#setStatus("waitingWake", WAKE_WORD)
    this.#trace("wake.started", {phraseCount: phraseGroups.activation.length})
  }

  async #activateAsr(wakeText: string, source: "wake" | "manual" = "wake"): Promise<void> {
    this.#trace("asr.activate.request", {source, wakeChars: cleanupVoiceText(wakeText).length, wakeText: debugTraceText(wakeText)})
    if (this.#wakeMatched || this.#stopRequested) return
    this.#wakeMatched = true
    this.options.onWake(wakeText)
    this.#resetCommitState()
    this.#syncSessionTimings()
    if (!this.#commitPending && !this.#session.hasPendingChunks()) this.#session.reset()
    this.#session.startRecording(true)
    this.#clearAsrReconnectTimer()
    this.#asrEnabled = true
    this.#asrActivatedAt = performance.now()
    if (source === "wake" && this.#wakeAudioCutoff === null) {
      this.#wakeAudioCutoff = {
        at: this.#asrActivatedAt - VOICE_WAKE_FALLBACK_AUDIO_PREROLL_MS,
        source: "fallback",
        phrase: cleanupVoiceText(wakeText),
        wordEndMs: null,
      }
    } else if (source === "manual" && this.#wakeAudioCutoff !== null && this.#asrActivatedAt - this.#wakeAudioCutoff.at > VOICE_AUDIO_PREROLL_MS) {
      this.#wakeAudioCutoff = null
    }
    this.#firstChunkPrerollArmed = true
    this.#setStatus("connecting", this.options.url())
    await this.#connectAsr(this.options.url())
    this.#sendAsr({
      type: "start",
      sampleRate: this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE,
      language: this.options.language,
      format: false,
      context: this.options.context().trim(),
      prompt: this.options.context().trim(),
    })
    this.#setStatus("listening")
    this.#session.startRecording(true)
    this.#captureActivationPrerollChunk(performance.now())
    this.#pumpAsrQueue()
    this.#touchVoiceActivity()
    this.#trace("asr.activate.ready")
  }

  async #connectCommand(url: string): Promise<void> {
    if (this.#commandWs?.readyState === WebSocket.OPEN) return

    const socketUrl = voiceInputWebSocketUrl(url)
    this.#trace("wake.socket.connecting", {url: socketUrl})
    const ws = this.options.createCommandSocket?.(socketUrl, this.#socketContext()) ?? new WebSocket(socketUrl)
    ws.binaryType = "arraybuffer"
    this.#commandWs = ws

    ws.addEventListener("message", (event) => this.#handleCommandMessage(event as MessageEvent<unknown>))
    ws.addEventListener("close", () => {
      this.#trace("wake.socket.close", {url: ws.url})
      if (this.#commandWs !== ws) return
      this.#commandWs = null
      if (this.#stopRequested || this.#status === "idle") return
      if (this.#asrEnabled) {
        this.#trace("wake.socket.close.ignored", {url: ws.url})
        return
      }
      this.#trace("wake.socket.reconnect.scheduled", {url: ws.url, delayMs: ASR_RECONNECT_DELAY_MS})
      window.setTimeout(() => {
        if (this.#stopRequested || this.#status === "idle" || this.#asrEnabled) return
        void this.#startCommandRecognizer().catch((error) => {
          this.#trace("wake.socket.reconnect.error", {error: error instanceof Error ? error.message : String(error)})
        })
      }, ASR_RECONNECT_DELAY_MS)
    })

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => {
        this.#trace("wake.socket.open", {url: socketUrl})
        resolve()
      }, {once: true})
      ws.addEventListener("error", () => {
        this.#trace("wake.socket.error", {url: socketUrl})
        reject(new Error(`voice command websocket failed: ${socketUrl}`))
      }, {once: true})
    })
  }

  async #connectAsr(url: string): Promise<void> {
    if (this.#asrWs?.readyState === WebSocket.OPEN) return
    if (this.#asrWs?.readyState === WebSocket.CONNECTING && this.#asrConnectPromise !== null) {
      await this.#asrConnectPromise
      return
    }

    this.#setTransport("connecting")
    const socketUrl = voiceInputWebSocketUrl(url)
    this.#trace("asr.socket.connecting", {url: socketUrl})
    const ws = this.options.createAsrSocket?.(socketUrl, this.#socketContext()) ?? new WebSocket(socketUrl)
    ws.binaryType = "arraybuffer"
    this.#asrWs = ws

    ws.addEventListener("message", (event) => this.#handleAsrMessage(event as MessageEvent<unknown>))
    ws.addEventListener("close", () => {
      this.#trace("asr.socket.close", {url: ws.url})
      if (this.#asrWs !== ws) return
      this.#asrWs = null
      this.#asrConnectPromise = null
      this.#setTransport("idle")
      if (this.#stopRequested || this.#status === "idle" || this.#status === "waitingWake") return
      this.#recoverAsrFailure(`voice ASR websocket closed: ${ws.url}`)
    })

    const connectPromise = new Promise<void>((resolve, reject) => {
      let opened = false
      ws.addEventListener("open", () => {
        opened = true
        if (this.#asrTransport === "connecting" && ws instanceof WebSocket) this.#setTransport("ws")
        this.#trace("asr.socket.open", {url: socketUrl})
        resolve()
      }, {once: true})
      ws.addEventListener("error", () => {
        this.#trace("asr.socket.error", {url: socketUrl})
        reject(new Error(`voice ASR websocket failed: ${socketUrl}`))
      }, {once: true})
      ws.addEventListener("close", () => {
        if (!opened) reject(new Error(`voice ASR websocket closed before open: ${socketUrl}`))
      }, {once: true})
    })
    this.#asrConnectPromise = connectPromise
    try {
      await connectPromise
    } finally {
      if (this.#asrWs === ws) this.#asrConnectPromise = null
    }
  }

  #socketContext(): VoiceInputAsrSocketContext {
    return {
      stream: this.#stream ?? new MediaStream(),
      sampleRate: this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE,
      language: this.options.language,
      context: this.options.context().trim(),
      onTransport: (transport) => this.#setTransport(transport),
    }
  }

  async #startAudio(): Promise<void> {
    this.#trace("audio.start.request")
    this.#clearAudioWatchdog()
    this.#debugAudioFrameCount = 0
    this.#debugLastAudioFrameAt = 0
    this.#debugLastInputRms = 0
    this.#debugLastInputPeak = 0
    this.#lastAudioTraceAt = 0
    this.#lastVadTraceAt = 0
    this.#clearLiveAsrPcm()
    this.#audioPreroll = []
    this.#firstChunkPrerollArmed = false
    this.#wakeAudioCutoff = null
    try {
      this.#audioContext = new AudioContext({sampleRate: TARGET_SAMPLE_RATE})
    } catch {
      this.#audioContext = new AudioContext()
    }

    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    this.#trace("audio.stream.ready", {
      sampleRate: this.#audioContext.sampleRate,
      tracks: this.#stream.getTracks().map((track) => `${track.kind}:${track.readyState}:${track.enabled ? "on" : "off"}`),
    })

    this.#sourceNode = this.#audioContext.createMediaStreamSource(this.#stream)
    this.#captureNode = await this.#createCaptureNode(this.#audioContext)
    this.#sinkNode = this.#audioContext.createGain()
    this.#sinkNode.gain.value = 0
    if (this.#audioContext.sampleRate === TARGET_SAMPLE_RATE) {
      this.#sileroVad = new VoiceSileroVad()
      this.#sileroVad.start()
    } else {
      this.#sileroVad = null
    }

    this.#captureNode.port.onmessage = (event: MessageEvent<unknown>) => {
      const samples = event.data
      if (!(samples instanceof Float32Array)) return
      this.#debugAudioFrameCount += 1
      this.#debugLastAudioFrameAt = performance.now()
      const rms = rmsLevel(samples)
      const peak = peakLevel(samples)
      const clippingRatio = clippingRatioLevel(samples)
      this.#debugLastInputRms = rms
      this.#debugLastInputPeak = peak
      const now = performance.now()
      if (now - this.#lastAudioTraceAt >= 1_000) {
        this.#lastAudioTraceAt = now
        this.#trace("audio.frame", {rms: roundTraceNumber(rms), peak: roundTraceNumber(peak), clippingRatio: roundTraceNumber(clippingRatio)})
      }
      const pcm = floatToPcm16(samples)
      const wakeGain = analyzeWakeAudioGain(samples, rms, peak, clippingRatio)
      this.#session.setWakeGainDebug(wakeGain)
      const wakePcm = floatToPcm16(applyWakeAudioGain(samples, wakeGain.gain))
      this.#sileroVad?.acceptFrame(samples)
      const sileroProbability = this.#sileroVad?.probability()
      this.#trackSpeechAndMaybeCommit(samples, pcm, rms, peak, clippingRatio)
      this.#sendCommandPcm(wakePcm, rms, peak, sileroProbability?.probability ?? null, sileroProbability?.at ?? 0, now)
      this.#rememberAudioPreroll(pcm, now, rms, peak, clippingRatio, sileroProbability?.probability ?? null, sileroProbability?.at ?? 0)
    }

    this.#sourceNode.connect(this.#captureNode)
    this.#captureNode.connect(this.#sinkNode)
    this.#sinkNode.connect(this.#audioContext.destination)
    this.#audioStartedAt = performance.now()
    this.#scheduleAudioWatchdog()
    this.#trace("audio.graph.ready", {sampleRate: this.#audioContext.sampleRate})
  }

  #scheduleAudioWatchdog(): void {
    this.#clearAudioWatchdog()
    if (this.#stream === null || this.#audioContext === null || this.#stopRequested || this.#status === "idle") return
    this.#audioWatchdogTimer = window.setTimeout(() => {
      this.#audioWatchdogTimer = null
      void this.#handleAudioWatchdog()
    }, VOICE_AUDIO_WATCHDOG_CHECK_MS)
  }

  async #handleAudioWatchdog(): Promise<void> {
    if (this.#stream === null || this.#audioContext === null || this.#stopRequested || this.#status === "idle") return
    const now = performance.now()
    const lastFrameAt = this.#debugLastAudioFrameAt > 0 ? this.#debugLastAudioFrameAt : this.#audioStartedAt
    const elapsedMs = now - lastFrameAt
    const sinceStartMs = now - this.#audioStartedAt
    if (elapsedMs < VOICE_AUDIO_WATCHDOG_STALL_MS || sinceStartMs < VOICE_AUDIO_WATCHDOG_START_GRACE_MS) {
      this.#scheduleAudioWatchdog()
      return
    }
    const session = this.#session.debugSnapshot()
    if (this.#commitPending || session.currentChunkId !== null || session.queuedPcmChunks > 0 || session.chunks.processing > 0) {
      this.#trace("audio.watchdog.defer", {elapsedMs: Math.round(elapsedMs), phase: session.phase})
      this.#scheduleAudioWatchdog()
      return
    }
    await this.#restartAudioAfterStall(elapsedMs)
  }

  async #restartAudioAfterStall(elapsedMs: number): Promise<void> {
    if (this.#audioRestarting) return
    this.#audioRestarting = true
    const resumeWake = this.#status === "waitingWake" && !this.#asrEnabled && this.#wakeEnabled()
    this.#trace("audio.watchdog.restart", {elapsedMs: Math.round(elapsedMs), status: this.#status, resumeWake})
    try {
      this.#sendCommand({type: "stop"})
      this.#stopAudioOnly()
      await this.#startAudio()
      if (resumeWake && this.#status === "waitingWake") await this.#startCommandRecognizer()
      this.#trace("audio.watchdog.ready", {resumeWake})
    } catch (error) {
      this.#trace("audio.watchdog.error", {error: error instanceof Error ? error.message : String(error)})
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
    } finally {
      this.#audioRestarting = false
    }
  }

  #clearAudioWatchdog(): void {
    if (this.#audioWatchdogTimer === null) return
    window.clearTimeout(this.#audioWatchdogTimer)
    this.#audioWatchdogTimer = null
  }

  async #createCaptureNode(context: AudioContext): Promise<AudioWorkletNode> {
    const code = `
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const frameCount = input[0].length;
    const mono = new Float32Array(frameCount);
    for (let channel = 0; channel < input.length; channel += 1) {
      const samples = input[channel];
      for (let index = 0; index < frameCount; index += 1) {
        mono[index] += samples[index] / input.length;
      }
    }
    this.port.postMessage(mono, [mono.buffer]);
    return true;
  }
}
registerProcessor("voice-capture", VoiceCaptureProcessor);
`
    this.#workletUrl = URL.createObjectURL(new Blob([code], {type: "text/javascript"}))
    await context.audioWorklet.addModule(this.#workletUrl)
    return new AudioWorkletNode(context, "voice-capture")
  }

  #handleCommandMessage(event: MessageEvent<unknown>): void {
    if (typeof event.data !== "string") return
    let msg: AsrMessage
    try {
      msg = JSON.parse(event.data) as AsrMessage
    } catch {
      return
    }

    if (msg.type === "error") {
      this.#trace("wake.message.error", {error: msg.error ?? "voice command error"})
      if (this.#asrEnabled && this.#status !== "idle" && this.#status !== "waitingWake") return
      this.#setStatus("error", msg.error ?? "voice command error")
      return
    }
    if (msg.type === "started" || msg.type === "ready") return

    const text = recognitionText(msg)
    if (!text) return
    const receivedAt = performance.now()
    const finalMessage = isFinalRecognitionMessage(msg)
    const phraseGroups = this.#commandPhrases()
    const activationPhrases = phraseGroups.activation
    if (this.#asrEnabled) {
      const commandsArmed = receivedAt - this.#asrActivatedAt >= STOP_COMMAND_ARM_DELAY_MS
      if (commandsArmed && isFinalRecognitionMessage(msg)) {
        if (hasStopCommand(text, phraseGroups.stop)) {
          this.stop(VOICE_STOP_COMMAND_DETAIL)
          return
        }
        if (deactivationModeAllowsPhrase(this.options.deactivationMode()) && hasCommandPhrase(text, phraseGroups.deactivation)) {
          void this.sleepToWake().catch((error) => {
            this.#setStatus("error", error instanceof Error ? error.message : String(error))
            this.#cleanup()
          })
          return
        }
        if (deactivationModeAllowsPhrase(this.options.deactivationMode()) && isActivationDeactivationCommand(text, phraseGroups.activation)) {
          void this.sleepToWake().catch((error) => {
            this.#setStatus("error", error instanceof Error ? error.message : String(error))
            this.#cleanup()
          })
          return
        }
      }
      return
    }

    if (finalMessage) {
      const wakeAudioCutoff = wakeAudioCutoffFromRecognitionMessage(msg, activationPhrases, this.#wakeRecognizerStartedAt, receivedAt)
      if (wakeAudioCutoff !== null) {
        this.#wakeAudioCutoff = wakeAudioCutoff
        this.#trace("wake.audio.cutoff", {
          source: wakeAudioCutoff.source,
          phrase: wakeAudioCutoff.phrase,
          wordEndMs: wakeAudioCutoff.wordEndMs,
          cutoffAgeMs: Math.round(receivedAt - wakeAudioCutoff.at),
        })
      }
    }

    const commandTextHandled = this.options.onCommandText(cleanupVoiceText(text), finalMessage) === true
    if (finalMessage) this.#trace("wake.message.final", {chars: cleanupVoiceText(text).length, text: debugTraceText(text), handled: commandTextHandled})
    if (commandTextHandled) return

    this.#setStatus("waitingWake", WAKE_WORD)
    if (isFinalRecognitionMessage(msg) && hasStopCommand(text, phraseGroups.stop)) {
      this.stop(VOICE_STOP_COMMAND_DETAIL)
      return
    }
    if (!isActivationRecognitionMessage(msg, activationPhrases)) return

    void this.#activateAsr(text, "wake").catch((error) => this.#recoverAsrFailure(error))
  }

  #handleAsrMessage(event: MessageEvent<unknown>): void {
    if (typeof event.data !== "string") return
    let msg: AsrMessage
    try {
      msg = JSON.parse(event.data) as AsrMessage
    } catch {
      return
    }

    if (msg.type === "partial") {
      const text = recognitionText(msg)
      if (this.#stream !== null && this.#session.phase !== "draft" && this.#status !== "waitingWake") this.#setStatus("listening", compactDetail(text))
      if (cleanupVoiceText(text).length > 0) this.#scheduleRecognitionTimeoutCheck()
      const partial = removeCommandTextFromString(text, this.#asrControlPhrases())
      const partialText = trimStableVoiceTranscriptPrefix(partial.text, this.#deliveryState.transcript)
      this.#observeDictationText(partialText)
      if (partial.command === null && partialText) {
        this.#lastPartialChunk = {text: partial.text, messages: [], segments: []}
      }
      if (partialText || partial.command === null) this.options.onPartial(partialText)
      return
    }

    if (msg.type === "result" || msg.type === "final") {
      this.#trace("asr.message.final", {type: msg.type, chars: cleanupVoiceText(recognitionText(msg)).length, text: debugTraceText(recognitionText(msg))})
      const phraseGroups = this.#asrControlPhrases()
      if (deactivationModeAllowsPhrase(this.options.deactivationMode()) && isActivationDeactivationCommand(recognitionText(msg), phraseGroups.activation)) {
        this.#trace("asr.message.activation-deactivation", {text: debugTraceText(recognitionText(msg))})
        this.#executeControlCommand("deactivation")
        return
      }
      const result = removeCommandText(chunkFromAsrMessage(msg, phraseGroups), phraseGroups)
      const chunk = result.chunk
      if (voiceChunkHasText(chunk)) {
        this.#scheduleRecognitionTimeoutCheck()
        this.#pendingCommittedChunk = chunk
        this.#pendingCommittedChunkCommitId = this.#commitPending ? this.#commitGeneration : 0
        if (this.#processingChunkId !== null) this.#session.markChunkRecognized(this.#processingChunkId, voiceChunkDeliveryText(chunk))
        if (result.command === null) {
          this.options.onPartial(voiceChunkPreviewForDelivery(chunk, this.#deliveryState))
          this.#schedulePendingChunkFlush()
        }
      }
      if (result.command !== null) {
        this.#flushPendingCommittedChunk()
        this.#executeControlCommand(result.command)
      }
      return
    }

    if (msg.type === "committed") {
      this.#trace("asr.message.committed")
      const committedChunkId = this.#processingChunkId
      this.#clearPendingChunkFlushTimer()
      this.#flushPendingCommittedChunk()
      if (committedChunkId !== null) this.#session.markChunkMerged(committedChunkId)
      this.#finishCommit()
      if (!this.#stopRequested && this.#stream !== null && this.#status !== "waitingWake" && this.#session.phase !== "draft") this.#setStatus("listening")
      return
    }

    if (msg.type === "stopped") {
      if (this.#asrWs !== null) return
      this.#asrEnabled = false
      return
    }

    if (msg.type === "error") {
      this.#trace("asr.message.error", {error: msg.error ?? "voice error"})
      this.#recoverAsrFailure(msg.error ?? "voice error")
    }
  }

  #executeControlCommand(command: VoiceControlCommand): void {
    if (command === "stop") {
      this.stop(VOICE_STOP_COMMAND_DETAIL)
      return
    }
    void this.sleepToWake().catch((error) => {
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
    })
  }

  #trackSpeechAndMaybeCommit(samples: Float32Array, pcm: ArrayBuffer, rms: number, peak: number, clippingRatio: number): void {
    const now = performance.now()
    const sileroProbability = this.#sileroVad?.probability()
    if ((this.#status !== "listening" && this.#status !== "committing") || this.#stream === null) {
      this.options.onLevel(0)
      return
    }
    this.#syncSessionTimings()
    const vad = this.#session.acceptVadFrame({
      rms,
      peak,
      clippingRatio,
      now,
      speechProbability: sileroProbability?.probability ?? undefined,
      speechProbabilityAt: sileroProbability?.at ?? undefined,
    })
    this.options.onLevel(vad.speaking ? rms : 0)
    if (vad.started || vad.stopped || vad.closedChunkIds.length > 0 || vad.finalSilence || vad.potentialVoice || now - this.#lastVadTraceAt >= 1_000) {
      this.#lastVadTraceAt = now
      this.#trace(vad.started ? "vad.speech-start" : vad.stopped ? "vad.speech-stop" : vad.closedChunkIds.length > 0 ? "vad.chunk-closed" : vad.finalSilence ? "vad.final-silence" : "vad.frame", {
        rms: roundTraceNumber(rms),
        peak: roundTraceNumber(peak),
        clippingRatio: roundTraceNumber(clippingRatio),
        speechProbability: sileroProbability?.probability == null ? null : roundTraceNumber(sileroProbability.probability),
        source: vad.source,
        potentialVoice: vad.potentialVoice,
        threshold: roundTraceNumber(vad.speechThreshold),
        noiseFloor: roundTraceNumber(vad.noiseFloor),
        closed: vad.closedChunkIds,
      })
    }
    if (this.#asrEnabled && this.#session.currentChunkId !== null) {
      const chunkId = this.#session.currentChunkId
      for (const frame of this.#appendFirstChunkPreroll(now)) this.#enqueueLiveAsrPcm(chunkId, frame)
      this.#session.appendCurrentChunkPcm(pcm)
      this.#enqueueLiveAsrPcm(chunkId, pcm)
    }
    if (vad.speaking || vad.potentialVoice) {
      this.#finalSilenceRequested = false
      this.#touchVoiceActivity(now)
    }
    if (vad.closedChunkIds.length > 0) this.#pumpAsrQueue()
    if (vad.finalSilence) {
      this.#finalSilenceRequested = true
      this.#trace("dictation.final-silence")
      this.#maybeFinishDictationAfterFinalSilence()
    }
  }

  #sendCommandPcm(commandPcm: ArrayBuffer, rms: number, peak: number, speechProbability: number | null, speechProbabilityAt: number, now: number): void {
    if (this.#commandWs?.readyState === WebSocket.OPEN) {
      if (!this.#shouldSendCommandAudio(rms, peak, speechProbability, speechProbabilityAt, now)) return
      this.#commandWs.send(commandPcm)
      this.#debugCommandBytesSent += commandPcm.byteLength
    }
  }

  #shouldSendCommandAudio(rms: number, peak: number, speechProbability: number | null, speechProbabilityAt: number, now: number): boolean {
    if (this.#status === "idle" || this.#stopRequested) return false
    if (!this.#asrEnabled && this.#status === "waitingWake") return true
    const freshSilero = speechProbability !== null && speechProbabilityAt > 0 && now - speechProbabilityAt <= 260
    if (freshSilero && speechProbability >= 0.35 && peak >= VOICE_COMMAND_AUDIO_GATE_PEAK * 0.7) return true
    return rms >= VOICE_COMMAND_AUDIO_GATE_RMS && peak >= VOICE_COMMAND_AUDIO_GATE_PEAK
  }

  #rememberAudioPreroll(pcm: ArrayBuffer, now: number, rms: number, peak: number, clippingRatio: number, speechProbability: number | null, speechProbabilityAt: number): void {
    this.#audioPreroll.push({at: now, pcm, rms, peak, clippingRatio, speechProbability, speechProbabilityAt})
    const retentionMs = this.#status === "connecting" && this.#firstChunkPrerollArmed ? VOICE_ACTIVATION_PREROLL_BUFFER_MS : VOICE_AUDIO_PREROLL_MS
    const cutoff = Math.max(now - retentionMs, this.#wakeAudioCutoff?.at ?? 0)
    while (this.#audioPreroll.length > 0 && (this.#audioPreroll[0]?.at ?? now) < cutoff) this.#audioPreroll.shift()
  }

  #captureActivationPrerollChunk(now: number): void {
    if (!this.#firstChunkPrerollArmed || this.#session.currentChunkId !== null) return
    const cutoff = this.#wakeAudioCutoff === null
      ? Math.max(this.#asrActivatedAt - VOICE_AUDIO_PREROLL_MS, now - VOICE_ACTIVATION_PREROLL_BUFFER_MS)
      : Math.max(this.#wakeAudioCutoff.at, now - VOICE_ACTIVATION_PREROLL_BUFFER_MS)
    const frames = this.#audioPreroll.filter((frame) => frame.at >= cutoff && frame.at <= now)
    if (frames.length === 0) return

    const sampleRate = this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE
    let firstVoiceAt = frames[0]?.at ?? 0
    let lastVoiceAt = frames.at(-1)?.at ?? 0
    let voicedMs = 0
    let maxRms = 0
    let maxPeak = 0
    for (const frame of frames) {
      const durationMs = Math.max(1, frame.pcm.byteLength / 2 / sampleRate * 1_000)
      maxRms = Math.max(maxRms, frame.rms)
      maxPeak = Math.max(maxPeak, frame.peak)
      const sileroVoice = frame.speechProbability !== null && frame.speechProbability >= 0.54 && frame.peak >= 0.013 && frame.clippingRatio < 0.35
      const energyVoice = frame.rms >= VOICE_ACTIVATION_PREROLL_RMS && frame.peak >= VOICE_ACTIVATION_PREROLL_PEAK && frame.clippingRatio < 0.22
      const strongVoice = frame.rms >= VOICE_ACTIVATION_PREROLL_STRONG_RMS && frame.peak >= VOICE_ACTIVATION_PREROLL_STRONG_PEAK && frame.clippingRatio < 0.22
      if (sileroVoice || energyVoice || strongVoice) {
        voicedMs += durationMs
      }
    }
    if (firstVoiceAt === 0 || lastVoiceAt === 0) return

    const startedAt = Math.max(cutoff, firstVoiceAt - VOICE_ACTIVATION_PREROLL_PAD_MS)
    const endedAt = Math.min(now, lastVoiceAt + this.#sessionTimings.speechEndMs)
    const chunkFrames = frames.filter((frame) => frame.at >= startedAt && frame.at <= endedAt)
    const chunk = this.#session.startBufferedChunk(chunkFrames.map((frame) => frame.pcm), startedAt, lastVoiceAt)
    if (chunk === null) return
    this.#firstChunkPrerollArmed = false
    this.#wakeAudioCutoff = null
    for (const frame of chunkFrames) this.#enqueueLiveAsrPcm(chunk.id, frame.pcm)
    const closed = now - lastVoiceAt >= this.#sessionTimings.speechEndMs
    this.#trace("activation.preroll.chunk", {
      chunkId: chunk.id,
      frames: chunkFrames.length,
      bytes: chunk.pcmBytes,
      voicedMs: Math.round(voicedMs),
      voiceAgeMs: Math.round(now - lastVoiceAt),
      closed,
      maxRms: roundTraceNumber(maxRms),
      maxPeak: roundTraceNumber(maxPeak),
    })
    if (closed) {
      this.#session.closeCurrentChunk(endedAt, "activation preroll")
      this.#pumpAsrQueue()
    }
  }

  #appendFirstChunkPreroll(now: number): ArrayBuffer[] {
    if (!this.#firstChunkPrerollArmed) return []
    const chunkId = this.#session.currentChunkId
    this.#firstChunkPrerollArmed = false
    if (chunkId === null) return []
    const wakeAudioCutoff = this.#wakeAudioCutoff
    this.#wakeAudioCutoff = null
    const cutoff = wakeAudioCutoff === null ? now - VOICE_AUDIO_PREROLL_MS : Math.max(now - VOICE_AUDIO_PREROLL_MS, wakeAudioCutoff.at)
    const appended: ArrayBuffer[] = []
    let frames = 0
    let bytes = 0
    for (const frame of this.#audioPreroll) {
      if (frame.at < cutoff) continue
      this.#session.appendCurrentChunkPcm(frame.pcm)
      appended.push(frame.pcm)
      frames += 1
      bytes += frame.pcm.byteLength
    }
    this.#trace("audio.preroll.append", {chunkId, frames, bytes, wakeCutoff: wakeAudioCutoff?.source ?? null, cutoffAgeMs: Math.round(now - cutoff)})
    return appended
  }

  #enqueueLiveAsrPcm(chunkId: string, pcm: ArrayBuffer): void {
    if (!this.#asrEnabled || this.#commitPending || this.#asrWs?.readyState !== WebSocket.OPEN) return
    if (this.#liveAsrChunkId !== null && this.#liveAsrChunkId !== chunkId) this.#flushLiveAsrPcm()
    this.#liveAsrChunkId = chunkId
    this.#liveAsrPcm.push(pcm)
    this.#liveAsrBytes += pcm.byteLength
    if (this.#liveAsrBytes >= PCM_FLUSH_BYTES) {
      this.#flushLiveAsrPcm()
      return
    }
    if (this.#liveAsrFlushTimer !== null) return
    this.#liveAsrFlushTimer = window.setTimeout(() => {
      this.#liveAsrFlushTimer = null
      this.#flushLiveAsrPcm()
    }, PCM_FLUSH_MS)
  }

  #flushLiveAsrPcm(): void {
    if (this.#liveAsrFlushTimer !== null) {
      window.clearTimeout(this.#liveAsrFlushTimer)
      this.#liveAsrFlushTimer = null
    }
    const chunkId = this.#liveAsrChunkId
    const frames = this.#liveAsrPcm.splice(0)
    const bytes = this.#liveAsrBytes
    this.#liveAsrBytes = 0
    if (chunkId === null || frames.length === 0) return
    const ws = this.#asrWs
    if (!this.#asrEnabled || this.#commitPending || ws?.readyState !== WebSocket.OPEN) return
    try {
      for (const frame of frames) {
        ws.send(frame)
        this.#debugAsrBytesSent += frame.byteLength
      }
      this.#liveAsrChunkBytesSent.set(chunkId, (this.#liveAsrChunkBytesSent.get(chunkId) ?? 0) + bytes)
    } catch (error) {
      this.#trace("asr.live-pcm.error", {chunkId, error: error instanceof Error ? error.message : String(error)})
      this.#clearLiveAsrPcm()
      this.#recoverAsrFailure(error)
    }
  }

  #clearLiveAsrPcm(): void {
    if (this.#liveAsrFlushTimer !== null) {
      window.clearTimeout(this.#liveAsrFlushTimer)
      this.#liveAsrFlushTimer = null
    }
    this.#liveAsrChunkId = null
    this.#liveAsrPcm = []
    this.#liveAsrBytes = 0
    this.#liveAsrChunkBytesSent.clear()
  }

  #pumpAsrQueue(): void {
    if (!this.#asrEnabled || this.#commitPending || this.#asrWs?.readyState !== WebSocket.OPEN) {
      if (this.#session.hasPendingChunks()) this.#trace("asr.queue.wait", {reason: !this.#asrEnabled ? "asr-disabled" : this.#commitPending ? "commit-pending" : "socket-not-open"})
      if (this.#session.hasPendingChunks()) this.#session.markAutoSendWaitingChunks()
      return
    }
    const chunk = this.#session.nextQueuedChunk()
    if (chunk === null) {
      this.#trace("asr.queue.empty")
      this.#maybeFinishDictationAfterFinalSilence()
      this.#maybePauseDraftAsrDrain()
      return
    }
    if (chunk.pcmBytes <= 0) {
      this.#trace("asr.chunk.empty", {chunkId: chunk.id})
      this.#session.markChunkFailed(chunk.id, "empty audio chunk", false)
      this.#pumpAsrQueue()
      return
    }
    this.#sendAsrChunk(chunk)
  }

  #maybeFinishDictationAfterFinalSilence(): void {
    if (!this.#finalSilenceRequested || this.#stopRequested || !this.#asrEnabled) return
    if (this.#session.phase === "draft") {
      this.#maybePauseDraftAsrDrain()
      return
    }
    if (!this.#session.hasVoiceActivity()) {
      this.#trace("dictation.final-silence.ignored", {reason: "no-voice-activity"})
      this.#finalSilenceRequested = false
      return
    }
    this.#prepareFinalSilenceForAsrQueue()
    if (this.#commitPending || this.#session.hasPendingChunks()) {
      this.#session.markAutoSendWaitingChunks()
      this.#pumpAsrQueue()
      return
    }
    this.#session.markAutoSendReady()
    this.#finalSilenceRequested = false
    this.#maybePauseDraftAsrDrain(true)
  }

  #prepareFinalSilenceForAsrQueue(): void {
    this.#trace("dictation.capture.final-silence", {keepAudio: this.#stream !== null})
    this.#session.closeCurrentChunk(performance.now(), "final silence")
    this.#flushLiveAsrPcm()
    this.#sendCommand({type: "stop"})
    this.#clearRecognitionTimeoutTimer()
    if (this.#stream === null && this.#status !== "processing") this.#setStatus("processing", "ASR queue")
  }

  #maybePauseDraftAsrDrain(force = false): void {
    if (!force && this.#status !== "waitingWake" && this.#status !== "processing" && this.#session.phase !== "draft") return
    if (this.#commitPending || this.#session.hasPendingChunks()) return
    if (!this.#asrEnabled) return
    this.#sendAsr({type: "stop"})
    this.#pauseAsrSocketForWake()
    this.#asrEnabled = false
    this.#asrActivatedAt = 0
    if (this.#session.phase === "draft") {
      this.#setStatus("idle", "draft")
    }
    else {
      if (this.#wakeEnabled()) {
        this.#setStatus("waitingWake", "ready")
        this.#session.reset()
        void this.reconnectWaitingWake()
      } else {
        this.#stopAudioOnly()
        this.#setStatus("idle", "ready")
        this.#session.reset()
      }
    }
  }

  #sendAsrChunk(chunk: VoiceChunk): void {
    const ws = this.#asrWs
    if (ws?.readyState !== WebSocket.OPEN) return
    try {
      this.#flushLiveAsrPcm()
      this.#beginCommit(chunk.id)
      const liveSentBytes = this.#liveAsrChunkBytesSent.get(chunk.id) ?? 0
      if (chunk.attempts === 1 && liveSentBytes >= chunk.pcmBytes) {
        this.#trace("asr.chunk.commit-live", {chunkId: chunk.id, bytes: chunk.pcmBytes, liveSentBytes})
        ws.send(JSON.stringify({type: "commit"}))
        this.#setStatus(this.#stream === null ? "processing" : "committing")
        return
      }
      this.#trace("asr.chunk.send", {chunkId: chunk.id, bytes: chunk.pcmBytes, liveSentBytes, parts: chunk.pcm.length, attempts: chunk.attempts})
      this.#sendChunkPcmTail(ws, chunk, chunk.attempts === 1 ? liveSentBytes : 0)
      ws.send(JSON.stringify({type: "commit"}))
      this.#setStatus(this.#stream === null ? "processing" : "committing")
    } catch (error) {
      this.#session.markChunkFailed(chunk.id, error instanceof Error ? error.message : String(error), true)
      this.#finishCommit(false)
      this.#recoverAsrFailure(error)
    }
  }

  #sendChunkPcmTail(ws: VoiceInputSocket, chunk: VoiceChunk, skipBytes: number): void {
    let remainingSkip = Math.min(Math.max(0, skipBytes), chunk.pcmBytes)
    for (const pcm of chunk.pcm) {
      if (remainingSkip >= pcm.byteLength) {
        remainingSkip -= pcm.byteLength
        continue
      }
      const payload = remainingSkip > 0 ? pcm.slice(remainingSkip) : pcm
      remainingSkip = 0
      ws.send(payload)
      this.#debugAsrBytesSent += payload.byteLength
    }
  }

  #beginCommit(chunkId: string): void {
    this.#trace("asr.commit.begin", {chunkId})
    this.#commitPending = true
    this.#processingChunkId = chunkId
    this.#session.markProcessing(chunkId)
    this.#commitGeneration += 1
    this.#clearCommitTimer()
    this.#commitTimer = window.setTimeout(() => {
      if (!this.#commitPending) return
      const chunkId = this.#processingChunkId
      this.#trace("asr.commit.timeout", {chunkId: chunkId ?? ""})
      if (chunkId !== null) this.#session.markChunkFailed(chunkId, "commit timeout", true)
      this.#pendingCommittedChunk = null
      this.#pendingCommittedChunkCommitId = 0
      this.#lastPartialChunk = null
      this.#finishCommit()
      if (!this.#stopRequested) {
        this.#setStatus(this.#session.phase === "draft" ? "waitingWake" : this.#stream === null ? "processing" : "listening", "commit timeout")
        this.#pumpAsrQueue()
      }
    }, COMMIT_TIMEOUT_MS)
  }

  #finishCommit(pump = true): void {
    this.#trace("asr.commit.finish", {pump})
    this.#commitPending = false
    this.#processingChunkId = null
    this.#clearCommitTimer()
    if (!this.#stopRequested && this.#stream !== null && this.#status !== "waitingWake" && this.#status !== "idle" && this.#status !== "processing") {
      this.#session.startRecording(false)
    }
    this.#resolveCommitWaiters()
    if (pump) this.#pumpAsrQueue()
    this.#maybeFinishDictationAfterFinalSilence()
  }

  async #commitCurrentChunkBeforeAsrShutdown(): Promise<void> {
    this.#session.closeCurrentChunk(performance.now(), "dictation stopped")
    this.#pumpAsrQueue()
    this.#flushPendingCommittedChunk()
  }

  #waitForCommitSettled(timeoutMs: number): Promise<void> {
    if (!this.#commitPending) return Promise.resolve()
    return new Promise((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve()
      }
      const timer = window.setTimeout(done, timeoutMs)
      this.#commitWaiters.push(done)
    })
  }

  #resolveCommitWaiters(): void {
    const waiters = this.#commitWaiters.splice(0)
    for (const waiter of waiters) waiter()
  }

  #clearCommitTimer(): void {
    if (this.#commitTimer === null) return
    window.clearTimeout(this.#commitTimer)
    this.#commitTimer = null
  }

  #resetCommitState(): void {
    this.#clearCommitTimer()
    this.#resolveCommitWaiters()
    this.#clearPendingChunkFlushTimer()
    this.#commitPending = false
    this.#processingChunkId = null
    this.#finalSilenceRequested = false
    this.#observedDictationChars = 0
    this.#deliveredVoiceChunkCount = 0
    this.#lastDynamicRecognitionTimeoutMs = -1
    this.#lastVoiceActivityAt = 0
    this.#pendingCommittedChunk = null
    this.#pendingCommittedChunkCommitId = 0
    this.#lastPartialChunk = null
    this.#commitGeneration = 0
    resetVoiceInputDeliveryState(this.#deliveryState)
  }

  #touchVoiceActivity(now = performance.now()): void {
    this.#lastVoiceActivityAt = now
    this.#scheduleRecognitionTimeoutCheck()
  }

  #scheduleRecognitionTimeoutCheck(): void {
    this.#clearRecognitionTimeoutTimer()
    if (!this.#asrEnabled || this.#stopRequested || !deactivationModeAllowsTimeout(this.options.deactivationMode())) return
    const timeoutMs = this.#currentRecognitionTimeoutMs()
    if (timeoutMs <= 0) return
    const now = performance.now()
    const lastVoiceActivityAt = this.#lastVoiceActivityAt > 0 ? this.#lastVoiceActivityAt : now
    const delay = Math.max(0, timeoutMs - (now - lastVoiceActivityAt))
    this.#recognitionTimeoutTimer = window.setTimeout(() => {
      this.#recognitionTimeoutTimer = null
      this.#handleRecognitionTimeout()
    }, delay)
  }

  #handleRecognitionTimeout(): void {
    if (!this.#asrEnabled || this.#stopRequested || !deactivationModeAllowsTimeout(this.options.deactivationMode())) return
    const timeoutMs = this.#currentRecognitionTimeoutMs()
    if (timeoutMs <= 0) return
    const session = this.#session.debugSnapshot()
    if (session.speaking || session.chunks.recording > 0) {
      this.#scheduleRecognitionTimeoutCheck()
      return
    }
    if (this.#commitPending) {
      this.#clearRecognitionTimeoutTimer()
      this.#recognitionTimeoutTimer = window.setTimeout(() => {
        this.#recognitionTimeoutTimer = null
        this.#handleRecognitionTimeout()
      }, timeoutMs)
      return
    }
    const elapsed = performance.now() - this.#lastVoiceActivityAt
    if (elapsed < timeoutMs) {
      this.#scheduleRecognitionTimeoutCheck()
      return
    }
    this.#trace("dictation.voice-timeout", {timeoutMs, elapsed: Math.round(elapsed)})
    this.#finalSilenceRequested = true
    this.#maybeFinishDictationAfterFinalSilence()
  }

  #syncSessionTimings(): void {
    const timeoutMs = deactivationModeAllowsTimeout(this.options.deactivationMode()) ? this.#currentRecognitionTimeoutMs() : 0
    this.#sessionTimings.finalSilenceMs = timeoutMs > 0
      ? Math.max(180, timeoutMs - this.#sessionTimings.speechEndMs)
      : DEFAULT_VOICE_SESSION_TIMINGS.finalSilenceMs
    if (timeoutMs === this.#lastDynamicRecognitionTimeoutMs) return
    this.#lastDynamicRecognitionTimeoutMs = timeoutMs
    const session = this.#session.debugSnapshot()
    if (!session.hasVoiceActivity) return
    this.#trace("dictation.dynamic-timeout", {
      chars: Math.max(this.#observedDictationChars, cleanupVoiceText(this.#deliveryState.transcript).length),
      chunkCount: Math.max(this.#deliveredVoiceChunkCount, session.chunks.total),
      audioMs: Math.round(session.chunkPcmBytes / 2 / TARGET_SAMPLE_RATE * 1_000),
      timeoutMs,
      finalSilenceMs: this.#sessionTimings.finalSilenceMs,
    })
  }

  #currentRecognitionTimeoutMs(): number {
    if (!deactivationModeAllowsTimeout(this.options.deactivationMode())) return 0
    const session = this.#session.debugSnapshot()
    return voiceDynamicRecognitionTimeoutMs(
      this.options.recognitionTimeoutMs(),
      Math.max(this.#observedDictationChars, cleanupVoiceText(this.#deliveryState.transcript).length),
      Math.max(this.#deliveredVoiceChunkCount, session.chunks.total),
      session.chunkPcmBytes / 2 / TARGET_SAMPLE_RATE * 1_000,
    )
  }

  #observeDictationText(text: string): void {
    const cleaned = cleanupVoiceText(text)
    if (cleaned.length === 0) return
    const deliveredChars = cleanupVoiceText(this.#deliveryState.transcript).length
    const chars = deliveredChars + cleaned.length + (deliveredChars > 0 ? 1 : 0)
    if (chars <= this.#observedDictationChars) return
    const previousTimeoutMs = this.#currentRecognitionTimeoutMs()
    this.#observedDictationChars = chars
    this.#syncSessionTimings()
    if (this.#currentRecognitionTimeoutMs() !== previousTimeoutMs) this.#scheduleRecognitionTimeoutCheck()
  }

  #clearRecognitionTimeoutTimer(): void {
    if (this.#recognitionTimeoutTimer === null) return
    window.clearTimeout(this.#recognitionTimeoutTimer)
    this.#recognitionTimeoutTimer = null
  }

  #sendCommand(payload: unknown): void {
    if (this.#commandWs?.readyState === WebSocket.OPEN) this.#commandWs.send(JSON.stringify(payload))
  }

  #sendAsr(payload: unknown): void {
    if (this.#asrWs?.readyState === WebSocket.OPEN) this.#asrWs.send(JSON.stringify(payload))
  }

  #disconnectCommandSocket(): void {
    if (this.#commandWs === null) return
    const ws = this.#commandWs
    this.#commandWs = null
    this.#wakeRecognizerStartedAt = 0
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  #disconnectAsrSocket(): void {
    if (this.#asrWs === null) return
    const ws = this.#asrWs
    this.#asrWs = null
    this.#asrConnectPromise = null
    this.#setTransport("idle")
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  #pauseAsrSocketForWake(): void {
    const ws = this.#asrWs
    if (ws?.readyState === WebSocket.OPEN) {
      this.#asrConnectPromise = null
      return
    }
    this.#disconnectAsrSocket()
  }

  async #resumeWakeAfterDraftDrain(): Promise<void> {
    if (this.#stopRequested || this.#status !== "waitingWake" || this.#session.phase !== "draft") return
    if (this.#asrEnabled || this.#commitPending || this.#session.hasPendingChunks()) return
    if (!this.#wakeEnabled()) {
      this.#setStatus("idle", "ready")
      return
    }
    this.#trace("wake.resume-after-draft.request")
    try {
      await this.reconnectWaitingWake()
      this.#trace("wake.resume-after-draft.ready")
    } catch (error) {
      this.#trace("wake.resume-after-draft.error", {error: error instanceof Error ? error.message : String(error)})
    }
  }

  #setTransport(transport: VoiceInputTransport): void {
    if (this.#asrTransport === transport) return
    this.#asrTransport = transport
    this.options.onTransport?.(transport)
  }

  #wakeEnabled(): boolean {
    return this.options.wakeEnabled?.() ?? true
  }

  #recoverAsrFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.#trace("asr.recover", {error: message})
    this.#session.requeueProcessingChunks(message)
    this.#pendingCommittedChunk = null
    this.#pendingCommittedChunkCommitId = 0
    this.#lastPartialChunk = null
    this.#clearLiveAsrPcm()
    this.#disconnectAsrSocket()
    this.#finishCommit(false)
    if (!this.#asrEnabled || this.#stopRequested || this.#status === "idle") {
      this.#asrEnabled = false
      this.#asrActivatedAt = 0
      this.#wakeMatched = false
      this.#clearRecognitionTimeoutTimer()
      this.#session.markReconnecting(message)
      if (this.#status !== "idle") this.#setStatus("waitingWake", `ASR reconnecting: ${message}`)
      return
    }
    this.#session.markReconnecting(message)
    this.#setTransport("connecting")
    this.#setStatus(this.#session.phase === "draft" ? "waitingWake" : this.#stream === null ? "processing" : "listening", `ASR reconnecting: ${message}`)
    this.#scheduleAsrReconnect()
  }

  #scheduleAsrReconnect(): void {
    if (this.#asrReconnectTimer !== null || !this.#asrEnabled || this.#stopRequested) return
    this.#trace("asr.reconnect.scheduled", {delayMs: ASR_RECONNECT_DELAY_MS})
    this.#asrReconnectTimer = window.setTimeout(() => {
      this.#asrReconnectTimer = null
      void this.#reconnectAsr()
    }, ASR_RECONNECT_DELAY_MS)
  }

  async #reconnectAsr(): Promise<void> {
    if (!this.#asrEnabled || this.#stopRequested) return
    this.#trace("asr.reconnect.request")
    try {
      await this.#connectAsr(this.options.url())
      this.#sendAsr({
        type: "start",
        sampleRate: this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE,
        language: this.options.language,
        format: false,
        context: this.options.context().trim(),
        prompt: this.options.context().trim(),
      })
      const resumeCapture = this.#stream !== null && this.#session.phase !== "draft"
      this.#session.startRecording(resumeCapture)
      this.#setStatus(resumeCapture ? "listening" : this.#session.phase === "draft" ? this.#session.hasPendingChunks() ? "processing" : "idle" : this.#session.hasPendingChunks() ? "processing" : "waitingWake", this.#session.phase === "draft" ? "draft" : "ASR reconnected")
      if (resumeCapture) this.#touchVoiceActivity()
      this.#pumpAsrQueue()
      this.#trace("asr.reconnect.ready", {resumeCapture})
    } catch (error) {
      if (!this.#asrEnabled || this.#stopRequested) return
      this.#trace("asr.reconnect.error", {error: error instanceof Error ? error.message : String(error)})
      this.#session.markReconnecting(error instanceof Error ? error.message : String(error))
      this.#setStatus(this.#session.phase === "draft" ? "waitingWake" : this.#stream === null ? "processing" : "listening", `ASR reconnecting: ${error instanceof Error ? error.message : String(error)}`)
      this.#scheduleAsrReconnect()
    }
  }

  #clearAsrReconnectTimer(): void {
    if (this.#asrReconnectTimer === null) return
    window.clearTimeout(this.#asrReconnectTimer)
    this.#asrReconnectTimer = null
  }

  #setStatus(status: VoiceInputStatus, detail = ""): void {
    const previous = this.#status
    this.#status = status
    this.options.onStatus(status, detail)
    if (previous !== status || detail.length > 0) this.#trace("status", {from: previous, to: status, detail})
  }

  #stopAudioOnly(closeDelayMs = 0): void {
    this.#trace("audio.stop", {closeDelayMs})
    this.#clearAudioWatchdog()
    const audioContext = this.#audioContext
    const workletUrl = this.#workletUrl

    this.#captureNode?.disconnect()
    this.#sourceNode?.disconnect()
    this.#sinkNode?.disconnect()
    this.#sileroVad?.stop()
    for (const track of this.#stream?.getTracks() ?? []) track.stop()

    this.#stream = null
    this.#audioContext = null
    this.#sourceNode = null
    this.#captureNode = null
    this.#sinkNode = null
    this.#workletUrl = null
    this.#sileroVad = null
    this.#audioPreroll = []
    this.#firstChunkPrerollArmed = false
    this.#wakeAudioCutoff = null
    this.#audioStartedAt = 0

    if (audioContext !== null) {
      if (closeDelayMs > 0) window.setTimeout(() => void audioContext.close(), closeDelayMs)
      else void audioContext.close()
    }
    if (workletUrl !== null) URL.revokeObjectURL(workletUrl)
  }

  #cleanup(closeAudioDelayMs = 0): void {
    this.#trace("cleanup", {closeAudioDelayMs})
    this.#clearAsrReconnectTimer()
    this.#stopAudioOnly(closeAudioDelayMs)
    this.#disconnectAsrSocket()
    this.#disconnectCommandSocket()
    this.#resetCommitState()
    this.#session.reset()
    this.#clearRecognitionTimeoutTimer()
    this.#wakeMatched = false
    this.#asrEnabled = false
    this.#asrActivatedAt = 0
    this.#wakeRecognizerStartedAt = 0
    this.#wakeAudioCutoff = null
    this.#stopRequested = false
    this.options.onLevel(0)
  }

  #flushPendingCommittedChunk(): void {
    this.#clearPendingChunkFlushTimer()
    const pendingChunk = this.#pendingCommittedChunk
    const chunk = pendingChunk
    const commitId = this.#pendingCommittedChunkCommitId
    const processingChunkId = this.#processingChunkId
    this.#pendingCommittedChunk = null
    this.#pendingCommittedChunkCommitId = 0
    this.#lastPartialChunk = null
    if (chunk === null || !voiceChunkHasText(chunk)) return
    const deliveryChunk = prepareVoiceInputChunkForDelivery(chunk, this.#deliveryState, commitId)
    if (deliveryChunk !== null) {
      const deliveryText = voiceChunkDeliveryText(deliveryChunk)
      this.#deliveredVoiceChunkCount += 1
      this.#observeDictationText(deliveryText)
      this.#trace("chunk.deliver", {chars: deliveryText.length, text: debugTraceText(deliveryText)})
      this.options.onChunk(deliveryChunk)
    }
    if (processingChunkId !== null) this.#session.markChunkMerged(processingChunkId)
  }

  #trace(label: string, detail: Record<string, unknown> = {}): void {
    const session = this.#session.debugSnapshot()
    const payload = {
      ...detail,
      seq: ++this.#traceSeq,
      status: this.#status,
      phase: session.phase,
      autoSend: session.autoSendState,
      speaking: session.speaking,
      vad: session.vadSource,
      chunksTotal: session.chunks.total,
      chunksRecording: session.chunks.recording,
      chunksQueued: session.chunks.queued + session.chunks.retrying,
      chunksProcessing: session.chunks.processing,
      chunksMerged: session.chunks.merged,
      queuedBytes: session.queuedChunkBytes,
      currentChunkId: session.currentChunkId,
      processingChunkId: session.processingChunkId,
      retry: session.retryCount,
      asrEnabled: this.#asrEnabled,
      transport: this.#asrTransport,
      wakeState: this.#commandWs?.readyState ?? null,
      asrState: this.#asrWs?.readyState ?? null,
      streamActive: this.#stream?.active === true,
      audioState: this.#audioContext?.state ?? null,
      frames: this.#debugAudioFrameCount,
      inputRms: roundTraceNumber(this.#debugLastInputRms),
      inputPeak: roundTraceNumber(this.#debugLastInputPeak),
    }
    this.#traceLog.push({at: Date.now(), label, detail: JSON.stringify(payload).slice(0, 260)})
    while (this.#traceLog.length > 24) this.#traceLog.shift()
    postInterpreterClientEvent("voice", label, payload)
  }

  #schedulePendingChunkFlush(): void {
    this.#clearPendingChunkFlushTimer()
    this.#pendingChunkFlushTimer = window.setTimeout(() => {
      this.#pendingChunkFlushTimer = null
      this.#flushPendingCommittedChunk()
    }, FINAL_SETTLE_MS)
  }

  #clearPendingChunkFlushTimer(): void {
    if (this.#pendingChunkFlushTimer === null) return
    window.clearTimeout(this.#pendingChunkFlushTimer)
    this.#pendingChunkFlushTimer = null
  }

  #commandPhrases(): VoiceCommandPhraseGroups {
    return {
      activation: normalizeVoicePhrases(this.options.activationPhrases()),
      deactivation: normalizeVoicePhrases(this.options.deactivationPhrases()),
      stop: normalizeVoicePhrases(this.options.stopPhrases()),
    }
  }

  #asrControlPhrases(): VoiceCommandPhraseGroups {
    const phrases = this.#commandPhrases()
    if (deactivationModeAllowsPhrase(this.options.deactivationMode())) return phrases
    return {
      ...phrases,
      deactivation: [],
    }
  }
}

function voiceInputSignalTone(kind: VoiceInputSignalTone): {
  startHz: number
  endHz: number
  duration: number
  gain: number
  type: OscillatorType
} {
  if (kind === "activation") return {startHz: 640, endHz: 960, duration: 0.24, gain: 0.34, type: "triangle"}
  if (kind === "deactivation") return {startHz: 740, endHz: 430, duration: 0.22, gain: 0.32, type: "sine"}
  return {startHz: 360, endHz: 210, duration: 0.34, gain: 0.38, type: "square"}
}

function chunkFromAsrMessage(msg: AsrMessage, phraseGroups: VoiceCommandPhraseGroups): VoiceInputChunk {
  const text = cleanupAsrText(msg.text ?? "", phraseGroups.activation)
  const messages = Array.isArray(msg.messages)
    ? msg.messages.map((message) => cleanupAsrText(String(message), phraseGroups.activation)).filter(Boolean)
    : []
  const segments = Array.isArray(msg.segments)
    ? msg.segments
      .filter((segment): segment is Record<string, unknown> => typeof segment === "object" && segment !== null)
      .map((segment) => {
        const out: VoiceInputSegment = {}
        if (typeof segment.start === "number") out.start = segment.start
        if (typeof segment.end === "number") out.end = segment.end
        if (typeof segment.text === "string") out.text = segment.text
        return out
      })
    : []
  return {text, messages, segments}
}

function cleanupAsrText(text: string, activationPhrases: readonly string[]): string {
  return stripPhrasePrefix(cleanupVoiceText(text), activationPhrases, DEFAULT_VOICE_ACTIVATION_PHRASES)
}

function removeCommandTextFromString(text: string, phraseGroups: VoiceCommandPhraseGroups): VoiceControlText {
  if (isActivationDeactivationCommand(text, phraseGroups.activation)) return {text: "", command: "deactivation"}
  return stripControlCommandText(cleanupAsrText(text, phraseGroups.activation), phraseGroups)
}

export function prepareVoiceLivePreviewText(
  text: string,
  phraseGroups: VoiceCommandPhraseGroups,
  deliveredTranscript = "",
): string {
  const preview = removeCommandTextFromString(text, phraseGroups)
  if (preview.command !== null) return ""
  return trimStableVoiceTranscriptPrefix(preview.text, deliveredTranscript)
}

function removeCommandText(chunk: VoiceInputChunk, phraseGroups: VoiceCommandPhraseGroups): VoiceControlChunk {
  const textResult = stripControlCommandText(chunk.text, phraseGroups)
  let command = textResult.command
  const messages: string[] = []
  for (const message of chunk.messages) {
    const result = stripControlCommandText(message, phraseGroups)
    command = mergeControlCommand(command, result.command)
    if (result.text) messages.push(result.text)
  }
  return {
    chunk: {
      text: textResult.text,
      messages,
      segments: command ? [] : chunk.segments,
    },
    command,
  }
}

function voiceChunkHasText(chunk: VoiceInputChunk): boolean {
  return chunk.text.length > 0 || chunk.messages.length > 0 || chunk.segments.some((segment) => typeof segment.text === "string" && segment.text.trim().length > 0)
}

function voiceChunkPreviewText(chunk: VoiceInputChunk): string {
  if (chunk.messages.length > 0) return chunk.messages.join("\n\n")
  if (chunk.text) return chunk.text
  return chunk.segments.map((segment) => segment.text ?? "").filter(Boolean).join(" ")
}

function voiceChunkDeliveryText(chunk: VoiceInputChunk): string {
  if (chunk.messages.length > 0) return chunk.messages.join(" ")
  if (chunk.text) return chunk.text
  return chunk.segments.map((segment) => segment.text ?? "").filter(Boolean).join(" ")
}

function debugTraceText(text: string): string {
  const cleaned = cleanupVoiceText(text)
  if (!cleaned) return ""
  return cleaned.length <= 96 ? cleaned : `${cleaned.slice(0, 93)}...`
}

function roundTraceNumber(value: number): number {
  return Math.round(value * 100_000) / 100_000
}

function voiceChunkPreviewForDelivery(chunk: VoiceInputChunk, state: VoiceInputDeliveryState): string {
  return trimStableVoiceTranscriptPrefix(cleanupVoiceText(voiceChunkPreviewText(chunk)), state.transcript)
}

export function createVoiceInputDeliveryState(): VoiceInputDeliveryState {
  return {
    transcript: "",
    lastCommitId: 0,
    lastSignature: "",
  }
}

function resetVoiceInputDeliveryState(state: VoiceInputDeliveryState): void {
  state.transcript = ""
  state.lastCommitId = 0
  state.lastSignature = ""
}

export function prepareVoiceInputChunkForDelivery(
  chunk: VoiceInputChunk,
  state: VoiceInputDeliveryState,
  commitId = 0,
): VoiceInputChunk | null {
  const text = trimStableVoiceTranscriptPrefix(cleanupVoiceText(voiceChunkDeliveryText(chunk)), state.transcript)
  if (!text) return null

  const signature = normalizeVoiceTranscriptForCompare(text)
  if (!signature) return null
  if (commitId > 0 && state.lastCommitId === commitId && state.lastSignature === signature) return null

  state.transcript = appendDeliveredVoiceTranscript(state.transcript, text)
  state.lastCommitId = commitId
  state.lastSignature = signature
  return {text, messages: [], segments: []}
}

function stripControlCommandText(text: string, phraseGroups: VoiceCommandPhraseGroups): VoiceControlText {
  const controlPhrases = [
    ...normalizePhrasesForRecognition(phraseGroups.deactivation, DEFAULT_VOICE_DEACTIVATION_PHRASES),
    ...normalizePhrasesForRecognition(phraseGroups.stop, DEFAULT_VOICE_STOP_PHRASES),
  ]
  let command = detectControlCommand(text, phraseGroups)
  let out = text
  for (const phrase of controlPhrases.sort((a, b) => b.length - a.length)) {
    const next = out.replace(new RegExp(`(^|[\\s,.;:!?…-]+)${voicePhraseRegexSource(phrase)}(?=$|[\\s,.;:!?…-]+)`, "giu"), " ")
    if (next !== out && command === null) command = detectControlCommand(phrase, phraseGroups)
    out = next
  }
  if (command !== null && out === text) return {text: "", command}
  return {text: cleanupVoiceText(out), command}
}

function detectControlCommand(text: string, phraseGroups: VoiceCommandPhraseGroups): VoiceControlCommand | null {
  if (hasStopCommand(text, phraseGroups.stop)) return "stop"
  return isDeactivationPhrase(text, phraseGroups.deactivation) ? "deactivation" : null
}

function isActivationDeactivationCommand(text: string, activationPhrases: readonly string[]): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  const match = activationPhraseMatch(normalized, activationPhrases)
  if (match === null) return false
  const tail = normalized.slice(match.phrase.length).trim()
  return tail === "" || tail === "и все" || tail === "все" || tail === "стоп" || tail === "и стоп"
}

function mergeControlCommand(a: VoiceControlCommand | null, b: VoiceControlCommand | null): VoiceControlCommand | null {
  if (a === "stop" || b === "stop") return "stop"
  return a ?? b
}

function hasStopCommand(text: string, stopPhrases: readonly string[]): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  const phrases = normalizePhrasesForRecognition(stopPhrases, DEFAULT_VOICE_STOP_PHRASES)
  return phrases.some((phrase) => phraseMatchesText(normalized, phrase))
}

export function isDeactivationPhrase(text: string, deactivationPhrases: readonly string[]): boolean {
  const phrases = normalizePhrasesForRecognition(deactivationPhrases, DEFAULT_VOICE_DEACTIVATION_PHRASES)
  return hasCommandPhrase(text, phrases)
}

function isFinalRecognitionMessage(msg: AsrMessage): boolean {
  return msg.type === "result" || msg.type === "final"
}

function recognitionText(msg: AsrMessage): string {
  if (typeof msg.text === "string" && msg.text.trim()) return msg.text
  if (typeof msg.json === "object" && msg.json !== null) {
    const json = msg.json as {text?: unknown; partial?: unknown}
    if (typeof json.text === "string" && json.text.trim()) return json.text
    if (typeof json.partial === "string" && json.partial.trim()) return json.partial
  }
  return ""
}

export function isActivationPhrase(text: string, activationPhrases: readonly string[]): boolean {
  return activationPhraseMatch(text, activationPhrases) !== null
}

export function isActivationRecognitionMessage(msg: {type?: string; text?: string; json?: unknown}, activationPhrases: readonly string[]): boolean {
  if (!isFinalRecognitionMessage(msg)) return false
  const text = recognitionText(msg)
  if (!text) return false
  return isActivationPhrase(text, activationPhrases)
}

export function wakeAudioCutoffFromRecognitionMessage(
  msg: {type?: string; text?: string; json?: unknown; result?: unknown; words?: unknown},
  activationPhrases: readonly string[],
  wakeRecognizerStartedAt: number,
  receivedAt: number,
): VoiceWakeAudioCutoff | null {
  if (!isActivationRecognitionMessage(msg, activationPhrases)) return null
  const match = activationPhraseMatch(recognitionText(msg), activationPhrases)
  if (match === null) return null
  const timing = activationPhraseWordTiming(msg, match.phrase)
  if (timing !== null) {
    const absoluteAt = wakeRecognizerStartedAt > 0 ? wakeRecognizerStartedAt + timing.endMs + VOICE_WAKE_WORD_AUDIO_PADDING_MS : 0
    if (absoluteAt > 0 && absoluteAt >= receivedAt - VOICE_AUDIO_PREROLL_MS - VOICE_WAKE_RESULT_LATENCY_GUARD_MS && absoluteAt <= receivedAt + VOICE_WAKE_RESULT_LATENCY_GUARD_MS) {
      return {at: absoluteAt, source: "absoluteWords", phrase: match.phrase, wordEndMs: timing.endMs}
    }
    const tailMs = Math.max(0, timing.lastEndMs - timing.endMs)
    return {
      at: Math.max(receivedAt - VOICE_AUDIO_PREROLL_MS, receivedAt - tailMs - VOICE_WAKE_RESULT_LATENCY_GUARD_MS + VOICE_WAKE_WORD_AUDIO_PADDING_MS),
      source: "relativeWords",
      phrase: match.phrase,
      wordEndMs: timing.endMs,
    }
  }
  return {
    at: Math.max(receivedAt - VOICE_AUDIO_PREROLL_MS, receivedAt - VOICE_WAKE_FALLBACK_AUDIO_PREROLL_MS),
    source: "fallback",
    phrase: match.phrase,
    wordEndMs: null,
  }
}

function activationPhraseWordTiming(
  msg: {json?: unknown; result?: unknown; words?: unknown},
  phrase: string,
): {endMs: number; lastEndMs: number} | null {
  const words = recognitionWords(msg)
  if (words.length === 0) return null
  const lastEndMs = words.reduce((end, word) => Math.max(end, word.endMs), 0)
  for (const phraseTokens of wakePhraseTimingTokenSequences(phrase)) {
    for (let index = 0; index <= words.length - phraseTokens.length; index += 1) {
      let matches = true
      for (let offset = 0; offset < phraseTokens.length; offset += 1) {
        if (words[index + offset]?.value !== phraseTokens[offset]) {
          matches = false
          break
        }
      }
      if (matches) return {endMs: words[index + phraseTokens.length - 1]!.endMs, lastEndMs}
    }
  }
  return null
}

function recognitionWords(msg: {json?: unknown; result?: unknown; words?: unknown}): Array<{value: string; endMs: number}> {
  const candidates: unknown[] = []
  if (Array.isArray(msg.result)) candidates.push(msg.result)
  if (Array.isArray(msg.words)) candidates.push(msg.words)
  if (typeof msg.json === "object" && msg.json !== null) {
    const json = msg.json as {result?: unknown; words?: unknown}
    if (Array.isArray(json.result)) candidates.push(json.result)
    if (Array.isArray(json.words)) candidates.push(json.words)
  }
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    const words: Array<{value: string; endMs: number}> = []
    for (const item of candidate) {
      if (typeof item !== "object" || item === null) continue
      const object = item as Record<string, unknown>
      const rawWord = typeof object["word"] === "string" ? object["word"] : typeof object["text"] === "string" ? object["text"] : ""
      const value = normalizeWakeText(rawWord)
      const rawEnd = object["end"]
      const end = typeof rawEnd === "number" ? rawEnd : typeof rawEnd === "string" ? Number(rawEnd) : Number.NaN
      if (!value || !Number.isFinite(end) || end < 0) continue
      words.push({value, endMs: Math.round(end * 1000)})
    }
    if (words.length > 0) return words
  }
  return []
}

function wakePhraseTimingTokenSequences(phrase: string): string[][] {
  const tokens = normalizeWakeText(phrase).split(/\s+/).filter(Boolean)
  const out: string[][] = []
  const push = (next: string[]): void => {
    if (next.length === 0 || out.some((item) => item.join(" ") === next.join(" "))) return
    out.push(next)
  }
  push(tokens)
  if (tokens.length > 1) push([tokens.join("")])
  if (tokens.length === 1) {
    const split = knownWakeCompoundTokenSplit(tokens[0]!)
    if (split !== null) push(split)
  }
  return out
}

function knownWakeCompoundTokenSplit(token: string): string[] | null {
  if (token === "завхоз") return ["зав", "хоз"]
  if (token === "запхоз") return ["зап", "хоз"]
  if (token === "дипсик") return ["дип", "сик"]
  if (token === "deepseek") return ["deep", "seek"]
  return null
}

function activationPhraseMatch(text: string, activationPhrases: readonly string[]): {phrase: string} | null {
  const normalized = normalizeWakeText(text)
  if (!normalized) return null
  const phrases = normalizePhrasesForRecognition(activationPhrases, DEFAULT_VOICE_ACTIVATION_PHRASES)
  const exactPhrase = phrases.find((phrase) => activationPhraseInText(normalized, phrase))
  return exactPhrase === undefined ? null : {phrase: exactPhrase}
}

export function isFastActivationPartial(text: string, activationPhrases: readonly string[]): boolean {
  void text
  void activationPhrases
  return false
}

function hasCommandPhrase(text: string, phrases: readonly string[]): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  return phrases.some((phrase) => phraseMatchesText(normalized, normalizeWakeText(phrase)))
}

function normalizeWakeText(text: string): string {
  const normalized = text
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9\s]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim()
  return normalized.split(/\s+/).filter(Boolean).map(normalizeWakeToken).join(" ")
}

function floatToPcm16(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return buffer
}

function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / samples.length)
}

function peakLevel(samples: Float32Array): number {
  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  return peak
}

function clippingRatioLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let clipped = 0
  for (const sample of samples) {
    if (Math.abs(sample) >= 0.98) clipped += 1
  }
  return clipped / samples.length
}

export function analyzeWakeAudioGain(
  samples: Float32Array,
  rms = rmsLevel(samples),
  peak = peakLevel(samples),
  clippingRatio = clippingRatioLevel(samples),
): {rms: number; peak: number; gain: number; clippingRatio: number} {
  if (samples.length === 0) return {rms: 0, peak: 0, gain: 1, clippingRatio: 0}
  if (rms >= VOICE_WAKE_GAIN_START_RMS || peak >= VOICE_WAKE_HIGH_PEAK || clippingRatio > 0) {
    return {rms, peak, gain: 1, clippingRatio}
  }
  const rmsGain = VOICE_WAKE_TARGET_RMS / Math.max(0.001, rms)
  const peakHeadroomGain = peak > 0 ? VOICE_WAKE_HEADROOM_PEAK / peak : VOICE_WAKE_MAX_GAIN
  const gain = Math.max(1, Math.min(VOICE_WAKE_MAX_GAIN, rmsGain, peakHeadroomGain))
  return {rms, peak, gain, clippingRatio}
}

export function applyWakeAudioGain(samples: Float32Array, gain = analyzeWakeAudioGain(samples).gain): Float32Array {
  const amplified = new Float32Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    amplified[index] = Math.max(-1, Math.min(1, (samples[index] ?? 0) * gain))
  }
  return amplified
}

export function cleanupVoiceText(text: string): string {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .replace(/(^|[\n.!?…]\s*)субтитры[^\n.!?…]*(?:[.!?…]+)?/giu, "$1")
    .replace(/(^|[\n.!?…]\s*)редактор\s+субтитров[^\n.!?…]*(?:[.!?…]+)?/giu, "$1")
    .replace(/(^|[\n.!?…]\s*)продолжение\s+следует[^\n.!?…]*(?:[.!?…]+)?/giu, "$1")
    .replace(/(^|[\n.!?…]\s*)subtitles[^\n.!?…]*(?:[.!?…]+)?/giu, "$1")
    .replace(/[\u2500-\u257F]+/g, " ")
    .replace(/[-_=]{6,}/g, " ")
    .split(/\n\s*\n+/)
    .map((paragraph) => cleanupVoiceParagraph(paragraph))
    .filter(Boolean)
  return dedupeAdjacentVoiceParagraphs(paragraphs).join("\n\n")
}

function cleanupVoiceParagraph(paragraph: string): string {
  const cleaned = dedupeAdjacentRepeatedVoiceTokenRuns(
    paragraph
      .replace(/продолжение\s+следует(?:[.!?…]+)?/giu, " ")
      .replace(/([а-яё])([А-ЯЁ])/gu, "$1 $2"),
  )
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .trim()
  return isNoisePhrase(cleaned) ? "" : cleaned
}

function stripPhrasePrefix(text: string, phrases: readonly string[], fallback: readonly string[]): string {
  let out = text.trim()
  for (const phrase of normalizePhrasesForRecognition(phrases, fallback).sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`^${voicePhraseRegexSource(phrase)}[\\s,.;:!?…-]*`, "iu"), "").trim()
  }
  return out
}

function isNoisePhrase(text: string): boolean {
  const normalized = normalizeWakeText(text)
  return normalized === "продолжение следует"
    || normalized.includes("dimatorzok")
    || normalized.startsWith("субтитры")
    || normalized.startsWith("редактор субтитров")
    || normalized.startsWith("subtitles")
    || !/[\p{L}\p{N}]/u.test(text)
}

function dedupeAdjacentVoiceParagraphs(paragraphs: string[]): string[] {
  const out: string[] = []
  let previousKey = ""
  for (const paragraph of paragraphs) {
    const key = normalizeVoiceTranscriptForCompare(paragraph)
    if (!key || key === previousKey) continue
    out.push(paragraph)
    previousKey = key
  }
  return out
}

function dedupeAdjacentRepeatedVoiceTokenRuns(text: string): string {
  let out = dedupeAdjacentSingleVoiceTokenRepeats(text)
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const range = findAdjacentRepeatedVoiceTokenRun(out)
    if (range === null) break
    out = removeVoiceTextRange(out, range.start, range.end)
  }
  return out
}

function dedupeAdjacentSingleVoiceTokenRepeats(text: string): string {
  let out = text
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const range = findAdjacentSingleVoiceTokenRepeat(out)
    if (range === null) break
    out = removeVoiceTextRange(out, range.start, range.end)
  }
  return out
}

function findAdjacentSingleVoiceTokenRepeat(text: string): {start: number; end: number} | null {
  const tokens = voiceTranscriptTokens(text)
  for (let index = 0; index < tokens.length; index += 1) {
    const value = tokens[index]?.value
    if (!value) continue
    let repeatEnd = index + 1
    while (tokens[repeatEnd]?.value === value) repeatEnd += 1
    if (repeatEnd - index >= 3) {
      return {
        start: tokens[index + 1]!.start,
        end: tokens[repeatEnd]?.start ?? text.length,
      }
    }
  }
  return null
}

function findAdjacentRepeatedVoiceTokenRun(text: string): {start: number; end: number} | null {
  const tokens = voiceTranscriptTokens(text)
  for (let index = 0; index < tokens.length; index += 1) {
    const maxRunLength = Math.min(MAX_REPEATED_VOICE_TOKEN_RUN, Math.floor((tokens.length - index) / 2))
    for (let runLength = maxRunLength; runLength >= 1; runLength -= 1) {
      if (!voiceTokenRunMatches(tokens, index, runLength)) continue
      if (!voiceRepeatedTokenRunCanBeRemoved(text, tokens, index, runLength)) continue
      return {start: tokens[index]!.start, end: tokens[index + runLength]!.start}
    }
  }
  return null
}

function voiceRepeatedTokenRunCanBeRemoved(
  text: string,
  tokens: Array<{start: number; end: number}>,
  index: number,
  runLength: number,
): boolean {
  if (runLength >= 3) return true
  const nextTokenIndex = index + runLength * 2
  if (nextTokenIndex >= tokens.length) return false
  const firstRunEnd = tokens[index + runLength - 1]!.end
  const secondRunStart = tokens[index + runLength]!.start
  return /[.!?…]/u.test(text.slice(firstRunEnd, secondRunStart))
}

function voiceTokenRunMatches(tokens: Array<{value: string}>, index: number, runLength: number): boolean {
  for (let offset = 0; offset < runLength; offset += 1) {
    if (tokens[index + offset]?.value !== tokens[index + runLength + offset]?.value) return false
  }
  return true
}

function removeVoiceTextRange(text: string, start: number, end: number): string {
  const before = text.slice(0, start).replace(/\s+$/u, "")
  const after = text.slice(end).replace(/^\s+/u, "")
  if (!before) return after
  if (!after) return before
  return `${before} ${after}`.replace(/\s+([,.;:!?…])/gu, "$1")
}

export function trimStableVoiceTranscriptPrefix(text: string, stableTranscript: string): string {
  const cleaned = cleanupVoiceText(text)
  if (!cleaned) return ""

  const overlap = stableVoiceTranscriptOverlap(stableTranscript, cleaned)
  const textTokenCount = voiceTranscriptTokens(cleaned).length
  const minimumOverlap = Math.min(3, textTokenCount)
  if (overlap < minimumOverlap) return cleaned
  return cleanupVoiceText(removeFirstVoiceTranscriptTokens(cleaned, overlap))
}

function stableVoiceTranscriptOverlap(stableTranscript: string, text: string): number {
  const stableTokens = voiceTranscriptTokens(stableTranscript)
  const textTokens = voiceTranscriptTokens(text)
  const max = Math.min(80, stableTokens.length, textTokens.length)
  for (let count = max; count > 0; count -= 1) {
    let same = true
    for (let index = 0; index < count; index += 1) {
      if (stableTokens[stableTokens.length - count + index]?.value !== textTokens[index]?.value) {
        same = false
        break
      }
    }
    if (same) return count
  }
  return 0
}

function removeFirstVoiceTranscriptTokens(text: string, count: number): string {
  if (count <= 0) return text
  const tokens = voiceTranscriptTokens(text)
  if (count >= tokens.length) return ""
  return text.slice(tokens[count]!.start).replace(/^[\s,.;:!?…-]+/, "").trim()
}

function appendDeliveredVoiceTranscript(stableTranscript: string, text: string): string {
  const next = cleanupVoiceText([stableTranscript, text].filter(Boolean).join(" "))
  if (next.length <= MAX_DELIVERED_TRANSCRIPT_CHARS) return next
  return next.slice(next.length - MAX_DELIVERED_TRANSCRIPT_CHARS).replace(/^[\p{L}\p{N}]*\s*/u, "").trim()
}

function normalizeVoiceTranscriptForCompare(text: string): string {
  return voiceTranscriptTokens(text).map((token) => token.value).join(" ")
}

function voiceTranscriptTokens(text: string): Array<{value: string; start: number; end: number}> {
  const tokens: Array<{value: string; start: number; end: number}> = []
  const source = String(text)
  const pattern = /[\p{L}\p{N}]+/gu
  for (const match of source.matchAll(pattern)) {
    const raw = match[0] ?? ""
    const value = raw
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/g, "е")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
    if (!value) continue
    const start = match.index ?? 0
    tokens.push({value, start, end: start + raw.length})
  }
  return tokens
}

function compactDetail(text: string): string {
  const cleaned = cleanupVoiceText(text).replace(/\s+/g, " ")
  return cleaned.length <= 90 ? cleaned : `${cleaned.slice(0, 87)}...`
}

export function normalizeVoicePhrases(phrases: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const phrase of phrases) {
    const cleaned = phrase.replace(/\s+/g, " ").trim()
    const normalized = normalizeWakeText(cleaned)
    if (!cleaned || !normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(cleaned)
  }
  return out
}

export function normalizeVoiceWakePhrases(phrases: readonly string[]): string[] {
  return normalizeVoicePhrases(phrases)
}

export function createWakeRecognitionGrammar(phraseGroups: VoiceCommandPhraseGroups): string[] {
  return uniqueStrings([
    ...wakeGrammarPhraseVariants(phraseGroups.activation, DEFAULT_VOICE_ACTIVATION_PHRASES),
    ...wakeGrammarFullPhraseVariants(DEFAULT_VOICE_WAKE_CONFUSER_PHRASES),
    ...wakeGrammarPhraseVariants(phraseGroups.deactivation, DEFAULT_VOICE_DEACTIVATION_PHRASES),
    ...wakeGrammarPhraseVariants(phraseGroups.stop, DEFAULT_VOICE_STOP_PHRASES),
  ])
}

function wakeGrammarFullPhraseVariants(phrases: readonly string[]): string[] {
  return normalizePhrasesForGrammar(phrases, [])
}

function normalizePhrasesForRecognition(phrases: readonly string[], fallback: readonly string[]): string[] {
  const normalized = normalizeVoicePhrases(phrases).map(normalizeWakeText).filter(Boolean)
  const base = normalized.length > 0 ? normalized : [...fallback].map(normalizeWakeText).filter(Boolean)
  return uniqueStrings(base.flatMap(voicePhraseMatchVariants))
}

function wakeGrammarPhraseVariants(phrases: readonly string[], fallback: readonly string[]): string[] {
  const out: string[] = []
  for (const phrase of normalizePhrasesForGrammar(phrases, fallback)) {
    const tokens = phrase.split(/\s+/).filter(Boolean)
    for (let count = 1; count <= tokens.length; count += 1) {
      out.push(tokens.slice(0, count).join(" "))
    }
  }
  out.push("[unk]")
  return out
}

function normalizePhrasesForGrammar(phrases: readonly string[], fallback: readonly string[]): string[] {
  const normalized = normalizeVoicePhrases(phrases).map(normalizeWakeText).filter(Boolean)
  const base = normalized.length > 0 ? normalized : [...fallback].map(normalizeWakeText).filter(Boolean)
  return uniqueStrings(base.flatMap(voicePhraseGrammarVariants))
}

function voicePhraseMatchVariants(phrase: string): string[] {
  return voicePhraseTokenVariants(phrase, voiceMatchTokenVariants)
}

function voicePhraseGrammarVariants(phrase: string): string[] {
  return voicePhraseTokenVariants(phrase, voiceGrammarTokenVariants)
}

function voicePhraseTokenVariants(
  phrase: string,
  tokenVariantsFor: (token: string) => readonly string[],
): string[] {
  const variants = [""]
  for (const token of phrase.split(/\s+/).filter(Boolean)) {
    const tokenVariants = tokenVariantsFor(token)
    const next: string[] = []
    for (const prefix of variants) {
      for (const tokenVariant of tokenVariants) {
        next.push(prefix ? `${prefix} ${tokenVariant}` : tokenVariant)
      }
    }
    variants.splice(0, variants.length, ...next)
  }
  return variants
}

function voiceMatchTokenVariants(token: string): string[] {
  switch (token) {
    case "выключи":
    case "выключим":
    case "выключу":
    case "выключить":
      return ["выключи", "выключим", "выключу", "выключить"]
    case "отключи":
    case "отключим":
    case "отключу":
    case "отключить":
      return ["отключи", "отключим", "отключу", "отключить"]
    case "выруби":
    case "вырубим":
    case "вырублю":
    case "вырубить":
      return ["выруби", "вырубим", "вырублю", "вырубить"]
    case "подслушивай":
    case "подслушивать":
    case "слушай":
      return ["подслушивай", "подслушивать", "слушай"]
    case "останови":
    case "остановим":
    case "остановлю":
    case "остановить":
      return ["останови", "остановим", "остановлю", "остановить"]
    default:
      return [token]
  }
}

function voiceGrammarTokenVariants(token: string): string[] {
  const spoken = digitToSpokenWakeTokens(token)
  if (spoken.length > 0) return uniqueStrings([...spoken, ...wakeNumberConfuserTokens()])
  switch (token) {
    case "выключи":
    case "выключим":
    case "выключу":
    case "выключить":
      return ["выключи", "выключим", "выключу", "выключить"]
    case "отключи":
    case "отключим":
    case "отключу":
    case "отключить":
      return ["отключи", "отключим", "отключу", "отключить"]
    case "выруби":
    case "вырубим":
    case "вырублю":
    case "вырубить":
      return ["выруби", "вырублю", "вырубить"]
    case "подслушивай":
    case "подслушивать":
      return ["подслушивать", "слушай"]
    case "останови":
    case "остановим":
    case "остановлю":
    case "остановить":
      return ["останови", "остановим", "остановлю", "остановить"]
    default:
      return [token]
  }
}

function digitToSpokenWakeTokens(token: string): string[] {
  if (token === "0") return ["ноль"]
  if (token === "1") return ["один", "одна"]
  if (token === "2") return ["два", "две"]
  if (token === "3") return ["три"]
  if (token === "4") return ["четыре"]
  if (token === "5") return ["пять"]
  if (token === "6") return ["шесть"]
  if (token === "7") return ["семь"]
  if (token === "8") return ["восемь"]
  if (token === "9") return ["девять"]
  if (token === "10") return ["десять"]
  return []
}

function wakeNumberConfuserTokens(): string[] {
  const out: string[] = []
  for (const token of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
    out.push(...digitToSpokenWakeTokens(token))
  }
  return out
}

function normalizeWakeToken(token: string): string {
  if (token === "ноль") return "0"
  if (token === "один" || token === "одна") return "1"
  if (token === "два" || token === "две") return "2"
  if (token === "три") return "3"
  if (token === "четыре") return "4"
  if (token === "пять") return "5"
  if (token === "шесть") return "6"
  if (token === "семь") return "7"
  if (token === "восемь") return "8"
  if (token === "девять") return "9"
  if (token === "десять") return "10"
  return token
}

function uniqueStrings(values: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function deactivationModeAllowsPhrase(mode: VoiceDeactivationMode): boolean {
  return mode === "phrase" || mode === "phrase-timeout"
}

function deactivationModeAllowsTimeout(mode: VoiceDeactivationMode): boolean {
  return mode === "timeout" || mode === "phrase-timeout"
}

export function voiceDynamicRecognitionTimeoutMs(baseTimeoutMs: number, observedChars: number, chunkCount: number, observedAudioMs = 0): number {
  const base = clampRecognitionTimeoutMs(baseTimeoutMs)
  if (observedChars >= VOICE_DICTATION_VERY_LONG_CHARS || chunkCount >= 3 || observedAudioMs >= VOICE_DICTATION_VERY_LONG_AUDIO_MS) return Math.max(base, VOICE_DICTATION_VERY_LONG_TIMEOUT_MS)
  if (observedChars >= VOICE_DICTATION_LONG_CHARS || chunkCount >= 2 || observedAudioMs >= VOICE_DICTATION_LONG_AUDIO_MS) return Math.max(base, VOICE_DICTATION_LONG_TIMEOUT_MS)
  if (observedChars >= VOICE_DICTATION_MEDIUM_CHARS || observedAudioMs >= VOICE_DICTATION_MEDIUM_AUDIO_MS) return Math.max(base, VOICE_DICTATION_MEDIUM_TIMEOUT_MS)
  return base
}

function clampRecognitionTimeoutMs(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(120_000, Math.max(0, value))
}

function phraseInText(text: string, phrase: string): boolean {
  return text === phrase
    || text.startsWith(`${phrase} `)
    || text.endsWith(` ${phrase}`)
    || text.includes(` ${phrase} `)
}

function activationPhraseInText(text: string, phrase: string): boolean {
  return text === phrase || text.startsWith(`${phrase} `)
}

function phraseMatchesText(text: string, phrase: string): boolean {
  if (!phrase) return false
  return phraseInText(text, phrase)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function voicePhraseRegexSource(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((part) => escapeRegExp(part).replace(/е/giu, "[её]"))
    .join("[\\s,.;:!?…-]+")
}
