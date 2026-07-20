import type {
  BoundaryInitialDeclaration,
  BoundaryInitialState,
} from "@metafor/types/boundary/initial"
import type {MatrixConditionValue} from "@metafor/types/matrix/condition"
import type {MatrixBraneValue, MatrixFieldRecord, MatrixInputBrane} from "@metafor/types/matrix/data"
import type {MatrixData} from "@metafor/types/matrix/store"
import {
  STATE_NONE,
  STATE_UNDEFINED,
  type MatrixRuntimeSnapshot,
} from "@metafor/types/matrix/runtime"
import {flattenMatrixData, validateData} from "@matrix/gravity"
import {gravity$} from "@matrix/gravity/store.ts"
import {assembleStoredMatrixData, strong$} from "@matrix/strong"
import {weak$, weakInit} from "@matrix/weak"
import {matrix$} from "./store.ts"

type JsonRecord = Record<string, unknown>

type NormalizedState = {
  id: number
  name: string
}

const fieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
} as const

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isBoundaryInitialState = (value: unknown): value is BoundaryInitialState =>
  isRecord(value) && value.version === 1 && Array.isArray(value.atoms) && Array.isArray(value.declarations)

const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null

const clone = <T>(value: T): T => structuredClone(value)

const group = <T, K extends string | number>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> => {
  const result = new Map<K, T[]>()
  for (const row of rows) {
    const item = key(row)
    const bucket = result.get(item)
    if (bucket) bucket.push(row)
    else result.set(item, [row])
  }
  return result
}

const sortByPosition = <T extends {value: JsonRecord; localId: string}>(items: readonly T[]): T[] =>
  [...items].sort((left, right) => {
    const leftPosition = Number(left.value.position ?? left.localId)
    const rightPosition = Number(right.value.position ?? right.localId)
    return leftPosition - rightPosition
  })

const matrixBraneValue = (value: unknown): MatrixBraneValue => {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    if (value.every((item): item is number => typeof item === "number")) return [...value]
    if (value.every((item): item is boolean => typeof item === "boolean")) return [...value]
    if (value.every((item): item is string => typeof item === "string")) return [...value]
  }
  throw new Error(`Boundary value cannot be encoded in Matrix: ${JSON.stringify(value)}`)
}

const inferArrayElementType = (field: JsonRecord): "number" | "string" | "boolean" => {
  const declared = field.elementType
  if (declared === "number" || declared === "string" || declared === "boolean") return declared
  const sample = Array.isArray(field.default) ? field.default[0] : undefined
  if (typeof sample === "number") return "number"
  if (typeof sample === "boolean") return "boolean"
  return "string"
}

const fallbackFieldValue = (field: JsonRecord, enumValues: readonly unknown[]): MatrixBraneValue => {
  if (Object.prototype.hasOwnProperty.call(field, "default")) return matrixBraneValue(clone(field.default))
  if (field.type === "number") return 0
  if (field.type === "boolean") return false
  if (field.type === "array") return []
  if (field.type === "enum") return matrixBraneValue(enumValues[0] ?? null)
  return ""
}

const matrixField = (field: JsonRecord, enumValues: readonly unknown[]): MatrixFieldRecord => {
  if (field.type === "number") return {type: fieldType.F32}
  if (field.type === "boolean") return {type: fieldType.BOOL}
  if (field.type === "array") return {type: fieldType.ARRAY_PTR, elementType: inferArrayElementType(field)}
  if (field.type === "enum") return {type: fieldType.U32, enum: [...enumValues]}
  return {type: fieldType.STRING_PTR}
}

const predicateValue = (condition: JsonRecord): MatrixConditionValue => {
  const raw = condition.predicate ?? condition.predicates ?? condition.value ?? null
  if (
    raw === null ||
    typeof raw === "number" ||
    typeof raw === "boolean" ||
    typeof raw === "string" ||
    isRecord(raw)
  ) return clone(raw) as MatrixConditionValue
  throw new Error(`Unsupported Matrix condition predicate: ${JSON.stringify(raw)}`)
}

