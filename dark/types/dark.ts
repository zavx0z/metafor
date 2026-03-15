/**
 * Канонический адрес хаба в MetaFor.
 *
 * Формат: `owner/repo` (например, `zavx0z/metafor`).
 */
export type Address = string

/**
 * Задача загрузки meta-схемы в процессе сборки topology.
 */
export interface MetaLoadTask {
  /** Адрес meta-схемы для загрузки. */
  metaAddress: Address

  /** Опционально: ID родительского placement для stitching. */
  parentPlacementId?: string

  /** Опционально: ID reference, через который была достигнута схема. */
  viaReferenceId?: string
}
