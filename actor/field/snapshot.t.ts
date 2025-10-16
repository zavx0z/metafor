import type { JsonPatch } from "../force/electromagnetic.t"

export type HistoryEntry = { forward: JsonPatch[]; inverse: JsonPatch[] }