/** Matrix-owned conversion from canonical Boundary rows to a packed projection. */
export function buildMatrixRuntime(initial: BoundaryInitialState): MatrixRuntimeSnapshot {
  const declarationsByWimpSection = group(initial.declarations, (item) => `${item.src}\0${item.section}`)
  const valuesByAtomField = new Map(
    initial.atoms.flatMap((atom) => atom.values.map((value) => [`${atom.id}\0${value.field}`, value.value] as const)),
  )

  const enumVariantRecordsByField = new Map<number, BoundaryInitialDeclaration[]>()
  for (const variant of initial.declarations.filter((item) => item.section === "variants")) {
    const fieldId = integer(variant.value.field)
    if (fieldId === null) continue
    const bucket = enumVariantRecordsByField.get(fieldId)
    if (bucket) bucket.push(variant)
    else enumVariantRecordsByField.set(fieldId, [variant])
  }
  const enumValuesByField = new Map<number, unknown[]>()
  for (const [fieldId, variants] of enumVariantRecordsByField) {
    enumValuesByField.set(
      fieldId,
      sortByPosition(variants).map((variant) => clone(variant.value.itemValue)),
    )
  }

  const dataFields: MatrixFieldRecord[] = []
  const branes: MatrixInputBrane[] = []
  const stateNames: string[][] = []
  const atomIdByBraneIndex: number[] = []
  const braneIndexByAtomId: Array<[number, number]> = []
  const wimpSrcByAtomId: Array<[number, string]> = []
  const atomIdsByWimpSrc = new Map<string, number[]>()
  const runtimeFieldIndexByAtomFieldId: Array<[number, number, number]> = []
  const runtimeFieldIndexByWimpFieldId: Array<[number, number]> = []
  const wimpFieldIdsByRuntimeFieldIndex: number[][] = []
  const braneIndexByWimpFieldId: Array<[number, number]> = []
  const topologyWimpFieldIds: number[] = []
  const topologyAtomFieldIds: Array<[number, number]> = []
  const stateMetaStateIdsByBraneIndex: number[][] = []
  const stateHasProcessByBraneIndex: boolean[][] = []
  const runtimeFieldIndexByAtomField = new Map<string, number>()
  let nextProjectionFieldId = 1

  for (let braneIndex = 0; braneIndex < initial.atoms.length; braneIndex++) {
    const atom = initial.atoms[braneIndex]!
    const fieldRecords = sortByPosition(declarationsByWimpSection.get(`${atom.wimp}\0fields`) ?? [])
    const stateRecords = sortByPosition(declarationsByWimpSection.get(`${atom.wimp}\0states`) ?? [])
    const transitionRecords = sortByPosition(declarationsByWimpSection.get(`${atom.wimp}\0transitions`) ?? [])
    const conditionRecords = sortByPosition(declarationsByWimpSection.get(`${atom.wimp}\0conditions`) ?? [])
    const processRecords = declarationsByWimpSection.get(`${atom.wimp}\0processes`) ?? []

    atomIdByBraneIndex.push(atom.id)
    braneIndexByAtomId.push([atom.id, braneIndex])
    wimpSrcByAtomId.push([atom.id, atom.wimp])
    const atomIds = atomIdsByWimpSrc.get(atom.wimp)
    if (atomIds) atomIds.push(atom.id)
    else atomIdsByWimpSrc.set(atom.wimp, [atom.id])

    const values: MatrixInputBrane["values"] = []
    for (const fieldRecord of fieldRecords) {
      const fieldId = integer(fieldRecord.value.id)
      if (fieldId === null) continue
      const runtimeFieldIndex = dataFields.length
      const variants = enumValuesByField.get(fieldId) ?? []
      const storedValue = valuesByAtomField.get(`${atom.id}\0${fieldId}`)
      const value = storedValue === undefined
        ? fallbackFieldValue(fieldRecord.value, variants)
        : matrixBraneValue(clone(storedValue))
      const wimpFieldId = nextProjectionFieldId++

      dataFields.push(matrixField(fieldRecord.value, variants))
      values.push([runtimeFieldIndex, value])
      runtimeFieldIndexByAtomField.set(`${atom.id}\0${fieldId}`, runtimeFieldIndex)
      runtimeFieldIndexByAtomFieldId.push([atom.id, fieldId, runtimeFieldIndex])
      runtimeFieldIndexByWimpFieldId.push([wimpFieldId, runtimeFieldIndex])
      wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [wimpFieldId]
      braneIndexByWimpFieldId.push([wimpFieldId, braneIndex])

      if (fieldRecord.value.type === "enum" || fieldRecord.value.type === "array") {
        topologyWimpFieldIds.push(wimpFieldId)
        topologyAtomFieldIds.push([atom.id, fieldId])
      }
    }

    const normalizedStates: NormalizedState[] = stateRecords.flatMap((state) => {
      const id = integer(state.value.id)
      const name = text(state.value.name) ?? text(state.value.key)
      return id === null || name === null ? [] : [{id, name}]
    })
    const stateIndexById = new Map(normalizedStates.map((state, index) => [state.id, index] as const))
    const stateNamesForAtom = normalizedStates.map((state) => state.name)
    const stateIdsForAtom = normalizedStates.map((state) => state.id)
    const selectedState = normalizedStates.length === 0
      ? STATE_NONE
      : atom.state === null
        ? STATE_UNDEFINED
        : (stateIndexById.get(atom.state) ?? STATE_UNDEFINED)

    const processStateNames = new Set(
      processRecords
        .map((process) => text(process.value.state) ?? text(process.value.key) ?? process.localId)
        .filter((name) => name.length > 0),
    )
    const conditionsByTransition = group(conditionRecords, (condition) => integer(condition.value.transition) ?? -1)
    const transitionsByState = group(transitionRecords, (transition) => integer(transition.value.fromState) ?? -1)
    const collapses: MatrixInputBrane["collapses"] = normalizedStates.map((state) =>
      (transitionsByState.get(state.id) ?? []).map((transition) => {
        const transitionId = integer(transition.value.id)
        const targetId = integer(transition.value.toState)
        if (transitionId === null || targetId === null) return null
        const targetState = stateIndexById.get(targetId)
        if (targetState === undefined) return null
        const transitionConditions: Record<number, MatrixConditionValue> = {}
        for (const condition of conditionsByTransition.get(transitionId) ?? []) {
          const fieldId = integer(condition.value.field)
          if (fieldId === null) continue
          const runtimeFieldIndex = runtimeFieldIndexByAtomField.get(`${atom.id}\0${fieldId}`)
          if (runtimeFieldIndex === undefined) continue
          transitionConditions[runtimeFieldIndex] = predicateValue(condition.value)
        }
        return [targetState, transitionConditions]
      }),
    )

    stateNames[braneIndex] = stateNamesForAtom
    stateMetaStateIdsByBraneIndex[braneIndex] = stateIdsForAtom
    stateHasProcessByBraneIndex[braneIndex] = stateNamesForAtom.map((name) => processStateNames.has(name))
    branes.push({values, state: selectedState, collapses})
  }

  return {
    ok: true,
    version: 1,
    runtime: {
      atomIdByBraneIndex,
      braneIndexByAtomId,
      wimpSrcByAtomId,
      atomIdsByWimpSrc: [...atomIdsByWimpSrc.entries()].map(([src, atomIds]) => [src, [...atomIds]]),
      runtimeFieldIndexByAtomFieldId,
    },
    data: {fields: dataFields, branes, stateNames},
    strong: {
      runtimeFieldIndexByWimpFieldId,
      wimpFieldIdsByRuntimeFieldIndex,
      braneIndexByWimpFieldId,
      topologyWimpFieldIds,
      topologyAtomFieldIds,
    },
    weak: {stateMetaStateIdsByBraneIndex, stateHasProcessByBraneIndex},
  }
}

