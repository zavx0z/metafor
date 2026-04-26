/**
 * `@store/meta` — реляционное хранилище DSL-декларации меты.
 *
 * Корневой entry-point — **классы** ORM-уровня, каждая под-сущность
 * декларации представлена своим manager-классом (Django-style):
 * - `Meta` — главный инстанс, координирует все managers и скаляры
 * - `Fields` / `Superposition` / `Processes` / `Reactions` / `Matter` — managers
 *   с `.all() / .get(filter) / .count() / .exists()`, возвращают инстансы:
 *   `Field`, `State`, `Process`, `Reaction` и `MatterParticlePlan` соответственно.
 *
 * Backend-специфичные имплементации (низкоуровневые SQL-функции) — в subpath
 * `@store/meta/sqlite`. Классы используют их для чтения/записи.
 *
 * См. `store/meta/README.md` и `store/README.md` для архитектурных принципов.
 */

export { Meta } from "./meta.ts"
export { Field, Fields } from "./fields.ts"
export { State, Superposition } from "./superposition.ts"
export { Process, Processes } from "./processes.ts"
export { Reaction, Reactions } from "./reactions.ts"
export { Matter } from "./matter.ts"
