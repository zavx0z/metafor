import {
  BunEmbodimentSet,
  type BunEmbodimentSnapshot,
  type EmbodimentAuthority,
} from "./embodiment-supervisor.ts"
import {authorityKey, makeLeaseId} from "../../core/runtime.js"
import type {HamiltonianServerLifecycle} from "../lifecycle.ts"

export interface HamiltonianProcessCoordinatorOptions {
  placement: "browser" | "server"
  hostEpoch: string
  serverEntityId: string
  versionPayload: {version: string; source: string; sha256: string}
  lifecycle: HamiltonianServerLifecycle
  broadcastTopology(): void
}

/** Владеет Bun process birth/rebirth и server-placement fencing authority. */
export class HamiltonianProcessCoordinator {
  readonly #options: HamiltonianProcessCoordinatorOptions
  readonly #mainRole: string
  readonly #workerRole: string
  readonly #embodiments: BunEmbodimentSet
  #fencingToken = 1
  #authority: EmbodimentAuthority | null
  #mainOperations: Promise<void> = Promise.resolve()
  #stopping = false
  #ready: Promise<Record<string, BunEmbodimentSnapshot>> | null = null

  constructor(options: HamiltonianProcessCoordinatorOptions) {
    this.#options = options
    this.#mainRole = options.placement === "server" ? "main" : "main-probe"
    this.#workerRole = options.placement === "server" ? "worker" : "worker-probe"
    this.#authority = options.placement === "server" ? this.#makeAuthority(this.#fencingToken) : null
    this.#embodiments = new BunEmbodimentSet(
      [this.#mainRole, this.#workerRole],
      () => options.broadcastTopology(),
      undefined,
      (_role, envelope) => options.lifecycle.relay(envelope),
      (_role, event) => options.lifecycle.observeHostIpcMessage(event),
      (role, event) => {
        options.lifecycle.observeProcessExit({...event, role, kind: "bun-process"})
        queueMicrotask(() => this.#requestRepair(role))
      },
    )
  }

  get mainRole(): string {
    return this.#mainRole
  }

  snapshot(): Record<string, BunEmbodimentSnapshot> {
    return this.#embodiments.snapshot()
  }

  start(): Promise<Record<string, BunEmbodimentSnapshot>> {
    this.#ready ??= this.#embodiments.birthAll((role) => this.#payloadForRole(role))
      .catch(() => this.#embodiments.snapshot())
    return this.#ready
  }

  authority(): EmbodimentAuthority | null {
    return this.#authority
  }

  acceptsAuthority(candidate: EmbodimentAuthority | null): boolean {
    return this.#options.placement === "server" && authorityKey(candidate) === authorityKey(this.#authority)
  }

  rebirth(role = this.#mainRole): Promise<BunEmbodimentSnapshot> {
    if (this.#stopping) return Promise.reject(new Error("Hamiltonian host is stopping"))
    if (this.#options.placement !== "server" || role !== this.#mainRole) {
      return this.#embodiments.rebirth(role, this.#payloadForRole(role))
    }
    const rebirth = this.#mainOperations.then(async () => {
      this.#fencingToken += 1
      this.#authority = this.#makeAuthority(this.#fencingToken)
      this.#options.broadcastTopology()
      return await this.#embodiments.rebirth(role, this.#payloadForRole(role))
    })
    this.#mainOperations = rebirth.then(() => undefined, () => undefined)
    return rebirth
  }

  crashForTest(role = this.#mainRole): number | null {
    return this.#embodiments.crashForTest(role)
  }

  beginStopping(): void {
    this.#stopping = true
  }

  async stop(): Promise<void> {
    this.beginStopping()
    await this.#embodiments.stopAll()
  }

  #requestRepair(role: string): void {
    if (this.#stopping) return
    void this.rebirth(role).catch(() => {})
  }

  #payloadForRole(role: string) {
    return {
      ...this.#options.versionPayload,
      serverEntityId: this.#options.serverEntityId,
      authority: this.#options.placement === "server" && role === this.#mainRole ? this.#authority : null,
    }
  }

  #makeAuthority(fencingToken: number): EmbodimentAuthority {
    return {
      hostEpoch: this.#options.hostEpoch,
      connectionId: "bun-host",
      holderId: "main",
      fencingToken,
      leaseId: makeLeaseId(this.#options.hostEpoch, fencingToken, "bun-host", "main"),
      expiresAt: Number.MAX_SAFE_INTEGER,
    }
  }
}
