import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  type BoundaryInitialProjection,
  type BoundaryInitialProjectionEntry,
} from "@metafor/types/boundary/initial"
import type {BulkInitialPackage} from "@metafor/types/bulk/initial"
import type {ForceMessage} from "shared/protocol/force/message"
import type {MonadRpcPeer} from "shared/transport/monad"
import {DEFAULT_BULK_SCENE_SRC, DEFAULT_BULK_SETTINGS} from "./settings.ts"
import {BulkProjectionStore} from "./projection.ts"
import {observedRootSrc} from "./web/force-protocol.ts"
import {buildBoundaryBulkManifest} from "./world.ts"

export type BulkMonadState = "created" | "loading" | "prepared" | "ready" | "error" | "stopped"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isInitialProjection = (value: unknown): value is BoundaryInitialProjection =>
  isRecord(value) && value.version === 1 && Array.isArray(value.entries)

const particle = (entry: BoundaryInitialProjectionEntry) => ({...structuredClone(entry), ts: 0})

/** Bulk service layer: prepares one permanent Store before its Force runtime is born. */
export class BulkMonad {
  readonly #projection = new BulkProjectionStore()
  #state: BulkMonadState = "created"
  #error: string | null = null
  #activeSrc = DEFAULT_BULK_SCENE_SRC
  #throughTs: number | null = null

  async onServerStarted(peer: Pick<MonadRpcPeer, "call">): Promise<{atoms: number; rootSrc: string}> {
    if (this.#state !== "created") throw new Error(`Bulk Monad cannot start from state: ${this.#state}`)
    this.#state = "loading"
    try {
      const initial = await peer.call<BoundaryInitialProjection>(
        "boundary",
        BOUNDARY_INITIAL_PROJECTION_METHOD,
        {},
        {waitMs: 30_000},
      )
      if (!isInitialProjection(initial)) throw new Error("Boundary returned an invalid initial Bulk projection")
      for (const entry of initial.entries) this.#projection.apply(particle(entry))
      this.#activeSrc = [...this.#projection.atoms.values()]
        .filter((atom) => atom.parentAtom === null && atom.parentTopology === null)
        .at(-1)?.wimp ?? DEFAULT_BULK_SCENE_SRC
      this.#state = "prepared"
      return {atoms: this.#projection.atoms.size, rootSrc: this.#activeSrc}
    } catch (error) {
      this.onRuntimeBirthFailed(error)
      throw error
    }
  }

  onRuntimeBorn(): void {
    if (this.#state !== "prepared") throw new Error(`Bulk runtime cannot be born from state: ${this.#state}`)
    this.#state = "ready"
  }

  onRuntimeBirthFailed(error: unknown): void {
    if (this.#state === "error") return
    this.#error = error instanceof Error ? error.message : String(error)
    this.#state = "error"
  }

  onImpulse(message: ForceMessage): void {
    const part = message.parts[0]
    this.#projection.apply(part)
    const roots = new Set(
      [...this.#projection.atoms.values()]
        .filter((atom) => atom.parentAtom === null && atom.parentTopology === null)
        .map((atom) => atom.wimp),
    )
    const nextRoot = observedRootSrc(part, roots)
    if (nextRoot !== null) this.#activeSrc = nextRoot
    this.#throughTs = part.ts
  }

  openObserver(session: string): BulkInitialPackage {
    if (this.#state !== "ready") throw new Error(`Bulk observer cannot open: runtime is not ready (${this.#state})`)
    const projection = this.#projection.snapshot()
    return {
      version: 1,
      session,
      throughTs: this.#throughTs,
      rootSrc: this.#activeSrc,
      projection,
      manifest: buildBoundaryBulkManifest(projection.runtime, this.#activeSrc, DEFAULT_BULK_SETTINGS.layout),
    }
  }

  onHealthRequested(): Response {
    return Response.json({
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "bulk",
      initialized: this.#state === "ready",
      rpc: this.#state,
      error: this.#error,
    })
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