const emptyPreparedData = (): MatrixData => ({
  fields: [],
  stringTable: [""],
  sharedBlocks: [],
  sharedValues: [],
  branes: [],
  braneValues: [],
  braneSharedBlockRefs: [],
  stateTable: [],
  transitions: [],
  conditions: [],
  states: [],
  stateNames: [],
})

const applyPreparedData = (prepared: MatrixData): void => {
  Object.assign(matrix$, prepared)
}

const atomFieldKey = (atomId: number, fieldId: number): string => `${atomId}\0${fieldId}`

const resetStores = (): void => {
  weak$.dispose()
  applyPreparedData(emptyPreparedData())
  gravity$.activeAtomIds = []
  gravity$.atomIdToBraneIndex.clear()
  gravity$.braneIndexToAtomId = []
  gravity$.wimpSrcByAtomId.clear()
  gravity$.atomIdsByWimpSrc.clear()
  gravity$.structuralDirty = false
  strong$.runtimeFieldIndexByWimpFieldId.clear()
  strong$.wimpFieldIdsByRuntimeFieldIndex = []
  strong$.braneIndexByWimpFieldId.clear()
  strong$.topologyWimpFieldIds.clear()
  strong$.runtimeFieldIndexByAtomFieldId.clear()
  strong$.atomFieldIdsByRuntimeFieldIndex = []
  strong$.topologyAtomFieldIds.clear()
}

