import type { Collapse } from "@boundary/fields"

/**
 * Результат конвертации суперпозиции.
 */
export interface ConvertedSuperposition {
  /** Имена состояний для reverse-маппинга (хранятся в Force). */
  states: string[]
  /** Суперпозиция для Boundary (только индексы). */
  boundary: {
    transitions: Array<Array<Collapse>>
  }
}
