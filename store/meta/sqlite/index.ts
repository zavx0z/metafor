/**
 * Bun-sqlite реализация meta-стора.
 *
 * Функциональный API: каждая операция — функция, первым аргументом принимающая
 * `Database`. Открытие БД и применение схемы — ответственность caller-а
 * (см. `store/server.ts`), потому что одна Database держит таблицы обоих
 * пакетов (meta + actor).
 *
 * Симметрично с `@store/actor/sqlite`.
 */

import type { Database } from "bun:sqlite"
import { create as writeMetaToDsl, metaforDslSchemaSql } from "./sqlite.ts"
import { readDarkParticleModel } from "./read.ts"
import type { MetaDSL } from "../../../metafor.t.ts"
import type { DarkMetaParticleModel } from "./read.t.ts"

/** Полный DDL meta-DSL-relational схемы (33 таблицы + индексы). Применяется к открытой Database. */
export const metaSchemaSql: string = metaforDslSchemaSql

/**
 * Записывает MetaDSL в DSL-relational схему по `src`.
 * Идемпотентно: DELETE-then-INSERT, каскад FK снимет старое дерево.
 */
export const metaCreate = (db: Database, src: string, dsl: MetaDSL): void => {
  db.prepare(`DELETE FROM meta WHERE src = ?`).run(src)
  writeMetaToDsl(db, dsl, src)
}

/** Читает meta из DSL-relational и собирает runtime-модель. `null`, если меты нет. */
export const metaGet = (db: Database, src: string): DarkMetaParticleModel | null =>
  readDarkParticleModel(db, src)

/** Удаляет meta по `src`. Каскад FK снимет всё дерево декларации. */
export const metaDelete = (db: Database, src: string): void => {
  db.prepare(`DELETE FROM meta WHERE src = ?`).run(src)
}
