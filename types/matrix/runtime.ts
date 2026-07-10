export const STATE_UNDEFINED = -1
export const STATE_NONE = -2

export interface MatrixRuntimeActor {
  id: number
  parentActor: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

export interface MatrixRuntimeActorValue {
  actor: number
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

/** One actor is the largest structural entity Matrix accepts from Force. */
export interface MatrixRuntimeActorEntity {
  actor: MatrixRuntimeActor
  values: MatrixRuntimeActorValue[]
  valueRecords: MatrixRuntimeValueRecord[]
  valueItems: MatrixRuntimeValueItem[]
  state: string | null
}

export interface MatrixRuntimeTopology {
  id: number
  parentActor: number | null
  parentTopology: number | null
  kind: "fuzzy" | "axion" | "macho"
  position: number
}

export type MatrixPendingProcessExecution = {
  braneIndex: number
  stateIndex: number
  fields: Record<string, unknown>
  acceptedEnergy?: string
}

export type AsyncGate = {
  pending: null | Promise<void>
}

export type MatrixUpdateOptions = {
  retriggerProcessStates?: boolean
  skipProcessRetriggerBraneIndexes?: Iterable<number>
}
