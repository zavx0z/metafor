import SparkMD5 from "spark-md5"
import type { Store } from "../core/store/index.t"
import type { ActorStore } from "../core/store/index.t"

export class IndexedDBActorStore implements ActorStore {
  id: number = 0
  meta: string = ""
  parent_id: number | null = null
  idx: number = 0
  key: string | null = null
  snapshot: string = ""
  timestamp: string = ""
}

export class IndexedDBStore implements Store {
  saveMetaIsNotExists(fingerprint: string) {
    const meta = SparkMD5.hash(fingerprint)
    const metaRecord = this.getMeta(meta)
    if (metaRecord) return meta
    return meta
  }

  getMeta(meta: string) {
    // TODO: реализовать получение метаданных из IndexedDB
    return null
  }

  saveActorIsNotExist(actor: Omit<ActorStore, "timestamp" | "id">) {
    // TODO: реализовать получение/создание актора в IndexedDB
    const rec = new IndexedDBActorStore()
    rec.meta = actor.meta
    rec.parent_id = actor.parent_id
    rec.idx = actor.idx
    ;(rec as any).key = (actor as any).key ?? null
    rec.snapshot = actor.snapshot
    return rec
  }

  updateActorSnapshot(id: number, snapshot: string): void {
    // TODO: реализовать обновление снапшота в IndexedDB
  }

  getActorByMeta(meta: string): ActorStore | null {
    // TODO: реализовать
    return null
  }

  getActorByComposite(meta: string, parent_id: number | null, idx: number): ActorStore | null {
    // TODO: реализовать
    return null
  }

  updateActorLocation(id: number, parent_id: number | null, idx: number): void {
    // TODO: реализовать перемещение записи в IndexedDB
  }

  getActorByKey(meta: string, parent_id: number | null, key: string): ActorStore | null {
    // TODO: реализовать
    return null
  }

  getActorByKeyAnyParent(meta: string, key: string): ActorStore | null {
    // TODO: реализовать
    return null
  }

  updateActorKey(id: number, key: string): void {
    // TODO: реализовать
  }

  constructor() {}
}
