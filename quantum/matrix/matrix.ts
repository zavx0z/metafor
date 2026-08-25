/**
 * Причинный оркестратор Matrix.
 *
 * Все операции, способные изменить Field, lock или структурную проекцию,
 * входят в один {@link AsyncGate}. Операция удерживает очередь до чтения
 * результата Weak и публикации Photon, но не ждёт исполнения Process в Energy.
 * Ошибка обработки входящей Particle возвращается в Force, после чего Matrix
 * завершает процесс с ненулевым кодом.
 *
 * @see [Порядок изменений Fields и структуры](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/matrix.spec.ts)
 * @see [Process завершается только после Boundary commit](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/matrix.spec.ts#L72-L233)
 * @see [Критическая ошибка завершает процесс Matrix](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/runtime-failure.spec.ts)
 *
 * @packageDocumentation
 */

import {gravity$} from "@matrix/gravity/store.ts"
import {matrix$} from "./store"
import type {MatrixFieldValueRecord, MatrixStore, MatrixValue} from "@matrix/types/store"
import type {MatrixFieldRecord} from "@matrix/types/data"
import type {AsyncGate, MatrixPendingProcessExecution, MatrixUpdateOptions} from "@matrix/types/runtime"
import type {
  ProcessExecutionClaim,
  ProcessExecutionGrant,
  ProcessResultCommit,
} from "shared/protocol/force/execution"
import {isProcessExecutionId} from "shared/protocol/force/execution"
import {FieldType} from "@matrix/gravity"
import {createStoredStringInterner, normalizeFieldValue, strong$} from "@matrix/strong"
import {StepMode, weakHeapUpdate, weakRunStep, weakStructuralUpdate, weak$} from "@matrix/weak"
import {resolveForceFieldId, resolveForceFieldsPayload} from "shared/protocol/force/fields"
import type {Particle} from "shared/protocol/force/particle"
import {Force} from "shared/transport/force"
import {consumePreparedMatrixBirth, consumePreparedMatrixProcessRestarts} from "./birth.ts"
import {applyMatrixProjectionParticle, recordMatrixProjectionState} from "./graph/projection.ts"
import {
  applyIncrementalMatrixProjection,
  initializeIncrementalMatrixIndexes,
} from "./incremental.ts"

let force: Force
const matrixGate: AsyncGate = {pending: null}
const pendingProcessExecutionsByAtomId = new Map<number, MatrixPendingProcessExecution>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const sameMatrixValue = (left: MatrixValue, right: MatrixValue): boolean =>
  Object.is(left, right) || (
    Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  )

const atomFieldKey = (atomId: number, fieldId: number): string =>
  `${atomId}\0${fieldId}`

const runExclusive = async <T>(gate: AsyncGate, task: () => Promise<T>): Promise<T> => {
  const previous = gate.pending
  let release: (() => void) | undefined
  gate.pending = new Promise<void>((resolve) => {
    release = resolve
  })

  if (previous) await previous

  try {
    return await task()
  } finally {
    release?.()
  }
}

const parseAtomIdPath = (path: Particle["path"]): number | null =>
  typeof path === "number" && Number.isSafeInteger(path) && path > 0 ? path : null

const isTopologyCompatibleAtomField = (atomId: number, fieldId: number, runtimeFieldIndex: number): boolean => {
  if (strong$.topologyAtomFieldIds.has(atomFieldKey(atomId, fieldId))) return true
  const field = matrix$.fields[runtimeFieldIndex]
  return field?.enum !== undefined || field?.type === FieldType.ARRAY_PTR
}

const collectAtomFieldUpdates = (
  parts: Particle[],
  kind: "gluon" | "higgs",
): Array<[braneIndex: number, fieldUpdates: Array<[fieldIndex: number, value: unknown]>]> => {
  const groupedUpdates = new Map<number, Array<[number, unknown]>>()

  for (const part of parts) {
    if (part.part !== kind || (part.op !== "replace" && part.op !== "remove" && part.op !== "add")) continue
    const atomId = parseAtomIdPath(part.path)
    if (atomId === null) continue
    const braneIndex = gravity$.getBraneIndexByAtomId(atomId)
    if (braneIndex === undefined) continue
    const fields = resolveForceFieldsPayload(part.value)
    if (fields === null) continue

    for (const [address, value] of Object.entries(fields)) {
      const fieldId = resolveForceFieldId(address)
      if (fieldId === null) continue
      const runtimeFieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(atomFieldKey(atomId, fieldId))
      if (runtimeFieldIndex === undefined) continue
      const field = matrix$.fields[runtimeFieldIndex]
      if (!field) continue
      const isTopology = isTopologyCompatibleAtomField(atomId, fieldId, runtimeFieldIndex)
      if (kind === "gluon" && isTopology) continue
      if (kind === "higgs" && !isTopology) continue

      const fieldUpdates = groupedUpdates.get(braneIndex)
      const nextValue = part.op === "remove" ? null : value
      if (fieldUpdates) fieldUpdates.push([runtimeFieldIndex, nextValue])
      else groupedUpdates.set(braneIndex, [[runtimeFieldIndex, nextValue]])
    }
  }

  return Array.from(groupedUpdates, ([braneIndex, fieldUpdates]) => [braneIndex, fieldUpdates])
}

