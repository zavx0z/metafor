/**
 * Ядро атома - объект для хранения сложных данных
 *
 * Используется для хранения данных, которые не подходят для контекста:
 * - Сложные объекты и структуры данных
 * - Кэшированные результаты вычислений
 * - Внешние ресурсы (DOM элементы, WebSocket соединения)
 * - Состояние, которое не влияет на UI напрямую
 *
 * @example
 * ```typescript
 * const core: Core = {
 *   users: [],
 *   cache: new Map(),
 * }
 * ```
 */

import type { JsonPatch, Initiator } from "./em.t"

export type Core = Record<string, any>
// Тип для snapshot атомов

export type AtomSnapshot = {
  path: string
  state: string
  context: Record<string, any>
}

export type ChunkPatches = {
  patches: JsonPatch[]
  timestamp: number
  initiator: Initiator
  atom: string
}
