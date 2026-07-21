import {
  DARK_HISTORY_CLEAR_METHOD,
  DARK_HISTORY_READ_METHOD,
} from "@metafor/types/dark/history"
import type {MonadRpcPeer} from "shared/transport/monad"
import type {DarkHistory} from "./history.ts"

export type DarkMonadState = "created" | "registering" | "ready" | "error" | "stopped"

/** Dark service-plane lifecycle and history RPC surface. */
export class DarkMonad {
  #state: DarkMonadState = "created"
  #error: string | null = null

  constructor(private readonly history: DarkHistory) {}

  onServerStarted(peer: MonadRpcPeer): void {
    if (this.#state !== "created") return
    this.#state = "registering"
    peer.expose(DARK_HISTORY_READ_METHOD, async (params) => this.history.read(params))
    peer.expose(DARK_HISTORY_CLEAR_METHOD, async (params) => this.history.clear(params))
  }

  onChannelOpened(): void {
    if (this.#state !== "registering") throw new Error(`Dark Monad channel cannot open from state: ${this.#state}`)
    this.#state = "ready"
  }

  onChannelFailed(error: unknown): void {
    if (this.#state === "error") return
    this.#error = error instanceof Error ? error.message : String(error)
    this.#state = "error"
  }

  onHealthRequested(): Response {
    return Response.json({
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "dark",
      rpc: this.#state,
      history: {
        path: this.history.filename,
        latestTs: this.history.latestTs,
      },
      error: this.#error,
    })
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
