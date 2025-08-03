import { Database } from "bun:sqlite"
import createMetaTableQuery from "./query/create.sql"
import type { Message } from "../../core/message"

export class Store {
  #db: Database

  constructor() {
    this.#db = new Database("store.sqlite")
    this.#db.exec(createMetaTableQuery)
  }
  setSnapshot(message: Message) {
    this.#db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run(message.meta.tag, message.patch)
  }
  getSnapshot(key: string) {
    return this.#db.prepare("SELECT value FROM meta WHERE key = ?").get(key)
  }
}
