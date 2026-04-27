/**
 * Bun-sqlite реализация meta-стора.
 *
 * Функциональный API: каждая операция — функция, первым аргументом принимающая
 * `SQL`. Открытие БД и применение схемы — ответственность caller-а
 * (см. `store/server.ts`), потому что одна SQL держит таблицы обоих
 * пакетов (meta + actor).
 *
 * Симметрично с `@store/actor/sqlite`.
 */

import type { SQL } from "bun"
import { create as writeMetaToDsl, metaforDslSchemaSql } from "./sqlite.ts"
import type { MetaDSL } from "../../../metafor.t.ts"

/** Полный DDL meta-DSL-relational схемы (33 таблицы + индексы). Применяется к открытой SQL. */
export const metaSchemaSql: string = metaforDslSchemaSql

/**
 * Записывает MetaDSL в DSL-relational схему по `src`.
 * Идемпотентно: DELETE-then-INSERT, каскад FK снимет старое дерево.
 */
export const metaCreate = async (sql: SQL, src: string, dsl: MetaDSL): Promise<void> => {
  await sql`DELETE FROM meta WHERE src = ${src}`
  await writeMetaToDsl(sql, dsl, src)
}

/** Удаляет meta по `src`. Каскад FK снимет всё дерево декларации. */
export const metaDelete = async (sql: SQL, src: string): Promise<void> => {
  await sql`DELETE FROM meta WHERE src = ${src}`
}

// Per-entity get-функции — для bulk-чтения декларации (read-проекции, dark-runtime).
// ORM-классы используют их выборочно (Matter — целиком, Field/State/Process/Reaction — нет).
export { getMetaRow, getMass, hasProcesses, hasReactions, hasMatter } from "./meta.G.ts"
export { getMatterParticles } from "./matter.G.ts"

// Dark-specific projection: собирает всю декларацию в один объект формы
// `{ meta: MetaInit, particles: MatterParticlePlan[] }` — нужен runtime-слою dark
// (dark/dark.ts:matterMeta) где meta загружается одним вызовом.
export { readDarkParticleModel } from "./read.ts"
export type { DarkMetaParticleModel } from "./read.t.ts"

// ORM-классы (Django-style). Корневой entry-point `@store/meta` re-export-ит их.
export { Meta } from "./meta.ts"
export { ArrayField, BooleanField, EnumField, Field, Fields, NumberField, StringField } from "./fields.ts"
export type { AnyField, FieldType } from "./fields.ts"
export { State, Superposition } from "./superposition.ts"
export { Process, Processes } from "./process.ts"
export { Reaction, Reactions } from "./reactions.ts"
export { Matter } from "./matter.ts"
