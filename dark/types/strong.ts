import type { Mass } from "@metafor/dsl/types"
import type { NodeMeta } from "@metafor/template"
import type { DarkParticle, ParticleID } from "./shared.ts"

export type WimpValues = Record<string, unknown>

/**
 * Базовая инициализация частицы.
 * @prop children Дочерние частицы по ID
 * @prop parent Родительская частица или `null` для корня
 */
export interface BaseParticleInit {
  children?: Iterable<ParticleID>
  parent?: DarkParticle | null
}

/**
 * Инициализация Wimp.
 * @prop src SRC-адрес меты
 * @prop values Стартовые значения узла meta
 * @prop mass Масса узла meta
 * @prop children Дочерние частицы по ID
 */
export interface WimpInit extends BaseParticleInit {
  src: string
  values?: WimpValues
  mass?: Mass | NodeMeta["mass"]
}

/**
 * Инициализация Fuzzy.
 * @prop value Выбранное значение (ID частицы или null)
 * @prop branch Ветви (пары ID и частицы)
 * @prop children Дочерние частицы по ID
 */
export interface FuzzyInit extends BaseParticleInit {
  value?: ParticleID | null
  branch?: Iterable<[ParticleID, DarkParticle]>
}

/**
 * Инициализация Macho.
 * @prop children Дочерние частицы по ID
 */
export interface MachoInit extends BaseParticleInit {}

/**
 * Инициализация Axion.
 * @prop children Дочерние частицы по ID
 */
export interface AxionInit extends BaseParticleInit {}
