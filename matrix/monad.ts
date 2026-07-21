import {
  BOUNDARY_INITIAL_STATE_METHOD,
  type BoundaryInitialState,
} from "@metafor/types/boundary/initial"
import type {MonadRpcPeer} from "shared/transport/monad"
import {weak$} from "@matrix/weak"
import {prepareMatrixBirth} from "./birth.ts"

export type MatrixMonadState = "created" | "preparing" | "prepared" | "ready" | "error" | "stopped"

/** Matrix server/service layer: obtains initial data and prepares the permanent Store. */
export class MatrixMonad {
  #state: MatrixMonadState = "created"
  #error: string | null = null

  async onServerStarted(peer: MonadRpcPeer): Promise<{atoms: number; fields: number; backend: string}> {
    if (this.#state !== "created") throw new Error(`Matrix Monad cannot prepare from state: ${this.#state}`)
    this.#state = "preparing"
    try {
      const initial = await peer.call<BoundaryInitialState>(
        "boundary",
        BOUNDARY_INITIAL_STATE_METHOD,
        {},
        {waitMs: 30_000},
      )
      const result = await prepareMatrixBirth(initial)
      this.#state = "prepared"
      return result
    } catch (error) {
      this.onRuntimeBirthFailed(error)
      throw error
    }
  }

  onRuntimeBorn(): void {
    if (this.#state !== "prepared") throw new Error(`Matrix runtime cannot be born from state: ${this.#state}`)
    this.#state = "ready"
  }

  onRuntimeBirthFailed(error: unknown): void {
    if (this.#state === "error") return
    this.#error = error instanceof Error ? error.message : String(error)
    this.#state = "error"
  }

  onHealthRequested(): Response {
    return Response.json({
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "matrix",
      backend: weak$.mode,
      initialized: this.#state === "ready" && weak$.initialized,
      rpc: this.#state,
      error: this.#error,
    })
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
