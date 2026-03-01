import type { JsonPatch, Initiator } from "./em.t"

/**
 * Масса атома — мера взаимодействия со средой исполнения
 *
 * Масса накапливается в процессе исполнения и определяет локализацию процесса:
 * - Зависимости от среды (WebSocket, DOM, Database API)
 * - Временные структуры данных для вычислений
 * - Кэши, актуальные только в runtime
 * - Общие ресурсы в иерархии акторов
 *
 * Масса не сериализуется в Boundary — она проявляется только в Volume.
 *
 * @example
 * ```typescript
 * const mass: Mass = {
 *   socket: null as WebSocket | null,
 *   cache: new Map(),
 * }
 * ```
 */
export type Mass = Record<string, any>
// Тип для snapshot атомов

export type AtomPayload = {
  path: string
  state: string
  fields: Record<string, any>
}

export type ImpulsesChunk = {
  impulses: JsonPatch[]
  timestamp: number
  initiator: Initiator
  atom: string
}
