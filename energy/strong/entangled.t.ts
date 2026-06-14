/** Типы для строгой materialization подготовленного entanglement. */

/**
 * Маппинг браны → локальные поля + ссылки на entangled блоки.
 */
export interface BraneMapping {
  /** Локальные поля для каждой браны: [fieldIndex, value][] */
  localFields: [number, unknown][][]
  /** Маппинг: индекс браны -> массив ID entangled-блоков. */
  braneEntangledMap: number[][]
  /** Поля для каждого entangled блока: ключ → [fieldIndex, value][] */
  entangledFields: Map<string, [number, unknown][]>
}

/**
 * Подготовленный блок shared-полей, пришедший сверху.
 *
 * Energy получает уже готовую membership/field projection и только
 * валидирует её и материализует в каноническую store-форму.
 */
export interface PreparedEntanglementBlock {
  /** Стабильный ключ блока. Если не задан — вычисляется из membership/fields. */
  key?: string
  /** Индексы бран, которые входят в shared-блок. */
  braneIndices: number[]
  /**
   * Явно подготовленные shared-поля блока.
   *
   * Это строгий контракт для energy materialization.
   */
  fields: PreparedEntanglementField[]
}

/** Projection entanglement-блоков, готовая для materialization в Energy. */
export interface PreparedEntanglementProjection {
  /** Полный набор shared-блоков для materialization. */
  blocks: PreparedEntanglementBlock[]
}

export interface PreparedEntanglementField {
  /** Индекс поля в energy field array. */
  fieldIndex: number
  /** Семантическое имя shared поля. */
  fieldName: string
  /** Идентификаторы payload, из которых поле было выведено. */
  payloadIds: string[]
  /** Нормализованные semantic keys этих payload. */
  semanticKeys: string[]
  /** Брана-репрезентант, из которой materialization может взять shared value. */
  representativeBraneIndex?: number
}
