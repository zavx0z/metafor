/**
 * Типы для модуля entangled — анализ запутанных групп бран.
 *
 * @packageDocumentation
 */

/**
 * Группа запутанных бран — браны с идентичными значениями полей.
 * Ключ — отсортированные индексы бран ("0,1,2").
 * Значение — набор индексов полей, которые одинаковы у всех бран группы.
 */
export interface EntangledGroup {
  /** Индексы бран в группе */
  braneIndices: Set<number>
  /** Индексы полей, которые одинаковы у всех бран */
  fieldIndices: Set<number>
}

/**
 * Результат анализа запутанных групп.
 */
export interface EntangledAnalysis {
  /** Маппинг: индекс поля → набор индексов бран, использующих это поле */
  fieldUsage: Map<number, Set<number>>
  /** Найденные группы запутанных бран */
  entangledGroups: Map<string, EntangledGroup>
}

/**
 * Маппинг браны → локальные поля + ссылки на entangled блоки.
 */
export interface BraneMapping {
  /** Локальные поля для каждой браны: [fieldIndex, value][] */
  localFields: [number, unknown][][]
  /** Маппинг: индекс браны → массив ID entangled блоков */
  braneEntangledMap: number[][]
  /** Поля для каждого entangled блока: ключ → [fieldIndex, value][] */
  entangledFields: Map<string, [number, unknown][]>
}

/**
 * Подготовленный блок shared-полей, пришедший сверху.
 *
 * Boundary получает уже готовую membership/field projection и только
 * валидирует её и материализует в layout для heap.
 */
export interface PreparedEntanglementBlock {
  /** Стабильный ключ блока. Если не задан — вычисляется из membership/fields. */
  key?: string
  /** Индексы бран, которые входят в shared-блок. */
  braneIndices: number[]
  /** Индексы полей, которые должны быть shared внутри блока. */
  fieldIndices: number[]
}

/**
 * Boundary-ready projection entanglement блоков.
 */
export interface PreparedEntanglementProjection {
  /** Полный набор shared-блоков для materialization. */
  blocks: PreparedEntanglementBlock[]
}
