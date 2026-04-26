import { Database } from "bun:sqlite"
import {
  actorRequiredBackendIndexes,
  type ActorBackend,
  type ActorBackendIndexSpec,
} from "../backend.t.ts"
import { initializeActorSqliteSchema, resetActorSqliteSchema } from "./schema.ts"
import { listChildActors, listRootActors, readActor, readActorRows } from "./actor.G.ts"
import { writeActorRows } from "./actor.C.ts"
import { deleteActor } from "./actor.D.ts"
import { readValue, readValueItems } from "./value.G.ts"
import { setValue, truncateValueItems, writeValueItem } from "./value.U.ts"
import { listValueOwners, readActorValue } from "./actor_value.G.ts"
import { forkValue, shareValue } from "./actor_value.U.ts"
import { readActorState } from "./state.G.ts"
import { setActorState } from "./state.U.ts"

export interface SqliteActorBackendOptions {
  filename?: string
  database?: Database
}

const isFileBacked = (filename: string): boolean => filename !== ":memory:"

/**
 * Bun-sqlite реализация {@link ActorBackend}.
 *
 * Собирает entity-операции (actor / value / actor_value / state) в единый объект.
 * Все вызовы — тонкие обёртки над функциями `*.{C,G,U,D}.ts`, принимающими `db: Database`.
 */
export const createSqliteActorBackend = (options: SqliteActorBackendOptions = {}): ActorBackend => {
  const owned = options.database === undefined
  const filename = options.filename ?? ":memory:"
  const db = options.database ?? new Database(filename, { strict: true, create: true })

  if (owned) {
    db.run("PRAGMA foreign_keys = ON;")
    if (isFileBacked(filename)) {
      db.run("PRAGMA journal_mode = WAL;")
      db.run("PRAGMA synchronous = NORMAL;")
      db.run("PRAGMA busy_timeout = 5000;")
    }
  }

  initializeActorSqliteSchema(db)

  return {
    requiredIndexes: actorRequiredBackendIndexes as readonly ActorBackendIndexSpec[],

    async close() {
      if (owned) db.close()
    },

    async reset() {
      resetActorSqliteSchema(db)
    },

    async flush() {
      // sqlite WAL — checkpoint оставляем владельцу Database
    },

    listRootActors: () => listRootActors(db),
    listChildActors: (parent) => listChildActors(db, parent),
    readActor: (uuid) => readActor(db, uuid),
    readActorRows: (uuid) => readActorRows(db, uuid),
    readActorState: (actor) => readActorState(db, actor),
    readActorValue: (actor, metaField) => readActorValue(db, actor, metaField),

    readValue: (uuid) => readValue(db, uuid),
    readValueItems: (value) => readValueItems(db, value),
    listValueOwners: (value) => listValueOwners(db, value),

    writeActorRows: (rows) => writeActorRows(db, rows),
    deleteActor: (uuid) => deleteActor(db, uuid),
    setValue: (uuid, scalar) => setValue(db, uuid, scalar),
    writeValueItem: (value, position, item) => writeValueItem(db, value, position, item),
    truncateValueItems: (value, fromPosition) => truncateValueItems(db, value, fromPosition),
    setActorState: (actor, metaState) => setActorState(db, actor, metaState),

    shareValue: (actor, metaField, value) => shareValue(db, actor, metaField, value),
    forkValue: (actor, metaField) => forkValue(db, actor, metaField),
  }
}
