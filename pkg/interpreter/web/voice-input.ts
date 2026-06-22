export type VoiceInputStatus = "idle" | "connecting" | "waitingWake" | "listening" | "committing" | "error"

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

type VoiceInputClientOptions = {
  url(): string
  wakeUrl(): string
  activationPhrases(): readonly string[]
  deactivationPhrases(): readonly string[]
  stopPhrases(): readonly string[]
  phraseFuzzyTolerance(groupId: VoiceInputPhraseGroupId): number
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
  onCommandText(text: string): void
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
  error?: string
}

export type VoiceCommandPhraseGroups = {
  activation: readonly string[]
  deactivation: readonly string[]
  stop: readonly string[]
}
type VoicePhraseTolerance = (groupId: VoiceInputPhraseGroupId) => number
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
  "Завхоз",
  "Агент",
  "Слышь долбоёб",
] as const
export const DEFAULT_VOICE_WAKE_PHRASES = DEFAULT_VOICE_ACTIVATION_PHRASES
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
const VOICE_RMS_THRESHOLD = 0.012
const VOICE_WAKE_BASE_GAIN = 2.8
const VOICE_WAKE_MAX_GAIN = 6
const VOICE_WAKE_TARGET_RMS = 0.055
const VOICE_WAKE_MIN_RMS = 0.002
const MAX_SIGNAL_TONE_VOLUME = 3
const SILENCE_COMMIT_MS = 1_550
const MIN_COMMIT_AUDIO_MS = 1_500
const MIN_COMMIT_INTERVAL_MS = 2_200
const COMMIT_TIMEOUT_MS = 15_000
const DEACTIVATION_COMMIT_TIMEOUT_MS = 3_000
const FINAL_SETTLE_MS = 450
const STOP_COMMAND_ARM_DELAY_MS = 1_800
const PCM_FLUSH_BYTES = 4096
const PCM_FLUSH_MS = 120
const MAX_QUEUED_PCM_BYTES = 8 * 1024 * 1024
const MAX_DELIVERED_TRANSCRIPT_CHARS = 8_000
const MAX_REPEATED_VOICE_TOKEN_RUN = 120

export type VoiceInputDeliveryState = {
  transcript: string
  lastCommitId: number
  lastSignature: string
}

export class VoiceInputClient {
  #commandWs: VoiceInputSocket | null = null
  #asrWs: VoiceInputSocket | null = null
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

  #commitPending = false
  #commitTimer: number | null = null
  #hasSpeechSinceCommit = false
  #lastSpeechAt = 0
  #lastCommitAt = 0
  #lastRecognitionAt = 0
  #recognitionTimeoutTimer: number | null = null
  #pcmSinceCommitBytes = 0
  #outboundPcmChunks: ArrayBuffer[] = []
  #outboundPcmBytes = 0
  #outboundFlushTimer: number | null = null
  #queuedPcmAfterCommit: ArrayBuffer[] = []
  #pendingCommittedChunk: VoiceInputChunk | null = null
  #pendingCommittedChunkCommitId = 0
  #lastPartialChunk: VoiceInputChunk | null = null
  #pendingChunkFlushTimer: number | null = null
  #commitGeneration = 0
  #commitWaiters: Array<() => void> = []
  #deliveryState = createVoiceInputDeliveryState()

  constructor(private readonly options: VoiceInputClientOptions) {}

  get status(): VoiceInputStatus {
    return this.#status
  }

  get active(): boolean {
    return this.#status === "connecting" || this.#status === "waitingWake" || this.#status === "listening" || this.#status === "committing"
  }

  reset(): void {
    this.#cleanup()
    this.#setStatus("idle")
  }

  async start(): Promise<void> {
    if (this.active) return
    this.#stopRequested = false
    this.#wakeMatched = false
    this.#resetCommitState()
    const wakeEnabled = this.#wakeEnabled()
    this.#setStatus("connecting", wakeEnabled ? this.options.wakeUrl() : this.options.url())

    try {
      await this.#startAudio()
      if (wakeEnabled) await this.#startCommandRecognizer()
      else this.#setStatus("idle")
    } catch (error) {
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
      throw error
    }
  }