const markHiggsClassScopeDirty = (parts: Particle[]): void => {
  for (const part of parts) {
    if (part.part !== "higgs" || (part.op !== "replace" && part.op !== "remove" && part.op !== "add")) continue
    if (typeof part.path !== "string") continue
    const fields = resolveForceFieldsPayload(part.value)
    if (fields === null) continue
    if (!Object.keys(fields).some((address) => resolveForceFieldId(address) !== null)) continue
    if (gravity$.getAtomIdsByWimpSrc(part.path).length === 0) continue
    gravity$.structuralDirty = true
  }
}

const applyRuntimeFieldParts = async (
  parts: Particle[],
  kind: "gluon" | "higgs",
): Promise<[number, number][]> => {
  if (!weak$.initialized) return []
  if (kind === "higgs") markHiggsClassScopeDirty(parts)

  const committedExecutionId = parts.length === 1 && isProcessExecutionId(parts[0]?.from)
    ? parts[0]!.from
    : null
  if (committedExecutionId) {
    const atomId = parseAtomIdPath(parts[0]!.path)
    const pending = atomId === null ? undefined : pendingProcessExecutionsByAtomId.get(atomId)
    if (!pending || pending.processExecutionId !== committedExecutionId) return []
  }

  const updates = collectAtomFieldUpdates(parts, kind)
  if (updates.length === 0) return []
  return await update(updates, {
    retriggerProcessStates: committedExecutionId === null,
  })
}

const publishPhotonChanges = (changes: [number, number][]): void => {
  for (const [braneIndex, stateIndex] of changes) {
    const atomId = gravity$.getAtomId(braneIndex)
    if (atomId === undefined) continue
    const stateName = matrix$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue
    recordMatrixProjectionState(
      atomId,
      weak$.stateMetaStateIdsByBraneIndex[braneIndex]?.[stateIndex] ?? null,
    )

    const hasProcess = weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] === true
    const pending = hasProcess ? pendingProcessExecutionsByAtomId.get(atomId) : undefined
    force.impulse({parts: [{
      part: "photon",
      op: hasProcess ? "test" : "replace",
      path: atomId,
      ts: Date.now(),
      ...(pending ? {from: pending.processExecutionId} : {}),
      value: stateName,
    }]})
  }
}

const applyStructuralProjection = async (
  projection: ReturnType<typeof applyMatrixProjectionParticle>,
): Promise<void> => {
  await runExclusive(matrixGate, async () => {
    const incremental = await applyIncrementalMatrixProjection(projection)
    for (const atomId of incremental.invalidatedAtomIds) pendingProcessExecutionsByAtomId.delete(atomId)
    for (const preserved of incremental.preservedProcessStates) {
      const pending = pendingProcessExecutionsByAtomId.get(preserved.atomId)
      if (!pending || pending.braneIndex !== preserved.braneIndex) continue
      pending.stateIndex = preserved.stateIndex
    }
    weakStructuralUpdate(incremental.weakUpdate)
    const stateChanges = await weakRunStep(StepMode.UndefinedOnly)
    const targets = new Map<string, [number, number]>()
    for (const change of stateChanges) {
      targets.set(`${change[0]}\0${change[1]}`, change)
    }
    for (const braneIndex of incremental.processCandidateBraneIndexes) {
      const stateIndex = matrix$.states[braneIndex]
      if (stateIndex !== undefined) targets.set(`${braneIndex}\0${stateIndex}`, [braneIndex, stateIndex])
    }
    const photonTargets = [...targets.values()]
    if (photonTargets.length > 0) {
      syncProcessLocksForChanges(photonTargets, stateChanges)
      publishPhotonChanges(photonTargets)
    }
  })
}

