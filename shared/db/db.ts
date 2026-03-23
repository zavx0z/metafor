import { Wimp } from "@dark/strong"
import type { DarkParticle } from "@dark/types"
import type { FieldKey } from "@metafor/ast"
import type {
  SharedDbBraneRecord,
  SharedDbFieldRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
} from "./db.t.ts"

const isTopologyFieldType = (type: string): boolean => type.startsWith("enum<") || type.startsWith("array<")
type SharedDbInputField = NonNullable<Wimp["fields"]>[string]

const cloneFieldSchema = (schema: SharedDbInputField["schema"]): SharedDbFieldSchemaRecord => ({
  type: schema.type,
  required: schema.required === true,
  topology: isTopologyFieldType(schema.type),
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

/**
 * Собирает плоский список всех `Wimp`, достижимых от корня.
 *
 * Обход идёт по `children`, поэтому в плоскую DB-проекцию попадают только уже
 * собранные частицы, а промежуточные topology-частицы служат мостами к дочерним `Wimp`.
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
 * Строит общую плоскую DB-проекцию из полностью materialized `Dark`-графа.
 *
 * Функция не меняет `Dark` и не делает плоскую проекцию новым источником истины.
 * Она только один раз снимает табличный снимок с уже собранного объектного графа.
 *
 * @param root Корневой `Wimp` materialized `Dark`-графа.
 * @returns Плоская DB-проекция с готовыми индексами для downstream-кода.
 */
export const assembleSharedDbProjection = (root: Wimp): SharedDbProjection => {
  const orderedWimps = collectReachableWimps(root)
  const branes: SharedDbBraneRecord[] = []
  const fields: SharedDbFieldRecord[] = []
  const fieldValues: SharedDbFieldValueRecord[] = []
  const fieldSources: SharedDbFieldSourceRecord[] = []
  const braneIndexByDarkId = new Map<string, number>()
  const fieldIndexByDarkId = new Map<string, number>()
  const fieldIndexByBraneAndKey = new Map<number, Map<FieldKey, number>>()
  const fieldSourceByChildFieldIndex: Array<SharedDbFieldSourceRecord | undefined> = []
  const dependentFieldIndexesByParentFieldIndex = new Map<number, number[]>()
  const fieldIndexByObject = new Map<SharedDbInputField, number>()

  for (const wimp of orderedWimps) {
    const braneIndex = branes.length
    const fieldOffset = fields.length
    const fieldLookup = new Map<FieldKey, number>()
    braneIndexByDarkId.set(wimp.id, braneIndex)

    for (const [key, field] of Object.entries(wimp.fields ?? {})) {
      const fieldIndex = fields.length
      const fieldRecord: SharedDbFieldRecord = {
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

      const sourceRecord: SharedDbFieldSourceRecord = {
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

  return projection.fields.slice(brane.fieldOffset, brane.fieldOffset + brane.fieldCount)
}
