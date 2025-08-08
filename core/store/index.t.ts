export abstract class ActorStore {
  declare id: number
  declare meta: string
  declare parent_id: number | null
  declare idx: number
  declare key: string | null
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
  /** Обновляет расположение актора (parent_id, idx) без изменения snapshot */
  abstract updateActorLocation(id: number, parent_id: number | null, idx: number): void
  /** Получает актора по ключу (meta, parent_id, key) */
  abstract getActorByKey(meta: string, parent_id: number | null, key: string): ActorStore | null
  /** Получает актора по ключу без учета родителя (meta, key), последний по id */
  abstract getActorByKeyAnyParent(meta: string, key: string): ActorStore | null
  /** Устанавливает/обновляет стабильный ключ актора */
  abstract updateActorKey(id: number, key: string): void
}
export interface MetaRecord {
  meta: string
  fingerprint: string
  timestamp: string
}
