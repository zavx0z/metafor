export type VoiceSessionPhase =
  | "idle"
  | "ready"
  | "speaking"
  | "recording"
  | "queued"
  | "processing"
  | "reconnecting"
  | "draft"
  | "error"

export type VoiceSessionVadFrame = {
  rms: number
  peak: number
  now: number
  speechProbability?: number | undefined
  speechProbabilityAt?: number | undefined
}

export type VoiceSessionVadResult = {
  speaking: boolean
  started: boolean
  stopped: boolean
  source: VoiceSessionVadSource
  noiseFloor: number
  speechThreshold: number
}

export type VoiceSessionVadSource = "silero" | "energy"

export type VoiceSessionDebugSnapshot = {
  phase: VoiceSessionPhase
  speaking: boolean
  vadSource: VoiceSessionVadSource
  speechProbability: number | null
  noiseFloor: number
  speechThreshold: number
  outboundPcmBytes: number
  queuedPcmBytes: number
  queuedPcmChunks: number
  lastSpeechAt: number
  lastVadAt: number
}

const DEFAULT_MAX_QUEUED_PCM_BYTES = 8 * 1024 * 1024
const MIN_NOISE_FLOOR = 0.0015
const MIN_SPEECH_THRESHOLD = 0.012
const NEAR_VOICE_PEAK_THRESHOLD = 0.018
const NOISE_FLOOR_ATTACK = 0.025
const NOISE_FLOOR_RELEASE = 0.002
const SPEECH_THRESHOLD_FACTOR = 3.4
const SPEECH_HOLD_MS = 220
const SILERO_SPEECH_PROBABILITY = 0.54
const SILERO_HOLD_PROBABILITY = 0.35
const SILERO_PROBABILITY_MAX_AGE_MS = 260

export class VoiceSessionManager {
  #phase: VoiceSessionPhase = "idle"
  #speaking = false
  #vadSource: VoiceSessionVadSource = "energy"
  #speechProbability: number | null = null
  #noiseFloor = MIN_NOISE_FLOOR
  #speechThreshold = MIN_SPEECH_THRESHOLD
  #lastSpeechAt = 0
  #lastVadAt = 0
  #outboundPcmChunks: ArrayBuffer[] = []
  #outboundPcmBytes = 0
  #queuedPcmChunks: ArrayBuffer[] = []
  #queuedPcmBytes = 0

  constructor(private readonly maxQueuedPcmBytes = DEFAULT_MAX_QUEUED_PCM_BYTES) {}

  get phase(): VoiceSessionPhase {
    return this.#phase
  }

  get queuedPcmBytes(): number {
    return this.#queuedPcmBytes
  }

  get outboundPcmBytes(): number {
    return this.#outboundPcmBytes
  }

  startReady(): void {
    this.#phase = "ready"
  }

  startRecording(): void {
    this.#phase = "recording"
  }

  markProcessing(): void {
    this.#phase = "processing"
  }

  markReconnecting(): void {
    this.#phase = "reconnecting"
  }

  enterDraftMode(): void {
    this.#phase = "draft"
  }

  markError(): void {
    this.#phase = "error"
  }

  reset(clearQueuedPcm = true): void {
    this.#phase = "idle"
    this.#speaking = false
    this.#vadSource = "energy"
    this.#speechProbability = null
    this.#noiseFloor = MIN_NOISE_FLOOR
    this.#speechThreshold = MIN_SPEECH_THRESHOLD
    this.#lastSpeechAt = 0
    this.#lastVadAt = 0
    this.clearOutboundPcm()
    if (clearQueuedPcm) this.clearQueuedPcm()
  }

