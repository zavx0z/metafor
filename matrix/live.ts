import type {MatrixConditionRecord} from "@metafor/types/matrix/condition"
import type {MatrixFieldRecord} from "@metafor/types/matrix/data"
import {STATE_NONE, STATE_UNDEFINED} from "@metafor/types/matrix/runtime"
import type {MatrixScalarValue, MatrixStateRecord, MatrixTransitionRecord} from "@metafor/types/matrix/store"
import type {Particle} from "@metafor/types/force/particle"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"
import {Force} from "force"
import {gravity$} from "@matrix/gravity/store.ts"
import {FieldType, parseCondition} from "@matrix/gravity"
import {createStoredStringInterner, normalizeFieldValue, strong$} from "@matrix/strong"
import {StepMode, weak$, weakHeapUpdate, weakInit, weakReconfigure, weakRunStep} from "@matrix/weak"
import {OP} from "@matrix/weak/constants.ts"
import {matrix$} from "./store.ts"
import {MatrixProjectionStore, type MatrixDeclarationRecord} from "./projection.ts"

const force = new Force("matrix")
export const matrixProjection$ = new MatrixProjectionStore()

const freeBraneIndexes: number[] = []
const fieldIdByRuntimeIndex: number[] = []

type PendingExecution = {
  execution: string
  state: string
  fields: Record<string, unknown>
  acceptedEnergy?: string
}

const pendingByActorId = new Map<number, PendingExecution>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const actorFieldKey = (actorId: number, fieldId: number): string => `${actorId}\0${fieldId}`
const declarationId = (record: MatrixDeclarationRecord): number | null => numeric(record.id)

const fieldRecord = (record: MatrixDeclarationRecord, variants: MatrixDeclarationRecord[]): MatrixFieldRecord => {
  const type = record.type
  if (type === "boolean") return {type: FieldType.BOOL}
  if (type === "string") return {type: FieldType.STRING_PTR}
  if (type === "array") {
    const sample = Array.isArray(record.default) ? record.default.find((item) => item !== null && item !== undefined) : undefined
    const elementType = typeof sample === "boolean" ? "boolean" : typeof sample === "string" ? "string" : "number"
    return {type: FieldType.ARRAY_PTR, elementType}
  }
  if (type === "enum") {
    return {
      type: FieldType.U32,
      enum: variants
        .filter((variant) => variant.field === record.id)
        .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
        .map((variant) => variant.itemValue ?? variant.value),
    }
  }
  return {type: FieldType.F32}
}

const ensureFields = (wimp: string): void => {
  const variants = matrixProjection$.declaration(wimp, "variants")
  const active = new Set<number>()
  for (const record of matrixProjection$.declaration(wimp, "fields")
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))) {
    const fieldId = declarationId(record)
    if (fieldId === null) continue
    active.add(fieldId)
    let index = strong$.runtimeFieldIndexByWimpFieldId.get(fieldId)
    if (index === undefined) {
      index = matrix$.fields.length
      matrix$.fields.push(fieldRecord(record, variants))
      strong$.runtimeFieldIndexByWimpFieldId.set(fieldId, index)
      strong$.wimpFieldIdsByRuntimeFieldIndex[index] = [fieldId]
      strong$.actorFieldIdsByRuntimeFieldIndex[index] = []
      fieldIdByRuntimeIndex[index] = fieldId
    } else matrix$.fields[index] = fieldRecord(record, variants)
    if (record.type === "enum" || record.type === "array") strong$.topologyWimpFieldIds.add(fieldId)
    else strong$.topologyWimpFieldIds.delete(fieldId)
  }
  for (const [fieldId] of strong$.runtimeFieldIndexByWimpFieldId) {
    const declaration = matrixProjection$.declaration(wimp, "fields").find((record) => record.id === fieldId)
    if (!declaration || active.has(fieldId)) continue
    strong$.runtimeFieldIndexByWimpFieldId.delete(fieldId)
    strong$.topologyWimpFieldIds.delete(fieldId)
  }
}

