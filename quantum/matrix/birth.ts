import type {
  BoundaryInitialDeclaration,
  BoundaryInitialReactionExecution,
  BoundaryInitialState,
  BoundaryInitialVariantRef,
} from "shared/protocol/boundary/initial"
import type {MatrixConditionValue} from "@matrix/types/condition"
import type {MatrixBraneValue, MatrixFieldRecord, MatrixInputBrane} from "@matrix/types/data"
import type {MatrixData} from "@matrix/types/store"
import {isReactionQueueCommit, isReactionRelation, type ReactionRelation} from "shared/protocol/force/reaction"
import {
  STATE_NONE,
  STATE_UNDEFINED,
  type MatrixRuntimeSnapshot,
} from "@matrix/types/runtime"
import {gravity$} from "@matrix/gravity/store.ts"
import {strong$} from "@matrix/strong"
import {weak$, weakInit} from "@matrix/weak"
import {matrix$} from "./store.ts"
import {hydrateMatrixProjection} from "./graph/projection.ts"
import {prepareMatrixData} from "./prepare.ts"

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

const isInitialReactionExecution = (value: unknown): value is BoundaryInitialReactionExecution =>
  isRecord(value) && Reflect.ownKeys(value).length === 2 && isReactionQueueCommit(value.queue) &&
  (value.energy === null || typeof value.energy === "string")

const isBoundaryInitialState = (value: unknown): value is BoundaryInitialState =>
  isRecord(value) && value.version === 3 && Array.isArray(value.atoms) &&
  Array.isArray(value.declarations) && Array.isArray(value.pendingProcessExecutions) &&
  Array.isArray(value.reactionRelations) && value.reactionRelations.every(isReactionRelation) &&
  Array.isArray(value.unfinishedReactionExecutions) &&
  value.unfinishedReactionExecutions.every(isInitialReactionExecution)

const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null

const clone = <T>(value: T): T => structuredClone(value)

const isVariantRef = (value: unknown): value is BoundaryInitialVariantRef =>
  isRecord(value) && value.kind === "enum" && Number.isSafeInteger(value.variant)

const resolveVariantReferences = (value: unknown, variants: Map<number, unknown>): unknown => {
  if (isVariantRef(value)) {
    if (!variants.has(value.variant)) throw new Error(`Boundary Variant ${value.variant} is missing`)
    return clone(variants.get(value.variant))
  }
  if (Array.isArray(value)) return value.map((item) => resolveVariantReferences(item, variants))
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveVariantReferences(item, variants)]),
    )
  }
  return clone(value)
}

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
  return "number"
}

const fallbackFieldValue = (
  field: JsonRecord,
  enumValues: readonly unknown[],
  variants: Map<number, unknown>,
): MatrixBraneValue => {
  if (Object.prototype.hasOwnProperty.call(field, "default")) {
    if (field.type === "enum" && isVariantRef(field.default) && !variants.has(field.default.variant)) return null
    return matrixBraneValue(resolveVariantReferences(field.default, variants))
  }
  return null
}

const matrixField = (field: JsonRecord, enumValues: readonly unknown[]): MatrixFieldRecord => {
  if (field.type === "number") return {type: fieldType.F32}
  if (field.type === "boolean") return {type: fieldType.BOOL}
  if (field.type === "array") return {type: fieldType.ARRAY_PTR, elementType: inferArrayElementType(field)}
  if (field.type === "enum") return {type: fieldType.U32, enum: [...enumValues]}
  return {type: fieldType.STRING_PTR}
}

const predicateValue = (condition: JsonRecord, variants: Map<number, unknown>): MatrixConditionValue => {
  const raw = condition.predicate ?? condition.predicates ?? condition.value ?? null
  if (
    raw === null ||
    typeof raw === "number" ||
    typeof raw === "boolean" ||
    typeof raw === "string" ||
    isRecord(raw)
  ) return resolveVariantReferences(raw, variants) as MatrixConditionValue
  throw new Error(`Unsupported Matrix condition predicate: ${JSON.stringify(raw)}`)
}

