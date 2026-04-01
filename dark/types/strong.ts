import type { FieldDefinitionJson, FieldKey, MetaAST } from "@metafor/ast"
import type { Mass } from "@metafor/dsl"
import type { NodeMeta } from "@metafor/template"
import type { DarkParticle } from "./shared.ts"
import type { InstanceField } from "../strong/Field.ts"
import type { Meta } from "../strong/Meta.ts"
import type { MetaField } from "../strong/MetaField.ts"
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
export type WimpFields = Record<FieldKey, InstanceField>

/**
 * Канонический набор meta-полей конкретной `Meta`.
 */
export type MetaFields = Record<FieldKey, MetaField>

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
  source?: InstanceField | null
}

/**
 * Полная инициализация instance-поля конкретного `Wimp`.
 *
 * @property key Локальный ключ поля в схеме.
 * @property owner Владелец поля в каноническом object graph частиц.
 * @property metaField Каноническое meta-поле, на которое ссылается instance field.
 */
export interface FieldObjectInit extends FieldInit {
  /** Локальный ключ поля в схеме. */
  key: FieldKey
  /** Владелец поля в каноническом object graph частиц. */
  owner: Wimp
  /** Каноническое meta-поле, на которое ссылается instance field. */
  metaField: MetaField
}

/**
 * Инициализация meta-поля.
 *
 * @property ownerMeta Каноническая Meta-владелица этого поля.
 * @property key Локальный ключ поля внутри схемы меты.
 * @property schema Содержимое meta-поля.
 */
export interface MetaFieldInit {
  /** Каноническая Meta-владелица этого поля. */
  ownerMeta: Meta
  /** Локальный ключ поля внутри схемы меты. */
  key: FieldKey
  /** Содержимое meta-поля. */
  schema: FieldDefinitionJson
}

/**
 * Инициализация `Meta`.
 *
 * @property src Канонический SRC-адрес меты.
 * @property name Локальное имя меты.
 * @property fieldSchemas Плоская схема полей, из которой будет собран `MetaField`-граф.
 * @property fields Готовый канонический граф meta-полей.
 * @property superposition Схема переходов состояний меты.
 * @property processes Описание процессов меты.
 * @property reactions Описание реакций меты.
 * @property matter Описание topology declaration меты.
 * @property bulk Описание bulk-секции меты.
 * @property mass Канонический mass-слой меты.
 */
export interface MetaInit {
  /** Канонический SRC-адрес меты. */
  src: string
  /** Локальное имя меты. */
  name?: MetaAST["name"]
  /** Плоская схема полей, из которой будет собран `MetaField`-граф. */
  fieldSchemas?: Record<FieldKey, FieldDefinitionJson>
  /** Готовый канонический граф meta-полей. */
  fields?: MetaFields
  /** Схема переходов состояний меты. */
  superposition?: MetaAST["superposition"]
  /** Описание процессов меты. */
  processes?: MetaAST["processes"]
  /** Описание реакций меты. */
  reactions?: MetaAST["reactions"]
  /** Описание topology declaration меты. */
  matter?: MetaAST["matter"]
  /** Описание bulk-секции меты. */
  bulk?: MetaAST["bulk"]
  /** Канонический mass-слой меты. */
  mass?: Mass | NodeMeta["mass"]
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
 * @property meta Каноническая Meta, если она уже materialized.
 * @property fields Локальные ORM-поля узла меты.
 * @property mass Instance-level override для `mass`, если он пришёл из родителя.
 */
export interface WimpInit extends BaseParticleInit {
  src: string
  meta?: Meta | null
  fields?: WimpFields
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
