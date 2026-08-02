import type {BulkStoreCaptureProof} from "@metafor/types/bulk/capture"

export type BulkObserverFrameScheduler = (callback: FrameRequestCallback) => number

/**
 * Keeps compact Bulk Store evidence for the cut that reached the canvas.
 *
 * Staging schedules no render. Its bounded callback is registered after the
 * existing on-demand renderer callback and only publishes the newest proof
 * once that normal browser frame has completed.
 */
export class BulkPresentedStoreProof {
  readonly #scheduleFrame: BulkObserverFrameScheduler
  #presented: BulkStoreCaptureProof | null = null
  #staged: (() => BulkStoreCaptureProof) | null = null
  #presentation: Promise<void> | null = null
  #resolvePresentation: (() => void) | null = null

  constructor(scheduleFrame: BulkObserverFrameScheduler = (callback) => requestAnimationFrame(callback)) {
    this.#scheduleFrame = scheduleFrame
  }

  stage(readProof: () => BulkStoreCaptureProof): void {
    this.#staged = readProof
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

  async read(): Promise<BulkStoreCaptureProof | null> {
    const presentation = this.#presentation
    if (presentation !== null) await presentation
    return this.#presented === null ? null : structuredClone(this.#presented)
  }
}
