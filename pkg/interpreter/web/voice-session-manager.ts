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
  sessionId: string
  turnId: string
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
  captureEpoch: string
  sequenceStart: number | null
  sequenceEnd: number | null
  acknowledgedSequence: number | null
  paragraphIndex: number
  audioHash: string
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

export type VoiceWakeGainSnapshot = {
  rms: number
  peak: number
  gain: number
  clippingRatio: number
}

export type VoiceSessionSnapshot = {
  sessionId: string
  turnId: string
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
  wakeGain: VoiceWakeGainSnapshot | null
  captureEpoch: string
  nextSequence: number
  paragraphIndex: number
}

const MIN_NOISE_FLOOR = 0.0015
const MIN_SPEECH_THRESHOLD = 0.012
const NEAR_VOICE_PEAK_THRESHOLD = 0.018
const NOISE_FLOOR_ATTACK = 0.025
const NOISE_FLOOR_RELEASE = 0.002
const SPEECH_THRESHOLD_FACTOR = 3.4
const SILERO_START_PROBABILITY = 0.54
const SILERO_CONTINUE_PROBABILITY = 0.22
const SILERO_PROBABILITY_MAX_AGE_MS = 260
const MAX_CLIPPING_RATIO_FOR_ENERGY = 0.22
const HARD_MAX_CHUNK_FACTOR = 1.5

export const DEFAULT_VOICE_SESSION_TIMINGS: VoiceSessionTimings = {
  speechStartMs: 90,
  speechEndMs: 620,
  paragraphBreakMs: 1_250,
  finalSilenceMs: 1_850,
  maxChunkMs: 12_000,
}

export class VoiceSessionManager {
  #sessionId = voiceId("voice-session")
  #turnId = voiceId("voice-turn")
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
  #wakeGain: VoiceWakeGainSnapshot | null = null
  #captureEpoch = voiceId("capture")
  #nextSequence = 0
  #paragraphIndex = 0
  #paragraphBreakEmitted = false
  #finalSilenceEmitted = false

  constructor(readonly timings: VoiceSessionTimings = {...DEFAULT_VOICE_SESSION_TIMINGS}) {}

  get sessionId(): string {
    return this.#sessionId
  }

  get turnId(): string {
    return this.#turnId
  }

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

  get autoSendState(): VoiceAutoSendState {
    return this.#autoSendState
  }

  get speaking(): boolean {
    return this.#speaking
  }

  get lastSpeechEndedAt(): number {
    return this.#lastSpeechEndedAt
  }

  get totalChunkCount(): number {
    return this.#chunks.filter((chunk) => chunk.turnId === this.#turnId && chunk.state !== "failed").length
  }

