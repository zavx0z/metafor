import type {OracleRpcPeer} from "shared/transport/oracle"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {
  DARK_DECLARATION_PROJECTION_METHOD,
  readDarkDeclarationProjection,
  type DarkGraphTemplate,
} from "./graph.ts"
import {GraphOracle} from "./oracle/graph.ts"
import type {DarkForceTimeControl} from "./time-control.ts"
import {
  META_CAPABILITIES_READ_METHOD,
  META_CREATE_METHOD,
  META_DECLARATION_APPLY_METHOD,
  META_MATTER_APPLY_METHOD,
  META_SOURCE_REVISION_READ_METHOD,
} from "@metafor/types/metafor/authoring"
import type {MatterAuthoringService} from "./oracle/matter.ts"
import type {DeclarationAuthoringService} from "./oracle/declaration.ts"
import type {MetaCreateService} from "./oracle/create.ts"
import type {MetaAuthoringRegistry} from "./oracle/registry.ts"
import {DARK_FORCE_HISTORY_READ_METHOD} from "@metafor/types/metafor/observation"
import type {DarkForceHistoryReadService} from "./oracle/history.ts"
import {
  META_FIELD_VALUE_APPLY_METHOD,
  META_PROCESS_EXECUTION_READ_METHOD,
  type MetaRuntimeRpcService,
} from "./oracle/runtime.ts"

export type DarkOracleState = "created" | "registering" | "ready" | "error" | "stopped"

type DeclarationProjectionReader = (params: unknown) => Promise<DarkGraphTemplate>

export interface DarkMetaAuthoringRpc {
  registry: Pick<MetaAuthoringRegistry, "readCapabilities" | "readSourceRevisions">
  create: Pick<MetaCreateService, "create">
  matter: Pick<MatterAuthoringService, "apply">
  declaration: Pick<DeclarationAuthoringService, "apply">
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
export class DarkOracle {
  #state: DarkOracleState = "created"
  #error: string | null = null
  readonly #graph = new GraphOracle()
  #timeControl: DarkForceTimeControl | null = null
  #authoring: DarkMetaAuthoringRpc | null = null
  #history: Pick<DarkForceHistoryReadService, "read"> | null = null
  #runtime: Pick<MetaRuntimeRpcService, "applyFieldValue" | "readProcessExecution"> | null = null

  constructor(
    private readonly readDeclarationProjection: DeclarationProjectionReader = readDarkDeclarationProjection,
  ) {}

  /** Installed by the local runtime after Force exists; Oracle never mutates it directly. */
  setTimeControl(control: DarkForceTimeControl): void {
    if (this.#timeControl) throw new Error("Dark Oracle time control is already installed")
    this.#timeControl = control
  }

  setAuthoring(services: DarkMetaAuthoringRpc): void {
    if (this.#state !== "created" || this.#authoring) {
      throw new Error("Dark Oracle authoring RPC is already installed or RPC registration has started")
    }
    this.#authoring = services
  }

  setHistory(service: Pick<DarkForceHistoryReadService, "read">): void {
    if (this.#state !== "created" || this.#history) {
      throw new Error("Dark Oracle history RPC is already installed or RPC registration has started")
    }
    this.#history = service
  }

  setRuntime(service: Pick<MetaRuntimeRpcService, "applyFieldValue" | "readProcessExecution">): void {
    if (this.#state !== "created" || this.#runtime) {
      throw new Error("Dark Oracle runtime RPC is already installed or RPC registration has started")
    }
    this.#runtime = service
  }

  onServerStarted(peer: OracleRpcPeer): void {
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
    if (this.#history) {
      peer.expose(
        DARK_FORCE_HISTORY_READ_METHOD,
        async (params) => this.#history!.read(params),
      )
    }
    if (this.#runtime) {
      peer.expose(
        META_FIELD_VALUE_APPLY_METHOD,
        async (params) => await this.#runtime!.applyFieldValue(params),
      )
      peer.expose(
        META_PROCESS_EXECUTION_READ_METHOD,
        async (params) => await this.#runtime!.readProcessExecution(params),
      )
    }
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
      peer.expose(
        META_DECLARATION_APPLY_METHOD,
        async (params, context) => await this.#authoring!.declaration.apply(params, context.source),
      )
    }
    this.#graph.onServerStarted(peer)
  }

  onChannelOpened(): void {
    if (this.#state !== "registering") throw new Error(`Dark Oracle channel cannot open from state: ${this.#state}`)
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
    rpc: DarkOracleState
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
