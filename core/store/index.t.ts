export abstract class ActorStore {
  declare id: number
  declare meta_tag: string
  declare parent_id: number | null
  declare idx: number
  declare snapshot: string
  declare timestamp: string
}
export abstract class Store {
  abstract saveMetaIsNotExists(fingerprint: string): string
  abstract getMeta(tag: string): MetaRecord | null

  abstract saveActorIsNotExist(actor: Omit<ActorStore, "id" | "timestamp">): ActorStore
}
export interface MetaRecord {
  tag: string
  fingerprint: string
  timestamp: string
}