const normalizeConditionScalar = (
  value: unknown,
  field: MatrixFieldRecord,
  op: number,
  interner: ReturnType<typeof createStoredStringInterner>,
): MatrixScalarValue => {
  if (field.enum) return normalizeFieldValue(value, field, interner) as number
  if (field.type === FieldType.F32 || field.type === FieldType.U32) return Number(value)
  if (field.type === FieldType.BOOL) return Boolean(value)
  if (field.type === FieldType.STRING_PTR) return normalizeFieldValue(value, field, interner) as number
  if (field.type === FieldType.ARRAY_PTR) {
    if (op === OP.INCLUDE || op === OP.NOT_INCLUDE) {
      const element: MatrixFieldRecord = {
        type: field.elementType === "string" ? FieldType.STRING_PTR : field.elementType === "boolean" ? FieldType.BOOL : FieldType.F32,
      }
      return normalizeFieldValue(value, element, interner) as MatrixScalarValue
    }
    if (op === OP.IS_EMPTY) return Boolean(value)
  }
  return Number(value)
}

const appendStateGraph = (wimp: string): {stateOffset: number; stateCount: number; names: string[]; ids: number[]; hasProcess: boolean[]} => {
  const interner = createStoredStringInterner(matrix$.stringTable)
  const states = matrixProjection$.declaration(wimp, "states")
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
  const transitions = matrixProjection$.declaration(wimp, "transitions")
  const conditions = matrixProjection$.declaration(wimp, "conditions")
  const stateIndexById = new Map<number, number>()
  const ids: number[] = []
  const names: string[] = []
  states.forEach((state, index) => {
    const id = declarationId(state)
    if (id !== null) {
      stateIndexById.set(id, index)
      ids[index] = id
    }
    names[index] = typeof state.name === "string" ? state.name : String(index)
  })

  const stateTable: MatrixStateRecord[] = []
  const compiledTransitions: MatrixTransitionRecord[] = []
  const compiledConditions: MatrixConditionRecord[] = []
  for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
    const stateId = declarationId(states[stateIndex]!)
    const offset = compiledTransitions.length
    for (const transition of transitions
      .filter((candidate) => candidate.fromState === stateId || candidate.from === stateId)
      .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))) {
      const transitionId = declarationId(transition)
      const targetId = numeric(transition.toState ?? transition.to)
      const targetState = targetId === null ? undefined : stateIndexById.get(targetId)
      if (transitionId === null || targetState === undefined) continue
      const conditionOffset = compiledConditions.length
      for (const condition of conditions
        .filter((candidate) => candidate.transition === transitionId)
        .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))) {
        const fieldId = numeric(condition.field)
        const fieldIndex = fieldId === null ? undefined : strong$.runtimeFieldIndexByWimpFieldId.get(fieldId)
        const field = fieldIndex === undefined ? undefined : matrix$.fields[fieldIndex]
        if (fieldIndex === undefined || !field) continue
        for (const check of parseCondition((condition.predicate ?? condition.value) as never)) {
          compiledConditions.push({
            fieldIndex,
            op: check.op,
            value: Array.isArray(check.val)
              ? check.val.map((item) => normalizeConditionScalar(item, field, check.op, interner))
              : normalizeConditionScalar(check.val, field, check.op, interner),
          })
        }
      }
      compiledTransitions.push({
        targetState,
        conditionOffset,
        conditionCount: compiledConditions.length - conditionOffset,
      })
    }
    stateTable.push({transitionOffset: offset, transitionCount: compiledTransitions.length - offset})
  }

  const stateOffset = matrix$.stateTable.length
  const transitionBase = matrix$.transitions.length
  const conditionBase = matrix$.conditions.length
  matrix$.conditions.push(...compiledConditions)
  matrix$.transitions.push(...compiledTransitions.map((transition) => ({
    ...transition,
    conditionOffset: conditionBase + transition.conditionOffset,
  })))
  matrix$.stateTable.push(...stateTable.map((state) => ({
    ...state,
    transitionOffset: transitionBase + state.transitionOffset,
  })))
  return {
    stateOffset,
    stateCount: states.length,
    names,
    ids,
    hasProcess: names.map((name) => processForState(wimp, name) !== undefined),
  }
}

