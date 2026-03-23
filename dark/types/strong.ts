import type { FieldDefinitionJson, FieldKey, MetaAST } from "@metafor/ast"
import type { Mass } from "@metafor/dsl/types"
import type { NodeMeta } from "@metafor/template"
import type { DarkParticle } from "./shared.ts"
import type { Field } from "../strong/Field.ts"
import type { Wimp } from "../strong/Wimp.ts"

/**
 * Уплощённое представление runtime значений полей.
 *
 * Используется как read-model и промежуточный результат вычисления выражений,
 * но не как каноническое runtime-хранилище `Wimp`.
 */
export type WimpValues = Record<string, unknown>

/**
 * Локальный ORM-набор полей конкретного `Wimp`.
 */
export type WimpFields = Record<FieldKey, Field>

/**
 * Временный build-init для поля дочернего `Wimp`.
 *
 * Это не каноническая ORM-сущность: init живёт только между двумя шагами traversal
 * и затем сразу materialize-ится в локальный `Field` внутри конкретного `Wimp`.
 */
export interface FieldInit {
  /** Ключ поля внутри схемы дочернего `Wimp`. */
  key: FieldKey
  /** Runtime-значение, которое должно быть materialize-нуто в `Field.value`. */
  value: unknown
  /** Прямая ссылка на parent field для простого ordinary-linking сценария. */
  source?: Field | null
}

/**
 * Полная инициализация объектного `Field`.
 */
export interface FieldObjectInit extends FieldInit {
  /** Владелец поля в каноническом object graph. */
  owner: Wimp
  /** Локальная schema поля, принадлежащая владельцу. */
  schema: FieldDefinitionJson
}

/**
 * Базовая инициализация частицы.
 * @prop children Дочерние частицы как объектные ссылки
 * @prop parent Родительская частица или `null` для корня
 */
export interface BaseParticleInit {
  children?: Iterable<DarkParticle>
  parent?: DarkParticle | null
}

/**
 * Инициализация Wimp.
 * @prop src SRC-адрес меты
 * @prop fields Локальные ORM-поля узла meta
 * @prop mass Масса узла meta
 * @prop children Дочерние частицы как объектные ссылки
 */
export interface WimpInit extends BaseParticleInit {
  src: string
  name?: MetaAST["name"]
  fields?: WimpFields
  superposition?: MetaAST["superposition"]
  processes?: MetaAST["processes"]
  reactions?: MetaAST["reactions"]
  bulk?: MetaAST["bulk"]
  mass?: Mass | NodeMeta["mass"]
}

/**
 * Инициализация Fuzzy.
 * @prop value Выбранное значение (частица или null)
 * @prop branch Ветви (пары частиц)
 * @prop children Дочерние частицы как объектные ссылки
 */
export interface FuzzyInit extends BaseParticleInit {
  value?: DarkParticle | null
  branch?: Iterable<[DarkParticle, DarkParticle]>
}

/**
 * Инициализация Macho.
 * @prop children Дочерние частицы как объектные ссылки
 */
export interface MachoInit extends BaseParticleInit {}

/**
 * Инициализация Axion.
 * @prop children Дочерние частицы как объектные ссылки
 */
export interface AxionInit extends BaseParticleInit {}
