import type { FieldKey } from "@metafor/ast"
import type {
  SharedDbBraneRecord,
  SharedDbFieldRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbTabularData,
} from "./db.t.ts"

/** Имена канонических shared/db таблиц backend-слоя. */
export type SharedDbBackendTableName = "branes" | "fields" | "field_values" | "field_sources"

/**
 * Зафиксированная backend-индексация для минимального lookup API.
 *
 * Индексные lookup по `brane.index` и `field.index` считаются частью primary key
 * табличной формы, а этот список описывает обязательные secondary indexes.
 */
export interface SharedDbBackendIndexSpec {
  /** Стабильное имя индексного требования. */
  name: string
  /** Таблица, на которой должен существовать индекс. */
  table: SharedDbBackendTableName
  /** Колонки индексного ключа в порядке lookup. */
  columns: readonly string[]
  /** Требуется ли уникальность ключа. */
  unique: boolean
}

/**
 * Минимальный backend-контракт общего DB-слоя.
 *
 * Контракт работает только с канонической табличной формой и индексными lookup.
 * Runtime-semantics доменов остаются поверх него.
 */
export interface SharedDbBackend {
  /** Зафиксированный набор обязательных backend-индексов. */
  readonly requiredIndexes: readonly SharedDbBackendIndexSpec[]

  /** Освобождает ресурсы backend-handle. */
  close(): void

  /** Возвращает индекс корневой браны канонического снимка. */
  getRootBraneIndex(): number

  /** Сбрасывает backend к пустому каноническому состоянию. */
  reset(): void

  /**
   * Полностью заменяет содержимое backend канонической табличной формой.
   *
   * @param data Новый снимок данных.
   */
  replaceData(data: SharedDbTabularData): void

  /**
   * Полностью записывает `SharedDbProjection`, отбрасывая derived indexes.
   *
   * @param projection Собранная проекция из `Dark`.
   */
  writeProjection(projection: SharedDbProjection): void

  /**
   * Возвращает brane-запись по индексу.
   *
   * @param braneIndex Индекс браны.
   * @returns Запись браны или `undefined`, если индекс не найден.
   */
  getBrane(braneIndex: number): SharedDbBraneRecord | undefined

  /**
   * Возвращает brane-запись по исходному `Dark Wimp.id`.
   *
   * @param darkWimpId Идентификатор исходного `Dark Wimp`.
   * @returns Запись браны или `undefined`, если `Wimp` не найден.
   */
  getBraneByDarkId(darkWimpId: string): SharedDbBraneRecord | undefined

  /**
   * Возвращает запись поля по индексу.
   *
   * @param fieldIndex Индекс поля.
   * @returns Запись поля или `undefined`, если индекс не найден.
   */
  getField(fieldIndex: number): SharedDbFieldRecord | undefined

  /**
   * Возвращает запись поля по исходному `Dark Field.id`.
   *
   * @param darkFieldId Идентификатор исходного `Dark Field`.
   * @returns Запись поля или `undefined`, если поле не найдено.
   */
  getFieldByDarkId(darkFieldId: string): SharedDbFieldRecord | undefined

  /**
   * Возвращает запись поля по паре `(braneIndex, fieldKey)`.
   *
   * @param braneIndex Индекс браны-владельца.
   * @param fieldKey Локальный ключ поля.
   * @returns Запись поля или `undefined`, если поле не найдено.
   */
  getFieldByKey(braneIndex: number, fieldKey: FieldKey): SharedDbFieldRecord | undefined

  /**
   * Возвращает запись текущего значения поля.
   *
   * @param fieldIndex Индекс поля.
   * @returns Запись значения или `undefined`, если она не найдена.
   */
  getFieldValue(fieldIndex: number): SharedDbFieldValueRecord | undefined

  /**
   * Возвращает direct ordinary source-связь дочернего поля.
   *
   * @param childFieldIndex Индекс дочернего поля.
   * @returns Source-связь или `undefined`, если её нет.
   */
  getFieldSource(childFieldIndex: number): SharedDbFieldSourceRecord | undefined

  /**
   * Возвращает все дочерние поля, зависящие от указанного источника.
   *
   * @param parentFieldIndex Индекс родительского поля-источника.
   * @returns Список записей зависимых полей.
   */
  getDependentFields(parentFieldIndex: number): SharedDbFieldRecord[]

  /**
   * Минимально обновляет значение одного поля без полной перезаписи проекции.
   *
   * @param fieldIndex Индекс поля.
   * @param value Новое значение поля.
   */
  setFieldValue(fieldIndex: number, value: unknown): void
}
