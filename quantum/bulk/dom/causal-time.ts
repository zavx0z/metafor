import type {TimelineProps} from "@ui/components/hud"

export type BulkTimeFrameResolution = "exact" | "degraded" | "overloaded"

export type BulkTimeFrame = Readonly<{
  id: number
  frontier: Readonly<{
    acceptanceSequence: number
  }>
  resolution?: BulkTimeFrameResolution
}>

export type BulkTimeState = "loading" | "open" | "pausing" | "paused" | "resuming" | "error"

export type BulkCausalTimeTransport = Readonly<{
  stack(): Promise<unknown>
  pause(): Promise<void>
  resume(): Promise<void>
}>

export type BulkCausalTimeSnapshot = Readonly<{
  frames: readonly BulkTimeFrame[]
  message: string
  playhead: number
  state: BulkTimeState
}>

type BulkTimeListener = (snapshot: BulkCausalTimeSnapshot) => void

export const BULK_TIME_TRACKS = Object.freeze([
  Object.freeze({key: "force", label: "Force"}),
  Object.freeze({key: "mass", label: "Mass"}),
  Object.freeze({key: "boundary", label: "Boundary"}),
])

export class BulkCausalTimeModel {
  #frames: readonly BulkTimeFrame[] = Object.freeze([])
  #state: BulkTimeState = "loading"
  #message = "Читаю causal stack…"
  #playhead = 0
  #operationEpoch = 0
  #disposed = false
  readonly #listeners = new Set<BulkTimeListener>()

  constructor(readonly transport: BulkCausalTimeTransport) {}