/**
 * Преобразует канонический начальный снимок Boundary в производную проекцию
 * Matrix.
 *
 * Atom без объявленных States получает {@link STATE_NONE}. Atom со States, но
 * без выбранного либо с неизвестным Meta State получает
 * {@link STATE_UNDEFINED}; режим первого шага позднее вводит его в State с
 * индексом `0`. Уже известный Meta State восстанавливается по идентичности и не
 * переигрывается при рождении.
 *
 * @param initial Один согласованный начальный снимок Boundary.
 * @returns Полностью подготовленная производная проекция Matrix.
 *
 * @see [Преобразование Boundary в Matrix](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/birth.spec.ts#L36-L104)
 * @see [Различие undefined и отсутствующего графа States](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/weak/tests/weak.parity.test.ts#L155-L237)
 */
export function buildMatrixRuntime(initial: BoundaryInitialState): MatrixRuntimeSnapshot {
  const declarationsByWimpSection = group(initial.declarations, (item) => `${item.src}\0${item.section}`)
  const valuesByAtomField = new Map(
    initial.atoms.flatMap((atom) => atom.values.map((value) => [`${atom.id}\0${value.field}`, value] as const)),
  )

  const enumVariantRecordsByField = new Map<number, BoundaryInitialDeclaration[]>()
  const enumValueByVariantId = new Map<number, unknown>()
  for (const variant of initial.declarations.filter((item) => item.section === "variants")) {
    const fieldId = integer(variant.value.field)
    const variantId = integer(variant.value.id)
    if (fieldId === null) continue
    if (variantId !== null) enumValueByVariantId.set(variantId, clone(variant.value.itemValue ?? variant.value.value ?? null))
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

  type PreparedField = {
    atomId: number
    braneIndex: number
    wimp: string
    fieldId: number
    key: string
    declaration: BoundaryInitialDeclaration
    valueId: number | null
    value: MatrixBraneValue
    runtimeFieldIndex?: number
    wimpFieldId?: number
  }
  const preparedFields: PreparedField[] = []
  for (let braneIndex = 0; braneIndex < initial.atoms.length; braneIndex++) {
    const atom = initial.atoms[braneIndex]!
    for (const declaration of sortByPosition(declarationsByWimpSection.get(`${atom.wimp}\0fields`) ?? [])) {
      const fieldId = integer(declaration.value.id)
      if (fieldId === null) continue
      const stored = valuesByAtomField.get(`${atom.id}\0${fieldId}`)
      const variants = enumValuesByField.get(fieldId) ?? []
      preparedFields.push({
        atomId: atom.id,
        braneIndex,
        wimp: atom.wimp,
        fieldId,
        key: text(declaration.value.key) ?? String(fieldId),
        declaration,
        valueId: stored ? stored.valueId : null,
        value: stored === undefined
          ? fallbackFieldValue(declaration.value, variants, enumValueByVariantId)
          : matrixBraneValue(resolveVariantReferences(stored.value, enumValueByVariantId)),
      })
    }
  }

  const sharedMembersByValueId = new Map<number, PreparedField[]>()
  for (const field of preparedFields) {
    if (field.valueId === null) continue
    const members = sharedMembersByValueId.get(field.valueId)
    if (members) members.push(field)
    else sharedMembersByValueId.set(field.valueId, [field])
  }
  for (const [valueId, members] of [...sharedMembersByValueId]) {
    if (members.length < 2) {
      sharedMembersByValueId.delete(valueId)
      continue
    }
    const types = new Set(members.map((field) => String(field.declaration.value.type)))
    const branes = new Set(members.map((field) => field.braneIndex))
    if (types.size !== 1 || branes.size !== members.length || !["string", "number", "boolean"].includes([...types][0] ?? "")) {
      throw new Error(`Boundary shared value ${valueId} is not a valid ordinary Field entanglement family`)
    }
  }

  const dataFields: MatrixFieldRecord[] = []
  const sharedRuntimeFieldIndexByValueId = new Map<number, number>()
  let nextProjectionFieldId = 1
  for (const field of preparedFields) {
    let runtimeFieldIndex = field.valueId === null
      ? undefined
      : sharedRuntimeFieldIndexByValueId.get(field.valueId)
    if (runtimeFieldIndex === undefined) {
      runtimeFieldIndex = dataFields.length
      dataFields.push(matrixField(field.declaration.value, enumValuesByField.get(field.fieldId) ?? []))
      if (field.valueId !== null && sharedMembersByValueId.has(field.valueId)) {
        sharedRuntimeFieldIndexByValueId.set(field.valueId, runtimeFieldIndex)
      }
    }
    field.runtimeFieldIndex = runtimeFieldIndex
    field.wimpFieldId = nextProjectionFieldId++
  }
  const preparedFieldByAtomField = new Map(
    preparedFields.map((field) => [`${field.atomId}\0${field.fieldId}`, field] as const),
  )
  const entanglement = {
    blocks: [...sharedMembersByValueId.entries()].map(([valueId, members]) => {
      const representative = members[0]!
      return {
        key: `value:${valueId}`,
        braneIndices: members.map((field) => field.braneIndex).sort((left, right) => left - right),
        fields: [{
          fieldIndex: representative.runtimeFieldIndex!,
          fieldName: representative.key,
          payloadIds: members.map((field) => `atom:${field.atomId}/field:${field.fieldId}`).sort(),
          semanticKeys: Array.from(new Set(members.map((field) => `${field.wimp}:${field.key}`))).sort(),
          representativeBraneIndex: representative.braneIndex,
        }],
      }
    }),
  }
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
  const restartProcessAtomIds: number[] = []
  const pendingProcessByAtomId = new Map<number, BoundaryInitialState["pendingProcessExecutions"][number]>()
  for (const execution of initial.pendingProcessExecutions) {
    if (pendingProcessByAtomId.has(execution.atom)) {
      throw new Error(`Boundary returned multiple pending Process executions for Atom ${execution.atom}`)
    }
    pendingProcessByAtomId.set(execution.atom, execution)
  }
  const runtimeFieldIndexByAtomField = new Map<string, number>()
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
      const prepared = preparedFieldByAtomField.get(`${atom.id}\0${fieldId}`)
      if (!prepared || prepared.runtimeFieldIndex === undefined || prepared.wimpFieldId === undefined) continue
      const runtimeFieldIndex = prepared.runtimeFieldIndex
      const wimpFieldId = prepared.wimpFieldId

      values.push([runtimeFieldIndex, prepared.value])
      runtimeFieldIndexByAtomField.set(`${atom.id}\0${fieldId}`, runtimeFieldIndex)
      runtimeFieldIndexByAtomFieldId.push([atom.id, fieldId, runtimeFieldIndex])
      runtimeFieldIndexByWimpFieldId.push([wimpFieldId, runtimeFieldIndex])
      const wimpFieldIds = wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex]
      if (wimpFieldIds) wimpFieldIds.push(wimpFieldId)
      else wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [wimpFieldId]
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
          transitionConditions[runtimeFieldIndex] = predicateValue(condition.value, enumValueByVariantId)
        }
        return [targetState, transitionConditions]
      }),
    )

    stateNames[braneIndex] = stateNamesForAtom
    stateMetaStateIdsByBraneIndex[braneIndex] = stateIdsForAtom
    stateHasProcessByBraneIndex[braneIndex] = stateNamesForAtom.map((name) => processStateNames.has(name))
    const pending = pendingProcessByAtomId.get(atom.id)
    if (pending) {
      const selectedName = selectedState >= 0 ? stateNamesForAtom[selectedState] : undefined
      const process = processRecords.find((record) => integer(record.value.id) === pending.process)
      const processState = process
        ? text(process.value.state) ?? text(process.value.key) ?? process.localId
        : null
      if (selectedName !== pending.state || processState !== pending.state) {
        throw new Error(`Boundary pending Process execution does not match Atom ${atom.id} current State`)
      }
      restartProcessAtomIds.push(atom.id)
    }
    branes.push({values, state: selectedState, collapses})
  }

  return {
    ok: true,
    version: 3,
    runtime: {
      atomIdByBraneIndex,
      restartProcessAtomIds,
      braneIndexByAtomId,
      wimpSrcByAtomId,
      atomIdsByWimpSrc: [...atomIdsByWimpSrc.entries()].map(([src, atomIds]) => [src, [...atomIds]]),
      runtimeFieldIndexByAtomFieldId,
      reactionRelations: clone(initial.reactionRelations),
      reactionExecutions: clone(initial.unfinishedReactionExecutions),
      confirmedStateIdByAtom: initial.atoms.map((atom) => [atom.id, atom.state]),
    },
    data: {
      fields: dataFields,
      branes,
      stateNames,
      ...(entanglement.blocks.length > 0 ? {entanglement} : {}),
    },
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

const applyPreparedData = (prepared: MatrixData): void => {
  Object.assign(matrix$, prepared)
}

const atomFieldKey = (atomId: number, fieldId: number): string => `${atomId}\0${fieldId}`

let preparedBirth = false
let preparedRestartProcessAtomIds: number[] = []
let preparedReactionRelations: ReactionRelation[] = []
let preparedReactionStates: Array<[number, number | null]> = []
let preparedReactionExecutions: BoundaryInitialReactionExecution[] = []

const prepareMatrixProjection = async (
  value: unknown,
  markBirth: boolean,
): Promise<{atoms: number; fields: number; backend: string}> => {
  if (!isBoundaryInitialState(value)) throw new Error("Boundary returned invalid initial state")
  const snapshot = buildMatrixRuntime(value)
  applyPreparedData(prepareMatrixData(snapshot.data))
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
  if (markBirth) {
    preparedBirth = true
    preparedRestartProcessAtomIds = [...snapshot.runtime.restartProcessAtomIds]
    preparedReactionRelations = clone(snapshot.runtime.reactionRelations)
    preparedReactionStates = clone(snapshot.runtime.confirmedStateIdByAtom)
    preparedReactionExecutions = clone(snapshot.runtime.reactionExecutions)
  }

  return {
    atoms: snapshot.runtime.atomIdByBraneIndex.length,
    fields: snapshot.data.fields.length,
    backend: weak$.mode,
  }
}

/**
 * Один раз подготавливает Matrix из согласованного начального снимка Boundary.
 *
 * Рабочий процесс вызывает это рождение только до открытия причинного потока.
 * Повторное рождение и восстановление внутри того же процесса не входят в
 * контракт Matrix.
 */
export async function prepareMatrixBirth(value: unknown): Promise<{atoms: number; fields: number; backend: string}> {
  if (!isBoundaryInitialState(value)) throw new Error("Boundary returned invalid initial state")
  hydrateMatrixProjection(value)
  return await prepareMatrixProjection(value, true)
}

/** Consumed exactly once by the newly born runtime module. */
export function consumePreparedMatrixBirth(): boolean {
  const prepared = preparedBirth
  preparedBirth = false
  return prepared
}

/** Consumed by the same new runtime immediately after the prepared birth marker. */
export function consumePreparedMatrixProcessRestarts(): number[] {
  const prepared = preparedRestartProcessAtomIds
  preparedRestartProcessAtomIds = []
  return prepared
}

/** Consumed by the same runtime before opening its Force input. */
export function consumePreparedMatrixReactionRelations(): ReactionRelation[] {
  const prepared = preparedReactionRelations
  preparedReactionRelations = []
  return prepared
}

/** Canonical States from the same Boundary cut as the initial relations. */
export function consumePreparedMatrixReactionStates(): Array<[number, number | null]> {
  const prepared = preparedReactionStates
  preparedReactionStates = []
  return prepared
}

/** Durable unfinished Reaction work from the same canonical initial cut. */
export function consumePreparedMatrixReactionExecutions(): BoundaryInitialReactionExecution[] {
  const prepared = preparedReactionExecutions
  preparedReactionExecutions = []
  return prepared
}