const clearActorFieldMappings = (actorId: number): void => {
  for (const [key, index] of [...strong$.runtimeFieldIndexByActorFieldId]) {
    if (!key.startsWith(`${actorId}\0`)) continue
    strong$.runtimeFieldIndexByActorFieldId.delete(key)
    strong$.topologyActorFieldIds.delete(key)
    const entries = strong$.actorFieldIdsByRuntimeFieldIndex[index]
    if (entries) strong$.actorFieldIdsByRuntimeFieldIndex[index] = entries.filter(([id]) => id !== actorId)
  }
}

const indexGravityActor = (actorId: number, braneIndex: number, wimp: string): void => {
  gravity$.actorIdToBraneIndex.set(actorId, braneIndex)
  gravity$.braneIndexToActorId[braneIndex] = actorId
  gravity$.wimpSrcByActorId.set(actorId, wimp)
  if (!gravity$.activeActorIds.includes(actorId)) gravity$.activeActorIds.push(actorId)
  const ids = gravity$.actorIdsByWimpSrc.get(wimp) ?? []
  if (!ids.includes(actorId)) ids.push(actorId)
  gravity$.actorIdsByWimpSrc.set(wimp, ids)
}

const removeGravityActor = (actorId: number): void => {
  const braneIndex = gravity$.actorIdToBraneIndex.get(actorId)
  const wimp = gravity$.wimpSrcByActorId.get(actorId)
  gravity$.actorIdToBraneIndex.delete(actorId)
  gravity$.wimpSrcByActorId.delete(actorId)
  gravity$.activeActorIds = gravity$.activeActorIds.filter((id) => id !== actorId)
  if (wimp) {
    const ids = (gravity$.actorIdsByWimpSrc.get(wimp) ?? []).filter((id) => id !== actorId)
    if (ids.length > 0) gravity$.actorIdsByWimpSrc.set(wimp, ids)
    else gravity$.actorIdsByWimpSrc.delete(wimp)
  }
  if (braneIndex !== undefined) {
    gravity$.braneIndexToActorId[braneIndex] = undefined as unknown as number
    matrix$.states[braneIndex] = STATE_NONE
    const brane = matrix$.branes[braneIndex]
    if (brane) brane.lock = true
    weak$.stateMetaStateIdsByBraneIndex[braneIndex] = []
    weak$.stateHasProcessByBraneIndex[braneIndex] = []
    if (!freeBraneIndexes.includes(braneIndex)) freeBraneIndexes.push(braneIndex)
  }
  clearActorFieldMappings(actorId)
  pendingByActorId.delete(actorId)
}

