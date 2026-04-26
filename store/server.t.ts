import type { Database } from "bun:sqlite"
import type { ActorBackend } from "@store/actor"
import type { DarkMetaParticleModel } from "@store/meta/sqlite"
import type { MetaDSL } from "../metafor.t.ts"

export interface OpenServerStoreOptions {
  /** Путь к SQLite-файлу. По умолчанию `:memory:`. */
  filename?: string
}

export interface ServerMetaApi {
  /** Записывает MetaDSL в DSL-relational схему по `src` (33 таблицы, идемпотентно через DELETE+INSERT). */
  write(src: string, meta: MetaDSL): void
  /** Читает meta из DSL-relational схемы и собирает runtime-модель для dark-слоя. */
  read(src: string): DarkMetaParticleModel
}

export interface ServerStore {
  readonly database: Database
  readonly meta: ServerMetaApi
  readonly actor: ActorBackend
  close(): Promise<void>
}