  acceptVadFrame(frame: VoiceSessionVadFrame): VoiceSessionVadResult {
    const rms = finitePositive(frame.rms)
    const peak = finitePositive(frame.peak)
    const now = finitePositive(frame.now)
    this.#lastVadAt = now

    const likelySilence = !this.#speaking && peak < Math.max(NEAR_VOICE_PEAK_THRESHOLD, this.#speechThreshold * 2.2)
    if (likelySilence) {
      const factor = rms > this.#noiseFloor ? NOISE_FLOOR_ATTACK : NOISE_FLOOR_RELEASE
      this.#noiseFloor = this.#noiseFloor + (rms - this.#noiseFloor) * factor
    } else if (!this.#speaking && rms < this.#noiseFloor) {
      this.#noiseFloor = this.#noiseFloor + (rms - this.#noiseFloor) * NOISE_FLOOR_RELEASE
    }

    this.#noiseFloor = Math.max(MIN_NOISE_FLOOR, this.#noiseFloor)
    this.#speechThreshold = Math.max(MIN_SPEECH_THRESHOLD, this.#noiseFloor * SPEECH_THRESHOLD_FACTOR)

    const speechProbability = finiteProbability(frame.speechProbability)
    const speechProbabilityAt = finitePositive(frame.speechProbabilityAt ?? 0)
    const hasFreshSileroProbability = speechProbability !== null && speechProbabilityAt > 0 && now - speechProbabilityAt <= SILERO_PROBABILITY_MAX_AGE_MS
    this.#speechProbability = hasFreshSileroProbability ? speechProbability : null
    this.#vadSource = hasFreshSileroProbability ? "silero" : "energy"

    const strongEnough = hasFreshSileroProbability
      ? speechProbability >= SILERO_SPEECH_PROBABILITY && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.72
      : rms >= this.#speechThreshold && peak >= NEAR_VOICE_PEAK_THRESHOLD
    const held = hasFreshSileroProbability
      ? this.#speaking && now - this.#lastSpeechAt <= SPEECH_HOLD_MS && speechProbability >= SILERO_HOLD_PROBABILITY
      : this.#speaking && now - this.#lastSpeechAt <= SPEECH_HOLD_MS && rms >= this.#speechThreshold * 0.62
    const speaking = strongEnough || held
    const started = speaking && !this.#speaking
    const stopped = !speaking && this.#speaking
    this.#speaking = speaking
    if (speaking) {
      this.#lastSpeechAt = now
      if (this.#phase === "ready" || this.#phase === "recording") this.#phase = "speaking"
    } else if (this.#phase === "speaking") {
      this.#phase = "recording"
    }

    return {
      speaking,
      started,
      stopped,
      source: this.#vadSource,
      noiseFloor: this.#noiseFloor,
      speechThreshold: this.#speechThreshold,
    }
  }

  enqueueOutboundPcm(pcm: ArrayBuffer): number {
    this.#outboundPcmChunks.push(pcm)
    this.#outboundPcmBytes += pcm.byteLength
    return this.#outboundPcmBytes
  }

  takeOutboundPcm(): ArrayBuffer | null {
    if (this.#outboundPcmBytes <= 0) return null
    if (this.#outboundPcmChunks.length === 1) {
      const [pcm] = this.#outboundPcmChunks
      this.clearOutboundPcm()
      return pcm ?? null
    }
    const payload = new Uint8Array(this.#outboundPcmBytes)
    let offset = 0
    for (const pcm of this.#outboundPcmChunks) {
      payload.set(new Uint8Array(pcm), offset)
      offset += pcm.byteLength
    }
    this.clearOutboundPcm()
    return payload.buffer
  }

  clearOutboundPcm(): void {
    this.#outboundPcmChunks = []
    this.#outboundPcmBytes = 0
  }

  queueAsrPcm(pcm: ArrayBuffer): void {
    this.#queuedPcmChunks.push(pcm)
    this.#queuedPcmBytes += pcm.byteLength
    this.trimQueuedPcm()
    if (this.#phase !== "reconnecting" && this.#phase !== "draft") this.#phase = "queued"
  }

  takeQueuedPcm(): ArrayBuffer[] {
    const queued = this.#queuedPcmChunks
    this.#queuedPcmChunks = []
    this.#queuedPcmBytes = 0
    return queued
  }

  requeuePcm(chunks: readonly ArrayBuffer[]): void {
    for (const chunk of chunks) this.queueAsrPcm(chunk)
  }

  clearQueuedPcm(): void {
    this.#queuedPcmChunks = []
    this.#queuedPcmBytes = 0
  }

  debugSnapshot(): VoiceSessionDebugSnapshot {
    return {
      phase: this.#phase,
      speaking: this.#speaking,
      vadSource: this.#vadSource,
      speechProbability: this.#speechProbability,
      noiseFloor: this.#noiseFloor,
      speechThreshold: this.#speechThreshold,
      outboundPcmBytes: this.#outboundPcmBytes,
      queuedPcmBytes: this.#queuedPcmBytes,
      queuedPcmChunks: this.#queuedPcmChunks.length,
      lastSpeechAt: this.#lastSpeechAt,
      lastVadAt: this.#lastVadAt,
    }
  }

  private trimQueuedPcm(): void {
    while (this.#queuedPcmBytes > this.maxQueuedPcmBytes && this.#queuedPcmChunks.length > 0) {
      const dropped = this.#queuedPcmChunks.shift()
      this.#queuedPcmBytes -= dropped?.byteLength ?? 0
    }
  }
}

function finitePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function finiteProbability(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}
