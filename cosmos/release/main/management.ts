import {RELEASE_MANAGEMENT_PATH, type ReleaseManagementClient, type ReleaseManagementSnapshot} from "../shared/management"

/**
Same-origin capability для visual Settings. Не сохраняет credentials или
selection paths, не повторяет POST после разрыва; receipt читается отдельно.
*/
export function createReleaseManagementClient(): ReleaseManagementClient {
  return {
    async read(signal) {
      const response = await fetch(RELEASE_MANAGEMENT_PATH, {signal, cache: "no-store", redirect: "error"})
      if (!response.ok) throw new Error("Состояние выпуска недоступно")
      const value = await response.json() as ReleaseManagementSnapshot
      if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.candidates))
        throw new Error("Сервер вернул неизвестное состояние выпуска")
      return value
    },
    async request(input, signal) {
      const response = await fetch(RELEASE_MANAGEMENT_PATH, {method: "POST", signal, redirect: "error",
        headers: {"content-type": "application/json"}, body: JSON.stringify(input)})
      const value = await response.json().catch(() => null)
      if (!response.ok) {
        const error = typeof value?.error === "string" ? value.error : "Переключение не принято"
        if (response.status >= 400 && response.status < 500) return {operationId: input.operationId, state: "rejected", error}
        throw new Error(error)
      }
      if (response.status !== 202 || value?.operationId !== input.operationId || value?.state !== "accepted")
        throw new Error("Сервер не подтвердил приём намерения")
      return {operationId: input.operationId, state: "accepted"}
    },
  }
}
