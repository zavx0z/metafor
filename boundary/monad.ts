import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  BOUNDARY_INITIAL_STATE_METHOD,
} from "@metafor/types/boundary/initial"
import type {MonadRpcPeer} from "shared/transport/monad"
import {
  BOUNDARY_META_JSON_PROJECTION_METHOD,
  readBoundaryMetaJSONProjection,
} from "./meta-json.ts"
import {BoundaryMF117LiveAdapter} from "./dissolve-live.ts"
import type {BoundaryDatabase} from "./sqlite.ts"

export type BoundaryMonadState = "created" | "registering" | "ready" | "error" | "stopped"

/** Boundary server/service layer and its transport-neutral RPC surface. */
export class BoundaryMonad {
  #state: BoundaryMonadState = "created"
  #error: string | null = null
  #peer: MonadRpcPeer | null = null
  readonly mf117: BoundaryMF117LiveAdapter

  constructor(private readonly boundary: BoundaryDatabase) {
    this.mf117 = new BoundaryMF117LiveAdapter(boundary)
  }

  onServerStarted(peer: MonadRpcPeer): void {
    if (this.#state !== "created") return
    this.#state = "registering"
    peer.expose(BOUNDARY_INITIAL_STATE_METHOD, async () => await this.boundary.initialState())
    peer.expose(BOUNDARY_INITIAL_PROJECTION_METHOD, async () => await this.boundary.initialProjection())
    peer.expose(
      BOUNDARY_META_JSON_PROJECTION_METHOD,
      async (params) => await readBoundaryMetaJSONProjection(this.boundary, params),
    )
    this.mf117.register(peer)
    this.#peer = peer
  }

  onChannelOpened(): void {
    if (this.#state !== "registering") throw new Error(`Boundary Monad channel cannot open from state: ${this.#state}`)
    this.#state = "ready"
    const peer = this.#peer
    if (peer) this.boundary.projection.setMassFence(async (request) => {
      await peer.call("energy", "energy.mass.fence", request, {waitMs: 30_000})
    })
    if (peer) this.boundary.projection.setMassRelease(async (request) => {
      await peer.call("energy", "energy.mass.release", request, {waitMs: 30_000})
    })
  }

  onChannelFailed(error: unknown): void {
    if (this.#state === "error") return
    this.#error = error instanceof Error ? error.message : String(error)
    this.#state = "error"
  }

  onHealthRequested(filename: string): Response {
    return Response.json({
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "boundary",
      database: filename,
      rpc: this.#state,
      error: this.#error,
    })
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
