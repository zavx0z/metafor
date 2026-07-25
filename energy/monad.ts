import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  type BoundaryInitialProjection,
  type BoundaryInitialProjectionEntry,
} from "@metafor/types/boundary/initial"
import type {MonadRpcPeer} from "shared/transport/monad"
import {EnergyCatalogStore} from "./catalog.ts"

export type EnergyMonadState = "created" | "loading" | "prepared" | "ready" | "error" | "stopped"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isInitialProjection = (value: unknown): value is BoundaryInitialProjection =>
  isRecord(value) && value.version === 1 && Array.isArray(value.entries)

const particle = (entry: BoundaryInitialProjectionEntry) => ({...structuredClone(entry), ts: 0})

/** Energy service layer: hydrates one local catalog before its Force runtime is born. */
export class EnergyMonad {
  readonly catalog = new EnergyCatalogStore()
  #state: EnergyMonadState = "created"
  #error: string | null = null
  #fenced = new Set<string>()

  async onServerStarted(peer: Pick<MonadRpcPeer, "call"> & Partial<Pick<MonadRpcPeer, "expose">>): Promise<{
    atoms: number
    topologies: number
    fields: number
    variants: number
    processes: number
    continuations: number
  }> {
    if (this.#state !== "created") throw new Error(`Energy Monad cannot start from state: ${this.#state}`)
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
      peer.expose?.("energy.mass.fence", async (request: unknown) => {
        if (!isRecord(request) || !Number.isSafeInteger(request.atom) || !Number.isSafeInteger(request.declaration) || typeof request.key !== "string") throw new Error("Invalid Mass fence request")
        const artifact = this.catalog.mass(Number(request.atom)).find((entry) => entry.id === Number(request.declaration) && entry.keyId === request.key)
        if (!artifact) throw new Error("Mass fence identity is stale")
        this.#fenced.add(`${request.atom}\0${request.declaration}\0${request.key}`)
        return {ok: true}
      })
      peer.expose?.("energy.mass.release", async (request: unknown) => {
        if (!isRecord(request) || !Number.isSafeInteger(request.atom) || !Number.isSafeInteger(request.declaration) || typeof request.key !== "string") throw new Error("Invalid Mass release request")
        this.#fenced.delete(`${request.atom}\0${request.declaration}\0${request.key}`)
        return {ok: true}
      })
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
    return Response.json({
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "energy",
      initialized: this.#state === "ready",
      rpc: this.#state,
      error: this.#error,
    })
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