let preparedBirth = false

/** Matrix Monad prepares the permanent Store and Weak resources before runtime birth. */
export async function prepareMatrixBirth(value: unknown): Promise<{atoms: number; fields: number; backend: string}> {
  if (!isBoundaryInitialState(value)) throw new Error("Boundary returned invalid initial state")
  const snapshot = buildMatrixRuntime(value)
  validateData(snapshot.data)
  resetStores()
  applyPreparedData(assembleStoredMatrixData(flattenMatrixData(snapshot.data)))
  await weakInit(matrix$)

  gravity$.activeAtomIds = [...snapshot.runtime.atomIdByBraneIndex]
  gravity$.braneIndexToAtomId = [...snapshot.runtime.atomIdByBraneIndex]
  gravity$.atomIdToBraneIndex = new Map(snapshot.runtime.braneIndexByAtomId)
  gravity$.wimpSrcByAtomId = new Map(snapshot.runtime.wimpSrcByAtomId)
  gravity$.atomIdsByWimpSrc = new Map(snapshot.runtime.atomIdsByWimpSrc.map(([src, ids]) => [src, [...ids]]))
  gravity$.structuralDirty = false

  strong$.runtimeFieldIndexByWimpFieldId = new Map(snapshot.strong.runtimeFieldIndexByWimpFieldId)
  strong$.wimpFieldIdsByRuntimeFieldIndex = snapshot.strong.wimpFieldIdsByRuntimeFieldIndex.map((ids) => [...ids])
  strong$.braneIndexByWimpFieldId = new Map(snapshot.strong.braneIndexByWimpFieldId)
  strong$.topologyWimpFieldIds = new Set(snapshot.strong.topologyWimpFieldIds)
  strong$.runtimeFieldIndexByAtomFieldId = new Map(
    snapshot.runtime.runtimeFieldIndexByAtomFieldId.map(([atomId, fieldId, fieldIndex]) => [
      atomFieldKey(atomId, fieldId),
      fieldIndex,
    ]),
  )
  strong$.atomFieldIdsByRuntimeFieldIndex = []
  for (const [atomId, fieldId, runtimeFieldIndex] of snapshot.runtime.runtimeFieldIndexByAtomFieldId) {
    const bucket = strong$.atomFieldIdsByRuntimeFieldIndex[runtimeFieldIndex]
    if (bucket) bucket.push([atomId, fieldId])
    else strong$.atomFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [[atomId, fieldId]]
  }
  strong$.topologyAtomFieldIds = new Set(
    snapshot.strong.topologyAtomFieldIds.map(([atomId, fieldId]) => atomFieldKey(atomId, fieldId)),
  )
  weak$.stateMetaStateIdsByBraneIndex = snapshot.weak.stateMetaStateIdsByBraneIndex.map((ids) => [...ids])
  weak$.stateHasProcessByBraneIndex = snapshot.weak.stateHasProcessByBraneIndex.map((items) => [...items])
  preparedBirth = true

  return {
    atoms: snapshot.runtime.atomIdByBraneIndex.length,
    fields: snapshot.data.fields.length,
    backend: weak$.mode,
  }
}

/** Consumed exactly once by the newly born runtime module. */
export function consumePreparedMatrixBirth(): boolean {
  const prepared = preparedBirth
  preparedBirth = false
  return prepared
}
