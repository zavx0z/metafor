/**
 * `@store/meta` — реляционное хранилище DSL-декларации меты.
 *
 * 33 таблицы DSL-relational в 6 группах: meta + fields + superposition +
 * processes (action/finally) + reactions + matter.
 *
 * Корневой entry-point держит **общие типы** — без привязки к конкретному backend.
 * Backend-специфичные имплементации лежат в subpath:
 * - `@store/meta/sqlite` — bun-sqlite реализация
 * - `@store/meta/idb` — IndexedDB реализация (планируется)
 *
 * См. `store/meta/README.md` и `store/README.md` для архитектурных принципов.
 */

export type { DarkMetaParticleModel } from "./sqlite/read.t.ts"