  get frames(): readonly BulkTimeFrame[] { return this.#frames }
  get state(): BulkTimeState { return this.#state }
  get message(): string { return this.#message }
  get playhead(): number { return this.#playhead }
  get canPause(): boolean { return !this.#disposed && this.#state === "open" }
  get canResume(): boolean { return !this.#disposed && this.#state === "paused" }

  snapshot(): BulkCausalTimeSnapshot {
    return Object.freeze({
      frames: this.#frames,
      message: this.#message,
      playhead: this.#playhead,
      state: this.#state,
    })
  }

  subscribe(listener: BulkTimeListener): () => void {
    if (this.#disposed) throw new Error("BulkCausalTimeModel is disposed")
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async open(): Promise<void> {
    this.#assertActive()
    const epoch = this.#beginOperation("loading", "Читаю causal stack…")
    await this.#loadStack(epoch)
  }

  setPlayhead(value: number): void {
    this.#assertActive()
    const next = clamp(value, 0, 1)
    if (next === this.#playhead && this.#message === "Просмотр позиции; live и 3D не изменены") return
    this.#playhead = next
    this.#message = "Просмотр позиции; live и 3D не изменены"
    this.#notify()
  }

  selectRelativeFrame(offset: -1 | 1): void {
    this.#assertActive()
    if (this.#frames.length === 0) return
    const selected = nearestFrameIndex(this.#frames, currentSequence(this.#frames, this.#playhead))
    const nextIndex = clamp(selected + offset, 0, this.#frames.length - 1)
    const next = this.#frames[nextIndex]
    if (next === undefined) return
    this.setPlayhead(playheadForSequence(this.#frames, next.frontier.acceptanceSequence))
  }

  async pause(): Promise<void> {
    this.#assertActive()
    if (!this.canPause) return
    const epoch = this.#beginOperation("pausing", "Жду causal frontier…")
    try {
      await this.transport.pause()
      if (!this.#isCurrent(epoch)) return
      await this.#loadStack(epoch)
    } catch (error) {
      if (!this.#isCurrent(epoch)) return
      this.#state = "error"
      this.#message = `Пауза не установлена: ${errorMessage(error)}`
      this.#notify()
    }
  }

  async resume(): Promise<void> {
    this.#assertActive()
    if (!this.canResume) return
    const epoch = this.#beginOperation("resuming", "Освобождаю causal frontier…")
    try {
      await this.transport.resume()
      if (!this.#isCurrent(epoch)) return
      this.#frames = Object.freeze([])
      this.#state = "open"
      this.#playhead = 0
      this.#message = "Приём Particle снова открыт"
    } catch (error) {
      if (!this.#isCurrent(epoch)) return
      this.#state = "error"
      this.#message = `Продолжение не выполнено: ${errorMessage(error)}`
    }
    this.#notify()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#operationEpoch += 1
    this.#listeners.clear()
  }

  async #loadStack(epoch: number): Promise<void> {
    try {
      const frames = readBulkTimeFrames(await this.transport.stack())
      if (!this.#isCurrent(epoch)) return
      this.#frames = frames
      this.#state = frames.length > 0 ? "paused" : "open"
      this.#playhead = frames.length === 0 ? 0 : 1
      this.#message = frames.length === 0
        ? "Пауза создаёт первый keyframe"
        : `Keyframes: ${frames.length}`
    } catch (error) {
      if (!this.#isCurrent(epoch)) return
      this.#state = "error"
      this.#message = `Время недоступно: ${errorMessage(error)}`
    }
    this.#notify()
  }

  #beginOperation(state: BulkTimeState, message: string): number {
    const epoch = ++this.#operationEpoch
    this.#state = state
    this.#message = message
    this.#notify()
    return epoch
  }

  #isCurrent(epoch: number): boolean {
    return !this.#disposed && this.#operationEpoch === epoch
  }

  #notify(): void {
    const snapshot = this.snapshot()
    for (const listener of this.#listeners) listener(snapshot)
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("BulkCausalTimeModel is disposed")
  }
}

export const readBulkTimeFrames = (value: unknown): readonly BulkTimeFrame[] => {
  if (!Array.isArray(value)) throw new Error("Dark returned an invalid causal stack")
  const frames = value.map((candidate): BulkTimeFrame => {
    if (
      !isRecord(candidate) ||
      !Number.isSafeInteger(candidate.id) ||
      (candidate.id as number) <= 0 ||
      !isRecord(candidate.frontier)
    ) {
      throw new Error("Dark returned an invalid causal frame")
    }
    const acceptanceSequence = candidate.frontier.acceptanceSequence
    if (!Number.isSafeInteger(acceptanceSequence) || (acceptanceSequence as number) < 0) {
      throw new Error("Dark returned a causal frame without a valid acceptance sequence")
    }
    const resolution = candidate.resolution
    if (resolution !== undefined && !isResolution(resolution)) {
      throw new Error("Dark returned a causal frame with an invalid resolution")
    }
    return Object.freeze({
      id: candidate.id as number,
      frontier: Object.freeze({acceptanceSequence: acceptanceSequence as number}),
      ...(resolution === undefined ? {} : {resolution}),
    })
  })
  for (const [index, frame] of frames.entries()) {
    if (frame.id !== index + 1) {
      throw new Error("Dark returned a causal stack with non-sequential frame identity")
    }
    const previous = frames[index - 1]
    if (
      previous !== undefined &&
      frame.frontier.acceptanceSequence <= previous.frontier.acceptanceSequence
    ) {
      throw new Error("Dark returned a causal stack with non-increasing acceptance sequence")
    }
  }
  return Object.freeze(frames)
}

export const buildBulkCausalTimeline = (
  frames: readonly BulkTimeFrame[],
  playhead: number,
  playing = false,
): TimelineProps => {
  const range = causalTimelineRange(frames)
  const current = range.span === 0
    ? range.first
    : range.first + range.span * clamp(playhead, 0, 1)
  const selectedIndex = nearestFrameIndex(frames, current)
  const markers = Object.freeze(frames.map((frame, index) => Object.freeze({
    key: `frame-${frame.id}`,
    tick: frame.frontier.acceptanceSequence,
    selected: index === selectedIndex,
    label: `frame ${frame.id}`,
  })))

  return Object.freeze({
    title: "ВРЕМЯ · causal stack",
    min: range.min,
    max: range.max,
    current,
    playing,
    tracks: Object.freeze(BULK_TIME_TRACKS.map(({key, label}) => Object.freeze({
      key,
      label,
      markers,
    }))),
  })
}

export const playheadForSequence = (
  frames: readonly BulkTimeFrame[],
  sequence: number,
): number => {
  const range = causalTimelineRange(frames)
  if (range.span === 0) return frames.length === 0 ? 0 : 1
  return clamp((sequence - range.first) / range.span, 0, 1)
}

const currentSequence = (frames: readonly BulkTimeFrame[], playhead: number): number => {
  const range = causalTimelineRange(frames)
  return range.first + range.span * clamp(playhead, 0, 1)
}

const causalTimelineRange = (frames: readonly BulkTimeFrame[]): Readonly<{
  first: number
  last: number
  span: number
  min: number
  max: number
}> => {
  const first = frames[0]?.frontier.acceptanceSequence ?? 0
  const last = frames.at(-1)?.frontier.acceptanceSequence ?? first
  const span = last - first
  const padding = Math.max(1, span * 0.06)
  return Object.freeze({
    first,
    last,
    span,
    min: first - padding,
    max: last + padding,
  })
}

const nearestFrameIndex = (frames: readonly BulkTimeFrame[], tick: number): number => {
  let selected = -1
  let distance = Number.POSITIVE_INFINITY
  for (const [index, frame] of frames.entries()) {
    const nextDistance = Math.abs(frame.frontier.acceptanceSequence - tick)
    if (nextDistance < distance) {
      selected = index
      distance = nextDistance
    }
  }
  return selected
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isResolution = (value: unknown): value is BulkTimeFrameResolution =>
  value === "exact" || value === "degraded" || value === "overloaded"

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))
