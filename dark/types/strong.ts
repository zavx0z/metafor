import type { Mass } from "@metafor/dsl/types"
import type { NodeMeta } from "@metafor/template"
import type { DarkParticle, ParticleID } from "./shared.ts"

export type WimpValues = Record<string, unknown>

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
 * @prop values Стартовые значения узла meta
 * @prop mass Масса узла meta
 * @prop children Дочерние частицы как объектные ссылки
 */
export interface WimpInit extends BaseParticleInit {
  src: string
  values?: WimpValues
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