const rebuildActor = (actorId: number): number | null => {
  const entity = matrixProjection$.actors.get(actorId)
  if (!entity) {
    removeGravityActor(actorId)
    return null
  }
  ensureFields(entity.actor.wimp)
  let braneIndex = gravity$.getBraneIndexByActorId(actorId)
  if (braneIndex === undefined) braneIndex = freeBraneIndexes.pop() ?? matrix$.branes.length
  clearActorFieldMappings(actorId)

  const interner = createStoredStringInterner(matrix$.stringTable)
  const localValueOffset = matrix$.braneValues.length
  for (const [fieldId, raw] of matrixProjection$.fieldValuesByActorId.get(actorId) ?? []) {
    const fieldIndex = strong$.runtimeFieldIndexByWimpFieldId.get(fieldId)
    const field = fieldIndex === undefined ? undefined : matrix$.fields[fieldIndex]
    if (fieldIndex === undefined || !field) continue
    const value = field.type === FieldType.ARRAY_PTR && !Array.isArray(raw) ? [] : raw
    matrix$.braneValues.push({fieldIndex, value: normalizeFieldValue(value, field, interner)})
    const key = actorFieldKey(actorId, fieldId)
    strong$.runtimeFieldIndexByActorFieldId.set(key, fieldIndex)
    const entries = strong$.actorFieldIdsByRuntimeFieldIndex[fieldIndex] ?? []
    if (!entries.some(([id, candidate]) => id === actorId && candidate === fieldId)) entries.push([actorId, fieldId])
    strong$.actorFieldIdsByRuntimeFieldIndex[fieldIndex] = entries
    if (strong$.topologyWimpFieldIds.has(fieldId)) strong$.topologyActorFieldIds.add(key)
  }

  const graph = appendStateGraph(entity.actor.wimp)
  const stateIndex = entity.state === null
    ? graph.stateCount > 0 ? STATE_UNDEFINED : STATE_NONE
    : Math.max(STATE_NONE, graph.names.indexOf(entity.state))
  matrix$.branes[braneIndex] = {
    localValueOffset,
    localValueCount: matrix$.braneValues.length - localValueOffset,
    sharedBlockRefOffset: matrix$.braneSharedBlockRefs.length,
    sharedBlockRefCount: 0,
    stateOffset: graph.stateOffset,
    stateCount: graph.stateCount,
    lock: pendingByActorId.has(actorId),
  }
  matrix$.states[braneIndex] = stateIndex
  matrix$.stateNames[braneIndex] = graph.names
  weak$.stateMetaStateIdsByBraneIndex[braneIndex] = graph.ids
  weak$.stateHasProcessByBraneIndex[braneIndex] = graph.hasProcess
  indexGravityActor(actorId, braneIndex, entity.actor.wimp)
  return braneIndex
}

const processForState = (wimp: string, state: string): MatrixDeclarationRecord | undefined =>
  matrixProjection$.declaration(wimp, "processes").find((process) => process.state === state || process.key === state)

const actorFields = (actorId: number): Record<string, unknown> =>
  Object.fromEntries([...(matrixProjection$.fieldValuesByActorId.get(actorId) ?? [])]
    .map(([fieldId, value]) => [String(fieldId), clone(value)]))

const clone = <T>(value: T): T => structuredClone(value)

const publishStateChanges = (changes: Array<[number, number]>): void => {
  for (const [braneIndex, stateIndex] of changes) {
    const actorId = gravity$.getActorId(braneIndex)
    const state = matrix$.getStateName(braneIndex, stateIndex)
    const actor = actorId === undefined ? undefined : matrixProjection$.actors.get(actorId)
    if (actorId === undefined || !actor || state === undefined) continue
    matrixProjection$.setActorState(actorId, state)
    const process = processForState(actor.actor.wimp, state)
    const brane = matrix$.branes[braneIndex]
    if (!brane) continue
    if (process) {
      const execution = crypto.randomUUID()
      brane.lock = true
      pendingByActorId.set(actorId, {execution, state, fields: actorFields(actorId)})
      weakHeapUpdate([{kind: "lock", braneIndex, value: true}])
      force.impulse({parts: [{part: "photon", op: "test", path: actorId, value: {state, execution}}]})
    } else {
      brane.lock = false
      pendingByActorId.delete(actorId)
      weakHeapUpdate([{kind: "lock", braneIndex, value: false}])
      force.impulse({parts: [{part: "photon", op: "replace", path: actorId, value: state}]})
    }
  }
}

const syncStructural = async (affectedActorIds: number[]): Promise<void> => {
  for (const actorId of new Set(affectedActorIds)) rebuildActor(actorId)
  if (matrix$.branes.length === 0) return
  if (!weak$.initialized) await weakInit(matrix$)
  else await weakReconfigure(matrix$)
  publishStateChanges(await weakRunStep(StepMode.UndefinedOnly))
}

