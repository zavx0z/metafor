import {
  READ_GRAPH_METHOD,
  type MetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import {BULK_VIEWPORT_CAPTURE_METHOD} from "@metafor/types/bulk/capture"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {ForceMessage} from "shared/protocol/force/message"
import type {MonadRpcPeer} from "shared/transport/monad"
import {FORCE_CHECKPOINT_QUIESCE_METHOD} from "shared/transport/force/checkpoint"
import {buildBulkManifestation} from "./manifestation.ts"
import {
  type BulkInitialScene,
  type BulkReadyScene,
  prepareBulkInitialVisual,
} from "./visual-initial.ts"
import {
  prepareBulkGraphCut,
} from "./graph.ts"
import type {BulkViewportCaptureRegistry} from "./capture.ts"

export type BulkMonadState = "created" | "loading" | "prepared" | "ready" | "error" | "stopped"

const projectionPromotionReceipt = (
  projection: BulkRuntimeProjection,
  receipt: BulkRootPromotionReceipt | null,
): BulkRootPromotionReceipt | null => {
  if (receipt === null) return null
  const target = projection.atoms.find(({wimp}) => wimp === receipt.promotedRootSrc)
  if (!target) return receipt
  let removedRootAtomId = receipt.removedRootAtomId
  const used = new Set(projection.atoms.map(({id}) => id))
  while (used.has(removedRootAtomId) || removedRootAtomId === target.id) {
    removedRootAtomId += 1
  }
  return {
    ...receipt,
    removedRootAtomId,
    promotedAtomId: target.id,
  }
}

/**
 * Bulk service layer.
 *
 * Birth prepares only operational RPC/Force state. Full Graph documents and
 * their projections are read from Dark and consumed within the page request,
 * causal invalidation that asked for them; this class never
 * retains a Graph or projection snapshot.
 */
export class BulkMonad {
  #state: BulkMonadState = "created"
  #error: string | null = null
  #throughTs: number | null = null

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
  async onServerStarted(): Promise<void> {
    if (this.#state !== "created") throw new Error(`Bulk Monad cannot start from state: ${this.#state}`)
    this.#state = "loading"
    try {
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

  async onImpulse(
    peer: Pick<MonadRpcPeer, "call">,
    message: ForceMessage,
  ): Promise<BulkReadyScene> {
    if (this.#state !== "ready") {
      throw new Error(`Bulk Monad cannot apply an invalidation from state: ${this.#state}`)
    }
    const part = message.parts[0]
    try {
      await peer.call(
        "boundary",
        FORCE_CHECKPOINT_QUIESCE_METHOD,
        {},
        {waitMs: 30_000},
      )
      const current = await peer.call<Graph>(
        "dark",
        READ_GRAPH_METHOD,
        {},
        {waitMs: 30_000},
      )
      const cut = prepareBulkGraphCut(current)
      const scene = this.#composeScene(
        cut.projection.runtime,
        cut.document.root,
        part.ts,
        null,
      )
      this.#throughTs = part.ts
      return scene
    } catch (error) {
      this.onRuntimeBirthFailed(error)
      throw error
    }
  }

  /** Reads and prepares one request-local Graph cut without retaining it. */
  async openFreshObserver(
    peer: Pick<MonadRpcPeer, "call">,
    session: string,
  ): Promise<BulkInitialScene> {
    if (this.#state !== "ready") throw new Error(`Bulk observer cannot open: runtime is not ready (${this.#state})`)
    const throughTs = this.#throughTs
    const value = await peer.call<Graph>(
      "dark",
      READ_GRAPH_METHOD,
      {},
      {waitMs: 30_000},
    )
    const cut = prepareBulkGraphCut(value)
    return {
      ...this.#composeScene(
        cut.projection.runtime,
        cut.document.root,
        throughTs,
        null,
      ),
      session,
    }
  }

  #composeScene(
    projection: BulkRuntimeProjection,
    rootSrc: MetaAddress,
    throughTs: number | null,
    promotionReceipt: BulkRootPromotionReceipt | null,
  ): BulkReadyScene {
    const promotion = projectionPromotionReceipt(
      projection,
      promotionReceipt,
    )
    const manifest = buildBulkManifestation(
      projection,
      promotion?.removedRootSrc ?? rootSrc,
      promotion,
    )
    return {
      kind: "bulk-ready-scene",
      version: 1,
      throughTs,
      rootSrc,
      visual: prepareBulkInitialVisual(manifest, projection),
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
