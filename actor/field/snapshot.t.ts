import type { Primitive } from "./array.t"
import type { Core } from "../force/gravity.t"

// Типы патчей
export type JsonPatch = { op: "add" | "remove" | "replace" | "move" | "test"; path: string; value?: any; from?: string }

// Тип для snapshot акторов
export type ActorSnapshot = {
  id: string
  path: string
  state: string
  context: Core
}

// История патчей
export type HistoryEntry = { forward: JsonPatch[]; inverse: JsonPatch[] }
