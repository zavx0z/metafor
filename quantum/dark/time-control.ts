import type {ForceMessageInput} from "shared/protocol/force/message"
import {
  CheckpointBarrierError,
  type CheckpointBarrierFrontier,
} from "./checkpoint/barrier.ts"
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
  readAtExactFrontier<T>(
    reader: (frontier: CheckpointBarrierFrontier) => Promise<T>,
  ): Promise<T>
}

export type DarkForceCausalReadErrorCode =
  | "checkpoint-unavailable"
  | "baseline-unresolved"

/** Expected inability to prove an exact Graph/frontier pair. */
export class DarkForceCausalReadError extends Error {
  override readonly name = "DarkForceCausalReadError"

  constructor(
    readonly code: DarkForceCausalReadErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

type TimeCheckpoint = {
  holdUnderClosedAdmission(signal?: AbortSignal): Promise<CheckpointBarrierFrontier>
  releaseAdmissionHold(): CheckpointBarrierFrontier
}

type TimeOperation = "pause" | "step" | "resume" | "read"

/**
 * Dark-owned causal time controller. Force owns Particle execution; this
 * controller only brackets it with the existing checkpoint hold.
 */
export class DarkForceTimeController implements DarkForceTimeControl {
  readonly #frames: ForcePauseFrame[] = []
  #paused = false
  #operation: TimeOperation | null = null

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
    this.#begin("pause")
    try {
      this.lifecycle.closeExternalAdmission()
      try {
        const frame = await this.#hold(checkpoint)
        this.#paused = true
        return frame
      } catch (error) {
        this.lifecycle.openExternalAdmission()
        throw error
      }
    } finally {
      this.#end("pause")
    }
  }

  async stepAgentParticle(input: ForceMessageInput): Promise<{
    decision: ForceAgentDecision
    frame: ForcePauseFrame
  }> {
    const checkpoint = this.#checkpointOrThrow()
    if (!this.#paused) throw new Error("Dark Force step requires paused admission")
    this.#begin("step")
    try {
      checkpoint.releaseAdmissionHold()
      this.#paused = false
      const decision = await this.lifecycle.stepAgentParticle(input)
      if (!decision.ok) throw new Error(decision.error)
      const frame = await this.#hold(checkpoint)
      this.#paused = true
      return {decision, frame}
    } finally {
      this.#end("step")
    }
  }

  resumeExternalAdmission(): void {
    const checkpoint = this.#checkpointOrThrow()
    if (!this.#paused) throw new Error("Dark Force time control is not paused")
    this.#begin("resume")
    try {
      checkpoint.releaseAdmissionHold()
      this.lifecycle.openExternalAdmission()
      this.#paused = false
      this.#frames.length = 0
    } finally {
      this.#end("resume")
    }
  }

  pauseStack(): ForcePauseFrame[] {
    return structuredClone(this.#frames)
  }

  /**
  Runs one read while the exact applied-through frontier cannot move.

  An existing explicit pause is borrowed without releasing it. Otherwise the
  method owns a short close → hold → read → release → open cycle. Concurrent
  pause, step, resume and causal reads are rejected instead of sharing a hold
  ambiguously.

  @param reader - Read-only work that must finish before the held frontier is released.
  @returns Detached result produced inside the held causal cut.
  @throws {@link DarkForceCausalReadError} when no checkpoint plane or proven baseline exists.

  @example
  ```ts
  const graph = await control.readAtExactFrontier(async (frontier) => ({
    frontier,
    value: await assembleGraph(),
  }))
  ```
  */
  async readAtExactFrontier<T>(
    reader: (frontier: CheckpointBarrierFrontier) => Promise<T>,
  ): Promise<T> {
    if (!this.checkpoint) {
      throw new DarkForceCausalReadError(
        "checkpoint-unavailable",
        "Exact causal Graph reads require the checkpoint plane",
      )
    }
    this.#begin("read")
    try {
      if (this.#paused) {
        const frame = this.#frames.at(-1)
        if (!frame || frame.frontier.phase !== "held") {
          throw new Error("Dark Force pause has no held causal frontier")
        }
        return await reader(structuredClone(frame.frontier))
      }

      this.lifecycle.closeExternalAdmission()
      let held = false
      try {
        const frontier = await this.checkpoint.holdUnderClosedAdmission()
        held = true
        return await reader(structuredClone(frontier))
      } catch (error) {
        if (
          error instanceof CheckpointBarrierError &&
          error.code === "sequence_zero_baseline_unresolved"
        ) {
          throw new DarkForceCausalReadError(
            "baseline-unresolved",
            "Exact causal Graph read has no proven sequence-zero baseline",
            {cause: error},
          )
        }
        throw error
      } finally {
        if (held) this.checkpoint.releaseAdmissionHold()
        this.lifecycle.openExternalAdmission()
      }
    } finally {
      this.#end("read")
    }
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

  #begin(operation: TimeOperation): void {
    if (this.#operation !== null) {
      throw new Error(`Dark Force causal time operation is busy: ${this.#operation}`)
    }
    this.#operation = operation
  }

  #end(operation: TimeOperation): void {
    if (this.#operation !== operation) {
      throw new Error(`Dark Force causal time operation ownership was lost: ${operation}`)
    }
    this.#operation = null
  }
}
