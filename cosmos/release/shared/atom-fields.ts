import type {AtomRef} from "@metafor/types/metafor/graph"
import type {MetaCausalFrontier, MetaFieldValueApplyReceipt, MetaRuntimeFieldValue} from "shared/protocol/metafor/observation"

/** Маршрут существующего локального same-origin adapter для одного Field intent. */
export const ATOM_FIELD_EDIT_PATH = "/agents/field" as const
export const ATOM_FIELD_EDIT_SCHEMA = "cosmos:atom-field-edit/v1" as const
export const ATOM_FIELDS_EDIT_PATH = "/agents/fields" as const
export const ATOM_FIELDS_EDIT_SCHEMA = "cosmos:atom-fields-edit/v1" as const

/** Набор черновиков одного Atom; сервер передаёт их одним причинным намерением. */
export interface AtomFieldsEditRequest {
  atomRef: AtomRef
  updates: import("shared/protocol/metafor/observation").MetaFieldsValueApplyRequest["updates"]
  expectedFrontier: MetaCausalFrontier
}

/** Ответ появляется только после чтения применённой причинной границы. */
export interface AtomFieldsEditReceipt {
  schema: typeof ATOM_FIELDS_EDIT_SCHEMA
  version: 1
  atomRef: AtomRef
  fields: string[]
  committed: true
  receipt: import("shared/protocol/metafor/observation").MetaFieldsValueApplyReceipt
  observedFrontier: MetaCausalFrontier
}

/**
 * Значение и frontier относятся к показанному пользователю наблюдению.
 * Сервер сверяет значение и тот же cut с coherent public Graph. Продвижение
 * других Fields допустимо; Force admission использует свежий coherent frontier.
 * Составные topology Fields остаются за принадлежащими им Processes.
 */
export interface AtomFieldEditRequest {
  atomRef: AtomRef
  field: string
  value: MetaRuntimeFieldValue
  expectedValue: MetaRuntimeFieldValue
  expectedFrontier: MetaCausalFrontier
}

/** Admission подтверждает намерение; commit и реакция наблюдаются обычным Graph. */
export interface AtomFieldEditReceipt {
  schema: typeof ATOM_FIELD_EDIT_SCHEMA
  version: 1
  atomRef: AtomRef
  field: string
  value: MetaRuntimeFieldValue
  acceptance: "admitted" | "observed"
  receipt: MetaFieldValueApplyReceipt | null
}

export type AtomFieldEditErrorCode = "invalid_request" | "field_not_editable" | "conflict" | "busy" | "world_unavailable" | "field_not_admitted" | "admission_unknown"

/** Draft хранит исходное значение отдельно от последующих poll-наблюдений UI. */
export interface AtomFieldEditDraft {
  readonly initialValue: MetaRuntimeFieldValue
  request(value: MetaRuntimeFieldValue): AtomFieldEditRequest
}

/**
 * Вызывается при начале редактирования. Последующие изменения Graph или
 * переданного frontier не заменяют expectedValue уже открытого draft.
 */
export function beginAtomFieldEdit(input: {atomRef: AtomRef; field: string; value: MetaRuntimeFieldValue; frontier: MetaCausalFrontier}): AtomFieldEditDraft {
  const initial = structuredClone(input)
  return {initialValue: initial.value, request(value) {
    return {atomRef: initial.atomRef, field: initial.field, value, expectedValue: initial.value, expectedFrontier: {...initial.frontier}}
  }}
}
