import SparkMD5 from "spark-md5"
import type { Store } from "../core/store/index.t"
import type { ActorStore } from "../core/store/index.t"

export class IndexedDBActorStore implements ActorStore {
  id: number = 0
  meta_tag: string = ""
  parent_id: number | null = null
  idx: number = 0
  snapshot: string = ""
  timestamp: string = ""
}

export class IndexedDBStore implements Store {
  saveMetaIsNotExists(fingerprint: string) {
    const tag = SparkMD5.hash(fingerprint)
    const meta = this.getMeta(tag)
    if (meta) return tag
    return tag
  }

  getMeta(tag: string) {
    // TODO: реализовать получение метаданных из IndexedDB
    return null
  }

  saveActorIsNotExist(actor: Omit<ActorStore, "timestamp" | "id">) {
    // TODO: реализовать получение актора из IndexedDB
    return new IndexedDBActorStore()
  }

  constructor() {}
}
