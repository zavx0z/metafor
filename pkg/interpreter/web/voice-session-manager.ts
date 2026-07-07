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

export type VoiceChunkState =
  | "recording"
  | "closed"
  | "queued"
  | "processing"
  | "recognized"
  | "merged"
  | "failed"
  | "retrying"

export type VoiceChunk = {
  id: string
  index: number
  state: VoiceChunkState
  startedAt: number
  endedAt: number | null
  pcm: ArrayBuffer[]
  pcmBytes: number
  text: string
  error: string | null
  attempts: number
}

export type VoiceAutoSendState =
  | "armed"
  | "cancelled"
  | "waitingChunks"
  | "readyToSend"
  | "sent"
  | "draft"

export type VoiceSessionTimings = {
  speechStartMs: number
  speechEndMs: number
  paragraphBreakMs: number
  finalSilenceMs: number
  maxChunkMs: number
}

export type VoiceSessionVadFrame = {
  rms: number
  peak: number
  now: number
  clippingRatio?: number | undefined
  speechProbability?: number | undefined
  speechProbabilityAt?: number | undefined
}

export type VoiceSessionVadResult = {
  speaking: boolean
  potentialVoice: boolean
  started: boolean
  stopped: boolean
  closedChunkIds: string[]
  paragraphBreak: boolean
  finalSilence: boolean
  source: VoiceSessionVadSource
  noiseFloor: number
  speechThreshold: number
}

export type VoiceSessionVadSource = "silero" | "energy"

export type VoiceWakeGainDebug = {
  rms: number
  peak: number
  gain: number
  clippingRatio: number
}

export type VoiceSessionDebugSnapshot = {
  phase: VoiceSessionPhase
  speaking: boolean
  hasVoiceActivity: boolean
  vadSource: VoiceSessionVadSource
  speechProbability: number | null
  noiseFloor: number
  speechThreshold: number
  outboundPcmBytes: number
  queuedPcmBytes: number
  queuedPcmChunks: number
  lastSpeechAt: number
  lastSpeechEndedAt: number
  lastPotentialVoiceAt: number
  lastVadAt: number
  autoSendState: VoiceAutoSendState
  currentChunkId: string | null
  processingChunkId: string | null
  chunks: Record<VoiceChunkState, number> & {total: number}
  chunkPcmBytes: number
  queuedChunkBytes: number
  retryCount: number
  lastError: string | null
  timings: VoiceSessionTimings
  wakeGain: VoiceWakeGainDebug | null
}

const MIN_NOISE_FLOOR = 0.0015
const MIN_SPEECH_THRESHOLD = 0.012
const NEAR_VOICE_PEAK_THRESHOLD = 0.018
const NOISE_FLOOR_ATTACK = 0.025
const NOISE_FLOOR_RELEASE = 0.002
const SPEECH_THRESHOLD_FACTOR = 3.4
const SILERO_SPEECH_PROBABILITY = 0.54
const SILERO_PROBABILITY_MAX_AGE_MS = 260
const MAX_CLIPPING_RATIO_FOR_ENERGY = 0.22

export const DEFAULT_VOICE_SESSION_TIMINGS: VoiceSessionTimings = {
  speechStartMs: 90,
  speechEndMs: 620,
  paragraphBreakMs: 1_250,
  finalSilenceMs: 1_850,
  maxChunkMs: 12_000,
}

export class VoiceSessionManager {
  #phase: VoiceSessionPhase = "idle"
  #speaking = false
  #vadSource: VoiceSessionVadSource = "energy"
  #speechProbability: number | null = null
  #noiseFloor = MIN_NOISE_FLOOR
  #speechThreshold = MIN_SPEECH_THRESHOLD
  #lastSpeechAt = 0
  #lastSpeechEndedAt = 0
  #lastPotentialVoiceAt = 0
  #lastVadAt = 0
  #recordingStartedAt = 0
  #hasVoiceActivity = false
  #speechCandidateStartedAt: number | null = null
  #silenceCandidateStartedAt: number | null = null
  #chunks: VoiceChunk[] = []
  #currentChunk: VoiceChunk | null = null
  #nextChunkIndex = 0
  #autoSendState: VoiceAutoSendState = "armed"
  #lastError: string | null = null
  #wakeGain: VoiceWakeGainDebug | null = null

