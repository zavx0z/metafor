export abstract class ActorStore {
  declare id: number
  declare meta: string
  declare parent_id: number | null
  declare idx: number
  declare snapshot: string
  declare timestamp: string
}
export abstract class Store {
  abstract saveMetaIsNotExists(fingerprint: string): string
  abstract getMeta(meta: string): MetaRecord | null

  abstract saveActorIsNotExist(actor: Omit<ActorStore, "id" | "timestamp">): ActorStore
  /** Возвращает последнего созданного актора по meta (для вычисления parent_id) */
  abstract getActorByMeta(meta: string): ActorStore | null
  /** Обновляет snapshot существующего актора по id */
  abstract updateActorSnapshot(id: number, snapshot: string): void
  /** Получает актора по составному ключу (meta, parent_id, idx) без модификации */
  abstract getActorByComposite(meta: string, parent_id: number | null, idx: number): ActorStore | null
}
export interface MetaRecord {
  meta: string
  fingerprint: string
  timestamp: string
}
