import type {OracleRpcPeer} from "shared/transport/oracle"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {
  DARK_DECLARATION_PROJECTION_METHOD,
  readDarkDeclarationProjection,
  type DarkGraphTemplate,
} from "./graph/declaration.ts"
import {GraphOracle} from "./graph/oracle.ts"
import type {DarkForceTimeControl} from "./time-control.ts"
import type {CheckpointBarrierFrontier} from "./checkpoint/barrier.ts"
import {
  META_CAPABILITIES_READ_METHOD,
  META_CREATE_METHOD,
  META_DECLARATION_APPLY_METHOD,
  META_MATTER_APPLY_METHOD,
  META_SOURCE_REVISION_READ_METHOD,
} from "shared/protocol/metafor/authoring"
import type {MatterAuthoringService} from "./oracle/matter.ts"
import type {DeclarationAuthoringService} from "./oracle/declaration.ts"
import type {MetaCreateService} from "./oracle/create.ts"
import type {MetaAuthoringRegistry} from "./oracle/registry.ts"
import {DARK_FORCE_HISTORY_READ_METHOD} from "shared/protocol/metafor/observation"
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
Serializes Oracle mutation admission against causal Graph reads and explicit
pause. Closing the gate is synchronous; already running mutations drain before
the owner enters its held operation, while later mutations fail before their
provider is invoked.
*/
export class DarkOracleMutationGate {
  #active = 0
  #closed = false
  readonly #idleWaiters = new Set<() => void>()

  /** Runs one admitted mutation and contributes it to the active drain set. */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closed) {
      throw new Error("Dark Oracle mutation admission is held by causal time")
    }
    this.#active++
    try {
      return await operation()
    } finally {
      this.#active--
      if (this.#active === 0) {
        for (const resolve of this.#idleWaiters) resolve()
        this.#idleWaiters.clear()
      }
    }
  }

  /**
  Closes new mutation admission and waits for every previously admitted
  mutation. The returned release function owns exactly this hold.
  */
  async acquire(): Promise<() => void> {
    if (this.#closed) throw new Error("Dark Oracle mutation admission is already held")
    this.#closed = true
    await this.#idle()
    let released = false
    return () => {
      if (released) throw new Error("Dark Oracle mutation admission hold is already released")
      released = true
      this.#closed = false
    }
  }

  /**
  Holds mutation admission for the full lifetime of one causal operation.

  @param operation - Provider work that must not overlap a new Oracle mutation.
  @returns Result after the gate is reopened in `finally`.

  @example
  ```ts
  const graph = await gate.withClosedAdmission(async () => await readGraph())
  ```
  */
  async withClosedAdmission<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await operation()
    } finally {
      release()
    }
  }

  async #idle(): Promise<void> {
    if (this.#active === 0) return
    await new Promise<void>((resolve) => this.#idleWaiters.add(resolve))
  }
}

/**
 * Owns Dark service RPC and causal time control without exposing Particle
 * history persistence or accepting world mutations directly.
 */
export class DarkOracle {
  #state: DarkOracleState = "created"
  #error: string | null = null
  readonly #graph = new GraphOracle()
  readonly #mutations = new DarkOracleMutationGate()
  #timeControl: DarkForceTimeControl | null = null
  #pauseMutationRelease: (() => void) | null = null
  #authoring: DarkMetaAuthoringRpc | null = null
  #history: Pick<DarkForceHistoryReadService, "read"> | null = null
  #runtime: Pick<MetaRuntimeRpcService, "applyFieldValue" | "readProcessExecution"> | null = null

  constructor(
    private readonly readDeclarationProjection: DeclarationProjectionReader = readDarkDeclarationProjection,
  ) {}

  /** Installed by the local runtime after Force exists; Oracle never mutates it directly. */
  setTimeControl(control: DarkForceTimeControl): void {
    if (this.#state !== "created" || this.#timeControl) {
      throw new Error("Dark Oracle time control is already installed or RPC registration has started")
    }
    this.#timeControl = control
    const mutations = this.#mutations
    const oracle = this
    this.#graph.setCausalTime({
      async readAtExactFrontier<T>(
        reader: (frontier: CheckpointBarrierFrontier) => Promise<T>,
      ): Promise<T> {
        if (oracle.#pauseMutationRelease) {
          return await control.readAtExactFrontier(reader)
        }
        return await mutations.withClosedAdmission(
          async () => await control.readAtExactFrontier(reader),
        )
      },
    })
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
      async () => {
        const release = await this.#mutations.acquire()
        try {
          const frame = await this.#timeControlOrThrow().pauseExternalAdmission()
          this.#pauseMutationRelease = release
          return frame
        } catch (error) {
          release()
          throw error
        }
      },
    )
    peer.expose(DARK_FORCE_STEP_METHOD, async (params) => {
      const result = await this.#timeControlOrThrow().stepAgentParticle(forceMessageInput(params))
      return structuredClone(result)
    })
    peer.expose(DARK_FORCE_RESUME_METHOD, async () => {
      this.#timeControlOrThrow().resumeExternalAdmission()
      const release = this.#pauseMutationRelease
      if (!release) throw new Error("Dark Oracle pause has no mutation admission hold")
      this.#pauseMutationRelease = null
      release()
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
        async (params) => await this.#mutations.run(
          async () => await this.#runtime!.applyFieldValue(params),
        ),
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
        async (params, context) => await this.#mutations.run(
          async () => await this.#authoring!.create.create(params, context.source),
        ),
      )
      peer.expose(
        META_MATTER_APPLY_METHOD,
        async (params, context) => await this.#mutations.run(
          async () => await this.#authoring!.matter.apply(params, context.source),
        ),
      )
      peer.expose(
        META_DECLARATION_APPLY_METHOD,
        async (params, context) => await this.#mutations.run(
          async () => await this.#authoring!.declaration.apply(params, context.source),
        ),
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
    this.#pauseMutationRelease?.()
    this.#pauseMutationRelease = null
    this.#state = "stopped"
  }

  #timeControlOrThrow(): DarkForceTimeControl {
    if (!this.#timeControl) throw new Error("Dark Force time control is unavailable")
    return this.#timeControl
  }
}
