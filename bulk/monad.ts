import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  type BoundaryInitialProjection,
} from "@metafor/types/boundary/initial"
import {BULK_VIEWPORT_CAPTURE_METHOD} from "@metafor/types/bulk/capture"
import type {BulkStore, BulkStoreInitial} from "@metafor/types/bulk/store"
import type {ForceMessage} from "shared/protocol/force/message"
import type {MonadRpcPeer} from "shared/transport/monad"
import type {BulkViewportCaptureRegistry} from "./capture.ts"
import {
  isBoundaryInitialProjection,
  prepareBulkStoreInitial,
} from "./store-initial.ts"
import {
  applyBulkStoreMessage,
  NOOP_BULK_STORE_RENDERER,
} from "./store-runtime.ts"

export type BulkMonadState = "created" | "loading" | "prepared" | "ready" | "error" | "stopped"

/**
 * Bulk service layer.
 *
 * Birth prepares the retained Store from Boundary's initial projection;
 * subsequent Force facts update that Store directly.
 */
export class BulkMonad {
  #state: BulkMonadState = "created"
  #error: string | null = null
  #store: BulkStore | null = null

  /** Register the typed observer capture method before advertising it. */
  onServerStarting(
    peer: Pick<MonadRpcPeer, "expose">,
    captures: Pick<BulkViewportCaptureRegistry, "capture">,
  ): void {
    peer.expose(
      BULK_VIEWPORT_CAPTURE_METHOD,
      async (params, context) => await captures.capture(params, context),
    )
  }

  /** Prepares durable operational state without reading or retaining Graph. */
  async onServerStarted(peer?: Pick<MonadRpcPeer, "call">): Promise<void> {
    if (this.#state !== "created") throw new Error(`Bulk Monad cannot start from state: ${this.#state}`)
    this.#state = "loading"
    try {
      if (peer !== undefined) {
        const initial = await peer.call<BoundaryInitialProjection>(
          "boundary",
          BOUNDARY_INITIAL_PROJECTION_METHOD,
          {},
          {waitMs: 30_000},
        )
        if (!isBoundaryInitialProjection(initial)) {
          throw new Error("Boundary returned an invalid initial Bulk projection")
        }
        const prepared = prepareBulkStoreInitial(
          initial,
          "server-foundation",
          null,
        )
        this.#store = prepared?.initial.store ?? null
      }
      this.#state = "prepared"
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

  /** Applies one already ordered Force fact directly to the retained Store. */
  acceptImpulse(message: ForceMessage): void {
    if (this.#state !== "ready") {
      throw new Error(`Bulk Monad cannot apply a Store update from state: ${this.#state}`)
    }
    if (this.#store === null) return
    const part = message.parts[0]
    if (part.part === "graviton" && part.path === "bulk") return
    applyBulkStoreMessage(this.#store, NOOP_BULK_STORE_RENDERER, message)
  }

  /** Clones the current server Store cut for one browser session. */
  async openFreshObserver(
    peer: Pick<MonadRpcPeer, "call">,
    session: string,
  ): Promise<BulkStoreInitial> {
    if (this.#state !== "ready") throw new Error(`Bulk observer cannot open: runtime is not ready (${this.#state})`)
    if (this.#store === null) {
      const initial = await peer.call<BoundaryInitialProjection>(
        "boundary",
        BOUNDARY_INITIAL_PROJECTION_METHOD,
        {},
        {waitMs: 30_000},
      )
      if (!isBoundaryInitialProjection(initial)) {
        throw new Error("Boundary returned an invalid initial Bulk projection")
      }
      const prepared = prepareBulkStoreInitial(
        initial,
        "server-foundation",
        null,
      )
      if (prepared === null) throw new Error("Bulk Store foundation has no root Atom")
      this.#store = prepared.initial.store
    }
    return {session, store: structuredClone(this.#store)}
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