  stop(detail = ""): void {
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
    if (!this.active) return
    this.#stopRequested = false
    if (!this.#asrEnabled) {
      this.#setStatus("waitingWake", WAKE_WORD)
      return
    }
    await this.#commitCurrentChunkBeforeAsrShutdown()
    this.#sendAsr({type: "stop"})
    this.#disconnectAsrSocket()
    this.#asrEnabled = false
    this.#asrActivatedAt = 0
    this.#clearRecognitionTimeoutTimer()
    this.#resetCommitState()
    this.#wakeMatched = false
    if (this.#stream === null) {
      await this.start()
      return
    }
    if (this.#commandWs?.readyState !== WebSocket.OPEN) await this.#startCommandRecognizer()
    else this.#setStatus("waitingWake", WAKE_WORD)
  }

  async startDictation(): Promise<void> {
    if (!this.active) {
      await this.#startDictationFromIdle()
      return
    }
    if (this.#asrEnabled) return
    try {
      await this.#activateAsr("")
    } catch (error) {
      this.#recoverAsrFailure(error)
      throw error
    }
  }

  async #startDictationFromIdle(): Promise<void> {
    this.#stopRequested = false
    this.#wakeMatched = false
    this.#resetCommitState()
    this.#setStatus("connecting", this.options.url())
    try {
      await this.#startAudio()
      await this.#activateAsr("")
    } catch (error) {
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
      throw error
    }
  }

  refreshDeactivationSettings(): void {
    this.#scheduleRecognitionTimeoutCheck()
  }

  async #startCommandRecognizer(): Promise<void> {
    if (!this.#wakeEnabled()) {
      this.#setStatus("idle")
      return
    }
    await this.#connectCommand(this.options.wakeUrl())
    this.#sendCommand({
      type: "start",
      sampleRate: this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE,
      useGrammar: true,
      grammar: createWakeRecognitionGrammar(this.#commandPhrases()),
      words: true,
    })
    this.#setStatus("waitingWake", WAKE_WORD)
  }

  async #activateAsr(wakeText: string): Promise<void> {
    if (this.#wakeMatched || this.#stopRequested) return
    this.#wakeMatched = true
    this.options.onWake(wakeText)
    this.#resetCommitState()
    this.#asrEnabled = true
    this.#asrActivatedAt = performance.now()
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
    this.#flushOutboundPcm()
    this.#flushQueuedPcm()
    this.#setStatus("listening")
    this.#touchRecognitionActivity()
  }

  async #connectCommand(url: string): Promise<void> {
    if (this.#commandWs?.readyState === WebSocket.OPEN) return

    const socketUrl = voiceInputWebSocketUrl(url)
    const ws = this.options.createCommandSocket?.(socketUrl, this.#socketContext()) ?? new WebSocket(socketUrl)
    ws.binaryType = "arraybuffer"
    this.#commandWs = ws

    ws.addEventListener("message", (event) => this.#handleCommandMessage(event as MessageEvent<unknown>))
    ws.addEventListener("close", () => {
      if (this.#commandWs !== ws) return
      this.#commandWs = null
      if (this.#stopRequested || this.#status === "idle") return
      this.#cleanup()
      this.#setStatus("error", `voice command websocket closed: ${ws.url}`)
    })

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), {once: true})
      ws.addEventListener("error", () => reject(new Error(`voice command websocket failed: ${socketUrl}`)), {once: true})
    })
  }

  async #connectAsr(url: string): Promise<void> {
    if (this.#asrWs?.readyState === WebSocket.OPEN) return

    this.#setTransport("connecting")
    const socketUrl = voiceInputWebSocketUrl(url)
    const ws = this.options.createAsrSocket?.(socketUrl, this.#socketContext()) ?? new WebSocket(socketUrl)
    ws.binaryType = "arraybuffer"
    this.#asrWs = ws

    ws.addEventListener("message", (event) => this.#handleAsrMessage(event as MessageEvent<unknown>))
    ws.addEventListener("close", () => {
      if (this.#asrWs !== ws) return
      this.#asrWs = null
      this.#setTransport("idle")
      this.#asrEnabled = false
      this.#asrActivatedAt = 0
      if (this.#stopRequested || this.#status === "idle") return
      this.#recoverAsrFailure(`voice ASR websocket closed: ${ws.url}`)
    })

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => {
        if (this.#asrTransport === "connecting" && ws instanceof WebSocket) this.#setTransport("ws")
        resolve()
      }, {once: true})
      ws.addEventListener("error", () => reject(new Error(`voice ASR websocket failed: ${socketUrl}`)), {once: true})
    })
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

    this.#sourceNode = this.#audioContext.createMediaStreamSource(this.#stream)
    this.#captureNode = await this.#createCaptureNode(this.#audioContext)
    this.#sinkNode = this.#audioContext.createGain()
    this.#sinkNode.gain.value = 0

    this.#captureNode.port.onmessage = (event: MessageEvent<unknown>) => {
      const samples = event.data
      if (!(samples instanceof Float32Array)) return
      const pcm = floatToPcm16(samples)
      const wakePcm = floatToPcm16(applyWakeAudioGain(samples))
      this.#pcmSinceCommitBytes += pcm.byteLength
      this.#trackSpeechAndMaybeCommit(samples)
      this.#sendPcm(pcm, wakePcm)
    }

    this.#sourceNode.connect(this.#captureNode)
    this.#captureNode.connect(this.#sinkNode)
    this.#sinkNode.connect(this.#audioContext.destination)
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
      this.#setStatus("error", msg.error ?? "voice command error")
      return
    }
    if (msg.type === "started" || msg.type === "ready") return

    const text = recognitionText(msg)
    if (!text) return
    this.options.onCommandText(cleanupVoiceText(text))

    const phraseGroups = this.#commandPhrases()
    if (this.#asrEnabled) {
      const commandsArmed = performance.now() - this.#asrActivatedAt >= STOP_COMMAND_ARM_DELAY_MS
      if (commandsArmed && isFinalRecognitionMessage(msg)) {
        if (hasStopCommand(text, phraseGroups.stop, this.#phraseFuzzyTolerance("stop"))) {
          this.stop(VOICE_STOP_COMMAND_DETAIL)
          return
        }
        if (deactivationModeAllowsPhrase(this.options.deactivationMode()) && hasCommandPhrase(text, phraseGroups.deactivation, this.#phraseFuzzyTolerance("deactivation"))) {
          void this.sleepToWake().catch((error) => {
            this.#setStatus("error", error instanceof Error ? error.message : String(error))
            this.#cleanup()
          })
        }
      }
      return
    }

    this.#setStatus("waitingWake", WAKE_WORD)
    if (isFinalRecognitionMessage(msg) && hasStopCommand(text, phraseGroups.stop, this.#phraseFuzzyTolerance("stop"))) {
      this.stop(VOICE_STOP_COMMAND_DETAIL)
      return
    }
    const activationPhrases = phraseGroups.activation
    const activationTolerance = this.#phraseFuzzyTolerance("activation")
    if (msg.type === "partial" && !isFastActivationPartial(text, activationPhrases)) return
    if (!isActivationPhrase(text, activationPhrases, activationTolerance)) return

    void this.#activateAsr(text).catch((error) => this.#recoverAsrFailure(error))
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
      this.#setStatus("listening", compactDetail(text))
      if (cleanupVoiceText(text).length > 0) this.#touchRecognitionActivity()
      const partial = removeCommandTextFromString(text, this.#asrControlPhrases(), (groupId) => this.#phraseFuzzyTolerance(groupId))
      const partialText = trimStableVoiceTranscriptPrefix(partial.text, this.#deliveryState.transcript)
      if (partial.command === null && partialText) {
        this.#lastPartialChunk = {text: partial.text, messages: [], segments: []}
      }
      if (partialText || partial.command === null) this.options.onPartial(partialText)
      return
    }

    if (msg.type === "result" || msg.type === "final") {
      const phraseGroups = this.#asrControlPhrases()
      const result = removeCommandText(chunkFromAsrMessage(msg, phraseGroups), phraseGroups, (groupId) => this.#phraseFuzzyTolerance(groupId))
      const chunk = result.chunk
      if (voiceChunkHasText(chunk)) {
        this.#touchRecognitionActivity()
        this.#pendingCommittedChunk = chunk
        this.#pendingCommittedChunkCommitId = this.#commitPending ? this.#commitGeneration : 0
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
      this.#clearPendingChunkFlushTimer()
      this.#flushPendingCommittedChunk()
      this.#finishCommit()
      if (!this.#stopRequested) this.#setStatus("listening")
      return
    }

    if (msg.type === "stopped") {
      if (this.#asrWs !== null) return
      this.#asrEnabled = false
      return
    }

    if (msg.type === "error") {
      this.#setStatus("error", msg.error ?? "voice error")
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

  #trackSpeechAndMaybeCommit(samples: Float32Array): void {
    const now = performance.now()
    const rms = rmsLevel(samples)
    this.options.onLevel(rms)
    if ((this.#status !== "listening" && this.#status !== "committing") || this.#stream === null) return
    if (rms >= VOICE_RMS_THRESHOLD) {
      this.#hasSpeechSinceCommit = true
      this.#lastSpeechAt = now
      this.#lastRecognitionAt = now
    }
    if (this.#status !== "listening") return

    const sampleRate = this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE
    const minCommitBytes = Math.round(sampleRate * 2 * (MIN_COMMIT_AUDIO_MS / 1000))
    const shouldCommit =
      this.#hasSpeechSinceCommit &&
      !this.#commitPending &&
      this.#asrWs?.readyState === WebSocket.OPEN &&
      this.#pcmSinceCommitBytes >= minCommitBytes &&
      now - this.#lastSpeechAt >= SILENCE_COMMIT_MS &&
      now - this.#lastCommitAt >= MIN_COMMIT_INTERVAL_MS

    if (!shouldCommit) return

    this.#beginCommit()
    this.#hasSpeechSinceCommit = false
    this.#lastCommitAt = now
    this.#pcmSinceCommitBytes = 0
    this.#flushOutboundPcm()
    this.#sendAsr({type: "commit"})
    this.#setStatus("committing")
  }

  #sendPcm(pcm: ArrayBuffer, commandPcm: ArrayBuffer): void {
    if (this.#commandWs?.readyState === WebSocket.OPEN) this.#commandWs.send(commandPcm)
    if (!this.#asrEnabled) return
    this.#enqueueOutboundPcm(pcm)
  }

  #enqueueOutboundPcm(pcm: ArrayBuffer): void {
    this.#outboundPcmChunks.push(pcm)
    this.#outboundPcmBytes += pcm.byteLength
    if (this.#outboundPcmBytes >= PCM_FLUSH_BYTES) {
      this.#flushOutboundPcm()
      return
    }
    if (this.#outboundFlushTimer !== null) return
    this.#outboundFlushTimer = window.setTimeout(() => {
      this.#outboundFlushTimer = null
      this.#flushOutboundPcm()
    }, PCM_FLUSH_MS)
  }

  #flushOutboundPcm(): void {
    if (this.#outboundFlushTimer !== null) {
      window.clearTimeout(this.#outboundFlushTimer)
      this.#outboundFlushTimer = null
    }
    if (this.#outboundPcmBytes <= 0) return
    this.#sendAsrPcm(this.#takeOutboundPcm())
  }

  #takeOutboundPcm(): ArrayBuffer {
    if (this.#outboundPcmChunks.length === 1) {
      const [pcm] = this.#outboundPcmChunks
      this.#outboundPcmChunks = []
      this.#outboundPcmBytes = 0
      return pcm!
    }
    const payload = new Uint8Array(this.#outboundPcmBytes)
    let offset = 0
    for (const pcm of this.#outboundPcmChunks) {
      payload.set(new Uint8Array(pcm), offset)
      offset += pcm.byteLength
    }
    this.#outboundPcmChunks = []
    this.#outboundPcmBytes = 0
    return payload.buffer
  }

  #clearOutboundPcm(): void {
    if (this.#outboundFlushTimer !== null) {
      window.clearTimeout(this.#outboundFlushTimer)
      this.#outboundFlushTimer = null
    }
    this.#outboundPcmChunks = []
    this.#outboundPcmBytes = 0
  }

  #sendAsrPcm(pcm: ArrayBuffer): void {
    if (this.#asrWs?.readyState !== WebSocket.OPEN) {
      this.#queuedPcmAfterCommit.push(pcm)
      this.#trimQueuedPcm()
      return
    }
    if (this.#commitPending) {
      this.#queuedPcmAfterCommit.push(pcm)
      this.#trimQueuedPcm()
      return
    }
    this.#asrWs.send(pcm)
  }

  #flushQueuedPcm(): void {
    if (this.#asrWs?.readyState !== WebSocket.OPEN) {
      this.#queuedPcmAfterCommit = []
      return
    }
    for (const pcm of this.#queuedPcmAfterCommit) this.#asrWs.send(pcm)
    this.#queuedPcmAfterCommit = []
  }

  #trimQueuedPcm(): void {
    let total = this.#queuedPcmAfterCommit.reduce((size, pcm) => size + pcm.byteLength, 0)
    while (total > MAX_QUEUED_PCM_BYTES && this.#queuedPcmAfterCommit.length > 0) {
      const dropped = this.#queuedPcmAfterCommit.shift()
      total -= dropped?.byteLength ?? 0
    }
  }

  #beginCommit(): void {
    this.#commitPending = true
    this.#commitGeneration += 1
    this.#clearCommitTimer()
    this.#commitTimer = window.setTimeout(() => {
      if (!this.#commitPending) return
      this.#flushPendingCommittedChunk()
      this.#finishCommit()
      if (!this.#stopRequested && this.#asrWs?.readyState === WebSocket.OPEN) {
        this.#setStatus("listening", "commit timeout")
      }
    }, COMMIT_TIMEOUT_MS)
  }

  #finishCommit(): void {
    this.#commitPending = false
    this.#clearCommitTimer()
    this.#flushQueuedPcm()
    this.#flushOutboundPcm()
    this.#resolveCommitWaiters()
  }

  async #commitCurrentChunkBeforeAsrShutdown(): Promise<void> {
    if (this.#asrWs?.readyState !== WebSocket.OPEN) {
      this.#flushPendingCommittedChunk()
      return
    }
    if (!this.#commitPending) {
      this.#flushOutboundPcm()
      this.#beginCommit()
      this.#hasSpeechSinceCommit = false
      this.#lastCommitAt = performance.now()
      this.#pcmSinceCommitBytes = 0
      this.#sendAsr({type: "commit"})
      this.#setStatus("committing", "deactivation commit")
    }
    await this.#waitForCommitSettled(DEACTIVATION_COMMIT_TIMEOUT_MS)
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
    this.#pendingCommittedChunk = null
    this.#pendingCommittedChunkCommitId = 0
    this.#lastPartialChunk = null
    this.#hasSpeechSinceCommit = false
    this.#lastSpeechAt = performance.now()
    this.#lastCommitAt = 0
    this.#commitGeneration = 0
    resetVoiceInputDeliveryState(this.#deliveryState)
    this.#pcmSinceCommitBytes = 0
    this.#clearOutboundPcm()
    this.#queuedPcmAfterCommit = []
  }

  #touchRecognitionActivity(): void {
    this.#lastRecognitionAt = performance.now()
    this.#scheduleRecognitionTimeoutCheck()
  }

  #scheduleRecognitionTimeoutCheck(): void {
    this.#clearRecognitionTimeoutTimer()
    if (!this.#asrEnabled || this.#stopRequested || !deactivationModeAllowsTimeout(this.options.deactivationMode())) return
    const timeoutMs = clampRecognitionTimeoutMs(this.options.recognitionTimeoutMs())
    if (timeoutMs <= 0) return
    const now = performance.now()
    const lastRecognitionAt = this.#lastRecognitionAt > 0 ? this.#lastRecognitionAt : now
    const delay = Math.max(0, timeoutMs - (now - lastRecognitionAt))
    this.#recognitionTimeoutTimer = window.setTimeout(() => {
      this.#recognitionTimeoutTimer = null
      this.#handleRecognitionTimeout()
    }, delay)
  }

  #handleRecognitionTimeout(): void {
    if (!this.#asrEnabled || this.#stopRequested || !deactivationModeAllowsTimeout(this.options.deactivationMode())) return
    const timeoutMs = clampRecognitionTimeoutMs(this.options.recognitionTimeoutMs())
    if (timeoutMs <= 0) return
    if (this.#commitPending) {
      this.#clearRecognitionTimeoutTimer()
      this.#recognitionTimeoutTimer = window.setTimeout(() => {
        this.#recognitionTimeoutTimer = null
        this.#handleRecognitionTimeout()
      }, timeoutMs)
      return
    }
    const elapsed = performance.now() - this.#lastRecognitionAt
    if (elapsed < timeoutMs) {
      this.#scheduleRecognitionTimeoutCheck()
      return
    }
    void this.sleepToWake().catch((error) => {
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
    })
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
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  #disconnectAsrSocket(): void {
    if (this.#asrWs === null) return
    const ws = this.#asrWs
    this.#asrWs = null
    this.#setTransport("idle")
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
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
    this.#flushPendingCommittedChunk()
    this.#disconnectAsrSocket()
    this.#asrEnabled = false
    this.#asrActivatedAt = 0
    this.#wakeMatched = false
    this.#clearRecognitionTimeoutTimer()
    this.#cleanup()
    this.#setStatus("error", message)
  }

  #setStatus(status: VoiceInputStatus, detail = ""): void {
    this.#status = status
    this.options.onStatus(status, detail)
  }

  #stopAudioOnly(closeDelayMs = 0): void {
    const audioContext = this.#audioContext
    const workletUrl = this.#workletUrl

    this.#captureNode?.disconnect()
    this.#sourceNode?.disconnect()
    this.#sinkNode?.disconnect()
    for (const track of this.#stream?.getTracks() ?? []) track.stop()

    this.#stream = null
    this.#audioContext = null
    this.#sourceNode = null
    this.#captureNode = null
    this.#sinkNode = null
    this.#workletUrl = null

    if (audioContext !== null) {
      if (closeDelayMs > 0) window.setTimeout(() => void audioContext.close(), closeDelayMs)
      else void audioContext.close()
    }
    if (workletUrl !== null) URL.revokeObjectURL(workletUrl)
  }

  #cleanup(closeAudioDelayMs = 0): void {
    this.#stopAudioOnly(closeAudioDelayMs)
    this.#disconnectAsrSocket()
    this.#disconnectCommandSocket()
    this.#resetCommitState()
    this.#clearRecognitionTimeoutTimer()
    this.#wakeMatched = false
    this.#asrEnabled = false
    this.#asrActivatedAt = 0
    this.#stopRequested = false
    this.options.onLevel(0)
  }

  #flushPendingCommittedChunk(): void {
    this.#clearPendingChunkFlushTimer()
    const pendingChunk = this.#pendingCommittedChunk
    const fallbackChunk = this.#commitPending ? this.#lastPartialChunk : null
    const chunk = pendingChunk ?? fallbackChunk
    const commitId = pendingChunk !== null ? this.#pendingCommittedChunkCommitId : this.#commitGeneration
    this.#pendingCommittedChunk = null
    this.#pendingCommittedChunkCommitId = 0
    this.#lastPartialChunk = null
    if (chunk === null || !voiceChunkHasText(chunk)) return
    const deliveryChunk = prepareVoiceInputChunkForDelivery(chunk, this.#deliveryState, commitId)
    if (deliveryChunk !== null) this.options.onChunk(deliveryChunk)
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

  #phraseFuzzyTolerance(groupId: VoiceInputPhraseGroupId): number {
    const value = this.options.phraseFuzzyTolerance(groupId)
    return Number.isFinite(value) ? Math.min(0.5, Math.max(0, value)) : 0
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

function removeCommandTextFromString(text: string, phraseGroups: VoiceCommandPhraseGroups, toleranceFor: VoicePhraseTolerance): VoiceControlText {
  return stripControlCommandText(cleanupAsrText(text, phraseGroups.activation), phraseGroups, toleranceFor)
}

function removeCommandText(chunk: VoiceInputChunk, phraseGroups: VoiceCommandPhraseGroups, toleranceFor: VoicePhraseTolerance): VoiceControlChunk {
  const textResult = stripControlCommandText(chunk.text, phraseGroups, toleranceFor)
  let command = textResult.command
  const messages: string[] = []
  for (const message of chunk.messages) {
    const result = stripControlCommandText(message, phraseGroups, toleranceFor)
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

function stripControlCommandText(text: string, phraseGroups: VoiceCommandPhraseGroups, toleranceFor: VoicePhraseTolerance): VoiceControlText {
  const controlPhrases = [
    ...normalizePhrasesForRecognition(phraseGroups.deactivation, DEFAULT_VOICE_DEACTIVATION_PHRASES),
    ...normalizePhrasesForRecognition(phraseGroups.stop, DEFAULT_VOICE_STOP_PHRASES),
  ]
  let command = detectControlCommand(text, phraseGroups, toleranceFor)
  let out = text
  for (const phrase of controlPhrases.sort((a, b) => b.length - a.length)) {
    const next = out.replace(new RegExp(`(^|[\\s,.;:!?…-]+)${voicePhraseRegexSource(phrase)}(?=$|[\\s,.;:!?…-]+)`, "giu"), " ")
    if (next !== out && command === null) command = detectControlCommand(phrase, phraseGroups, toleranceFor)
    out = next
  }
  if (command !== null && out === text) return {text: "", command}
  return {text: cleanupVoiceText(out), command}
}

function detectControlCommand(text: string, phraseGroups: VoiceCommandPhraseGroups, toleranceFor: VoicePhraseTolerance): VoiceControlCommand | null {
  if (hasStopCommand(text, phraseGroups.stop, toleranceFor("stop"))) return "stop"
  return isDeactivationPhrase(text, phraseGroups.deactivation, toleranceFor("deactivation")) ? "deactivation" : null
}

function mergeControlCommand(a: VoiceControlCommand | null, b: VoiceControlCommand | null): VoiceControlCommand | null {
  if (a === "stop" || b === "stop") return "stop"
  return a ?? b
}

function hasStopCommand(text: string, stopPhrases: readonly string[], tolerance: number): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  const phrases = normalizePhrasesForRecognition(stopPhrases, DEFAULT_VOICE_STOP_PHRASES)
  return phrases.some((phrase) => phraseMatchesText(normalized, phrase, tolerance))
}

export function isDeactivationPhrase(text: string, deactivationPhrases: readonly string[], tolerance: number): boolean {
  const phrases = normalizePhrasesForRecognition(deactivationPhrases, DEFAULT_VOICE_DEACTIVATION_PHRASES)
  return hasCommandPhrase(text, phrases, tolerance)
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

export function isActivationPhrase(text: string, activationPhrases: readonly string[], tolerance: number): boolean {
  return activationPhraseMatch(text, activationPhrases, tolerance) !== null
}

function activationPhraseMatch(text: string, activationPhrases: readonly string[], tolerance: number): {phrase: string} | null {
  const normalized = normalizeWakeText(text)
  if (!normalized) return null
  const phrases = normalizePhrasesForRecognition(activationPhrases, DEFAULT_VOICE_ACTIVATION_PHRASES)
  const exactPhrase = phrases.find((phrase) => activationPhraseInText(normalized, phrase))
  if (exactPhrase !== undefined) return {phrase: exactPhrase}

  const words = normalized.split(/\s+/)
  const shortWakeUtterance = words.length <= 3
  if (!shortWakeUtterance) return null
  if (tolerance > 0) {
    const fuzzyPhrase = phrases.find((phrase) => fuzzyActivationPhraseAtStart(normalized, phrase, tolerance))
    if (fuzzyPhrase !== undefined) return {phrase: fuzzyPhrase}
  }

  if (tolerance <= 0) return null
  const [firstWord] = words
  if (!firstWord) return null
  const fuzzyWakeWord = phrases.find((phrase) => fuzzyWakeWordMatch(firstWord, phrase, tolerance))
  return fuzzyWakeWord === undefined ? null : {phrase: fuzzyWakeWord}
}

export function isFastActivationPartial(text: string, activationPhrases: readonly string[]): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  const phrases = normalizePhrasesForRecognition(activationPhrases, DEFAULT_VOICE_ACTIVATION_PHRASES)
  return phrases.some((phrase) => activationPhraseInText(normalized, phrase))
}

function hasCommandPhrase(text: string, phrases: readonly string[], tolerance: number): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  return phrases.some((phrase) => phraseMatchesText(normalized, normalizeWakeText(phrase), tolerance))
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

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const previous = Array.from({length: b.length + 1}, (_, index) => index)
  const current = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost,
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[b.length] ?? Math.max(a.length, b.length)
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

function applyWakeAudioGain(samples: Float32Array): Float32Array {
  const rms = rmsLevel(samples)
  const gain = rms >= VOICE_WAKE_MIN_RMS
    ? Math.min(VOICE_WAKE_MAX_GAIN, Math.max(VOICE_WAKE_BASE_GAIN, VOICE_WAKE_TARGET_RMS / rms))
    : VOICE_WAKE_BASE_GAIN
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
    ...wakeGrammarPhraseVariants(phraseGroups.deactivation, DEFAULT_VOICE_DEACTIVATION_PHRASES),
    ...wakeGrammarPhraseVariants(phraseGroups.stop, DEFAULT_VOICE_STOP_PHRASES),
  ])
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

function phraseMatchesText(text: string, phrase: string, tolerance: number): boolean {
  if (!phrase) return false
  if (phraseInText(text, phrase)) return true
  return fuzzyPhraseInText(text, phrase, tolerance)
}

function fuzzyPhraseInText(text: string, phrase: string, tolerance: number): boolean {
  if (tolerance <= 0 || !text || !phrase) return false
  const phraseWords = phrase.split(/\s+/).filter(Boolean)
  const textWords = text.split(/\s+/).filter(Boolean)
  if (phraseWords.length === 0 || textWords.length === 0) return false

  const minWindow = Math.max(1, phraseWords.length - 1)
  const maxWindow = Math.min(textWords.length, phraseWords.length + 1)
  const compactPhrase = phrase.replace(/\s+/g, "")
  for (let size = minWindow; size <= maxWindow; size += 1) {
    for (let start = 0; start + size <= textWords.length; start += 1) {
      const candidate = textWords.slice(start, start + size).join(" ")
      if (wakeNumberSignatureMismatch(candidate, phrase)) continue
      const compactCandidate = candidate.replace(/\s+/g, "")
      const score = Math.min(
        normalizedLevenshtein(candidate, phrase),
        normalizedLevenshtein(compactCandidate, compactPhrase),
      )
      if (score <= tolerance) return true
    }
  }
  return false
}

function fuzzyActivationPhraseAtStart(text: string, phrase: string, tolerance: number): boolean {
  if (tolerance <= 0 || !text || !phrase) return false
  const phraseWords = phrase.split(/\s+/).filter(Boolean)
  const textWords = text.split(/\s+/).filter(Boolean)
  if (phraseWords.length === 0 || textWords.length === 0) return false

  const minWindow = Math.max(1, phraseWords.length - 1)
  const maxWindow = Math.min(textWords.length, phraseWords.length + 1)
  const compactPhrase = phrase.replace(/\s+/g, "")
  for (let size = minWindow; size <= maxWindow; size += 1) {
    const candidate = textWords.slice(0, size).join(" ")
    if (wakeNumberSignatureMismatch(candidate, phrase)) continue
    const compactCandidate = candidate.replace(/\s+/g, "")
    const score = Math.min(
      normalizedLevenshtein(candidate, phrase),
      normalizedLevenshtein(compactCandidate, compactPhrase),
    )
    if (score <= tolerance) return true
  }
  return false
}

function wakeNumberSignatureMismatch(text: string, phrase: string): boolean {
  const textNumbers = wakeNumberSignature(text)
  const phraseNumbers = wakeNumberSignature(phrase)
  if (textNumbers.length === 0 && phraseNumbers.length === 0) return false
  if (textNumbers.length !== phraseNumbers.length) return true
  return textNumbers.some((number, index) => number !== phraseNumbers[index])
}

function wakeNumberSignature(text: string): string[] {
  return normalizeWakeText(text)
    .split(/\s+/)
    .filter((token) => /^\d+$/.test(token))
}

function normalizedLevenshtein(a: string, b: string): number {
  const length = Math.max(a.length, b.length)
  if (length === 0) return 0
  return levenshtein(a, b) / length
}

function fuzzyWakeWordMatch(word: string, phrase: string, tolerance: number): boolean {
  if (phrase.includes(" ")) return false
  if (word.length < 5 || word.length > Math.max(8, phrase.length + 2)) return false
  return normalizedLevenshtein(word, phrase) <= tolerance
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
