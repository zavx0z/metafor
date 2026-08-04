import type {MonadRpcPeer} from "shared/transport/monad"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {
  DARK_DECLARATION_PROJECTION_METHOD,
  readDarkDeclarationProjection,
  type DarkGraphTemplate,
} from "./graph.ts"
import {GraphMonad} from "./monad/graph.ts"
import type {DarkForceTimeControl} from "./time-control.ts"
import {
  META_CAPABILITIES_READ_METHOD,
  META_CREATE_METHOD,
  META_MATTER_APPLY_METHOD,
  META_SOURCE_REVISION_READ_METHOD,
} from "@metafor/types/metafor/authoring"
import type {MatterAuthoringService} from "./monad/matter.ts"
import type {MetaCreateService} from "./monad/create.ts"
import type {MetaAuthoringRegistry} from "./monad/registry.ts"

export type DarkMonadState = "created" | "registering" | "ready" | "error" | "stopped"

type DeclarationProjectionReader = (params: unknown) => Promise<DarkGraphTemplate>

export interface DarkMetaAuthoringRpc {
  registry: Pick<MetaAuthoringRegistry, "readCapabilities" | "readSourceRevisions">
  create: Pick<MetaCreateService, "create">
  matter: Pick<MatterAuthoringService, "apply">
}

export const DARK_FORCE_PAUSE_METHOD = "dark.force.pause" as const
export const DARK_FORCE_STEP_METHOD = "dark.force.step" as const
export const DARK_FORCE_RESUME_METHOD = "dark.force.resume" as const
export const DARK_FORCE_STACK_METHOD = "dark.force.stack" as const

const forceMessageInput = (value: unknown): ForceMessageInput => {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as {parts?: unknown}).parts) ||
    (value as {parts: unknown[]}).parts.length !== 1 ||
    !(value as {parts: unknown[]}).parts[0] ||
    typeof (value as {parts: unknown[]}).parts[0] !== "object"
  ) {
    throw new Error("dark.force.step requires exactly one Force Particle input")
  }
  return structuredClone(value) as ForceMessageInput
}

/**
 * Owns Dark service RPC and causal time control without exposing Particle
 * history persistence or accepting world mutations directly.
 */
export class DarkMonad {
  #state: DarkMonadState = "created"
  #error: string | null = null
  readonly #graph = new GraphMonad()
  #timeControl: DarkForceTimeControl | null = null
  #authoring: DarkMetaAuthoringRpc | null = null

  constructor(
    private readonly readDeclarationProjection: DeclarationProjectionReader = readDarkDeclarationProjection,
  ) {}

  /** Installed by the local runtime after Force exists; Monad never mutates it directly. */
  setTimeControl(control: DarkForceTimeControl): void {
    if (this.#timeControl) throw new Error("Dark Monad time control is already installed")
    this.#timeControl = control
  }

  setAuthoring(services: DarkMetaAuthoringRpc): void {
    if (this.#state !== "created" || this.#authoring) {
      throw new Error("Dark Monad authoring RPC is already installed or RPC registration has started")
    }
    this.#authoring = services
  }

  onServerStarted(peer: MonadRpcPeer): void {
    if (this.#state !== "created") return
    this.#state = "registering"
    peer.expose(
      DARK_DECLARATION_PROJECTION_METHOD,
      async (params) => await this.readDeclarationProjection(params),
    )
    peer.expose(
      DARK_FORCE_PAUSE_METHOD,
      async () => await this.#timeControlOrThrow().pauseExternalAdmission(),
    )
    peer.expose(DARK_FORCE_STEP_METHOD, async (params) => {
      const result = await this.#timeControlOrThrow().stepAgentParticle(forceMessageInput(params))
      return structuredClone(result)
    })
    peer.expose(DARK_FORCE_RESUME_METHOD, async () => {
      this.#timeControlOrThrow().resumeExternalAdmission()
      return {ok: true}
    })
    peer.expose(
      DARK_FORCE_STACK_METHOD,
      async () => this.#timeControlOrThrow().pauseStack(),
    )
    if (this.#authoring) {
      peer.expose(
        META_CAPABILITIES_READ_METHOD,
        async (params, context) => this.#authoring!.registry.readCapabilities(params, context.source),
      )
      peer.expose(
        META_SOURCE_REVISION_READ_METHOD,
        async (params, context) => await this.#authoring!.registry.readSourceRevisions(params, context.source),
      )
      peer.expose(
        META_CREATE_METHOD,
        async (params, context) => await this.#authoring!.create.create(params, context.source),
      )
      peer.expose(
        META_MATTER_APPLY_METHOD,
        async (params, context) => await this.#authoring!.matter.apply(params, context.source),
      )
    }
    this.#graph.onServerStarted(peer)
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

  #timeControlOrThrow(): DarkForceTimeControl {
    if (!this.#timeControl) throw new Error("Dark Force time control is unavailable")
    return this.#timeControl
  }
}
