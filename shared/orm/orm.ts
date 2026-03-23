import { Wimp } from "@dark/strong"
import type { DarkParticle } from "@dark/types"
import type { FieldKey } from "@metafor/ast"
import type {
  SharedOrmBraneRecord,
  SharedOrmFieldRecord,
  SharedOrmFieldSchemaRecord,
  SharedOrmFieldSourceRecord,
  SharedOrmFieldValueRecord,
  SharedOrmProjection,
} from "./orm.t.ts"

const isTopologyFieldType = (type: string): boolean => type.startsWith("enum<") || type.startsWith("array<")
type SharedOrmInputField = NonNullable<Wimp["fields"]>[string]

const cloneFieldSchema = (schema: SharedOrmInputField["schema"]): SharedOrmFieldSchemaRecord => ({
  type: schema.type,
  required: schema.required === true,
  topology: isTopologyFieldType(schema.type),
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

/**
 * Собирает плоский список всех `Wimp`, достижимых от корня.
 *
 * Обход идёт по `children`, поэтому в ORM попадают только уже собранные частицы,
 * а промежуточные `Fuzzy` / `Macho` / `Axion` используются лишь как мосты к дочерним `Wimp`.
 *
 * @param root Корневой materialized `Wimp`, от которого начинается проекция.
 * @returns Список `Wimp` в стабильном порядке обхода.
 */
const collectReachableWimps = (root: Wimp): Wimp[] => {
  const ordered: Wimp[] = []
  const queue: DarkParticle[] = [root]
  const seenParticleIds = new Set<string>()

  while (queue.length > 0) {
    const particle = queue.shift()
    if (!particle || seenParticleIds.has(particle.id)) continue
    seenParticleIds.add(particle.id)

    if (particle instanceof Wimp) {
      ordered.push(particle)
    }

    for (const child of particle.children) {
      queue.push(child)
    }
  }

  return ordered
}

/**
 * Строит общую ORM-проекцию из полностью materialized `Dark`-графа.
 *
 * Функция не меняет `Dark` и не превращает его в источник истины для плоских таблиц.
 * Она только один раз снимает индексный слепок с уже собранного объектного графа.
 *
 * @param root Корневой `Wimp` materialized `Dark`-графа.
 * @returns Плоская ORM-проекция с готовыми индексами для downstream-кода.
 */
export const assembleSharedOrmProjection = (root: Wimp): SharedOrmProjection => {
  const orderedWimps = collectReachableWimps(root)
  const branes: SharedOrmBraneRecord[] = []
  const fields: SharedOrmFieldRecord[] = []
  const fieldValues: SharedOrmFieldValueRecord[] = []
  const fieldSources: SharedOrmFieldSourceRecord[] = []
  const braneIndexByDarkId = new Map<string, number>()
  const fieldIndexByDarkId = new Map<string, number>()
  const fieldIndexByBraneAndKey = new Map<number, Map<FieldKey, number>>()
  const fieldSourceByChildFieldIndex: Array<SharedOrmFieldSourceRecord | undefined> = []
  const dependentFieldIndexesByParentFieldIndex = new Map<number, number[]>()
  const fieldIndexByObject = new Map<SharedOrmInputField, number>()

  for (const wimp of orderedWimps) {
    const braneIndex = branes.length
    const fieldOffset = fields.length
    const fieldLookup = new Map<FieldKey, number>()
    braneIndexByDarkId.set(wimp.id, braneIndex)

    for (const [key, field] of Object.entries(wimp.fields ?? {})) {
      const fieldIndex = fields.length
      const fieldRecord: SharedOrmFieldRecord = {
        index: fieldIndex,
        darkFieldId: field.id,
        ownerBraneIndex: braneIndex,
        key,
        schema: cloneFieldSchema(field.schema),
      }

      fields.push(fieldRecord)
      fieldValues.push({
        fieldIndex,
        value: structuredClone(field.value),
      })
      fieldIndexByDarkId.set(field.id, fieldIndex)
      fieldLookup.set(key, fieldIndex)
      fieldIndexByObject.set(field, fieldIndex)
    }

    branes.push({
      index: braneIndex,
      darkWimpId: wimp.id,
      src: wimp.src,
      ...(wimp.name !== undefined ? { name: wimp.name } : {}),
      fieldOffset,
      fieldCount: fields.length - fieldOffset,
    })
    fieldIndexByBraneAndKey.set(braneIndex, fieldLookup)
  }

  for (const wimp of orderedWimps) {
    for (const field of Object.values(wimp.fields ?? {})) {
      const childFieldIndex = fieldIndexByObject.get(field)
      const parentFieldIndex = field.source ? fieldIndexByObject.get(field.source) : undefined

      // В таблицу ordinary source-связей попадает только доказуемая прямая связь
      // между обычными полями. Topology-поля остаются лишь в общих таблицах полей и значений.
      if (
        childFieldIndex === undefined ||
        parentFieldIndex === undefined ||
        isTopologyFieldType(field.schema.type) ||
        isTopologyFieldType(field.source.schema.type)
      ) {
        continue
      }

      const sourceRecord: SharedOrmFieldSourceRecord = {
        childFieldIndex,
        parentFieldIndex,
      }

      fieldSources.push(sourceRecord)
      fieldSourceByChildFieldIndex[childFieldIndex] = sourceRecord

      const dependents = dependentFieldIndexesByParentFieldIndex.get(parentFieldIndex)
      if (dependents) {
        dependents.push(childFieldIndex)
      } else {
        dependentFieldIndexesByParentFieldIndex.set(parentFieldIndex, [childFieldIndex])
      }
    }
  }

  return {
    rootBraneIndex: 0,
    branes,
    fields,
    fieldValues,
    fieldSources,
    braneIndexByDarkId,
    fieldIndexByDarkId,
    fieldIndexByBraneAndKey,
    fieldSourceByChildFieldIndex,
    dependentFieldIndexesByParentFieldIndex,
  }
}

/**
 * Возвращает brane-запись по индексу.
 *
 * @param projection Собранная ORM-проекция.
 * @param braneIndex Индекс браны в плоской таблице.
 * @returns Запись браны или `undefined`, если индекс не найден.
 */
export const getSharedOrmBraneByIndex = (
  projection: SharedOrmProjection,
  braneIndex: number,
): SharedOrmBraneRecord | undefined => projection.branes[braneIndex]

/**
 * Возвращает brane-запись по исходному `Dark Wimp.id`.
 *
 * @param projection Собранная ORM-проекция.
 * @param darkWimpId Идентификатор исходного `Dark Wimp`.
 * @returns Запись браны или `undefined`, если `Wimp` не был спроецирован.
 */
export const getSharedOrmBraneByDarkId = (
  projection: SharedOrmProjection,
  darkWimpId: string,
): SharedOrmBraneRecord | undefined => {
  const braneIndex = projection.braneIndexByDarkId.get(darkWimpId)
  return braneIndex === undefined ? undefined : projection.branes[braneIndex]
}

/**
 * Возвращает запись поля по исходному `Dark Field.id`.
 *
 * @param projection Собранная ORM-проекция.
 * @param darkFieldId Идентификатор исходного объектного поля `Dark`.
 * @returns Запись поля или `undefined`, если поле не было спроецировано.
 */
export const getSharedOrmFieldByDarkId = (
  projection: SharedOrmProjection,
  darkFieldId: string,
): SharedOrmFieldRecord | undefined => {
  const fieldIndex = projection.fieldIndexByDarkId.get(darkFieldId)
  return fieldIndex === undefined ? undefined : projection.fields[fieldIndex]
}

/**
 * Возвращает запись поля по паре `(braneIndex, fieldKey)`.
 *
 * @param projection Собранная ORM-проекция.
 * @param braneIndex Индекс браны-владельца.
 * @param fieldKey Локальный ключ поля внутри браны.
 * @returns Запись поля или `undefined`, если такого поля нет.
 */
export const getSharedOrmFieldByKey = (
  projection: SharedOrmProjection,
  braneIndex: number,
  fieldKey: FieldKey,
): SharedOrmFieldRecord | undefined => {
  const fieldIndex = projection.fieldIndexByBraneAndKey.get(braneIndex)?.get(fieldKey)
  return fieldIndex === undefined ? undefined : projection.fields[fieldIndex]
}

/**
 * Возвращает запись текущего значения поля.
 *
 * Таблица значений выровнена по индексам поля, поэтому lookup не требует
 * дополнительных обходов или поисков по объектному графу `Dark`.
 *
 * @param projection Собранная ORM-проекция.
 * @param fieldIndex Индекс поля в плоской таблице.
 * @returns Запись значения или `undefined`, если индекс не найден.
 */
export const getSharedOrmFieldValue = (
  projection: SharedOrmProjection,
  fieldIndex: number,
): SharedOrmFieldValueRecord | undefined => projection.fieldValues[fieldIndex]

/**
 * Возвращает direct ordinary source-связь для дочернего поля.
 *
 * @param projection Собранная ORM-проекция.
 * @param childFieldIndex Индекс дочернего поля.
 * @returns Source-связь или `undefined`, если её нет.
 */
export const getSharedOrmFieldSource = (
  projection: SharedOrmProjection,
  childFieldIndex: number,
): SharedOrmFieldSourceRecord | undefined => projection.fieldSourceByChildFieldIndex[childFieldIndex]

/**
 * Возвращает зависимые поля для родительского поля-источника.
 *
 * @param projection Собранная ORM-проекция.
 * @param parentFieldIndex Индекс родительского поля-источника.
 * @returns Список дочерних записей поля, зависящих от этого источника.
 */
export const getSharedOrmDependentFields = (
  projection: SharedOrmProjection,
  parentFieldIndex: number,
): SharedOrmFieldRecord[] =>
  (projection.dependentFieldIndexesByParentFieldIndex.get(parentFieldIndex) ?? []).map(
    (fieldIndex) => projection.fields[fieldIndex]!,
  )

/**
 * Возвращает все поля, принадлежащие конкретной бране.
 *
 * @param projection Собранная ORM-проекция.
 * @param braneIndex Индекс браны.
 * @returns Последовательный срез полей владельца.
 */
export const getSharedOrmBraneFields = (
  projection: SharedOrmProjection,
  braneIndex: number,
): SharedOrmFieldRecord[] => {
  const brane = projection.branes[braneIndex]
  if (!brane) return []

  return projection.fields.slice(brane.fieldOffset, brane.fieldOffset + brane.fieldCount)
}