const collectProcessExecutionFields = (atomId: number, braneIndex: number): Record<string, unknown> => {
  const fields: Record<string, unknown> = {}

  for (let runtimeFieldIndex = 0; runtimeFieldIndex < strong$.atomFieldIdsByRuntimeFieldIndex.length; runtimeFieldIndex++) {
    for (const [fieldAtomId, fieldId] of strong$.atomFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] ?? []) {
      if (fieldAtomId !== atomId) continue
      const value = matrix$.getFieldValue(braneIndex, runtimeFieldIndex)
      if (value === undefined) continue
      const field = matrix$.fields[runtimeFieldIndex]
      if (field?.enum !== undefined && typeof value === "number") {
        fields[String(fieldId)] = structuredClone(field.enum[value])
      } else if (field?.type === FieldType.STRING_PTR && typeof value === "number") {
        fields[String(fieldId)] = matrix$.stringTable[value] ?? ""
      } else if (field?.type === FieldType.ARRAY_PTR && field.elementType === "string" && Array.isArray(value)) {
        fields[String(fieldId)] = value.map((item) => typeof item === "number" ? matrix$.stringTable[item] ?? "" : "")
      } else {
        fields[String(fieldId)] = structuredClone(value satisfies MatrixValue)
      }
    }
  }

  return fields
}

const cloneProcessExecutionFields = (fields: Record<string, unknown>): Record<string, unknown> =>
  structuredClone(fields) as Record<string, unknown>

const rememberPendingProcessExecution = (braneIndex: number, stateIndex: number): void => {
  const atomId = gravity$.getAtomId(braneIndex)
  if (atomId === undefined) return
  pendingProcessExecutionsByAtomId.set(atomId, {
    braneIndex,
    stateIndex,
    processExecutionId: crypto.randomUUID(),
    fields: cloneProcessExecutionFields(collectProcessExecutionFields(atomId, braneIndex)),
  })
}

const clearPendingProcessExecution = (braneIndex: number): void => {
  const atomId = gravity$.getAtomId(braneIndex)
  if (atomId !== undefined) pendingProcessExecutionsByAtomId.delete(atomId)
}

const syncProcessLocksForChanges = (changes: [number, number][], stateChanges: [number, number][]): void => {
  const weakUpdates: Array<{kind: "lock"; braneIndex: number; value: boolean}> = []
  const stateChangeKeys = new Set(stateChanges.map(([braneIndex, stateIndex]) => `${braneIndex}\0${stateIndex}`))

  for (const [braneIndex, stateIndex] of changes) {
    const shouldLock = weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] === true
    const brane = matrix$.branes[braneIndex]
    if (!brane) continue

    const isStateChange = stateChangeKeys.has(`${braneIndex}\0${stateIndex}`)
    if (isStateChange) {
      brane.lock = shouldLock
      weakUpdates.push({kind: "lock", braneIndex, value: shouldLock})
    } else {
      if (brane.lock === shouldLock) continue
      brane.lock = shouldLock
      weakUpdates.push({kind: "lock", braneIndex, value: shouldLock})
    }

    if (shouldLock) rememberPendingProcessExecution(braneIndex, stateIndex)
    else clearPendingProcessExecution(braneIndex)
  }

  if (weakUpdates.length > 0) weakHeapUpdate(weakUpdates)
}

const currentBraneHasProcess = (braneIndex: number): boolean => {
  const stateIndex = matrix$.states[braneIndex]
  return stateIndex !== undefined && weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] === true
}

const applyEnergyExecutionRequest = (part: Particle): void => {
  if (part.part !== "z" || part.op !== "test") return
  const atomId = parseAtomIdPath(part.path)
  if (atomId === null) return
  const braneIndex = gravity$.getBraneIndexByAtomId(atomId)
  if (braneIndex === undefined) return
  const brane = matrix$.branes[braneIndex]
  if (!brane?.lock) return

  const stateIndex = matrix$.states[braneIndex]
  if (stateIndex === undefined || !currentBraneHasProcess(braneIndex)) return

  const pending = pendingProcessExecutionsByAtomId.get(atomId)
  if (
    !pending ||
    pending.braneIndex !== braneIndex ||
    pending.stateIndex !== stateIndex ||
    pending.acceptedEnergy !== undefined ||
    !isRecord(part.value)
  ) return

  const claim = part.value as Partial<ProcessExecutionClaim>
  if (
    typeof claim.energy !== "string" ||
    claim.energy.trim().length === 0 ||
    claim.processExecutionId !== pending.processExecutionId
  ) return

  const energy = claim.energy.trim()
  pending.acceptedEnergy = energy
  const grant: ProcessExecutionGrant = {
    processExecutionId: pending.processExecutionId,
    fields: cloneProcessExecutionFields(pending.fields),
  }

  force.impulse({parts: [{
    part: "z",
    op: "copy",
    path: atomId,
    ts: Date.now(),
    from: energy,
    value: grant,
  }]})
}

