import type {MonadRpcPeer} from "shared/transport/monad"
import {
  DARK_DECLARATION_PROJECTION_METHOD,
  readDarkDeclarationProjection,
  type DarkDeclarationProjectionV1,
} from "./meta-json.ts"
import {MetaJSONMonad} from "./monad/meta-json.ts"

export type DarkMonadState = "created" | "registering" | "ready" | "error" | "stopped"

type DeclarationProjectionReader = (params: unknown) => Promise<DarkDeclarationProjectionV1>

/** Dark service-plane lifecycle and history RPC surface. */
export class DarkMonad {
  #state: DarkMonadState = "created"
  #error: string | null = null
  readonly #metaJSON = new MetaJSONMonad()

  constructor(
    private readonly readDeclarationProjection: DeclarationProjectionReader = readDarkDeclarationProjection,
  ) {}

  onServerStarted(peer: MonadRpcPeer): void {
    if (this.#state !== "created") return
    this.#state = "registering"
    peer.expose(
      DARK_DECLARATION_PROJECTION_METHOD,
      async (params) => await this.readDeclarationProjection(params),
    )
    this.#metaJSON.onServerStarted(peer)
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
    return Response.json(this.health())
  }

  health(): {
    ok: boolean
    domain: "dark"
    rpc: DarkMonadState
    error: string | null
  } {
    return {
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "dark",
      rpc: this.#state,
      error: this.#error,
    }
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
