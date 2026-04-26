/**
 * `@store/meta` — реляционное хранилище DSL-декларации меты.
 *
 * Корневой entry-point — **классы** ORM-уровня, каждая под-сущность
 * декларации представлена своим manager-классом (Django-style):
 * - `Meta` — главный инстанс, координирует все managers и скаляры
 * - `Fields` / `Superposition` / `Processes` / `Reactions` / `Matter` — managers
 *   с `.all() / .get(filter) / .count() / .exists()`.
 *
 * Backend-специфичные имплементации (низкоуровневые SQL-функции) — в subpath
 * `@store/meta/sqlite`. Классы используют их для чтения/записи.
 *
 * См. `store/meta/README.md` и `store/README.md` для архитектурных принципов.
 */

export { Meta } from "./meta.ts"
export { Fields, type FieldRecord } from "./fields.ts"
export { Superposition, type SuperpositionStateRecord } from "./superposition.ts"
export { Processes, type ProcessRecord } from "./processes.ts"
export { Reactions, type ReactionRecord } from "./reactions.ts"
export { Matter } from "./matter.ts"
