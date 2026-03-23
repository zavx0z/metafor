import type { FieldDefinitionJson, FieldKey, MetaAST } from "@metafor/ast"
import type { Mass } from "@metafor/dsl/types"
import type { NodeMeta } from "@metafor/template"
import type { DarkParticle } from "./shared.ts"
import type { Field } from "../strong/Field.ts"
import type { Wimp } from "../strong/Wimp.ts"

/**
 * Уплощённое представление текущих значений полей.
 *
 * Используется как форма чтения и промежуточный результат вычисления выражений,
 * но не как каноническое хранилище `Wimp`.
 */
export type WimpValues = Record<string, unknown>

/**
 * Локальный ORM-набор полей конкретного `Wimp`.
 */
export type WimpFields = Record<FieldKey, Field>

/**
 * Временное описание инициализации поля дочернего `Wimp`.
 *
 * Это не каноническая ORM-сущность: описание живёт только между двумя шагами обхода
 * и затем сразу превращается в локальный `Field` внутри конкретного `Wimp`.
 *
 * @property key Ключ поля в схеме дочернего `Wimp`.
 * @property value Runtime-значение, которое будет записано в `Field.value`.
 * @property source Прямая ссылка на поле родителя для простого сценария связывания.
 */
export interface FieldInit {
  /** Ключ поля внутри схемы дочернего `Wimp`. */
  key: FieldKey
  /** Значение, которое должно быть записано в `Field.value`. */
  value: unknown
  /** Прямая ссылка на поле родителя для простого сценария связывания. */
  source?: Field | null
}

/**
 * Полная инициализация объектного `Field`.
 *
 * @property owner Владелец поля в каноническом объектном графе.
 * @property schema Локальная схема поля, принадлежащая владельцу.
 */
export interface FieldObjectInit extends FieldInit {
  /** Владелец поля в каноническом объектном графе. */
  owner: Wimp
  /** Локальная схема поля, принадлежащая владельцу. */
  schema: FieldDefinitionJson
}

/**
 * Базовая инициализация частицы.
 *
 * @property children Дочерние частицы как объектные ссылки.
 * @property parent Родительская частица или `null` для корня.
 */
export interface BaseParticleInit {
  children?: Iterable<DarkParticle>
  parent?: DarkParticle | null
}

/**
 * Инициализация Wimp.
 *
 * @property src SRC-адрес меты, которую нужно собрать.
 * @property name Локальное имя меты, если оно уже известно.
 * @property fields Локальные ORM-поля узла меты.
 * @property superposition Локальная схема переходов состояний.
 * @property processes Локальные процессы меты.
 * @property reactions Локальные реакции меты.
 * @property bulk Описание `bulk`, передаваемое в следующий слой.
 * @property mass Текущее значение `mass` узла меты.
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
 *
 * @property value Выбранное значение ветвления или `null`.
 * @property branch Каноническая таблица ветвей `частица -> частица`.
 */
export interface FuzzyInit extends BaseParticleInit {
  value?: DarkParticle | null
  branch?: Iterable<[DarkParticle, DarkParticle]>
}

/**
 * Инициализация Macho.
 *
 * `Macho` не требует собственных данных сверх базовой инициализации частицы.
 */
export interface MachoInit extends BaseParticleInit {}

/**
 * Инициализация Axion.
 *
 * `Axion` не требует собственных данных сверх базовой инициализации частицы.
 */
export interface AxionInit extends BaseParticleInit {}
