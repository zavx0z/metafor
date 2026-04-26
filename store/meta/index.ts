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
 * `@store/meta/sqlite`. Классы реализованы там же (рядом с C/G/D-помощниками)
 * и реэкспортируются отсюда без изменения публичного API.
 *
 * См. `store/meta/README.md` и `store/README.md` для архитектурных принципов.
 */

export {
  Meta,
  Field,
  Fields,
  State,
  Superposition,
  Process,
  Processes,
  Reaction,
  Reactions,
  Matter,
} from "./sqlite/index.ts"
