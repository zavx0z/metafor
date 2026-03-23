import type { MachoInit } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

/**
 * Multiplicity-частица topology-графа.
 *
 * `Macho` создаётся для `map`-узлов и выступает контейнером множественных ветвей.
 */
export class Macho extends BaseParticle {
  /**
   * Создаёт узел множественности.
   *
   * @param init Базовая инициализация частицы со связью с родителем и необязательными детьми.
   */
  constructor(init: MachoInit = {}) {
    super(init)
  }
}
