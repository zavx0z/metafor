import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"

export type BulkObserverFrameScheduler = (callback: FrameRequestCallback) => number

/**
 * Keeps the structural cut that has reached the observer's presented canvas.
 *
 * Staging schedules no render. Its bounded callback is registered after the
 * existing on-demand renderer callback and only publishes the newest snapshot
 * once that normal browser frame has completed.
 */
export class BulkPresentedSnapshot {
  readonly #scheduleFrame: BulkObserverFrameScheduler
  #presented: BulkObserverSnapshot | null = null
  #staged: (() => BulkObserverSnapshot) | null = null
  #presentation: Promise<void> | null = null
  #resolvePresentation: (() => void) | null = null

  constructor(scheduleFrame: BulkObserverFrameScheduler = (callback) => requestAnimationFrame(callback)) {
    this.#scheduleFrame = scheduleFrame
  }

  stage(readSnapshot: () => BulkObserverSnapshot): void {
    this.#staged = readSnapshot
    if (this.#presentation !== null) return
    this.#presentation = new Promise<void>((resolve) => {
      this.#resolvePresentation = resolve
    })
    this.#scheduleFrame(() => {
      try {
        if (this.#staged !== null) this.#presented = structuredClone(this.#staged())
      } catch {
        this.#presented = null
      }
      this.#staged = null
      const resolve = this.#resolvePresentation
      this.#resolvePresentation = null
      this.#presentation = null
      resolve?.()
    })
  }

  async read(): Promise<BulkObserverSnapshot | null> {
    const presentation = this.#presentation
    if (presentation !== null) await presentation
    return this.#presented === null ? null : structuredClone(this.#presented)
  }
}
