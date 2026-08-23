import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  type BoundaryInitialProjection,
  type BoundaryInitialProjectionEntry,
} from "@metafor/types/boundary/initial"
import type {OracleRpcPeer} from "shared/transport/oracle"
import type {DomainHealth} from "shared/protocol/oracle/health"
import {EnergyCatalogStore} from "./catalog.ts"
import {
  createFilesystemEnergyMassStore,
  EnergyMassCatalog,
  EnergyMassGate,
} from "./mass.ts"
import {
  DARK_FORCE_HISTORY_READ_METHOD,
  ENERGY_MASS_RESULT_READ_METHOD,
  META_OBSERVATION_CONTRACT_VERSION,
  type DarkForceHistoryReadReceipt,
} from "@metafor/types/metafor/observation"
import {EnergyMassResultReadService} from "./oracle/mass-result.ts"

export type EnergyOracleState = "created" | "loading" | "prepared" | "ready" | "error" | "stopped"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isInitialProjection = (value: unknown): value is BoundaryInitialProjection =>
  isRecord(value) && value.version === 1 && Array.isArray(value.entries)

const particle = (entry: BoundaryInitialProjectionEntry) => ({...structuredClone(entry), ts: 0})

/** Energy service layer: hydrates one local catalog before its Force runtime is born. */
export class EnergyOracle {
  readonly catalog = new EnergyCatalogStore()
  readonly massGate = new EnergyMassGate()
  readonly massCatalog = new EnergyMassCatalog()
  readonly massStore = createFilesystemEnergyMassStore(this.massGate, this.massCatalog)
  #state: EnergyOracleState = "created"
  #error: string | null = null

  /** Register public Mass result read and internal lifecycle methods before advertising them. */
  onServerStarting(peer: Pick<OracleRpcPeer, "expose" | "call">): void {
    const massResults = new EnergyMassResultReadService(
      this.catalog,
      this.massCatalog,
      this.massGate,
      async () => await peer.call<DarkForceHistoryReadReceipt>(
        "dark",
        DARK_FORCE_HISTORY_READ_METHOD,
        {contractVersion: META_OBSERVATION_CONTRACT_VERSION, query: {kind: "frontier"}},
      ),
    )
    peer.expose(
      ENERGY_MASS_RESULT_READ_METHOD,
      async (request: unknown) => await massResults.read(request),
    )
    peer.expose("energy.mass.fence", async (request: unknown) => {
      const identity = this.massIdentity(request)
      const artifact = this.catalog.mass(identity.atom).find((entry) =>
        entry.id === identity.declaration && entry.keyId === identity.key,
      )
      if (!artifact) throw new Error("Mass fence identity is stale")
      this.massGate.fence(identity.atom, identity.declaration, identity.key)
      return {ok: true}
    })
    peer.expose("energy.mass.release", async (request: unknown) => {
      const identity = this.massIdentity(request)
      this.massGate.release(identity.atom, identity.declaration, identity.key)
      return {ok: true}
    })
  }

  private massIdentity(request: unknown): {atom: number; declaration: number; key: string} {
    if (!isRecord(request) || !Number.isSafeInteger(request.atom) || !Number.isSafeInteger(request.declaration) || typeof request.key !== "string") {
      throw new Error("Invalid Mass fence request")
    }
    return {atom: Number(request.atom), declaration: Number(request.declaration), key: request.key}
  }

  async onServerStarted(peer: Pick<OracleRpcPeer, "call"> & Partial<Pick<OracleRpcPeer, "expose">>): Promise<{
    atoms: number
    topologies: number
    fields: number
    variants: number
    processes: number
    continuations: number
  }> {
    if (this.#state !== "created") throw new Error(`Energy Oracle cannot start from state: ${this.#state}`)
    this.#state = "loading"
    try {
      const initial = await peer.call<BoundaryInitialProjection>(
        "boundary",
        BOUNDARY_INITIAL_PROJECTION_METHOD,
        {},
        {waitMs: 30_000},
      )
      if (!isInitialProjection(initial)) throw new Error("Boundary returned an invalid initial Energy projection")
      for (const entry of initial.entries) this.catalog.apply(particle(entry))
      for (const atom of this.catalog.atoms.values()) {
        this.massStore.authorize?.(
          {energyId: "energy-local", atomId: atom.id, wimp: atom.wimp, state: ""},
          this.catalog.mass(atom.id),
        )
      }
      this.#state = "prepared"
      return {
        atoms: this.catalog.atoms.size,
        topologies: this.catalog.topologies.size,
        fields: this.catalog.fields.size,
        variants: this.catalog.variants.size,
        processes: this.catalog.processes.size,
        continuations: this.catalog.continuations.size,
      }
    } catch (error) {
      this.onRuntimeBirthFailed(error)
      throw error
    }
  }

  onRuntimeBorn(): void {
    if (this.#state !== "prepared") throw new Error(`Energy runtime cannot be born from state: ${this.#state}`)
    this.#state = "ready"
  }

  onRuntimeBirthFailed(error: unknown): void {
    if (this.#state === "error") return
    this.#error = error instanceof Error ? error.message : String(error)
    this.#state = "error"
  }

  onHealthRequested(): Response {
    return Response.json(this.health())
  }

  health(): DomainHealth {
    return {
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "energy",
      initialized: this.#state === "ready",
      rpc: this.#state,
      error: this.#error,
    }
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
