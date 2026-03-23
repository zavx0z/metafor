import type { DarkParticle } from "@dark/types"
import type { FuzzyInit } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

/**
 * Частица ветвления topology-графа.
 *
 * `Fuzzy` держит таблицу ветвей и текущее выбранное значение,
 * но не владеет схемой полей или данными меты.
 */
export class Fuzzy extends BaseParticle {
  value: DarkParticle | null
  branch: Map<DarkParticle, DarkParticle>

  /**
   * Создаёт runtime-узел ветвления.
   *
   * @param init Начальное состояние ветвления: выбранная ветвь, таблица ветвей и связь с родителем.
   */
  constructor(init: FuzzyInit = {}) {
    super(init)
    this.value = init.value ?? null
    this.branch = new Map(init.branch ?? [])
  }

  /**
   * Переключает `Fuzzy` на новую ветвь.
   *
   * @param value Частица-ключ ветви или `null` для сброса выбранного значения.
   * @returns Каноническая частица ветви из таблицы ветвей, если она найдена.
   */
  switch(value: DarkParticle | null): DarkParticle | undefined {
    this.value = value
    if (value === null) return
    return this.branch.get(value)
  }
}
