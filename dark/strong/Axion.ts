import type { AxionInit } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

/**
 * Логическая grouping-частица topology-графа.
 *
 * `Axion` создаётся для узлов вроде `log`, не добавляя собственных данных меты.
 */
export class Axion extends BaseParticle {
  /**
   * Создаёт узел логической группировки.
   *
   * @param init Базовая инициализация частицы со связью с родителем и необязательными детьми.
   */
  constructor(init: AxionInit = {}) {
    super(init)
  }
}