  get chunkPcmBytes(): number {
    let bytes = 0
    for (const chunk of this.#chunks) {
      if (chunk.turnId === this.#turnId && chunk.state !== "failed") bytes += chunk.pcmBytes
    }
    return bytes
  }

  hasRecordingChunk(): boolean {
    return this.#currentChunk !== null || this.#chunks.some((chunk) => chunk.state === "recording")
  }

  startReady(): void {
    this.#phase = "ready"
    if (this.#autoSendState === "sent") this.#autoSendState = "armed"
  }

  startRecording(force = false, now = performance.now()): void {
    if (force) {
      if (!this.#hasPendingChunks()) this.#beginNewSession()
      this.#turnId = voiceId("voice-turn")
      this.#paragraphIndex = 0
      this.#paragraphBreakEmitted = false
      this.#finalSilenceEmitted = false
    }
    if (force || (this.#phase !== "reconnecting" && this.#phase !== "draft")) this.#phase = "recording"
    if (force || this.#autoSendState === "sent" || this.#autoSendState === "cancelled" || this.#autoSendState === "draft") {
      this.#autoSendState = "armed"
    }
    this.#recordingStartedAt = now
    this.#lastSpeechAt = now
    this.#lastSpeechEndedAt = now
    this.#lastPotentialVoiceAt = now
    this.#speechCandidateStartedAt = null
    this.#silenceCandidateStartedAt = null
    if (force) {
      this.#hasVoiceActivity = false
      this.#speaking = false
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
    if (this.#phase !== "draft") this.#phase = "reconnecting"
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

  reset(options: {discardPending?: boolean} = {}): void {
    const discardPending = options.discardPending === true
    const kept = discardPending ? [] : this.#chunks.filter((chunk) => chunk.state !== "merged")
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
    this.#hasVoiceActivity = kept.length > 0
    this.#speechCandidateStartedAt = null
    this.#silenceCandidateStartedAt = null
    this.#currentChunk = null
    this.#chunks = kept
    this.#nextChunkIndex = kept.reduce((next, chunk) => Math.max(next, chunk.index + 1), 0)
    this.#autoSendState = kept.length > 0 ? "waitingChunks" : "armed"
    this.#lastError = null
    this.#wakeGain = null
    this.#paragraphIndex = kept.reduce((index, chunk) => Math.max(index, chunk.paragraphIndex), 0)
    this.#paragraphBreakEmitted = false
    this.#finalSilenceEmitted = false
    if (kept.length === 0) this.#beginNewSession()
  }

  setCaptureEpoch(captureEpoch: string, nextSequence = 0): void {
    const value = captureEpoch.trim()
    this.#captureEpoch = value || voiceId("capture")
    this.#nextSequence = Math.max(0, Math.trunc(nextSequence))
  }

  nextCaptureSequence(): number {
    const sequence = this.#nextSequence
    this.#nextSequence += 1
    return sequence
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
    const hasFreshSileroProbability = speechProbability !== null
      && speechProbabilityAt > 0
      && now - speechProbabilityAt <= SILERO_PROBABILITY_MAX_AGE_MS
    this.#speechProbability = hasFreshSileroProbability ? speechProbability : null
    this.#vadSource = hasFreshSileroProbability ? "silero" : "energy"

    const tooClippedForEnergy = clippingRatio >= MAX_CLIPPING_RATIO_FOR_ENERGY
    const energySpeech = rms >= this.#speechThreshold
      && peak >= NEAR_VOICE_PEAK_THRESHOLD
      && !tooClippedForEnergy
    const sileroSpeech = hasFreshSileroProbability
      && speechProbability >= SILERO_START_PROBABILITY
      && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.72
      && clippingRatio < 0.35
    const energyPotentialVoice = rms >= Math.max(this.#noiseFloor * 1.8, 0.0045)
      && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.36
    const energyContinuationSpeech = rms >= this.#speechThreshold * 0.72
      && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.72
    const potentialVoice = this.#hasVoiceActivity
      && !tooClippedForEnergy
      && (hasFreshSileroProbability
        ? (speechProbability >= SILERO_CONTINUE_PROBABILITY && peak >= NEAR_VOICE_PEAK_THRESHOLD * 0.34) || energyPotentialVoice
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
      this.#paragraphBreakEmitted = false
      this.#finalSilenceEmitted = false
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

    if (this.#currentChunk !== null) {
      const duration = now - this.#currentChunk.startedAt
      const hardMax = this.timings.maxChunkMs * HARD_MAX_CHUNK_FACTOR
      const canSplitAtBoundary = !rawSpeech || this.#silenceCandidateStartedAt !== null
      if ((duration >= this.timings.maxChunkMs && canSplitAtBoundary) || duration >= hardMax) {
        const chunk = this.closeCurrentChunk(now, "max duration")
        if (chunk !== null) closedChunkIds.push(chunk.id)
        if (rawSpeech && this.#speaking) this.#createChunk(now)
      }
    }

    if (this.#speaking) {
      if (this.#phase === "ready" || this.#phase === "recording" || this.#phase === "queued" || this.#phase === "processing") {
        this.#phase = "speaking"
      }
    } else if (this.#phase === "speaking") {
      this.#phase = this.#hasQueuedChunks() ? "queued" : "recording"
    }

    const paragraphSilenceAnchor = this.#hasVoiceActivity
      ? Math.max(this.#lastSpeechAt, this.#lastSpeechEndedAt, this.#lastPotentialVoiceAt)
      : this.#recordingStartedAt || now
    const finalSilenceAnchor = this.#hasVoiceActivity
      ? Math.max(this.#lastSpeechAt, this.#lastSpeechEndedAt)
      : this.#recordingStartedAt || now
    const paragraphSilenceMs = this.#speaking ? 0 : now - paragraphSilenceAnchor
    const finalSilenceMs = this.#speaking ? 0 : now - finalSilenceAnchor
    const paragraphBreak = this.#hasVoiceActivity
      && paragraphSilenceMs >= this.timings.paragraphBreakMs
    const finalSilence = this.#hasVoiceActivity
      && finalSilenceMs >= this.timings.finalSilenceMs
    if (paragraphBreak && !this.#paragraphBreakEmitted) {
      this.#paragraphBreakEmitted = true
      this.#paragraphIndex += 1
    }
    if (finalSilence) this.#finalSilenceEmitted = true

    return {
      speaking: this.#speaking,
      potentialVoice,
      started,
      stopped,
      closedChunkIds,
      paragraphBreak,
      finalSilence,
      source: this.#vadSource,
      noiseFloor: this.#noiseFloor,
      speechThreshold: this.#speechThreshold,
    }
  }

  appendCurrentChunkPcm(pcm: ArrayBuffer, sequence?: number, captureEpoch?: string): VoiceChunk | null {
    if (this.#currentChunk === null || this.#currentChunk.state !== "recording") return null
    const copy = pcm.slice(0)
    this.#currentChunk.pcm.push(copy)
    this.#currentChunk.pcmBytes += copy.byteLength
    if (captureEpoch !== undefined && captureEpoch.trim().length > 0) this.#currentChunk.captureEpoch = captureEpoch
    const frameSequence = sequence ?? this.nextCaptureSequence()
    if (this.#currentChunk.sequenceStart === null) this.#currentChunk.sequenceStart = frameSequence
    this.#currentChunk.sequenceEnd = frameSequence
    return this.#currentChunk
  }

  prependCurrentChunkPcm(
    frames: readonly {pcm: ArrayBuffer; sequence: number}[],
    startedAt: number,
    captureEpoch?: string,
  ): VoiceChunk | null {
    const chunk = this.#currentChunk
    if (chunk === null || chunk.state !== "recording" || frames.length === 0) return chunk
    const copies = frames.map((frame) => ({pcm: frame.pcm.slice(0), sequence: frame.sequence}))
    chunk.pcm = [...copies.map((frame) => frame.pcm), ...chunk.pcm]
    chunk.pcmBytes += copies.reduce((sum, frame) => sum + frame.pcm.byteLength, 0)
    chunk.startedAt = Math.min(chunk.startedAt, startedAt)
    if (captureEpoch !== undefined && captureEpoch.trim().length > 0) chunk.captureEpoch = captureEpoch
    const firstSequence = copies[0]?.sequence
    const lastSequence = copies.at(-1)?.sequence
    if (firstSequence !== undefined) chunk.sequenceStart = chunk.sequenceStart === null ? firstSequence : Math.min(chunk.sequenceStart, firstSequence)
    if (lastSequence !== undefined) chunk.sequenceEnd = chunk.sequenceEnd === null ? lastSequence : Math.max(chunk.sequenceEnd, lastSequence)
    return chunk
  }

  startBufferedChunk(
    pcm: ArrayBuffer[],
    startedAt: number,
    lastSpeechAt = startedAt,
    sequences?: readonly number[],
    captureEpoch?: string,
  ): VoiceChunk | null {
    if (this.#currentChunk !== null || pcm.length === 0) return null
    const chunk = this.#createChunk(startedAt)
    pcm.forEach((frame, index) => this.appendCurrentChunkPcm(frame, sequences?.[index], captureEpoch))
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

  getChunk(id: string): VoiceChunk | null {
    return this.#chunkById(id)
  }

  allChunks(): readonly VoiceChunk[] {
    return this.#chunks
  }

  pendingChunks(): VoiceChunk[] {
    return this.#chunks.filter((chunk) => isPendingChunkState(chunk.state))
  }

  restoreChunks(chunks: readonly VoiceChunk[]): number {
    let restored = 0
    const existing = new Set(this.#chunks.map((chunk) => `${chunk.sessionId}:${chunk.id}`))
    for (const source of chunks) {
      const key = `${source.sessionId}:${source.id}`
      if (existing.has(key) || source.state === "merged") continue
      const chunk = cloneChunk(source)
      if (chunk.state === "processing") chunk.state = "retrying"
      if (chunk.state === "recording" || chunk.state === "closed") chunk.state = chunk.pcmBytes > 0 ? "retrying" : "failed"
      this.#chunks.push(chunk)
      existing.add(key)
      this.#nextChunkIndex = Math.max(this.#nextChunkIndex, chunk.index + 1)
      this.#paragraphIndex = Math.max(this.#paragraphIndex, chunk.paragraphIndex)
      restored += 1
    }
    if (restored > 0) {
      this.#chunks.sort((a, b) => a.startedAt - b.startedAt || a.index - b.index)
      const pending = this.#hasPendingChunks()
      this.#autoSendState = pending ? "waitingChunks" : "armed"
      this.#phase = pending ? "reconnecting" : "idle"
      this.#hasVoiceActivity = pending
    }
    return restored
  }

  markChunkProcessing(id: string): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null || chunk.state === "merged") return chunk
    chunk.state = "processing"
    chunk.attempts += 1
    chunk.error = null
    this.#phase = "processing"
    if (this.#autoSendState === "armed" || this.#autoSendState === "readyToSend") this.#autoSendState = "waitingChunks"
    return chunk
  }

  markChunkAcknowledged(id: string, sequence: number): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null || !Number.isFinite(sequence)) return chunk
    const value = Math.trunc(sequence)
    chunk.acknowledgedSequence = chunk.acknowledgedSequence === null
      ? value
      : Math.max(chunk.acknowledgedSequence, value)
    return chunk
  }

  markChunkRecognized(id: string, text: string): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null || chunk.state === "merged") return chunk
    chunk.text = text
    chunk.state = "recognized"
    return chunk
  }

  markChunkMerged(id: string): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null) return null
    chunk.state = "merged"
    chunk.error = null
    if (!this.#hasPendingChunks()) {
      this.#autoSendState = this.#autoSendState === "draft" || this.#autoSendState === "cancelled"
        ? this.#autoSendState
        : "readyToSend"
    }
    return chunk
  }

  releaseMergedChunkAudio(id: string): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null || chunk.state !== "merged") return chunk
    chunk.pcm = []
    chunk.pcmBytes = 0
    return chunk
  }

  markChunkFailed(id: string, error: string, retry = true): VoiceChunk | null {
    const chunk = this.#chunkById(id)
    if (chunk === null) return null
    if (chunk.state === "merged") return chunk
    chunk.error = error
    this.#lastError = error
    chunk.state = retry && chunk.pcmBytes > 0 ? "retrying" : "failed"
    if (retry && this.#phase !== "draft") this.#phase = "reconnecting"
    return chunk
  }

  requeueProcessingChunks(error: string): void {
    for (const chunk of this.#chunks) {
      if (chunk.state === "processing") this.markChunkFailed(chunk.id, error, true)
    }
  }

  retryFailedChunks(): number {
    let count = 0
    for (const chunk of this.#chunks) {
      if (chunk.state !== "failed" || chunk.pcmBytes <= 0) continue
      chunk.state = "retrying"
      chunk.error = null
      count += 1
    }
    if (count > 0) {
      this.#autoSendState = "waitingChunks"
      if (this.#phase !== "draft") this.#phase = "reconnecting"
    }
    return count
  }

  hasPendingChunks(): boolean {
    return this.#hasPendingChunks()
  }

  hasVoiceActivity(): boolean {
    return this.#hasVoiceActivity || this.#chunks.some((chunk) => chunk.state !== "failed")
  }

  setWakeGainSnapshot(snapshot: VoiceWakeGainSnapshot): void {
    this.#wakeGain = snapshot
  }

  snapshot(): VoiceSessionSnapshot {
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
      sessionId: this.#sessionId,
      turnId: this.#turnId,
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
      timings: {...this.timings},
      wakeGain: this.#wakeGain,
      captureEpoch: this.#captureEpoch,
      nextSequence: this.#nextSequence,
      paragraphIndex: this.#paragraphIndex,
    }
  }

  #createChunk(now: number): VoiceChunk {
    if (this.#currentChunk !== null) return this.#currentChunk
    const chunk: VoiceChunk = {
      sessionId: this.#sessionId,
      turnId: this.#turnId,
      id: voiceId("voice-chunk"),
      index: this.#nextChunkIndex,
      state: "recording",
      startedAt: now,
      endedAt: null,
      pcm: [],
      pcmBytes: 0,
      text: "",
      error: null,
      attempts: 0,
      captureEpoch: this.#captureEpoch,
      sequenceStart: null,
      sequenceEnd: null,
      acknowledgedSequence: null,
      paragraphIndex: this.#paragraphIndex,
      audioHash: "",
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
    return this.#currentChunk !== null || this.#chunks.some((chunk) => isPendingChunkState(chunk.state))
  }

  #queuedChunkBytes(): number {
    let bytes = 0
    for (const chunk of this.#chunks) {
      if (chunk.state === "queued" || chunk.state === "retrying" || chunk.state === "processing") bytes += chunk.pcmBytes
    }
    return bytes
  }

  #beginNewSession(): void {
    this.#chunks = this.#chunks.filter((chunk) => chunk.state === "failed")
    this.#currentChunk = null
    this.#sessionId = voiceId("voice-session")
    this.#turnId = voiceId("voice-turn")
    this.#captureEpoch = voiceId("capture")
    this.#nextSequence = 0
    this.#nextChunkIndex = 0
  }
}

function isPendingChunkState(state: VoiceChunkState): boolean {
  return state === "recording"
    || state === "closed"
    || state === "queued"
    || state === "retrying"
    || state === "processing"
    || state === "recognized"
}

function cloneChunk(chunk: VoiceChunk): VoiceChunk {
  return {...chunk, pcm: chunk.pcm.map((buffer) => buffer.slice(0))}
}

function voiceId(prefix: string): string {
  const cryptoApi = globalThis.crypto
  const token = typeof cryptoApi?.randomUUID === "function"
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${token}`
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
