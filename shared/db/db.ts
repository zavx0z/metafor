import type { FieldKey } from "@metafor/ast"
import type {
  SharedDbBraneRecord,
  SharedDbFieldRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
} from "./db.t.ts"

/**
 * Возвращает brane-запись по индексу.
 *
 * @param projection Собранная DB-проекция.
 * @param braneIndex Индекс браны в плоской таблице.
 * @returns Запись браны или `undefined`, если индекс не найден.
 */
export const getSharedDbBraneByIndex = (
  projection: SharedDbProjection,
  braneIndex: number,
): SharedDbBraneRecord | undefined => projection.branes[braneIndex]

/**
 * Возвращает brane-запись по исходному `Dark Wimp.id`.
 *
 * @param projection Собранная DB-проекция.
 * @param darkWimpId Идентификатор исходного `Dark Wimp`.
 * @returns Запись браны или `undefined`, если `Wimp` не был спроецирован.
 */
export const getSharedDbBraneByDarkId = (
  projection: SharedDbProjection,
  darkWimpId: string,
): SharedDbBraneRecord | undefined => {
  const braneIndex = projection.braneIndexByDarkId.get(darkWimpId)
  return braneIndex === undefined ? undefined : projection.branes[braneIndex]
}

/**
 * Возвращает запись поля по индексу.
 *
 * @param projection Собранная DB-проекция.
 * @param fieldIndex Индекс поля в плоской таблице.
 * @returns Запись поля или `undefined`, если индекс не найден.
 */
export const getSharedDbFieldByIndex = (
  projection: SharedDbProjection,
  fieldIndex: number,
): SharedDbFieldRecord | undefined => projection.fields[fieldIndex]

/**
 * Возвращает запись поля по исходному `Dark Field.id`.
 *
 * @param projection Собранная DB-проекция.
 * @param darkFieldId Идентификатор исходного объектного поля `Dark`.
 * @returns Запись поля или `undefined`, если поле не было спроецировано.
 */
export const getSharedDbFieldByDarkId = (
  projection: SharedDbProjection,
  darkFieldId: string,
): SharedDbFieldRecord | undefined => {
  const fieldIndex = projection.fieldIndexByDarkId.get(darkFieldId)
  return fieldIndex === undefined ? undefined : projection.fields[fieldIndex]
}

/**
 * Возвращает запись поля по паре `(braneIndex, fieldKey)`.
 *
 * @param projection Собранная DB-проекция.
 * @param braneIndex Индекс браны-владельца.
 * @param fieldKey Локальный ключ поля внутри браны.
 * @returns Запись поля или `undefined`, если такого поля нет.
 */
export const getSharedDbFieldByKey = (
  projection: SharedDbProjection,
  braneIndex: number,
  fieldKey: FieldKey,
): SharedDbFieldRecord | undefined => {
  const fieldIndex = projection.fieldIndexByBraneAndKey.get(braneIndex)?.get(fieldKey)
  return fieldIndex === undefined ? undefined : projection.fields[fieldIndex]
}

/**
 * Возвращает запись текущего значения поля.
 *
 * Таблица значений выровнена по индексам поля, поэтому lookup не требует
 * дополнительных обходов или поисков по объектному графу `Dark`.
 *
 * @param projection Собранная DB-проекция.
 * @param fieldIndex Индекс поля в плоской таблице.
 * @returns Запись значения или `undefined`, если индекс не найден.
 */
export const getSharedDbFieldValue = (
  projection: SharedDbProjection,
  fieldIndex: number,
): SharedDbFieldValueRecord | undefined => projection.fieldValues[fieldIndex]

/**
 * Возвращает direct ordinary source-связь для дочернего поля.
 *
 * @param projection Собранная DB-проекция.
 * @param childFieldIndex Индекс дочернего поля.
 * @returns Source-связь или `undefined`, если её нет.
 */
export const getSharedDbFieldSource = (
  projection: SharedDbProjection,
  childFieldIndex: number,
): SharedDbFieldSourceRecord | undefined => projection.fieldSourceByChildFieldIndex[childFieldIndex]

/**
 * Возвращает зависимые поля для родительского поля-источника.
 *
 * @param projection Собранная DB-проекция.
 * @param parentFieldIndex Индекс родительского поля-источника.
 * @returns Список дочерних записей поля, зависящих от этого источника.
 */
export const getSharedDbDependentFields = (
  projection: SharedDbProjection,
  parentFieldIndex: number,
): SharedDbFieldRecord[] =>
  (projection.dependentFieldIndexesByParentFieldIndex.get(parentFieldIndex) ?? []).map(
    (fieldIndex) => projection.fields[fieldIndex]!,
  )

/**
 * Возвращает все поля, принадлежащие конкретной бране.
 *
 * @param projection Собранная DB-проекция.
 * @param braneIndex Индекс браны.
 * @returns Последовательный срез полей владельца.
 */
export const getSharedDbBraneFields = (
  projection: SharedDbProjection,
  braneIndex: number,
): SharedDbFieldRecord[] => {
  const brane = projection.branes[braneIndex]
  if (!brane) return []

  const fieldWindow = projection.fieldWindowByBraneIndex[braneIndex]
  if (!fieldWindow) return []

  return projection.fields.slice(fieldWindow.fieldOffset, fieldWindow.fieldOffset + fieldWindow.fieldCount)
}
