import type { Wimp } from "@dark/strong"
import type { DarkParticle } from "./shared"
import type { FieldInit } from "./strong.ts"

export type MatterBindingValue =
  | string
  | boolean
  | {
      data?: string | string[]
      expr?: string
    }

export interface MatterParticleWimpPlan {
  kind: "wimp"
  src: string
  fieldsBinding?: MatterBindingValue
  massBinding?: MatterBindingValue
  children?: MatterParticlePlan[]
}

export interface MatterParticleFuzzyPlan {
  kind: "fuzzy"
  fuzzyKind: "dynamic-meta" | "cond"
  predicateBinding?: MatterBindingValue
  children?: MatterParticlePlan[]
}

export interface MatterParticleAxionPlan {
  kind: "axion"
  predicateBinding: MatterBindingValue
  children?: MatterParticlePlan[]
}

export interface MatterParticleMachoPlan {
  kind: "macho"
  collectionBinding: MatterBindingValue
  children?: MatterParticlePlan[]
}

export type MatterParticlePlan =
  | MatterParticleWimpPlan
  | MatterParticleFuzzyPlan
  | MatterParticleAxionPlan
  | MatterParticleMachoPlan

/**
 * Временный пакет данных, который родительская мета передаёт обнаруженному дочернему `Wimp`.
 *
 * Сам `Wimp` при обнаружении ещё остаётся пустым. Этот пакет применяется позже,
 * когда мета дочернего `Wimp` уже загружена и он передаётся в `matterMeta`.
 * После применения этот пакет больше не является каноническим слоем хранения.
 *
 * @property fieldInits Временный набор описаний полей для сборки дочернего `Wimp`.
 * @property mass Временное значение `mass`, приходящее от родителя.
 */
export interface MatterContinuation {
  /** Временный набор описаний полей для сборки дочернего `Wimp`. */
  fieldInits?: FieldInit[]
  /** Временное значение `mass`, приходящее от родителя. */
  mass?: Wimp["mass"]
}

/**
 * Возвращаемая пара: обнаруженный `Wimp` и временный пакет данных от его родителя.
 */
export type MatterWimpResult = [wimp: Wimp, continuation: MatterContinuation]

/**
 * Результат одного слоя `matterMeta`.
 *
 * Генератор отдаёт такой массив на каждом уровне обхода, даже если на этом шаге
 * новые `Wimp` не появились. Это сохраняет явную границу между слоями traversal.
 */
export type MatterLayerResult = MatterWimpResult[]

/**
 * Внутренняя запись очереди текущего шага обхода.
 */
export interface MatterEntry {
  plan: MatterParticlePlan
  parent: DarkParticle
}
