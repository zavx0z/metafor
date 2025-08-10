import type { MetaRecord, ActorStore } from "./index.t"
export type { ActorStore }

export class MetaClass implements MetaRecord {
  declare id: number
  declare meta: string
  declare fingerprint: string
  declare timestamp: string
}
