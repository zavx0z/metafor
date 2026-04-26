import type { DarkMetaParticleModel } from "@store/meta/sqlite"
import type { Database } from "bun:sqlite"
import type { MetaforStore } from "./index.t"
import type { MetaStoreOrm } from "./meta/meta.t"
import type { MetaDSL } from "../metafor.t.ts"

export interface OpenServerStoreOptions {
  /**
   * Путь к SQLite-файлу. По умолчанию `:memory:`.
   *
   * Все три слоя (meta DSL-relational, view, actor) живут в одной Database
   * с разделением через префиксы имён таблиц: `meta_*`, `view_*`, `actor_*`,
   * + DSL-relational meta-таблицы (без префикса).
   */
  filename?: string
}

export interface ServerMetaStoreOrm extends MetaStoreOrm {
  readonly database: Database
  create(src: string, meta: MetaDSL): void
  model(src: string): DarkMetaParticleModel
}

export interface ServerMetaforStore extends MetaforStore {
  meta: ServerMetaStoreOrm
}
