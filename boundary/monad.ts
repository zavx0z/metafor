import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  BOUNDARY_INITIAL_STATE_METHOD,
} from "@metafor/types/boundary/initial"
import type {MonadRpcPeer} from "shared/transport/monad"
import type {DomainHealth} from "shared/protocol/monad/health"
import {
  BOUNDARY_GRAPH_PROJECTION_METHOD,
  readBoundaryGraphProjection,
} from "./graph.ts"
import type {BoundaryDatabase} from "./sqlite.ts"
import {
  BOUNDARY_FIELD_VALUE_PLAN_METHOD,
  BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
  BoundaryRuntimeRpcService,
} from "./runtime-rpc.ts"

export type BoundaryMonadState = "created" | "registering" | "ready" | "error" | "stopped"

/** Boundary server/service layer and its transport-neutral RPC surface. */
export class BoundaryMonad {
  #state: BoundaryMonadState = "created"
  #error: string | null = null
  #peer: MonadRpcPeer | null = null
  readonly #runtime: BoundaryRuntimeRpcService
  constructor(private readonly boundary: BoundaryDatabase) {
    this.#runtime = new BoundaryRuntimeRpcService(boundary)
  }

  onServerStarted(peer: MonadRpcPeer): void {
    if (this.#state !== "created") return
    this.#state = "registering"
    peer.expose(BOUNDARY_INITIAL_STATE_METHOD, async () => await this.boundary.initialState())
    peer.expose(BOUNDARY_INITIAL_PROJECTION_METHOD, async () => await this.boundary.initialProjection())
    peer.expose(
      BOUNDARY_GRAPH_PROJECTION_METHOD,
      async (params) => await readBoundaryGraphProjection(this.boundary, params),
    )
    peer.expose(
      BOUNDARY_FIELD_VALUE_PLAN_METHOD,
      async (params) => await this.#runtime.planFieldValue(params),
    )
    peer.expose(
      BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
      async (params) => await this.#runtime.projectProcessExecution(params),
    )
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
    return Response.json(this.health(filename))
  }

  health(filename: string): DomainHealth {
    return {
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "boundary",
      database: filename,
      rpc: this.#state,
      error: this.#error,
    }
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
