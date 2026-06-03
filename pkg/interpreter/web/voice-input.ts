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
  onStatus(status: VoiceInputStatus, detail?: string): void
  onWake(text: string): void
  onCommandText(text: string): void
  onPartial(text: string): void
  onChunk(chunk: VoiceInputChunk): void
  onLevel(level: number): void
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

type VoiceCommandPhraseGroups = {
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
  "отключи микрофон",
  "выруби микрофон",
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
const FINAL_SETTLE_MS = 450
const STOP_COMMAND_ARM_DELAY_MS = 1_800
const MAX_QUEUED_PCM_BYTES = 8 * 1024 * 1024

export class VoiceInputClient {
  #commandWs: WebSocket | null = null
  #asrWs: WebSocket | null = null
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
  #queuedPcmAfterCommit: ArrayBuffer[] = []
  #pendingCommittedChunk: VoiceInputChunk | null = null
  #pendingChunkFlushTimer: number | null = null

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
    this.#setStatus("connecting", this.options.wakeUrl())

    try {
      await this.#startAudio()
      await this.#startCommandRecognizer()
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
      void context.resume().then(play).catch((error) => onResult?.(kind, "capture resume blocked", error))
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
    if (!this.active) await this.start()
    if (this.#asrEnabled) return
    try {
      await this.#activateAsr("")
    } catch (error) {
      this.#recoverAsrFailure(error)
      throw error
    }
  }

  refreshDeactivationSettings(): void {
    this.#scheduleRecognitionTimeoutCheck()
  }

  async #startCommandRecognizer(): Promise<void> {
    await this.#connectCommand(this.options.wakeUrl())
    this.#sendCommand({
      type: "start",
      sampleRate: this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE,
      useGrammar: true,
      grammar: createVoiceRecognitionGrammar(this.#commandPhrases()),
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
    this.#flushQueuedPcm()
    this.#setStatus("listening")
    this.#touchRecognitionActivity()
  }

  async #connectCommand(url: string): Promise<void> {
    if (this.#commandWs?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(url)
    ws.binaryType = "arraybuffer"
    this.#commandWs = ws

    ws.addEventListener("message", (event) => this.#handleCommandMessage(event))
    ws.addEventListener("close", () => {
      if (this.#commandWs !== ws) return
      this.#commandWs = null
      if (this.#stopRequested || this.#status === "idle") return
      this.#cleanup()
      this.#setStatus("error", `voice command websocket closed: ${ws.url}`)
    })

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), {once: true})
      ws.addEventListener("error", () => reject(new Error(`voice command websocket failed: ${url}`)), {once: true})
    })
  }

  async #connectAsr(url: string): Promise<void> {
    if (this.#asrWs?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(url)
    ws.binaryType = "arraybuffer"
    this.#asrWs = ws

    ws.addEventListener("message", (event) => this.#handleAsrMessage(event))
    ws.addEventListener("close", () => {
      if (this.#asrWs !== ws) return
      this.#asrWs = null
      this.#asrEnabled = false
      this.#asrActivatedAt = 0
      if (this.#stopRequested || this.#status === "idle") return
      this.#recoverAsrFailure(`voice ASR websocket closed: ${ws.url}`)
    })

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), {once: true})
      ws.addEventListener("error", () => reject(new Error(`voice ASR websocket failed: ${url}`)), {once: true})
    })
  }

  async #startAudio(): Promise<void> {
    try {
      this.#audioContext = new AudioContext({sampleRate: TARGET_SAMPLE_RATE})
    } catch {
      this.#audioContext = new AudioContext()
    }

    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: {ideal: 1},
        sampleRate: {ideal: TARGET_SAMPLE_RATE},
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
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
      const partial = removeCommandTextFromString(text, this.#asrControlPhrases(), (groupId) => this.#phraseFuzzyTolerance(groupId))
      if (partial.text) this.#touchRecognitionActivity()
      if (partial.text || partial.command === null) this.options.onPartial(partial.text)
      return
    }

    if (msg.type === "result" || msg.type === "final") {
      const phraseGroups = this.#asrControlPhrases()
      const result = removeCommandText(chunkFromAsrMessage(msg, phraseGroups), phraseGroups, (groupId) => this.#phraseFuzzyTolerance(groupId))
      const chunk = result.chunk
      if (voiceChunkHasText(chunk)) {
        this.#touchRecognitionActivity()
        this.#pendingCommittedChunk = chunk
        if (result.command === null) {
          this.options.onPartial(voiceChunkPreviewText(chunk))
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
      const phraseGroups = this.#asrControlPhrases()
      const result = removeCommandText(chunkFromAsrMessage(msg, phraseGroups), phraseGroups, (groupId) => this.#phraseFuzzyTolerance(groupId))
      const committedChunk = result.chunk
      if (voiceChunkHasText(committedChunk)) {
        this.#touchRecognitionActivity()
        this.#pendingCommittedChunk = committedChunk
      }
      this.#clearPendingChunkFlushTimer()
      this.#flushPendingCommittedChunk()
      this.#finishCommit()
      if (result.command !== null) {
        this.#executeControlCommand(result.command)
        return
      }
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
    if (this.#status !== "listening" || this.#stream === null) return
    if (rms >= VOICE_RMS_THRESHOLD) {
      this.#hasSpeechSinceCommit = true
      this.#lastSpeechAt = now
    }

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
    this.#sendAsr({type: "commit"})
    this.#setStatus("committing")
  }

  #sendPcm(pcm: ArrayBuffer, commandPcm: ArrayBuffer): void {
    if (this.#commandWs?.readyState === WebSocket.OPEN) this.#commandWs.send(commandPcm)
    if (!this.#asrEnabled) return

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
  }

  #clearCommitTimer(): void {
    if (this.#commitTimer === null) return
    window.clearTimeout(this.#commitTimer)
    this.#commitTimer = null
  }

  #resetCommitState(): void {
    this.#clearCommitTimer()
    this.#clearPendingChunkFlushTimer()
    this.#commitPending = false
    this.#pendingCommittedChunk = null
    this.#hasSpeechSinceCommit = false
    this.#lastSpeechAt = performance.now()
    this.#lastCommitAt = 0
    this.#pcmSinceCommitBytes = 0
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
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  #recoverAsrFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.#disconnectAsrSocket()
    this.#asrEnabled = false
    this.#asrActivatedAt = 0
    this.#wakeMatched = false
    this.#clearRecognitionTimeoutTimer()
    this.#resetCommitState()

    if (!this.#stopRequested && this.#stream !== null && this.#commandWs?.readyState === WebSocket.OPEN) {
      this.#setStatus("waitingWake", message)
      return
    }

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
    const chunk = this.#pendingCommittedChunk
    this.#pendingCommittedChunk = null
    if (chunk !== null && voiceChunkHasText(chunk)) this.options.onChunk(chunk)
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
  const deactivationPhrases = normalizePhrasesForRecognition(phraseGroups.deactivation, DEFAULT_VOICE_DEACTIVATION_PHRASES)
  return hasCommandPhrase(text, deactivationPhrases, toleranceFor("deactivation")) ? "deactivation" : null
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

function isActivationPhrase(text: string, activationPhrases: readonly string[], tolerance: number): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  const phrases = normalizePhrasesForRecognition(activationPhrases, DEFAULT_VOICE_ACTIVATION_PHRASES)
  if (phrases.some((phrase) => phraseInText(normalized, phrase))) return true

  const words = normalized.split(/\s+/)
  const shortWakeUtterance = words.length <= 3
  if (!shortWakeUtterance) return false
  if (tolerance > 0 && phrases.some((phrase) => fuzzyPhraseInText(normalized, phrase, tolerance))) return true

  if (tolerance <= 0) return false
  return words.some((word) => phrases.some((phrase) => fuzzyWakeWordMatch(word, phrase, tolerance)))
}

function isFastActivationPartial(text: string, activationPhrases: readonly string[]): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  const phrases = normalizePhrasesForRecognition(activationPhrases, DEFAULT_VOICE_ACTIVATION_PHRASES)
  return phrases.some((phrase) => phraseInText(normalized, phrase))
}

function hasCommandPhrase(text: string, phrases: readonly string[], tolerance: number): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  return phrases.some((phrase) => phraseMatchesText(normalized, normalizeWakeText(phrase), tolerance))
}

function normalizeWakeText(text: string): string {
  return text
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9\s]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim()
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

function cleanupVoiceText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((paragraph) => cleanupVoiceParagraph(paragraph))
    .filter(Boolean)
    .join("\n\n")
}

function cleanupVoiceParagraph(paragraph: string): string {
  const cleaned = paragraph
    .replace(/продолжение\s+следует/giu, " ")
    .replace(/\s+/g, " ")
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
    || normalized.startsWith("субтитры")
    || normalized.startsWith("редактор субтитров")
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

function createVoiceRecognitionGrammar(phraseGroups: VoiceCommandPhraseGroups): string[] {
  return uniqueStrings([
    ...normalizePhrasesForRecognition(phraseGroups.activation, DEFAULT_VOICE_ACTIVATION_PHRASES),
    ...normalizePhrasesForRecognition(phraseGroups.deactivation, DEFAULT_VOICE_DEACTIVATION_PHRASES),
    ...normalizePhrasesForRecognition(phraseGroups.stop, DEFAULT_VOICE_STOP_PHRASES),
  ])
}

function normalizePhrasesForRecognition(phrases: readonly string[], fallback: readonly string[]): string[] {
  const normalized = normalizeVoicePhrases(phrases).map(normalizeWakeText).filter(Boolean)
  return normalized.length > 0 ? normalized : [...fallback].map(normalizeWakeText).filter(Boolean)
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
