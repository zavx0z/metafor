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

type VoiceInputClientOptions = {
  url(): string
  wakeUrl(): string
  language: string
  context(): string
  onStatus(status: VoiceInputStatus, detail?: string): void
  onWake(text: string): void
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

const TARGET_SAMPLE_RATE = 16_000
const WAKE_WORD = "завхоз"
const WAKE_ALIASES = [
  "завхоз",
  "зав хоз",
  "завхос",
  "зав хос",
  "запхоз",
  "зап хоз",
  "совхоз",
  "за вход",
  "агент",
  "слышь долбоеб",
  "слыш долбоеб",
]
const STOP_COMMAND_RE = /(^|[\s,.;:!?…-]+)(?:выключи|выключу|отключи|отключу|выруби|вырублю|останови|остановлю)\s+(?:микрофон|голос(?:овой\s+ввод)?)(?=$|[\s,.;:!?…-]+)/giu
const VOICE_RMS_THRESHOLD = 0.012
const VOICE_WAKE_GAIN = 2.4
const SILENCE_COMMIT_MS = 1_550
const MIN_COMMIT_AUDIO_MS = 1_500
const MIN_COMMIT_INTERVAL_MS = 2_200
const COMMIT_TIMEOUT_MS = 15_000
const FINAL_SETTLE_MS = 450
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

  #commitPending = false
  #commitTimer: number | null = null
  #hasSpeechSinceCommit = false
  #lastSpeechAt = 0
  #lastCommitAt = 0
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

  stop(): void {
    if (!this.active) return
    this.#stopRequested = true
    this.#sendCommand({type: "stop"})
    this.#sendAsr({type: "stop"})
    this.#cleanup()
    this.#setStatus("idle")
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
    await this.#activateAsr("")
  }

  async #startCommandRecognizer(): Promise<void> {
    await this.#connectCommand(this.options.wakeUrl())
    this.#sendCommand({
      type: "start",
      sampleRate: this.#audioContext?.sampleRate ?? TARGET_SAMPLE_RATE,
      useGrammar: false,
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
      if (this.#stopRequested || this.#status === "idle") return
      this.#cleanup()
      this.#setStatus("error", `voice ASR websocket closed: ${ws.url}`)
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
      const wakePcm = floatToPcm16(applyAudioGain(samples, VOICE_WAKE_GAIN))
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

    if (this.#asrEnabled) {
      if (hasStopCommand(text)) {
        void this.sleepToWake().catch((error) => {
          this.#setStatus("error", error instanceof Error ? error.message : String(error))
          this.#cleanup()
        })
      }
      return
    }

    this.#setStatus("waitingWake", WAKE_WORD)
    if (msg.type === "partial" && !isFastWakePartial(text)) return
    if (!isWakePhrase(text)) return

    void this.#activateAsr(text).catch((error) => {
      this.#setStatus("error", error instanceof Error ? error.message : String(error))
      this.#cleanup()
    })
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
      this.options.onPartial(removeCommandTextFromString(text))
      return
    }

    if (msg.type === "result" || msg.type === "final") {
      const chunk = removeCommandText(chunkFromAsrMessage(msg))
      if (voiceChunkHasText(chunk)) {
        this.#pendingCommittedChunk = chunk
        this.options.onPartial(voiceChunkPreviewText(chunk))
        this.#schedulePendingChunkFlush()
      }
      return
    }

    if (msg.type === "committed") {
      const committedChunk = removeCommandText(chunkFromAsrMessage(msg))
      if (voiceChunkHasText(committedChunk)) this.#pendingCommittedChunk = committedChunk
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

  #setStatus(status: VoiceInputStatus, detail = ""): void {
    this.#status = status
    this.options.onStatus(status, detail)
  }

  #stopAudioOnly(): void {
    this.#captureNode?.disconnect()
    this.#sourceNode?.disconnect()
    this.#sinkNode?.disconnect()
    for (const track of this.#stream?.getTracks() ?? []) track.stop()
    if (this.#audioContext !== null) void this.#audioContext.close()
    if (this.#workletUrl !== null) URL.revokeObjectURL(this.#workletUrl)

    this.#stream = null
    this.#audioContext = null
    this.#sourceNode = null
    this.#captureNode = null
    this.#sinkNode = null
    this.#workletUrl = null
  }

  #cleanup(): void {
    this.#stopAudioOnly()
    this.#disconnectAsrSocket()
    this.#disconnectCommandSocket()
    this.#resetCommitState()
    this.#wakeMatched = false
    this.#asrEnabled = false
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
}

function chunkFromAsrMessage(msg: AsrMessage): VoiceInputChunk {
  const text = cleanupAsrText(msg.text ?? "")
  const messages = Array.isArray(msg.messages)
    ? msg.messages.map((message) => cleanupAsrText(String(message))).filter(Boolean)
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

function cleanupAsrText(text: string): string {
  return stripWakePrefix(cleanupVoiceText(text))
}

function removeCommandTextFromString(text: string): string {
  return stripStopCommand(cleanupAsrText(text)).text
}

function removeCommandText(chunk: VoiceInputChunk): VoiceInputChunk {
  const textResult = stripStopCommand(chunk.text)
  let command = textResult.stop
  const messages: string[] = []
  for (const message of chunk.messages) {
    const result = stripStopCommand(message)
    command ||= result.stop
    if (result.text) messages.push(result.text)
  }
  return {
    text: textResult.text,
    messages,
    segments: command ? [] : chunk.segments,
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

function stripStopCommand(text: string): {text: string; stop: boolean} {
  let stop = hasStopCommand(text)
  const withoutCommand = text.replace(STOP_COMMAND_RE, " ")
  if (withoutCommand !== text) stop = true
  if (stop && withoutCommand === text) return {text: "", stop}
  const stripped = cleanupVoiceText(withoutCommand)
  return {text: stripped, stop}
}

function hasStopCommand(text: string): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  if (
    normalized.includes("выключи микрофон") ||
    normalized.includes("выключу микрофон") ||
    normalized.includes("отключи микрофон") ||
    normalized.includes("отключу микрофон") ||
    normalized.includes("выруби микрофон") ||
    normalized.includes("вырублю микрофон") ||
    normalized.includes("останови голосовой ввод") ||
    normalized.includes("остановлю голосовой ввод")
  ) return true

  const words = normalized.split(/\s+/)
  return words.some((word) => ["выключи", "выключу", "отключи", "отключу", "выруби", "вырублю", "останови", "остановлю"].some((cmd) => levenshtein(word, cmd) <= 1))
    && words.some((word) => ["микрофон", "голос"].some((target) => levenshtein(word, target) <= 2))
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

function isWakePhrase(text: string): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  if (
    normalized.includes("завхоз") ||
    normalized.includes("завхос") ||
    normalized.includes("запхоз") ||
    normalized === "агент" ||
    normalized.startsWith("агент ") ||
    normalized.includes("слышь долбоеб") ||
    normalized.includes("слыш долбоеб")
  ) return true

  const words = normalized.split(/\s+/)
  const shortWakeUtterance = words.length <= 3
  if (!shortWakeUtterance) return false

  if (WAKE_ALIASES.some((alias) => normalized === alias)) return true
  return normalized
    .split(/\s+/)
    .some((word) => word.length >= 5 && word.length <= 8 && levenshtein(word, WAKE_WORD) <= 1)
}

function isFastWakePartial(text: string): boolean {
  const normalized = normalizeWakeText(text)
  if (!normalized) return false
  if (
    normalized === "завхоз" ||
    normalized === "завхос" ||
    normalized === "зав хоз" ||
    normalized === "зав хос" ||
    normalized === "запхоз" ||
    normalized === "зап хоз" ||
    normalized === "агент" ||
    normalized === "слышь долбоеб" ||
    normalized === "слыш долбоеб"
  ) return true
  return normalized.startsWith("завхоз ")
    || normalized.startsWith("завхос ")
    || normalized.startsWith("зав хоз ")
    || normalized.startsWith("зав хос ")
    || normalized.startsWith("запхоз ")
    || normalized.startsWith("зап хоз ")
    || normalized.startsWith("агент ")
    || normalized.startsWith("слышь долбоеб ")
    || normalized.startsWith("слыш долбоеб ")
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

function applyAudioGain(samples: Float32Array, gain: number): Float32Array {
  if (gain === 1) return samples
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

function stripWakePrefix(text: string): string {
  return text
    .replace(/^(?:завхоз|завхос|запхоз|зав\s+хоз|зав\s+хос|зап\s+хоз|совхоз|за\s+вход|агент|слышь\s+долбо[её]б|слыш\s+долбо[её]б)[\s,.;:!?…-]*/iu, "")
    .trim()
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