const applyCommittedWeakResult = async (part: Particle): Promise<boolean> => {
  if ((part.part !== "w+" && part.part !== "w-") || part.op !== "copy") return false
  const atomId = parseAtomIdPath(part.path)
  if (atomId === null) return false
  const braneIndex = gravity$.getBraneIndexByAtomId(atomId)
  if (braneIndex === undefined) return true
  const brane = matrix$.branes[braneIndex]
  if (!brane?.lock || !currentBraneHasProcess(braneIndex)) return true

  const pending = pendingProcessExecutionsByAtomId.get(atomId)
  if (!pending?.acceptedEnergy || !isRecord(part.value)) return true
  const commit = part.value as Partial<ProcessResultCommit>
  if (
    part.from !== pending.processExecutionId ||
    commit.processExecutionId !== pending.processExecutionId ||
    commit.energy !== pending.acceptedEnergy ||
    typeof commit.processId !== "number"
  ) return true

  pendingProcessExecutionsByAtomId.delete(atomId)
  await update([[braneIndex, [], false]], {
    retriggerProcessStates: false,
    skipProcessRetriggerBraneIndexes: [braneIndex],
  })
  return true
}

export function listMatrixRuntimeAtomIds(): number[] {
  return [...gravity$.activeAtomIds]
}

const collectProcessStateRetriggers = (
  updatedBraneIndexes: Iterable<number>,
  changes: [number, number][],
  skipBraneIndexes: Iterable<number> = [],
): [number, number][] => {
  const changedBraneIndexes = new Set(changes.map(([braneIndex]) => braneIndex))
  const skippedBraneIndexes = new Set(skipBraneIndexes)
  const retriggers: [number, number][] = []

  for (const braneIndex of updatedBraneIndexes) {
    if (changedBraneIndexes.has(braneIndex) || skippedBraneIndexes.has(braneIndex)) continue
    const stateIndex = matrix$.states[braneIndex]
    if (stateIndex === undefined) continue
    if (weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] !== true) continue
    retriggers.push([braneIndex, stateIndex])
  }

  return retriggers
}

function requireInitializedStore(store$: MatrixStore): void {
  if (!store$.fields.length && !store$.branes.length) {
    throw new Error("Store not initialized. Matrix must be born first.")
  }
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
}

function findMutableFieldRecord(
  store$: MatrixStore,
  braneIndex: number,
  fieldIndex: number,
): MatrixFieldValueRecord {
  if (!store$.branes[braneIndex]) throw new Error(`Brane index out of range: ${braneIndex}`)
  const fieldRecord = store$.getField(braneIndex, fieldIndex)
  if (fieldRecord) return fieldRecord
  throw new Error(`Field ${fieldIndex} not found in brane ${braneIndex}`)
}

/**
 * Применяет изменения Fields или lock и выполняет один полный шаг Weak.
 *
 * Один вызов может изменить State каждой затронутой незаблокированной Brane не
 * более одного раза. Публикация вызванных Photon входит в ту же
 * последовательную операцию. Активный Process не удерживает эту очередь:
 * его Brane пропускается вычислением, а остальные Branes продолжают работу.
 *
 * @param updates Изменения, сгруппированные по адресу Brane.
 * @param options Управление повторным сигналом Process при внутренних
 * подтверждениях и структурной перестройке.
 * @returns Пары адреса Brane и нового State для фактических переходов.
 * @throws Если Store не рождён либо указан неизвестный Brane или Field.
 *
 * @see [Заблокированная Brane сохраняет Field и не меняет State](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/update.spec.ts)
 * @see [Параллельные update сохраняют порядок](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/update.spec.ts)
 */
