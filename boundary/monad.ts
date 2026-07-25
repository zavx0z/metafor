import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  BOUNDARY_INITIAL_STATE_METHOD,
} from "@metafor/types/boundary/initial"
import type {MonadRpcPeer} from "shared/transport/monad"
import type {BoundaryDatabase} from "./sqlite.ts"

export type BoundaryMonadState = "created" | "registering" | "ready" | "error" | "stopped"

/** Boundary server/service layer and its transport-neutral RPC surface. */
export class BoundaryMonad {
  #state: BoundaryMonadState = "created"
  #error: string | null = null
  #peer: MonadRpcPeer | null = null

  constructor(private readonly boundary: BoundaryDatabase) {}

  onServerStarted(peer: MonadRpcPeer): void {
    if (this.#state !== "created") return
    this.#state = "registering"
    peer.expose(BOUNDARY_INITIAL_STATE_METHOD, async () => await this.boundary.initialState())
    peer.expose(BOUNDARY_INITIAL_PROJECTION_METHOD, async () => await this.boundary.initialProjection())
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
