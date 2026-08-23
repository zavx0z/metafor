import {
  isHamiltonianServiceWorkerCodeVersion,
  isHamiltonianServiceWorkerRelease,
} from "../shared/service-release.js"

export interface HamiltonianServiceWorkerRelease {
  version: string
  sha256: string
}

export type HamiltonianServiceWorkerUpdateDecision =
  | {
      accepted: false
      reason: "invalid Service Worker update target"
    }
  | {
      accepted: true
      target: HamiltonianServiceWorkerRelease
      completion: Promise<unknown>
    }

export type HamiltonianServiceWorkerCurrentDecision =
  | {
      accepted: false
      reason: "invalid current Service Worker release"
    }
  | {
      accepted: true
      target: HamiltonianServiceWorkerRelease
      transitioned: boolean
      completion: Promise<void> | null
    }

export interface HamiltonianServiceWorkerUpdateControllerOptions {
  codeVersion: string
  updateRegistration(): Promise<unknown>
  admitApplication(): void | Promise<void>
}

/**
 * Owns the browser-side update/current gate for one Service Worker execution.
 * Transport rejection and application side effects stay with the Worker entry.
 */
export class HamiltonianServiceWorkerUpdateController {
  readonly #codeVersion: string
  readonly #updateRegistration: () => Promise<unknown>
  readonly #admitApplication: () => void | Promise<void>
  #applicationReady = false

  constructor(options: HamiltonianServiceWorkerUpdateControllerOptions) {
    if (!isHamiltonianServiceWorkerCodeVersion(options.codeVersion)) {
      throw new Error("Hamiltonian Service Worker code version is not valid SemVer")
    }
    this.#codeVersion = options.codeVersion
    this.#updateRegistration = options.updateRegistration
    this.#admitApplication = options.admitApplication
  }

  get applicationReady(): boolean {
    return this.#applicationReady
  }

  resetApplication(): void {
    this.#applicationReady = false
  }

  handleUpdateTarget(target: unknown): HamiltonianServiceWorkerUpdateDecision {
    if (!isHamiltonianServiceWorkerRelease(target) || target.version === this.#codeVersion) {
      return {accepted: false, reason: "invalid Service Worker update target"}
    }
    this.#applicationReady = false
    return {
      accepted: true,
      target,
      completion: callAsPromise(this.#updateRegistration),
    }
  }

  handleCurrentTarget(target: unknown): HamiltonianServiceWorkerCurrentDecision {
    if (!isHamiltonianServiceWorkerRelease(target) || target.version !== this.#codeVersion) {
      return {accepted: false, reason: "invalid current Service Worker release"}
    }
    if (this.#applicationReady) {
      return {accepted: true, target, transitioned: false, completion: null}
    }
    this.#applicationReady = true
    return {
      accepted: true,
      target,
      transitioned: true,
      completion: callAsPromise(this.#admitApplication).then(() => undefined),
    }
  }
}

function callAsPromise<T>(callback: () => T | Promise<T>): Promise<T> {
  try {
    return Promise.resolve(callback())
  } catch (error) {
    return Promise.reject(error)
  }
}
