import type {MatrixInputData} from "./data.ts"
import type {ProcessExecutionId} from "shared/protocol/force/execution"

/**
 * У Atom есть объявленные States, но текущий State ещё не выбран.
 *
 * Первый шаг в режиме рождения переводит такой Atom в State с индексом `0`.
 *
 * @see [Undefined входит в первый State](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.parity.test.ts#L155-L175)
 */
export const STATE_UNDEFINED = -1

/**
 * У Atom вообще нет объявленных States.
 *
 * Такой Atom остаётся адресуемым для Fields, но любой шаг Weak пропускает его.
 *
 * @see [Atom без States сохраняет Fields и не меняет State](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.parity.test.ts#L213-L237)
 */
export const STATE_NONE = -2

export interface MatrixRuntimeAtom {
  id: number
  parentAtom: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

export interface MatrixRuntimeAtomValue {
  atom: number
  field: number
  value: number
}

export interface MatrixRuntimeValueRecord {
  id: number
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  boolean?: boolean
  number?: number
  text?: string
  variant?: number
}

export interface MatrixRuntimeValueItem {
  value: number
  position: number
  itemValue: string
}

export interface MatrixRuntimeFieldSource {
  childAtom: number
  childField: number
  parentAtom: number
  parentField: number
}

/** One Atom is the largest structural entity Boundary exposes incrementally. */
export interface MatrixRuntimeAtomEntity {
  atom: MatrixRuntimeAtom
  values: MatrixRuntimeAtomValue[]
  valueRecords: MatrixRuntimeValueRecord[]
  valueItems: MatrixRuntimeValueItem[]
  fieldSources?: MatrixRuntimeFieldSource[]
  state: {atom: number; metaState: number | null}
}

export interface MatrixRuntimeTopology {
  id: number
  parentAtom: number | null
  parentTopology: number | null
  kind: "fuzzy" | "axion" | "macho"
  position: number
}

/**
 * Matrix-internal derived projection built by its Monad from canonical
 * Boundary initial data before runtime birth.
 *
 * Atom-prefixed keys identify materialized Atoms throughout the wire format.
 */
export interface MatrixRuntimeSnapshot {
  ok: true
  version: 1
  runtime: {
    atomIdByBraneIndex: number[]
    braneIndexByAtomId: Array<[atomId: number, braneIndex: number]>
    wimpSrcByAtomId: Array<[atomId: number, wimpSrc: string]>
    atomIdsByWimpSrc: Array<[wimpSrc: string, atomIds: number[]]>
    /** Canonical Matrix field identity remains the explicit Atom/Field pair. */
    runtimeFieldIndexByAtomFieldId: Array<[atomId: number, fieldId: number, runtimeFieldIndex: number]>
  }
  data: Required<Pick<MatrixInputData, "fields" | "branes" | "stateNames">> &
    Pick<MatrixInputData, "entanglement">
  /**
   * Compact addresses below are scoped to this rebuildable projection. They
   * are not canonical Boundary IDs and may be regenerated with the snapshot.
   */
  strong: {
    runtimeFieldIndexByWimpFieldId: Array<[wimpFieldId: number, runtimeFieldIndex: number]>
    wimpFieldIdsByRuntimeFieldIndex: number[][]
    braneIndexByWimpFieldId: Array<[wimpFieldId: number, braneIndex: number]>
    topologyWimpFieldIds: number[]
    topologyAtomFieldIds: Array<[atomId: number, fieldId: number]>
  }
  weak: {
    stateMetaStateIdsByBraneIndex: number[][]
    stateHasProcessByBraneIndex: boolean[][]
  }
}

/**
 * Matrix-owned identity одного незавершённого Process.
 *
 * Fields копируются в момент входа в Process State. `acceptedEnergy` появляется
 * только после первого корректного claim и участвует в проверке Boundary
 * подтверждения. Запись остаётся текущей до совпавшего Boundary commit либо до
 * структурного аннулирования; автоматического срока ожидания сейчас нет.
 */
export type MatrixPendingProcessExecution = {
  braneIndex: number
  stateIndex: number
  processExecutionId: ProcessExecutionId
  fields: Record<string, unknown>
  acceptedEnergy?: string
}

/** Хвост общей последовательности операций, изменяющих Matrix Store. */
export type AsyncGate = {
  pending: null | Promise<void>
}

export type MatrixUpdateOptions = {
  retriggerProcessStates?: boolean
  skipProcessRetriggerBraneIndexes?: Iterable<number>
}
