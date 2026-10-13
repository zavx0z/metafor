/** Closed owning-Atom profile intentions, observations and confirmed no-admission refusals. @packageDocumentation */
import {parseMetaAddress, type AtomRef, type MetaAddress} from "./graph"
import type {OracleWorldIdentity} from "./peer-oracle"

export const PROFILE_READ_METHOD = "energy.profile.read" as const
export const PROFILE_INTENT_METHOD = "energy.profile.intent" as const
export type ProfileOperation = "profile.open" | "profile.save" | "profile.reconfigure"
export interface ProfileAssignment {name: string, saveId: string | null}
export interface ProfileTarget {worldIdentity: OracleWorldIdentity, atomRef: AtomRef}

/** Current assigned profile only; public metadata never contains native paths or credentials. */
export interface ProfileTargetDescriptor extends ProfileTarget {
  meta: MetaAddress
  expectedProfile: ProfileAssignment
  supportedOperations: ProfileOperation[]
  state: string
  /** Owning FSM may admit the intent; this is not browser login/model readiness. */
  available: boolean
}

/** An explicit owner intent, not an arbitrary Field/RPC/native command. */
interface ProfileIntentBase {
  id: string
  target: ProfileTarget
  expectedProfile: ProfileAssignment
}
export type ProfileIntentRequest = ProfileIntentBase & (
  {operation: "profile.open" | "profile.save"} |
  {operation: "profile.reconfigure"; templatePath: string}
)

/** Одна строка owning Root Field сохраняет identity и шаблон одного намерения. */
export const PROFILE_RECONFIGURE_INPUT_PREFIX = "profile.reconfigure:"
export function validProfileTemplateReference(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && value.endsWith(".yaml")
    && value.split("/").every(segment => segment !== "." && segment !== ".." && /^[A-Za-z0-9._-]+$/u.test(segment))
}
export function parseProfileReconfigurationInput(value: string | null): {requestId: string; templatePath: string} {
  if (!value?.startsWith(PROFILE_RECONFIGURE_INPUT_PREFIX)) throw new Error("Expected a profile reconfiguration intent")
  const input: unknown = JSON.parse(value.slice(PROFILE_RECONFIGURE_INPUT_PREFIX.length))
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join(",") !== "id,templatePath"
    || typeof Reflect.get(input, "id") !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(Reflect.get(input, "id"))
    || !validProfileTemplateReference(Reflect.get(input, "templatePath"))) throw new Error("Invalid profile reconfiguration intent")
  return {requestId: Reflect.get(input, "id"), templatePath: Reflect.get(input, "templatePath")}
}

export interface ProfileCatalogReceipt {
  schema: "metafor/profile-targets/v1"
  version: 1
  targets: ProfileTargetDescriptor[]
}

/** Admission only. Its owner specializes the receipt type; the owning Meta's State/ACK/catalog proves completion separately. */
export interface ProfileIntentReceipt<Admission = unknown> {
  schema: "metafor/profile-intent/v1"
  version: 1
  id: string
  operation: ProfileOperation
  target: ProfileTarget
  admission: Admission
}

/** Durable explicit refusal before Field admission. A lost response/timeout provides no such proof. */
export interface ProfileIntentRefusal {
  schema: "metafor/profile-intent-refusal/v1"
  version: 1
  id: string
  operation: ProfileOperation
  target: ProfileTarget
  reason: "frontier_mismatch" | "admission_closed" | "not_running" | "precondition"
}

/** Closed refusal discriminator for Oracle clients; messages are diagnostic only. */
export function isProfileIntentRefusal(value: unknown): value is ProfileIntentRefusal {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(",") !== "id,operation,reason,schema,target,version" ||
      record.schema !== "metafor/profile-intent-refusal/v1" || record.version !== 1 || typeof record.id !== "string" || !record.id ||
      record.operation !== "profile.open" && record.operation !== "profile.save" && record.operation !== "profile.reconfigure" ||
      typeof record.reason !== "string" || !["frontier_mismatch", "admission_closed", "not_running", "precondition"].includes(record.reason)) return false
  const target = record.target
  if (target === null || typeof target !== "object" || Array.isArray(target)) return false
  const scope = target as Record<string, unknown>
  const world = scope.worldIdentity
  return Object.keys(scope).sort().join(",") === "atomRef,worldIdentity" && typeof scope.atomRef === "string" && /^atom:[1-9][0-9]*$/.test(scope.atomRef) &&
    world !== null && typeof world === "object" && !Array.isArray(world) && Object.keys(world).sort().join(",") === "cutId,peerId,root" &&
    ["cutId", "peerId", "root"].every(key => typeof Reflect.get(world, key) === "string" && Reflect.get(world, key).length > 0 && Reflect.get(world, key).length <= 200) &&
    parseMetaAddress(Reflect.get(world, "root")) !== null
}
