import {
  BOUNDARY_INITIAL_STATE_METHOD,
  type BoundaryInitialState,
} from "@metafor/types/boundary/initial"
import {
  MONAD_RPC_VERSION,
  type MonadRpcFailure,
  type MonadRpcResponse,
  type RoutedMonadRpcCall,
} from "shared/protocol/monad/rpc"
import type {MonadRpcClient} from "shared/transport/monad"
import type {BoundaryDatabase} from "./sqlite.ts"

export type BoundaryMonadState = "created" | "registering" | "ready" | "error" | "stopped"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isRoutedCall = (value: unknown): value is RoutedMonadRpcCall =>
  isRecord(value) &&
  value.version === MONAD_RPC_VERSION &&
  typeof value.id === "string" && value.id.length > 0 &&
  typeof value.source === "string" && value.source.length > 0 &&
  value.target === "boundary" &&
  typeof value.method === "string" && value.method.length > 0 &&
  Object.prototype.hasOwnProperty.call(value, "params")

const failure = (id: string, code: MonadRpcFailure["error"]["code"], message: string): MonadRpcFailure => ({
  version: MONAD_RPC_VERSION,
  id,
  ok: false,
  error: {code, message},
})

/** Boundary server/service layer and its initial-data RPC surface. */
export class BoundaryMonad {
  #state: BoundaryMonadState = "created"
  #error: string | null = null

  constructor(private readonly boundary: BoundaryDatabase) {}

  async onServerStarted(client: MonadRpcClient, endpoint: URL): Promise<void> {
    if (this.#state !== "created") return
    this.#state = "registering"
    try {
      await client.registerProvider([BOUNDARY_INITIAL_STATE_METHOD], endpoint, {waitMs: 30_000})
      this.#state = "ready"
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error)
      this.#state = "error"
      throw error
    }
  }

  async onRpcRequested(request: Request): Promise<Response> {
    let value: unknown
    try {
      value = await request.json()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return Response.json(failure("invalid", "invalid_request", message), {status: 400})
    }
    if (!isRoutedCall(value)) {
      return Response.json(failure("invalid", "invalid_request", "Invalid routed Monad RPC call"), {status: 400})
    }
    const response = await this.#invoke(value)
    return Response.json(response, {status: response.ok ? 200 : 500})
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

  async #invoke(call: RoutedMonadRpcCall): Promise<MonadRpcResponse<BoundaryInitialState>> {
    if (call.method !== BOUNDARY_INITIAL_STATE_METHOD) {
      return failure(call.id, "method_unavailable", `Boundary Monad RPC method is unavailable: ${call.method}`)
    }
    try {
      return {
        version: MONAD_RPC_VERSION,
        id: call.id,
        ok: true,
        result: await this.boundary.initialState(),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return failure(call.id, "method_error", message)
    }
  }
}
