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
import type { MetaDSL } from "../../../metafor.t.ts"

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

/** Удаляет meta по `src`. Каскад FK снимет всё дерево декларации. */
export const metaDelete = (db: Database, src: string): void => {
  db.prepare(`DELETE FROM meta WHERE src = ?`).run(src)
}

// Per-entity get-функции — для ленивых getter-ов ORM-инстансов.
// Каждая возвращает соответствующую секцию декларации.
export { getMetaRow, getMass, hasProcesses, hasReactions, hasMatter } from "./meta.G.ts"
export { getFields } from "./fields.G.ts"
export { getSuperposition } from "./superposition.G.ts"
export { getProcesses } from "./process.G.ts"
export { getReactions } from "./reactions.G.ts"
export { getMatterParticles } from "./matter.G.ts"

// Dark-specific projection: собирает всю декларацию в один объект формы
// `{ meta: MetaInit, particles: MatterParticlePlan[] }` — нужен runtime-слою dark
// (dark/dark.ts:matterMeta) где meta загружается одним вызовом.
export { readDarkParticleModel } from "./read.ts"
export type { DarkMetaParticleModel } from "./read.t.ts"
