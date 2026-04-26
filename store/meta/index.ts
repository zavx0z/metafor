/**
 * `@store/meta` — реляционное хранилище DSL-декларации меты.
 *
 * Корневой entry-point — **классы** ORM-уровня, каждая под-сущность
 * декларации представлена своим manager-классом (Django-style):
 * - `Meta` — главный инстанс, координирует все managers и скаляры
 * - `Fields` / `Superposition` / `Processes` / `Reactions` / `Matter` — managers
 *   с `.all() / .get(filter) / .count() / .exists()`. `Fields` возвращает
 *   type-specific подкласс `Field` (`StringField` / `NumberField` /
 *   `BooleanField` / `ArrayField` / `EnumField`) — дискриминатор `type`.
 *
 * Backend-специфичные имплементации (низкоуровневые SQL-функции) — в subpath
 * `@store/meta/sqlite`. Классы реализованы там же (рядом с C/G/D-помощниками)
 * и реэкспортируются отсюда без изменения публичного API.
 *
 * См. `store/meta/README.md` и `store/README.md` для архитектурных принципов.
 */

export {
  ArrayField,
  BooleanField,
  EnumField,
  Field,
  Fields,
  Matter,
  Meta,
  NumberField,
  Process,
  Processes,
  Reaction,
  Reactions,
  State,
  StringField,
  Superposition,
} from "./sqlite/index.ts"
export type { AnyField, FieldType } from "./sqlite/index.ts"