export async function update(
  updates: Array<[braneIndex: number, fieldUpdates: Array<[fieldIndex: number, value: unknown]>, lock?: boolean]>,
  options: MatrixUpdateOptions = {},
): Promise<[number, number][]> {
  return await runExclusive(matrixGate, async () => {
    requireInitializedStore(matrix$)
    const stringInterner = createStoredStringInterner(matrix$.stringTable)
    const weakUpdates: Array<
      {kind: "field"; braneIndex: number; fieldIndex: number} |
      {kind: "lock"; braneIndex: number; value: boolean}
    > = []
    const affectedBraneIndexes = new Set<number>()
    let explicitTick = false

    for (const [braneIndex, fieldUpdates, lock] of updates) {
      const brane = matrix$.branes[braneIndex]
      if (!brane) throw new Error(`Brane index out of range: ${braneIndex}`)
      if (fieldUpdates.length === 0 && lock === undefined) explicitTick = true
      if (lock !== undefined) explicitTick = true

      if (lock !== undefined) {
        if (brane.lock !== lock) {
          brane.lock = lock
          weakUpdates.push({kind: "lock", braneIndex, value: lock})
        }
      }

      for (const [fieldIndex, value] of fieldUpdates) {
        const field = matrix$.fields[fieldIndex]
        if (!field) throw new Error(`Field ${fieldIndex} not defined`)
        const record = findMutableFieldRecord(matrix$, braneIndex, fieldIndex)
        const next = normalizeFieldValue(value, field, stringInterner)
        if (sameMatrixValue(record.value, next)) continue
        record.value = next
        weakUpdates.push({kind: "field", braneIndex, fieldIndex})
        affectedBraneIndexes.add(braneIndex)

        for (const [atomId] of strong$.atomFieldIdsByRuntimeFieldIndex[fieldIndex] ?? []) {
          const affectedBraneIndex = gravity$.getBraneIndexByAtomId(atomId)
          if (affectedBraneIndex !== undefined) affectedBraneIndexes.add(affectedBraneIndex)
        }
        for (const wimpFieldId of strong$.wimpFieldIdsByRuntimeFieldIndex[fieldIndex] ?? []) {
          const affectedBraneIndex = strong$.braneIndexByWimpFieldId.get(wimpFieldId)
          if (affectedBraneIndex !== undefined) affectedBraneIndexes.add(affectedBraneIndex)
        }
      }
    }

    if (weakUpdates.length === 0 && !explicitTick) return []
    weakHeapUpdate(weakUpdates)
    const changes = await weakRunStep()
    const photonTargets = options.retriggerProcessStates === false
      ? changes
      : [
          ...changes,
          ...collectProcessStateRetriggers(
            affectedBraneIndexes,
            changes,
            options.skipProcessRetriggerBraneIndexes,
          ),
        ]

    syncProcessLocksForChanges(photonTargets, changes)
    publishPhotonChanges(photonTargets)
    return changes
  })
}

const preparedBirth = consumePreparedMatrixBirth()
const restartProcessAtomIds = preparedBirth ? consumePreparedMatrixProcessRestarts() : []
if (preparedBirth) initializeIncrementalMatrixIndexes()
const birthChanges = preparedBirth ? await weakRunStep(StepMode.UndefinedOnly) : []
const restartedProcessStates: [number, number][] = []
for (const atomId of restartProcessAtomIds) {
  const braneIndex = gravity$.getBraneIndexByAtomId(atomId)
  const stateIndex = braneIndex === undefined ? undefined : matrix$.states[braneIndex]
  if (
    braneIndex === undefined || stateIndex === undefined ||
    weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] !== true
  ) throw new Error(`Cold Process restart target is invalid for Atom ${atomId}`)
  restartedProcessStates.push([braneIndex, stateIndex])
}
const birthPhotonTargets = [...birthChanges, ...restartedProcessStates]
if (birthPhotonTargets.length > 0) syncProcessLocksForChanges(birthPhotonTargets, birthChanges)

force = new Force("matrix")
force.onImpulseError = () => {
  process.exit(1)
}
force.onImpulse = async (impulse) => {
  const part = impulse.parts[0]
  const projection = applyMatrixProjectionParticle(part)

  if (projection.structural) {
    await applyStructuralProjection(projection)
    return
  }

  if (part.part === "gluon" || part.part === "higgs") {
    await applyRuntimeFieldParts([part], part.part)
    return
  }
  if (part.part === "z") {
    applyEnergyExecutionRequest(part)
    return
  }
  if (part.part === "w+" || part.part === "w-") {
    await applyCommittedWeakResult(part)
  }
}

if (birthPhotonTargets.length > 0) publishPhotonChanges(birthPhotonTargets)

export {FieldType} from "./gravity"
export {gravity$}
export {matrix$}
export {strong$}
