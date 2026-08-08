import {
  BOUNDARY_INITIAL_STATE_METHOD,
  type BoundaryInitialState,
} from "@metafor/types/boundary/initial"
import type {OracleRpcPeer} from "shared/transport/oracle"
import type {DomainHealth} from "shared/protocol/oracle/health"
import {weak$} from "@matrix/weak"
import {prepareMatrixBirth} from "./birth.ts"

export type MatrixOracleState = "created" | "preparing" | "prepared" | "ready" | "error" | "stopped"

/**
 * Управляет рождением и наблюдаемым состоянием службы Matrix.
 *
 * До открытия причинного канала класс читает единственный начальный снимок
 * Boundary и подготавливает Weak. После рождения проверка состояния объединяет
 * состояние RPC и сохранённый отказ Weak; неисправный WebGPU не выдаётся за
 * готовую Matrix.
 *
 * @see [Подготовка до рождения и публикация отказа Weak](https://github.com/zavx0z/metafor/blob/main/matrix/oracle.spec.ts#L20-L54)
 */
export class MatrixOracle {
  #state: MatrixOracleState = "created"
  #error: string | null = null

  async onServerStarted(peer: OracleRpcPeer): Promise<{atoms: number; fields: number; backend: string}> {
    if (this.#state !== "created") throw new Error(`Matrix Oracle cannot prepare from state: ${this.#state}`)
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
    return Response.json(this.health())
  }

  health(): DomainHealth {
    const runtimeError = weak$.runtime?.fault() ?? null
    return {
      ok: this.#state !== "error" && this.#state !== "stopped" && runtimeError === null,
      domain: "matrix",
      backend: weak$.mode,
      initialized: this.#state === "ready" && weak$.initialized && runtimeError === null,
      rpc: this.#state,
      error: this.#error ?? runtimeError,
    }
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
