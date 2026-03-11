/**
 * `@metafor/bulk` — агрегирующий вход bulk-домена.
 *
 * Пакет не содержит boundary-оркестрации и не связывает домены напрямую.
 */

export { loadDSL } from "./gravity"
export { registerProcesses, getProcessSchema, loadAction, executeProcess, weak$, resetWeakStore, restoreWeakStore } from "./weak"
export type { ProcessConfig } from "./weak"
export type { FieldDefinition, FieldsDefinition } from "./strong/field.t"
export type {
  GravityRuntimeBinding,
  RuntimeActorSnapshot,
  StrongEntanglementPlan,
  StrongMembershipEntanglementBlock,
} from "./strong/strong.t"