const applyPackedField = (actorId: number, fieldId: number, raw: unknown): boolean => {
  const braneIndex = gravity$.getBraneIndexByActorId(actorId)
  const fieldIndex = strong$.runtimeFieldIndexByActorFieldId.get(actorFieldKey(actorId, fieldId))
  const field = fieldIndex === undefined ? undefined : matrix$.fields[fieldIndex]
  if (braneIndex === undefined || fieldIndex === undefined || !field) return false
  const record = matrix$.getField(braneIndex, fieldIndex)
  if (!record) return false
  const interner = createStoredStringInterner(matrix$.stringTable)
  record.value = normalizeFieldValue(field.type === FieldType.ARRAY_PTR && !Array.isArray(raw) ? [] : raw, field, interner)
  weakHeapUpdate([{kind: "field", braneIndex, fieldIndex}])
  return true
}

const applyFields = async (part: Particle, allowLocked = false): Promise<void> => {
  const actorId = numeric(part.path)
  const fields = resolveForceFieldsPayload(part.value)
  if (actorId === null || !fields || Object.keys(fields).length !== 1) return
  const braneIndex = gravity$.getBraneIndexByActorId(actorId)
  if (!allowLocked && braneIndex !== undefined && matrix$.branes[braneIndex]?.lock) return
  const change = matrixProjection$.applyFields(part)
  if (!change.changed) return
  let structural = false
  for (const [rawId, value] of Object.entries(fields)) {
    const fieldId = resolveForceFieldId(rawId)
    if (fieldId === null) continue
    if (part.op === "remove" || !applyPackedField(actorId, fieldId, value)) structural = true
  }
  if (structural) await syncStructural([actorId])
  else publishStateChanges(await weakRunStep(StepMode.Full))
}

const fieldPartFor = (actorId: number, fieldId: number, value: unknown): "gluon" | "higgs" =>
  strong$.topologyActorFieldIds.has(actorFieldKey(actorId, fieldId)) ? "higgs" : "gluon"

force.onImpulse = async (message) => {
  const part = message.parts[0]
  if (part.part === "graviton") {
    const change = matrixProjection$.apply(part)
    if (change.changed) await syncStructural(change.affectedActorIds)
    return
  }
  if (part.part === "gluon" || part.part === "higgs") {
    await applyFields(part)
    return
  }
  if (part.part === "z" && part.op === "test") {
    const actorId = numeric(part.path)
    const pending = actorId === null ? undefined : pendingByActorId.get(actorId)
    if (!pending || pending.acceptedEnergy !== undefined || !isRecord(part.value)) return
    if (part.value.execution !== pending.execution) return
    const energy = typeof part.value.energy === "string" ? part.value.energy.trim() : ""
    if (!energy) return
    pending.acceptedEnergy = energy
    force.impulse({parts: [{
      part: "z",
      op: "copy",
      path: actorId!,
      from: energy,
      value: {execution: pending.execution, fields: clone(pending.fields)},
    }]})
    return
  }
  if ((part.part === "w+" || part.part === "w-") && part.op === "replace") {
    const actorId = numeric(part.path)
    const pending = actorId === null ? undefined : pendingByActorId.get(actorId)
    if (!pending || !pending.acceptedEnergy || part.from !== pending.acceptedEnergy || !isRecord(part.value)) return
    if (part.value.execution !== pending.execution) return
    const fields = isRecord(part.value.fields) ? part.value.fields : {}
    for (const [rawId, value] of Object.entries(fields)) {
      const fieldId = resolveForceFieldId(rawId)
      if (fieldId === null) continue
      const kind = fieldPartFor(actorId!, fieldId, value)
      const fieldPart: Particle = {part: kind, op: "replace", path: actorId!, value: {fields: {[String(fieldId)]: clone(value)}}}
      await applyFields(fieldPart, true)
      force.impulse({parts: [fieldPart]})
    }
    const braneIndex = gravity$.getBraneIndexByActorId(actorId!)
    pendingByActorId.delete(actorId!)
    if (braneIndex !== undefined && matrix$.branes[braneIndex]) {
      matrix$.branes[braneIndex]!.lock = false
      weakHeapUpdate([{kind: "lock", braneIndex, value: false}])
      publishStateChanges(await weakRunStep(StepMode.Full))
    }
  }
}

export {gravity$, matrix$, strong$, weak$}
