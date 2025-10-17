import type { JsonPatch } from "./electromagnetic.t"

export type Key = Uint8Array

export interface Topology {
  /** Родительский id или null для корня (управляет внешняя логика) */
  parent: string | null
  /** Лексикографический order-ключ (опционально). Генерирует gravity. */
  orderKey?: Key
  /** Последовательный номер для детерминированности при одинаковых ключах */
  seq: number
}

/* -------------------------
   Сигнатуры событий
   ------------------------- */
export type Payloads = {
  create: { id: string }
  remove: { id: string }
  topologyChanged: { id: string; prev?: Topology; next: Topology | null }
}

export type EventName = keyof Payloads
export type Listener<E extends EventName> = (payload: Payloads[E]) => void

export type HistoryEntry = { forward: JsonPatch[]; inverse: JsonPatch[] }
