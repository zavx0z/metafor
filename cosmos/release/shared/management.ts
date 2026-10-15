/** Browser-проекция управления installed Release без host paths и credentials. */
export interface ReleaseManagementSnapshot {
  readonly schemaVersion: 1
  readonly active: {readonly digest: string; readonly version: string} | null
  readonly revision: number
  readonly candidates: readonly {
    readonly digest: string
    readonly version: string
    readonly active: boolean
    readonly previousSuccessful: boolean
    readonly compatibilityLine: string | null
    readonly activate: {readonly allowed: boolean; readonly reason?: string}
    readonly downgrade: {readonly allowed: boolean; readonly reason?: string}
  }[]
  readonly operation: {
    readonly id: string
    readonly kind: "activate" | "downgrade"
    readonly target: string
    /** Unknown сохраняет принятое намерение без terminal receipt; timeout IPC не доказывает отказ startup. */
    readonly state: "accepted" | "unknown" | "running" | "complete" | "failed"
    readonly error?: string
  } | null
}

/** Одно явное намерение оператора. Потеря ответа разрешает только readback, не повтор эффекта. */
export interface ReleaseManagementRequest {
  readonly operationId: string
  readonly kind: "activate" | "downgrade"
  readonly target?: string
  readonly expected: {readonly digest: string | null; readonly revision: number}
}

/** Visual получает capability от Release и не создаёт transport или отдельный Document. */
export interface ReleaseManagementClient {
  read(signal: AbortSignal): Promise<ReleaseManagementSnapshot>
  request(input: ReleaseManagementRequest, signal: AbortSignal): Promise<
    {operationId: string; state: "accepted"} | {operationId: string; state: "rejected"; error: string}
  >
}

export const RELEASE_MANAGEMENT_PATH = "/release/manage"