  constructor(private readonly timings: VoiceSessionTimings = DEFAULT_VOICE_SESSION_TIMINGS) {}

  get phase(): VoiceSessionPhase {
    return this.#phase
  }

  get queuedPcmBytes(): number {
    return this.#queuedChunkBytes()
  }

  get outboundPcmBytes(): number {
    return 0
  }

  get currentChunkId(): string | null {
    return this.#currentChunk?.id ?? null
  }

  startReady(): void {
    this.#phase = "ready"
    this.#autoSendState = "armed"
  }

  startRecording(force = false, now = performance.now()): void {
    if (force || (this.#phase !== "reconnecting" && this.#phase !== "draft")) this.#phase = "recording"
    if (force || this.#autoSendState === "sent") this.#autoSendState = "armed"
    this.#recordingStartedAt = now
    this.#lastSpeechAt = now
    this.#lastSpeechEndedAt = now
    this.#lastPotentialVoiceAt = now
    this.#speechCandidateStartedAt = null
    this.#silenceCandidateStartedAt = null
    if (force) {
      this.#hasVoiceActivity = false
      this.#vadSource = "energy"
      this.#speechProbability = null
      this.#noiseFloor = MIN_NOISE_FLOOR
      this.#speechThreshold = MIN_SPEECH_THRESHOLD
    }
  }

  markProcessing(chunkId?: string): void {
    if (chunkId !== undefined) this.markChunkProcessing(chunkId)
    this.#phase = "processing"
    if (this.#autoSendState === "armed" || this.#autoSendState === "readyToSend") this.#autoSendState = "waitingChunks"
  }

  markReconnecting(error?: string): void {
    this.#phase = "reconnecting"
    if (error !== undefined && error.length > 0) this.#lastError = error
  }

  enterDraftMode(): void {
    this.#phase = "draft"
    this.#autoSendState = "draft"
  }

  cancelAutoSend(): void {
    this.#autoSendState = "cancelled"
  }

  markAutoSendWaitingChunks(): void {
    if (this.#autoSendState !== "draft" && this.#autoSendState !== "cancelled") this.#autoSendState = "waitingChunks"
  }

  markAutoSendReady(): void {
    if (this.#autoSendState !== "draft" && this.#autoSendState !== "cancelled") this.#autoSendState = "readyToSend"
  }

  markAutoSendSent(): void {
    this.#autoSendState = "sent"
  }

  markError(error?: string): void {
    this.#phase = "error"
    if (error !== undefined && error.length > 0) this.#lastError = error
  }

  reset(): void {
    this.#phase = "idle"
    this.#speaking = false
    this.#vadSource = "energy"
    this.#speechProbability = null
    this.#noiseFloor = MIN_NOISE_FLOOR
    this.#speechThreshold = MIN_SPEECH_THRESHOLD
    this.#lastSpeechAt = 0
    this.#lastSpeechEndedAt = 0
    this.#lastPotentialVoiceAt = 0
    this.#lastVadAt = 0
    this.#recordingStartedAt = 0
    this.#hasVoiceActivity = false
    this.#speechCandidateStartedAt = null
    this.#silenceCandidateStartedAt = null
    this.#currentChunk = null
    this.#chunks = []
    this.#nextChunkIndex = 0
    this.#autoSendState = "armed"
    this.#lastError = null
    this.#wakeGain = null
  }

  acceptVadFrame(frame: VoiceSessionVadFrame): VoiceSessionVadResult {
    const rms = finitePositive(frame.rms)
    const peak = finitePositive(frame.peak)
    const clippingRatio = finiteRatio(frame.clippingRatio ?? 0)
    const now = finitePositive(frame.now)
    const closedChunkIds: string[] = []
    this.#lastVadAt = now

    const likelySilence = !this.#speaking
      && peak < NEAR_VOICE_PEAK_THRESHOLD * 0.9
      && rms < Math.max(MIN_SPEECH_THRESHOLD, this.#noiseFloor * 2.4)
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

    const tooClippedForEnergy = clippingRatio >= MAX_CLIPPING_RATIO_FOR_ENERGY
    const energySpeech = rms >= this.#speechThreshold && peak >= NEAR_VOICE_PEAK_THRESHOLD && !tooClippedForEnergy
    const sileroSpeech = hasFreshSileroProbability
      && speechProbability >= SILERO_SPEECH_PROBABILITY
      && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.72
      && clippingRatio < 0.35
    const energyPotentialVoice = rms >= Math.max(this.#noiseFloor * 1.8, 0.0045)
      && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.36
    const energyContinuationSpeech = rms >= this.#speechThreshold * 0.72
      && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.72
    const potentialVoice = this.#hasVoiceActivity
      && !tooClippedForEnergy
      && (hasFreshSileroProbability
        ? (speechProbability >= 0.22 && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.34) || energyPotentialVoice
        : energyPotentialVoice)
    const continuationSpeech = this.#hasVoiceActivity
      && !tooClippedForEnergy
      && (hasFreshSileroProbability
        ? (speechProbability >= 0.34 && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.5) || energyContinuationSpeech
        : energyContinuationSpeech)
    if (potentialVoice) this.#lastPotentialVoiceAt = now
    const energyFallbackSpeech = energySpeech && (!hasFreshSileroProbability || this.#hasVoiceActivity)
    const rawSpeech = sileroSpeech || energyFallbackSpeech || continuationSpeech || (this.#speaking && potentialVoice)

    let started = false
    let stopped = false
    if (rawSpeech) {
      this.#silenceCandidateStartedAt = null
      if (!this.#speaking) {
        if (this.#speechCandidateStartedAt === null) this.#speechCandidateStartedAt = now
        if (now - this.#speechCandidateStartedAt >= this.timings.speechStartMs) {
          this.#speaking = true
          started = true
          this.#hasVoiceActivity = true
          this.#lastSpeechAt = now
          this.#createChunk(now)
        }
      } else {
        this.#lastSpeechAt = now
      }
    } else {
      this.#speechCandidateStartedAt = null
      if (this.#speaking) {
        if (this.#silenceCandidateStartedAt === null) this.#silenceCandidateStartedAt = now
        if (now - this.#silenceCandidateStartedAt >= this.timings.speechEndMs) {
          this.#speaking = false
          stopped = true
          this.#lastSpeechEndedAt = now
          const chunk = this.closeCurrentChunk(now)
          if (chunk !== null) closedChunkIds.push(chunk.id)
        }
      }
    }

    if (this.#currentChunk !== null && now - this.#currentChunk.startedAt >= this.timings.maxChunkMs) {
      const chunk = this.closeCurrentChunk(now, "max duration")
      if (chunk !== null) closedChunkIds.push(chunk.id)
      if (rawSpeech && this.#speaking) this.#createChunk(now)
    }

    if (this.#speaking) {
      if (this.#phase === "ready" || this.#phase === "recording" || this.#phase === "queued") this.#phase = "speaking"
    } else if (this.#phase === "speaking") {
      this.#phase = this.#hasQueuedChunks() ? "queued" : "recording"
    }

    const paragraphSilenceAnchor = this.#hasVoiceActivity ? Math.max(this.#lastSpeechAt, this.#lastSpeechEndedAt, this.#lastPotentialVoiceAt) : this.#recordingStartedAt || now
    const finalSilenceAnchor = this.#hasVoiceActivity ? Math.max(this.#lastSpeechAt, this.#lastSpeechEndedAt) : this.#recordingStartedAt || now
    const paragraphSilenceMs = this.#speaking ? 0 : now - paragraphSilenceAnchor
    const finalSilenceMs = this.#speaking ? 0 : now - finalSilenceAnchor
    return {
      speaking: this.#speaking,
      potentialVoice,
      started,
      stopped,
      closedChunkIds,
      paragraphBreak: this.#hasVoiceActivity && paragraphSilenceMs >= this.timings.paragraphBreakMs,
      finalSilence: this.#hasVoiceActivity && finalSilenceMs >= this.timings.finalSilenceMs,
      source: this.#vadSource,
      noiseFloor: this.#noiseFloor,
      speechThreshold: this.#speechThreshold,
    }
  }

  appendCurrentChunkPcm(pcm: ArrayBuffer): VoiceChunk | null {
    if (this.#currentChunk === null || this.#currentChunk.state !== "recording") return null
    this.#currentChunk.pcm.push(pcm)
    this.#currentChunk.pcmBytes += pcm.byteLength
    return this.#currentChunk
  }

  startBufferedChunk(pcm: ArrayBuffer[], startedAt: number, lastSpeechAt = startedAt): VoiceChunk | null {
    if (this.#currentChunk !== null || pcm.length === 0) return null
    const chunk = this.#createChunk(startedAt)
    for (const frame of pcm) {
      chunk.pcm.push(frame)
      chunk.pcmBytes += frame.byteLength
    }
    this.#speaking = true
    this.#hasVoiceActivity = true
    this.#lastSpeechAt = Math.max(startedAt, lastSpeechAt)
    this.#lastPotentialVoiceAt = this.#lastSpeechAt
    this.#speechCandidateStartedAt = null
    this.#silenceCandidateStartedAt = null
    return chunk
  }

  closeCurrentChunk(now = performance.now(), error?: string): VoiceChunk | null {
    const chunk = this.#currentChunk
    if (chunk === null) return null
    this.#currentChunk = null
    chunk.endedAt = now
    if (chunk.pcmBytes > 0) {
      chunk.state = "queued"
      if (this.#autoSendState === "armed" || this.#autoSendState === "readyToSend") this.#autoSendState = "waitingChunks"
      if (this.#phase !== "draft" && this.#phase !== "reconnecting") this.#phase = "queued"
    } else {
      chunk.state = "failed"
      chunk.error = error ?? "empty audio chunk"
      this.#lastError = chunk.error
      if (this.#phase !== "draft" && this.#phase !== "reconnecting") this.#phase = "recording"
    }
    return chunk
  }

  nextQueuedChunk(): VoiceChunk | null {
    return this.#chunks.find((chunk) => chunk.state === "queued" || chunk.state === "retrying") ?? null
  }

  markChunkProcessing(id: string): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null) return null
    chunk.state = "processing"
    chunk.attempts += 1
    chunk.error = null
    this.#phase = "processing"
    if (this.#autoSendState === "armed" || this.#autoSendState === "readyToSend") this.#autoSendState = "waitingChunks"
    return chunk
  }

  markChunkRecognized(id: string, text: string): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null) return null
    chunk.text = text
    chunk.state = "recognized"
    return chunk
  }

  markChunkMerged(id: string): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null) return null
    chunk.state = "merged"
    if (!this.#hasPendingChunks()) this.#autoSendState = this.#autoSendState === "draft" || this.#autoSendState === "cancelled" ? this.#autoSendState : "readyToSend"
    return chunk
  }

  markChunkFailed(id: string, error: string, retry = true): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null) return null
    if (chunk.state === "merged") return chunk
    chunk.error = error
    this.#lastError = error
    chunk.state = retry ? "retrying" : "failed"
    if (retry && this.#phase !== "draft") this.#phase = "reconnecting"
    return chunk
  }

  requeueProcessingChunks(error: string): void {
    for (const chunk of this.#chunks) {
      if (chunk.state === "processing") this.markChunkFailed(chunk.id, error, true)
    }
  }

  hasPendingChunks(): boolean {
    return this.#hasPendingChunks()
  }

  hasVoiceActivity(): boolean {
    return this.#hasVoiceActivity || this.#chunks.some((chunk) => chunk.state !== "failed")
  }

  setWakeGainDebug(debug: VoiceWakeGainDebug): void {
    this.#wakeGain = debug
  }

  debugSnapshot(): VoiceSessionDebugSnapshot {
    const counts = {
      total: this.#chunks.length,
      recording: 0,
      closed: 0,
      queued: 0,
      processing: 0,
      recognized: 0,
      merged: 0,
      failed: 0,
      retrying: 0,
    } satisfies Record<VoiceChunkState, number> & {total: number}
    let chunkPcmBytes = 0
    let retryCount = 0
    let processingChunkId: string | null = null
    for (const chunk of this.#chunks) {
      counts[chunk.state] += 1
      chunkPcmBytes += chunk.pcmBytes
      retryCount += Math.max(0, chunk.attempts - 1)
      if (chunk.state === "processing") processingChunkId = chunk.id
    }
    return {
      phase: this.#phase,
      speaking: this.#speaking,
      hasVoiceActivity: this.hasVoiceActivity(),
      vadSource: this.#vadSource,
      speechProbability: this.#speechProbability,
      noiseFloor: this.#noiseFloor,
      speechThreshold: this.#speechThreshold,
      outboundPcmBytes: 0,
      queuedPcmBytes: this.queuedPcmBytes,
      queuedPcmChunks: counts.queued + counts.retrying,
      lastSpeechAt: this.#lastSpeechAt,
      lastSpeechEndedAt: this.#lastSpeechEndedAt,
      lastPotentialVoiceAt: this.#lastPotentialVoiceAt,
      lastVadAt: this.#lastVadAt,
      autoSendState: this.#autoSendState,
      currentChunkId: this.#currentChunk?.id ?? null,
      processingChunkId,
      chunks: counts,
      chunkPcmBytes,
      queuedChunkBytes: this.#queuedChunkBytes(),
      retryCount,
      lastError: this.#lastError,
      timings: this.timings,
      wakeGain: this.#wakeGain,
    }
  }

  #createChunk(now: number): VoiceChunk {
    if (this.#currentChunk !== null) return this.#currentChunk
    const chunk: VoiceChunk = {
      id: `voice-chunk-${Date.now().toString(36)}-${this.#nextChunkIndex.toString(36)}`,
      index: this.#nextChunkIndex,
      state: "recording",
      startedAt: now,
      endedAt: null,
      pcm: [],
      pcmBytes: 0,
      text: "",
      error: null,
      attempts: 0,
    }
    this.#nextChunkIndex += 1
    this.#chunks.push(chunk)
    this.#currentChunk = chunk
    if (this.#phase !== "draft" && this.#phase !== "reconnecting") this.#phase = "speaking"
    return chunk
  }

  #chunkById(id: string): VoiceChunk | null {
    return this.#chunks.find((chunk) => chunk.id === id) ?? null
  }

  #hasQueuedChunks(): boolean {
    return this.#chunks.some((chunk) => chunk.state === "queued" || chunk.state === "retrying")
  }

  #hasPendingChunks(): boolean {
    return this.#currentChunk !== null || this.#chunks.some((chunk) => (
      chunk.state === "queued"
      || chunk.state === "retrying"
      || chunk.state === "processing"
      || chunk.state === "recognized"
    ))
  }

  #queuedChunkBytes(): number {
    let bytes = 0
    for (const chunk of this.#chunks) {
      if (chunk.state === "queued" || chunk.state === "retrying" || chunk.state === "processing") bytes += chunk.pcmBytes
    }
    return bytes
  }
}

function finitePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function finiteRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function finiteProbability(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}
