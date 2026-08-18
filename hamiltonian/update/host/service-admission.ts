import type {HamiltonianServiceWorkerRelease} from "./browser-release.ts"

const TECHNICAL_CLIENT_MESSAGE_KINDS = new Set(["identity", "pong"])

export interface HamiltonianServiceWorkerAdmissionClaim {
  profileId: string
  workerEntityId: string
  runtimeIncarnation: string
  codeVersion: string
  applicationAdmitted: boolean
}

export interface HamiltonianServiceWorkerReleaseCandidate<T> {
  endpoint: T
  profileId: string
  workerEntityId: string
  runtimeIncarnation: string | null
  codeVersion: string | null
  applicationAdmitted: boolean
}

export interface HamiltonianServiceWorkerReleaseUpdate<T> {
  endpoint: T
  target: HamiltonianServiceWorkerRelease
  revokeApplication: boolean
}

export type HamiltonianServiceWorkerAdmissionDecision =
  | {
    kind: "reject"
    reason:
      | "Service Worker code version changed without a new execution"
      | "Service Worker target version requires a new execution"
  }
  | {
    kind: "stale"
    target: HamiltonianServiceWorkerRelease
    revokeApplication: boolean
  }
  | {
    kind: "current"
    target: HamiltonianServiceWorkerRelease
  }

interface HamiltonianServiceWorkerEmbodiment {
  runtimeIncarnation: string
  codeVersion: string
}

interface PendingHamiltonianServiceWorkerUpdate {
  runtimeIncarnation: string
  target: HamiltonianServiceWorkerRelease
}

/** Owns host-local admission state without transport, lifecycle, or topology I/O. */
export class HamiltonianServiceWorkerAdmissionRegistry {
  readonly #embodiments = new Map<string, HamiltonianServiceWorkerEmbodiment>()
  readonly #pendingUpdates = new Map<string, PendingHamiltonianServiceWorkerUpdate>()

  applicationMessageAllowed(applicationAdmitted: boolean, kind: string): boolean {
    return applicationAdmitted || TECHNICAL_CLIENT_MESSAGE_KINDS.has(kind)
  }

  decideIdentity(
    claim: HamiltonianServiceWorkerAdmissionClaim,
    target: HamiltonianServiceWorkerRelease,
  ): HamiltonianServiceWorkerAdmissionDecision {
    const embodiment = this.#embodiments.get(claim.workerEntityId)
    if (
      embodiment?.runtimeIncarnation === claim.runtimeIncarnation &&
      embodiment.codeVersion !== claim.codeVersion
    ) {
      return {
        kind: "reject",
        reason: "Service Worker code version changed without a new execution",
      }
    }

    const pending = this.#pendingUpdates.get(this.#updateKey(claim.profileId, claim.workerEntityId))
    if (
      pending?.runtimeIncarnation === claim.runtimeIncarnation &&
      claim.codeVersion === pending.target.version
    ) {
      return {
        kind: "reject",
        reason: "Service Worker target version requires a new execution",
      }
    }

    if (claim.codeVersion !== target.version) {
      this.#rememberPending(claim, target)
      return {
        kind: "stale",
        target,
        revokeApplication: claim.applicationAdmitted,
      }
    }

    return {kind: "current", target}
  }

  reconcileRelease<T>(
    candidates: ReadonlyArray<HamiltonianServiceWorkerReleaseCandidate<T>>,
    target: HamiltonianServiceWorkerRelease,
  ): HamiltonianServiceWorkerReleaseUpdate<T>[] {
    const updates: HamiltonianServiceWorkerReleaseUpdate<T>[] = []
    for (const candidate of candidates) {
      if (
        candidate.runtimeIncarnation === null ||
        candidate.codeVersion === null ||
        candidate.codeVersion === target.version
      ) continue
      this.#rememberPending({
        profileId: candidate.profileId,
        workerEntityId: candidate.workerEntityId,
        runtimeIncarnation: candidate.runtimeIncarnation,
      }, target)
      updates.push({
        endpoint: candidate.endpoint,
        target,
        revokeApplication: candidate.applicationAdmitted,
      })
    }
    return updates
  }

  confirmCurrent(claim: HamiltonianServiceWorkerAdmissionClaim): void {
    this.#embodiments.set(claim.workerEntityId, {
      runtimeIncarnation: claim.runtimeIncarnation,
      codeVersion: claim.codeVersion,
    })
    this.#pendingUpdates.delete(this.#updateKey(claim.profileId, claim.workerEntityId))
  }

  forgetEmbodiment(workerEntityId: string): void {
    this.#embodiments.delete(workerEntityId)
  }

  embodiment(workerEntityId: string): Readonly<HamiltonianServiceWorkerEmbodiment> | undefined {
    return this.#embodiments.get(workerEntityId)
  }

  pendingTarget(
    profileId: string,
    workerEntityId: string,
  ): Readonly<PendingHamiltonianServiceWorkerUpdate> | undefined {
    return this.#pendingUpdates.get(this.#updateKey(profileId, workerEntityId))
  }

  #rememberPending(
    claim: Pick<
      HamiltonianServiceWorkerAdmissionClaim,
      "profileId" | "workerEntityId" | "runtimeIncarnation"
    >,
    target: HamiltonianServiceWorkerRelease,
  ): void {
    this.#pendingUpdates.set(this.#updateKey(claim.profileId, claim.workerEntityId), {
      runtimeIncarnation: claim.runtimeIncarnation,
      target,
    })
  }

  #updateKey(profileId: string, workerEntityId: string): string {
    return `${profileId}\u0000${workerEntityId}`
  }
}
