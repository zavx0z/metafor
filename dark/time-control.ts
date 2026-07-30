import type {ForceMessageInput} from "shared/protocol/force/message"
import type {CheckpointBarrierFrontier} from "./checkpoint/barrier.ts"
import type {ForceAgentDecision, ForceLifecycle} from "./force/lifecycle.ts"

export type ForcePauseFrame = {
  id: number
  frontier: CheckpointBarrierFrontier
}

export interface DarkForceTimeControl {
  pauseExternalAdmission(): Promise<ForcePauseFrame>
  stepAgentParticle(input: ForceMessageInput): Promise<{
    decision: ForceAgentDecision
    frame: ForcePauseFrame
  }>
  resumeExternalAdmission(): void
  pauseStack(): ForcePauseFrame[]
}

type TimeCheckpoint = {
  holdUnderClosedAdmission(signal?: AbortSignal): Promise<CheckpointBarrierFrontier>
  releaseAdmissionHold(): CheckpointBarrierFrontier
}

/**
 * Dark-owned causal time controller. Force owns Particle execution; this
 * controller only brackets it with the existing checkpoint hold.
 */
export class DarkForceTimeController implements DarkForceTimeControl {
  readonly #frames: ForcePauseFrame[] = []
  #paused = false

  constructor(
    private readonly lifecycle: Pick<
      ForceLifecycle,
      "closeExternalAdmission" | "openExternalAdmission" | "stepAgentParticle"
    >,
    private readonly checkpoint: TimeCheckpoint | null,
  ) {}

  async pauseExternalAdmission(): Promise<ForcePauseFrame> {
    const checkpoint = this.#checkpointOrThrow()
    if (this.#paused) throw new Error("Dark Force time control is already paused")
    this.lifecycle.closeExternalAdmission()
    try {
      const frame = await this.#hold(checkpoint)
      this.#paused = true
      return frame
    } catch (error) {
      this.lifecycle.openExternalAdmission()
      throw error
    }
  }

  async stepAgentParticle(input: ForceMessageInput): Promise<{
    decision: ForceAgentDecision
    frame: ForcePauseFrame
  }> {
    const checkpoint = this.#checkpointOrThrow()
    if (!this.#paused) throw new Error("Dark Force step requires paused admission")
    checkpoint.releaseAdmissionHold()
    this.#paused = false
    const decision = await this.lifecycle.stepAgentParticle(input)
    if (!decision.ok) throw new Error(decision.error)
    const frame = await this.#hold(checkpoint)
    this.#paused = true
    return {decision, frame}
  }

  resumeExternalAdmission(): void {
    const checkpoint = this.#checkpointOrThrow()
    if (!this.#paused) throw new Error("Dark Force time control is not paused")
    checkpoint.releaseAdmissionHold()
    this.lifecycle.openExternalAdmission()
    this.#paused = false
    this.#frames.length = 0
  }

  pauseStack(): ForcePauseFrame[] {
    return structuredClone(this.#frames)
  }

  async #hold(checkpoint: TimeCheckpoint): Promise<ForcePauseFrame> {
    const frontier = await checkpoint.holdUnderClosedAdmission()
    const frame = {
      id: this.#frames.length + 1,
      frontier: structuredClone(frontier),
    } satisfies ForcePauseFrame
    this.#frames.push(frame)
    return structuredClone(frame)
  }

  #checkpointOrThrow(): TimeCheckpoint {
    if (!this.checkpoint) throw new Error("Dark Force time control requires the checkpoint plane")
    return this.checkpoint
  }
}
