import {
  parseMetaAddress,
  type JsonPointer,
  type MetaAddress,
  type MetaExecutionEnv,
  type MetaMatterBinding,
  type MetaMatterParticle,
  type ValidationIssue,
  type ValidationResult,
} from "./graph.ts"

export const META_AUTHORING_CONTRACT_VERSION = 1 as const

export const META_CAPABILITIES_READ_METHOD = "meta.capabilities.read" as const
export const META_SOURCE_REVISION_READ_METHOD = "meta.source.revision.read" as const
export const META_CREATE_METHOD = "meta.create" as const
export const META_MATTER_APPLY_METHOD = "meta.matter.apply" as const
export const META_DECLARATION_APPLY_METHOD = "meta.declaration.apply" as const

export const META_SOURCE_READ_CAPABILITY = "meta.source.read" as const
export const META_CREATE_CAPABILITY = "meta.create" as const
export const META_MATTER_WRITE_CAPABILITY = "meta.matter.write" as const
export const META_DECLARATION_WRITE_CAPABILITY = "meta.declaration.write" as const

export type MetaAuthoringMethod =
  | typeof META_CAPABILITIES_READ_METHOD
  | typeof META_SOURCE_REVISION_READ_METHOD
  | typeof META_CREATE_METHOD
  | typeof META_MATTER_APPLY_METHOD
  | typeof META_DECLARATION_APPLY_METHOD

export type MetaAuthoringCapabilityId =
  | typeof META_SOURCE_READ_CAPABILITY
  | typeof META_CREATE_CAPABILITY
  | typeof META_MATTER_WRITE_CAPABILITY
  | typeof META_DECLARATION_WRITE_CAPABILITY

export type MetaAuthoringOperationClass = "source_read" | "create" | "matter" | "declaration"

export interface MetaAuthoringCapability {
  capability: MetaAuthoringCapabilityId
  method: MetaAuthoringMethod
  scopes: readonly MetaAddress[]
  operationClass: MetaAuthoringOperationClass
  liveState: boolean
  gitCommit: boolean
}

export interface MetaCapabilitiesReadRequest {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
}

export interface MetaCapabilitiesReadReceipt {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  capabilities: MetaAuthoringCapability[]
}

export interface MetaSourceRevisionReadRequest {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  capability: typeof META_SOURCE_READ_CAPABILITY
  addresses: MetaAddress[]
}

export interface MetaSourceRevisionReadReceipt {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  sources: Array<{
    address: MetaAddress
    revision: MetaSourceRevision
  }>
}

export type MetaAuthoringOperationId = string
export type MetaSourceRevision = `sha256:${string}`
export type MetaSourcePrecondition = MetaSourceRevision | "absent"
export type MetaAuthoringRequestDigest = `sha256:${string}`

export const META_MATTER_AUTHORING_CAUSE_SCHEMA_V1 =
  "metafor/matter-authoring-cause/v1" as const
export const META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1 =
  "metafor/declaration-authoring-cause/v1" as const

export interface MetaAuthoringSourceProjectionV1 {
  address: MetaAddress
  beforeRevision: MetaSourceRevision
  afterRevision: MetaSourceRevision
}

export type MetaMatterSourceProjectionV1 = MetaAuthoringSourceProjectionV1
export interface MetaDeclarationSourceProjectionV1 {
  address: MetaAddress
  path?: "meta.ts" | `actions/${string}.ts`
  beforeRevision: MetaSourcePrecondition
  afterRevision: MetaSourceRevision
}

/** Immutable RPC causation stored in the same Dark Force history row. */
export interface MetaMatterAuthoringCauseV1 {
  schema: typeof META_MATTER_AUTHORING_CAUSE_SCHEMA_V1
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  rpcSource: string
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  sourceProjections: MetaMatterSourceProjectionV1[]
}

export interface MetaDeclarationAuthoringCauseV1 {
  schema: typeof META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  rpcSource: string
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  sourceProjections: MetaDeclarationSourceProjectionV1[]
}

export type MetaAuthoringCauseV1 =
  | MetaMatterAuthoringCauseV1
  | MetaDeclarationAuthoringCauseV1

export interface MetaForceAcceptanceIdentity {
  cutId: string
  sequence: number
  id: string
}

interface MetaMatterApplyReceiptBase {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  acceptance: MetaForceAcceptanceIdentity
  sourceProjections: MetaMatterSourceProjectionV1[]
  boundary: "applied"
}

export interface MetaMatterPublishedSourceV1 extends MetaMatterSourceProjectionV1 {
  outcome: "published" | "already_published"
}

export type MetaMatterApplyReceipt =
  | MetaMatterApplyReceiptBase & {
      phase: "source_pending"
      source: {outcome: "pending"; error: string}
    }
  | MetaMatterApplyReceiptBase & {
      phase: "runtime_committed"
      source: {
        outcome: "published" | "already_published"
        files: MetaMatterPublishedSourceV1[]
      }
      materialization: {outcome: "pending"; error: string}
    }
  | MetaMatterApplyReceiptBase & {
      phase: "complete"
      source: {
        outcome: "published" | "already_published"
        files: MetaMatterPublishedSourceV1[]
      }
      materialization: {outcome: "applied"}
    }

interface MetaDeclarationApplyReceiptBase {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  acceptance: MetaForceAcceptanceIdentity
  sourceProjections: MetaDeclarationSourceProjectionV1[]
  boundary: "applied"
}

export interface MetaDeclarationPublishedSourceV1 extends MetaDeclarationSourceProjectionV1 {
  outcome: "published" | "already_published"
}

export type MetaDeclarationApplyReceipt =
  | MetaDeclarationApplyReceiptBase & {
      phase: "source_pending"
      source: {outcome: "pending"; error: string}
    }
  | MetaDeclarationApplyReceiptBase & {
      phase: "runtime_committed"
      source: {
        outcome: "published" | "already_published"
        files: MetaDeclarationPublishedSourceV1[]
      }
      materialization: {outcome: "pending"; error: string}
    }
  | MetaDeclarationApplyReceiptBase & {
      phase: "complete"
      source: {
        outcome: "published" | "already_published"
        files: MetaDeclarationPublishedSourceV1[]
      }
      materialization: {outcome: "applied"}
    }

interface MetaAuthoringWriteEnvelope {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  operationId: MetaAuthoringOperationId
}

export interface MetaCreateRequest extends MetaAuthoringWriteEnvelope {
  capability: typeof META_CREATE_CAPABILITY
  address: MetaAddress
  name: string
  description: string
  profile: "empty"
  target: "absent"
}

export interface MetaCreateReceipt {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  phase: "created"
  outcome: "created" | "already_created"
  address: MetaAddress
  sourceRevision: MetaSourceRevision
  files: string[]
  repository: {
    initialized: true
    branch: "main"
    head: null
    staged: false
  }
}

export interface MetaMatterSourcePrecondition {
  address: MetaAddress
  revision: MetaSourceRevision
}

interface MetaMatterRequestBase extends MetaAuthoringWriteEnvelope {
  capability: typeof META_MATTER_WRITE_CAPABILITY
  particle: MetaMatterParticle
  revisions: MetaMatterSourcePrecondition[]
}

export interface MetaMatterLocatorStep {
  edgeSlot: "root" | "child" | "then" | "else" | "branch"
  position: number
}

export interface MetaMatterOccurrenceLocator {
  address: MetaAddress
  path: [MetaMatterLocatorStep, ...MetaMatterLocatorStep[]]
}

export interface MetaMatterPlacement {
  address: MetaAddress
  parent: MetaMatterOccurrenceLocator | null
  edgeSlot: MetaMatterLocatorStep["edgeSlot"]
  position: number
}

export interface MetaMatterAddRequest extends MetaMatterRequestBase {
  operation: "add"
  to: MetaMatterPlacement
}

export interface MetaMatterMoveRequest extends MetaMatterRequestBase {
  operation: "move"
  from: MetaMatterOccurrenceLocator
  to: MetaMatterPlacement
}

export interface MetaMatterRemoveRequest extends MetaMatterRequestBase {
  operation: "remove"
  target: MetaMatterOccurrenceLocator
}

export type MetaMatterRequest =
  | MetaMatterAddRequest
  | MetaMatterMoveRequest
  | MetaMatterRemoveRequest

interface MetaOptionalFieldBase {
  key: string
  required: false
  label?: string
}

export type MetaOptionalFieldDeclaration =
  | MetaOptionalFieldBase & {type: "string"; default?: string}
  | MetaOptionalFieldBase & {type: "number"; default?: number}
  | MetaOptionalFieldBase & {type: "boolean"; default?: boolean}
  | MetaOptionalFieldBase & {type: "array"; default?: number[]; data?: string}
  | MetaOptionalFieldBase & {type: "enum"; values: string[]; default?: string}

export type MetaDeclarationEntity = "field" | "metadata" | "state" | "mass" | "reaction" | "process" | "bulk"

interface MetaDeclarationRequestBase extends MetaAuthoringWriteEnvelope {
  capability: typeof META_DECLARATION_WRITE_CAPABILITY
  entity: MetaDeclarationEntity
  revisions: MetaMatterSourcePrecondition[]
}

export interface MetaFieldDeclarationAddRequest extends MetaDeclarationRequestBase {
  entity: "field"
  operation: "add"
  address: MetaAddress
  field: MetaOptionalFieldDeclaration
}

export interface MetaFieldDeclarationReplaceRequest extends MetaDeclarationRequestBase {
  entity: "field"
  operation: "replace"
  address: MetaAddress
  key: string
  field: MetaOptionalFieldDeclaration
}

export interface MetaFieldDeclarationRemoveRequest extends MetaDeclarationRequestBase {
  entity: "field"
  operation: "remove"
  address: MetaAddress
  key: string
}

export interface MetaFieldDeclarationMoveRequest extends MetaDeclarationRequestBase {
  entity: "field"
  operation: "move"
  fromAddress: MetaAddress
  toAddress: MetaAddress
  key: string
}

export interface MetaMetadataDeclaration {
  name: string
  description?: string
}

export interface MetaMetadataDeclarationReplaceRequest extends MetaDeclarationRequestBase {
  entity: "metadata"
  operation: "replace"
  address: MetaAddress
  metadata: MetaMetadataDeclaration
}

export type MetaJsonValue = null | boolean | number | string | MetaJsonValue[] | {[key: string]: MetaJsonValue}

export interface MetaStateDeclaration {
  name: string
  transitions: null | Record<string, Record<string, Record<string, MetaJsonValue>>>
}

export interface MetaStateDeclarationAddRequest extends MetaDeclarationRequestBase {
  entity: "state"
  operation: "add"
  address: MetaAddress
  state: MetaStateDeclaration
}

export interface MetaStateDeclarationReplaceRequest extends MetaDeclarationRequestBase {
  entity: "state"
  operation: "replace"
  address: MetaAddress
  name: string
  state: MetaStateDeclaration
}

export interface MetaStateDeclarationRemoveRequest extends MetaDeclarationRequestBase {
  entity: "state"
  operation: "remove"
  address: MetaAddress
  name: string
}

export interface MetaStateDeclarationMoveRequest extends MetaDeclarationRequestBase {
  entity: "state"
  operation: "move"
  fromAddress: MetaAddress
  toAddress: MetaAddress
  name: string
}

export interface MetaMassDeclaration {
  key: string
  format: "json" | "binary"
  label?: string
  description?: string
}

export interface MetaMassDeclarationAddRequest extends MetaDeclarationRequestBase {
  entity: "mass"
  operation: "add"
  address: MetaAddress
  mass: MetaMassDeclaration
}

export interface MetaMassDeclarationReplaceRequest extends MetaDeclarationRequestBase {
  entity: "mass"
  operation: "replace"
  address: MetaAddress
  key: string
  mass: MetaMassDeclaration
}

export interface MetaMassDeclarationRemoveRequest extends MetaDeclarationRequestBase {
  entity: "mass"
  operation: "remove"
  address: MetaAddress
  key: string
}

export interface MetaMassDeclarationMoveRequest extends MetaDeclarationRequestBase {
  entity: "mass"
  operation: "move"
  fromAddress: MetaAddress
  toAddress: MetaAddress
  key: string
}

export interface MetaReactionDeclaration {
  key: string
  label: string
  description?: string
  states: string[]
  filterSource: string
  updateSource: string
  read: string[]
  write: string[]
}

export interface MetaReactionDeclarationAddRequest extends MetaDeclarationRequestBase {
  entity: "reaction"
  operation: "add"
  address: MetaAddress
  reaction: MetaReactionDeclaration
}

export interface MetaReactionDeclarationReplaceRequest extends MetaDeclarationRequestBase {
  entity: "reaction"
  operation: "replace"
  address: MetaAddress
  key: string
  reaction: MetaReactionDeclaration
}

export interface MetaReactionDeclarationRemoveRequest extends MetaDeclarationRequestBase {
  entity: "reaction"
  operation: "remove"
  address: MetaAddress
  key: string
}

export interface MetaReactionDeclarationMoveRequest extends MetaDeclarationRequestBase {
  entity: "reaction"
  operation: "move"
  fromAddress: MetaAddress
  toAddress: MetaAddress
  key: string
}

export type MetaProcessArtifactExport = "default" | "action" | "process" | "load" | "run" | "execute"

export interface MetaProcessSourceArtifact {
  path: `actions/${string}.ts`
  revision: MetaSourcePrecondition
  source: string
  exportName: MetaProcessArtifactExport
}

interface MetaProcessDeclarationBase {
  key: string
  label?: string
  description?: string
  env?: MetaExecutionEnv[]
  artifact?: MetaProcessSourceArtifact
}

export interface MetaActionProcessDeclaration extends MetaProcessDeclarationBase {
  type: "action"
  successSource?: string
  errorSource?: string
}

export interface MetaFinallyProcessDeclaration extends MetaProcessDeclarationBase {
  type: "finally"
}

export type MetaProcessDeclaration = MetaActionProcessDeclaration | MetaFinallyProcessDeclaration

export interface MetaProcessDeclarationAddRequest extends MetaDeclarationRequestBase {
  entity: "process"
  operation: "add"
  address: MetaAddress
  process: MetaProcessDeclaration & {artifact: MetaProcessSourceArtifact & {revision: "absent"}}
}

export interface MetaProcessDeclarationReplaceRequest extends MetaDeclarationRequestBase {
  entity: "process"
  operation: "replace"
  address: MetaAddress
  key: string
  process: MetaProcessDeclaration
}

export interface MetaBulkDeclaration {
  view: string
}

export interface MetaBulkDeclarationAddRequest extends MetaDeclarationRequestBase {
  entity: "bulk"
  operation: "add"
  address: MetaAddress
  bulk: MetaBulkDeclaration
}

export interface MetaBulkDeclarationReplaceRequest extends MetaDeclarationRequestBase {
  entity: "bulk"
  operation: "replace"
  address: MetaAddress
  bulk: MetaBulkDeclaration
}

export interface MetaBulkDeclarationRemoveRequest extends MetaDeclarationRequestBase {
  entity: "bulk"
  operation: "remove"
  address: MetaAddress
}

export interface MetaBulkDeclarationMoveRequest extends MetaDeclarationRequestBase {
  entity: "bulk"
  operation: "move"
  fromAddress: MetaAddress
  toAddress: MetaAddress
}

export type MetaDeclarationRequest =
  | MetaFieldDeclarationAddRequest
  | MetaFieldDeclarationReplaceRequest
  | MetaFieldDeclarationRemoveRequest
  | MetaFieldDeclarationMoveRequest
  | MetaMetadataDeclarationReplaceRequest
  | MetaStateDeclarationAddRequest
  | MetaStateDeclarationReplaceRequest
  | MetaStateDeclarationRemoveRequest
  | MetaStateDeclarationMoveRequest
  | MetaMassDeclarationAddRequest
  | MetaMassDeclarationReplaceRequest
  | MetaMassDeclarationRemoveRequest
  | MetaMassDeclarationMoveRequest
  | MetaReactionDeclarationAddRequest
  | MetaReactionDeclarationReplaceRequest
  | MetaReactionDeclarationRemoveRequest
  | MetaReactionDeclarationMoveRequest
  | MetaProcessDeclarationAddRequest
  | MetaProcessDeclarationReplaceRequest
  | MetaBulkDeclarationAddRequest
  | MetaBulkDeclarationReplaceRequest
  | MetaBulkDeclarationRemoveRequest
  | MetaBulkDeclarationMoveRequest

export interface MetaAuthoringValidationContext {
  capabilities: readonly MetaAuthoringCapability[]
  currentRevision(address: MetaAddress): MetaSourceRevision | null
}

type RecordValue = Record<string, unknown>

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SOURCE_REVISION = /^sha256:[a-f0-9]{64}$/
const PROCESS_ARTIFACT_PATH = /^actions\/[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.ts$/
const PROCESS_ARTIFACT_EXPORTS = new Set<MetaProcessArtifactExport>([
  "default", "action", "process", "load", "run", "execute",
])
const PROCESS_ENVS = new Set<MetaExecutionEnv>([
  "browser", "node", "worker", "server", "any",
])

const pointerToken = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1")

const childPath = (path: JsonPointer, key: string | number): JsonPointer =>
  `${path}/${pointerToken(String(key))}` as JsonPointer

const isPlainRecord = (value: unknown): value is RecordValue => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

class AuthoringValidator {
  readonly issues: ValidationIssue[] = []

  issue(path: JsonPointer, code: string, message: string): void {
    this.issues.push({path, code, message})
  }

  record(value: unknown, path: JsonPointer, name: string): value is RecordValue {
    if (!isPlainRecord(value)) {
      this.issue(path, "invalid_type", `${name} must be a plain object`)
      return false
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        this.issue(path, "non_json_value", `${name} must not contain symbol properties`)
        return false
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        this.issue(childPath(path, key), "non_json_value", `Property "${key}" must be enumerable JSON data`)
        return false
      }
    }
    return true
  }

  array(value: unknown, path: JsonPointer, name: string): value is unknown[] {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      this.issue(path, "invalid_type", `${name} must be a plain array`)
      return false
    }
    const expectedKeys = new Set<string>(["length"])
    for (let index = 0; index < value.length; index++) expectedKeys.add(String(index))
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !expectedKeys.has(key)) {
        this.issue(path, "non_json_value", `${name} must not contain extra properties`)
        return false
      }
      if (key === "length") continue
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        this.issue(childPath(path, key), "non_json_value", `${name} items must be enumerable JSON data`)
        return false
      }
    }
    if (Object.keys(value).length !== value.length) {
      this.issue(path, "non_json_value", `${name} must not contain holes`)
      return false
    }
    return true
  }

  closed(value: RecordValue, path: JsonPointer, allowed: readonly string[]): void {
    const known = new Set(allowed)
    for (const key of Object.keys(value)) {
      if (!known.has(key)) {
        this.issue(childPath(path, key), "unknown_property", `Property "${key}" is not allowed`)
      }
    }
  }

  required(value: RecordValue, path: JsonPointer, keys: readonly string[]): void {
    for (const key of keys) {
      if (!Object.hasOwn(value, key)) {
        this.issue(childPath(path, key), "required", `Property "${key}" is required`)
      }
    }
  }

  literal(value: unknown, path: JsonPointer, expected: string | number, name: string): boolean {
    if (value === expected) return true
    this.issue(path, "invalid_literal", `${name} must be ${JSON.stringify(expected)}`)
    return false
  }

  address(value: unknown, path: JsonPointer): MetaAddress | null {
    if (typeof value === "string") {
      const parsed = parseMetaAddress(value)
      if (parsed !== null) return parsed
    }
    this.issue(path, "invalid_meta_address", "Expected canonical <owner>/<repository> address")
    return null
  }

  text(value: unknown, path: JsonPointer, name: string, allowEmpty = false): string | null {
    if (typeof value !== "string") {
      this.issue(path, "invalid_type", `${name} must be a string`)
      return null
    }
    if ((!allowEmpty && value.trim().length === 0) || value.length > 512) {
      this.issue(path, "invalid_text", `${name} must contain 1..512 characters`)
      return null
    }
    return value
  }

  source(value: unknown, path: JsonPointer, name: string, allowEmpty = false): string | null {
    if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0) || value.length > 65_536) {
      this.issue(path, "invalid_source", `${name} must contain ${allowEmpty ? "0" : "1"}..65536 source characters`)
      return null
    }
    return value
  }

  stringList(value: unknown, path: JsonPointer, name: string): string[] {
    if (!this.array(value, path, name)) return []
    const result: string[] = []
    const seen = new Set<string>()
    value.forEach((item, index) => {
      const itemPath = childPath(path, index)
      const text = this.text(item, itemPath, `${name} item`)
      if (text === null) return
      if (seen.has(text)) {
        this.issue(itemPath, "duplicate_value", `${name} value ${text} is duplicated`)
        return
      }
      seen.add(text)
      result.push(text)
    })
    return result
  }

  json(value: unknown, path: JsonPointer, name: string, depth = 0): MetaJsonValue | null {
    if (depth > 32) {
      this.issue(path, "invalid_json_depth", `${name} exceeds 32 nested levels`)
      return null
    }
    if (value === null || typeof value === "boolean" || typeof value === "string") return value
    if (typeof value === "number") {
      if (Number.isFinite(value)) return value
      this.issue(path, "non_json_value", `${name} numbers must be finite`)
      return null
    }
    if (Array.isArray(value)) {
      if (!this.array(value, path, name)) return null
      return value.map((item, index) =>
        this.json(item, childPath(path, index), name, depth + 1),
      ) as MetaJsonValue[]
    }
    if (this.record(value, path, name)) {
      const result: Record<string, MetaJsonValue> = {}
      for (const [key, item] of Object.entries(value)) {
        const normalized = this.json(item, childPath(path, key), name, depth + 1)
        if (normalized !== null || item === null) result[key] = normalized
      }
      return result
    }
    this.issue(path, "non_json_value", `${name} must contain JSON data only`)
    return null
  }

  operationId(value: unknown, path: JsonPointer): string | null {
    if (typeof value === "string" && OPERATION_ID.test(value)) return value
    this.issue(path, "invalid_operation_id", "operationId must be 1..128 safe identifier characters")
    return null
  }

  revision(value: unknown, path: JsonPointer): MetaSourceRevision | null {
    if (typeof value === "string" && SOURCE_REVISION.test(value)) {
      return value as MetaSourceRevision
    }
    this.issue(path, "invalid_source_revision", "revision must be a lowercase sha256 digest")
    return null
  }
}

const grantFor = (
  validator: AuthoringValidator,
  capabilities: readonly MetaAuthoringCapability[],
  capability: MetaAuthoringCapabilityId,
  method: MetaAuthoringMethod,
  operationClass: MetaAuthoringOperationClass,
  liveState: boolean,
): MetaAuthoringCapability | null => {
  const grant = capabilities.find((candidate) =>
    candidate.capability === capability &&
    candidate.method === method &&
    candidate.operationClass === operationClass &&
    candidate.liveState === liveState
  )
  if (grant) return grant
  validator.issue("/capability", "capability_denied", `Capability ${capability} is not granted for ${method}`)
  return null
}

const requireScope = (
  validator: AuthoringValidator,
  grant: MetaAuthoringCapability | null,
  addresses: readonly MetaAddress[],
): void => {
  if (!grant) return
  const allowed = new Set(grant.scopes)
  for (const address of addresses) {
    if (!allowed.has(address)) {
      validator.issue("/capability", "scope_denied", `Capability scope does not include ${address}`)
    }
  }
}

const commonEnvelope = (
  validator: AuthoringValidator,
  value: RecordValue,
): {operationId: string} | null => {
  validator.literal(
    value.contractVersion,
    "/contractVersion",
    META_AUTHORING_CONTRACT_VERSION,
    "contractVersion",
  )
  const operationId = validator.operationId(value.operationId, "/operationId")
  return operationId === null ? null : {operationId}
}

export const validateMetaCapabilitiesReadRequest = (
  input: unknown,
): ValidationResult<MetaCapabilitiesReadRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.capabilities.read request")) return {ok: false, issues: validator.issues}
  validator.closed(input, "", ["contractVersion"])
  validator.required(input, "", ["contractVersion"])
  validator.literal(
    input.contractVersion,
    "/contractVersion",
    META_AUTHORING_CONTRACT_VERSION,
    "contractVersion",
  )
  if (validator.issues.length > 0) return {ok: false, issues: validator.issues}
  return {ok: true, value: {contractVersion: META_AUTHORING_CONTRACT_VERSION}}
}

export const validateMetaSourceRevisionReadRequest = (
  input: unknown,
  context: Pick<MetaAuthoringValidationContext, "capabilities">,
): ValidationResult<MetaSourceRevisionReadRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.source.revision.read request")) return {ok: false, issues: validator.issues}
  validator.closed(input, "", ["contractVersion", "capability", "addresses"])
  validator.required(input, "", ["contractVersion", "capability", "addresses"])
  validator.literal(
    input.contractVersion,
    "/contractVersion",
    META_AUTHORING_CONTRACT_VERSION,
    "contractVersion",
  )
  validator.literal(input.capability, "/capability", META_SOURCE_READ_CAPABILITY, "capability")
  const addresses: MetaAddress[] = []
  const seen = new Set<MetaAddress>()
  if (validator.array(input.addresses, "/addresses", "addresses")) {
    if (input.addresses.length === 0) validator.issue("/addresses", "invalid_scope", "addresses must not be empty")
    input.addresses.forEach((value, index) => {
      const address = validator.address(value, childPath("/addresses", index))
      if (address === null) return
      if (seen.has(address)) {
        validator.issue(childPath("/addresses", index), "duplicate_address", `Address ${address} is duplicated`)
        return
      }
      seen.add(address)
      addresses.push(address)
    })
  }
  const grant = grantFor(
    validator,
    context.capabilities,
    META_SOURCE_READ_CAPABILITY,
    META_SOURCE_REVISION_READ_METHOD,
    "source_read",
    false,
  )
  requireScope(validator, grant, addresses)
  if (validator.issues.length > 0) return {ok: false, issues: validator.issues}
  return {
    ok: true,
    value: {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      capability: META_SOURCE_READ_CAPABILITY,
      addresses: addresses.sort((left, right) => left.localeCompare(right)),
    },
  }
}

export const validateMetaCreateRequest = (
  input: unknown,
  context: Pick<MetaAuthoringValidationContext, "capabilities">,
): ValidationResult<MetaCreateRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.create request")) return {ok: false, issues: validator.issues}
  validator.closed(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "address",
    "name",
    "description",
    "profile",
    "target",
  ])
  validator.required(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "address",
    "name",
    "description",
    "profile",
    "target",
  ])
  const envelope = commonEnvelope(validator, input)
  validator.literal(input.capability, "/capability", META_CREATE_CAPABILITY, "capability")
  const address = validator.address(input.address, "/address")
  const name = validator.text(input.name, "/name", "name")
  const description = validator.text(input.description, "/description", "description", true)
  validator.literal(input.profile, "/profile", "empty", "profile")
  validator.literal(input.target, "/target", "absent", "target")
  const grant = grantFor(
    validator,
    context.capabilities,
    META_CREATE_CAPABILITY,
    META_CREATE_METHOD,
    "create",
    false,
  )
  if (address !== null) requireScope(validator, grant, [address])
  if (validator.issues.length > 0 || !envelope || address === null || name === null || description === null) {
    return {ok: false, issues: validator.issues}
  }
  return {
    ok: true,
    value: {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: envelope.operationId,
      capability: META_CREATE_CAPABILITY,
      address,
      name,
      description,
      profile: "empty",
      target: "absent",
    },
  }
}

const sourcePreconditions = (
  validator: AuthoringValidator,
  value: unknown,
): MetaMatterSourcePrecondition[] => {
  if (!validator.array(value, "/revisions", "revisions")) return []
  const result: MetaMatterSourcePrecondition[] = []
  const seen = new Set<MetaAddress>()
  value.forEach((entry, index) => {
    const path = childPath("/revisions", index)
    if (!validator.record(entry, path, "source precondition")) return
    validator.closed(entry, path, ["address", "revision"])
    validator.required(entry, path, ["address", "revision"])
    const address = validator.address(entry.address, childPath(path, "address"))
    const revision = validator.revision(entry.revision, childPath(path, "revision"))
    if (address === null || revision === null) return
    if (seen.has(address)) {
      validator.issue(childPath(path, "address"), "duplicate_revision", `Revision for ${address} is duplicated`)
      return
    }
    seen.add(address)
    result.push({address, revision})
  })
  return result.sort((left, right) => left.address.localeCompare(right.address))
}

const exactRevisions = (
  validator: AuthoringValidator,
  revisions: readonly MetaMatterSourcePrecondition[],
  affected: readonly MetaAddress[],
  currentRevision: MetaAuthoringValidationContext["currentRevision"],
): void => {
  const required = new Set(affected)
  const provided = new Map(revisions.map((entry) => [entry.address, entry] as const))
  for (const address of required) {
    const entry = provided.get(address)
    if (!entry) {
      validator.issue("/revisions", "missing_revision", `Expected source revision for ${address}`)
      continue
    }
    const current = currentRevision(address)
    if (current === null) {
      validator.issue("/revisions", "revision_unavailable", `Current source revision is unavailable for ${address}`)
    } else if (entry.revision !== current) {
      validator.issue("/revisions", "revision_mismatch", `Source revision mismatch for ${address}: expected ${current}`)
    }
  }
  for (const {address} of revisions) {
    if (!required.has(address)) {
      validator.issue("/revisions", "extra_revision", `Source revision for unaffected ${address} is not allowed`)
    }
  }
}

const optionalFieldDeclaration = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaOptionalFieldDeclaration | null => {
  if (!validator.record(value, path, "Field declaration")) return null
  const type = value.type
  const allowed = type === "array"
    ? ["key", "type", "required", "default", "label", "data"]
    : type === "enum"
      ? ["key", "type", "required", "default", "label", "values"]
      : ["key", "type", "required", "default", "label"]
  validator.closed(value, path, allowed)
  validator.required(value, path, type === "enum"
    ? ["key", "type", "required", "values"]
    : ["key", "type", "required"])
  const key = validator.text(value.key, childPath(path, "key"), "Field key")
  if (key?.includes("\0")) {
    validator.issue(childPath(path, "key"), "invalid_field_key", "Field key must not contain NUL")
  }
  if (value.required !== false) {
    validator.issue(childPath(path, "required"), "invalid_literal", "Optional Field required must be false")
  }
  if (value.label !== undefined) validator.text(value.label, childPath(path, "label"), "Field label", true)
  if (type !== "string" && type !== "number" && type !== "boolean" && type !== "array" && type !== "enum") {
    validator.issue(childPath(path, "type"), "invalid_field_type", "Field type must be string, number, boolean, array or enum")
    return null
  }

  const base = {
    key: key ?? "",
    type,
    required: false as const,
    ...(typeof value.label === "string" ? {label: value.label} : {}),
  }
  if (type === "string") {
    if (value.default !== undefined && typeof value.default !== "string") {
      validator.issue(childPath(path, "default"), "invalid_field_default", "String Field default must be a string")
    }
    return {...base, type, ...(typeof value.default === "string" ? {default: value.default} : {})}
  }
  if (type === "number") {
    if (value.default !== undefined && (typeof value.default !== "number" || !Number.isFinite(value.default))) {
      validator.issue(childPath(path, "default"), "invalid_field_default", "Number Field default must be finite")
    }
    return {
      ...base,
      type,
      ...(typeof value.default === "number" && Number.isFinite(value.default) ? {default: value.default} : {}),
    }
  }
  if (type === "boolean") {
    if (value.default !== undefined && typeof value.default !== "boolean") {
      validator.issue(childPath(path, "default"), "invalid_field_default", "Boolean Field default must be boolean")
    }
    return {...base, type, ...(typeof value.default === "boolean" ? {default: value.default} : {})}
  }
  if (type === "array") {
    const defaultValue: number[] = []
    if (value.default !== undefined) {
      if (validator.array(value.default, childPath(path, "default"), "Array Field default")) {
        value.default.forEach((item, index) => {
          if (typeof item !== "number" || !Number.isFinite(item)) {
            validator.issue(
              childPath(childPath(path, "default"), index),
              "invalid_field_default",
              "Array Field default items must be finite numbers",
            )
          } else defaultValue.push(item)
        })
      }
    }
    if (value.data !== undefined) validator.text(value.data, childPath(path, "data"), "Array Field data")
    return {
      ...base,
      type,
      ...(value.default !== undefined ? {default: defaultValue} : {}),
      ...(typeof value.data === "string" ? {data: value.data} : {}),
    }
  }

  const values: string[] = []
  const seen = new Set<string>()
  if (validator.array(value.values, childPath(path, "values"), "Enum Field values")) {
    if (value.values.length === 0) {
      validator.issue(childPath(path, "values"), "invalid_enum_values", "Enum Field values must not be empty")
    }
    value.values.forEach((item, index) => {
      const itemPath = childPath(childPath(path, "values"), index)
      const normalized = validator.text(item, itemPath, "Enum Field value")
      if (normalized === null) return
      if (seen.has(normalized)) {
        validator.issue(itemPath, "duplicate_enum_value", `Enum Field value ${normalized} is duplicated`)
        return
      }
      seen.add(normalized)
      values.push(normalized)
    })
  }
  if (value.default !== undefined && (typeof value.default !== "string" || !seen.has(value.default))) {
    validator.issue(childPath(path, "default"), "invalid_field_default", "Enum Field default must name one declared value")
  }
  return {
    ...base,
    type,
    values,
    ...(typeof value.default === "string" && seen.has(value.default) ? {default: value.default} : {}),
  }
}

const metadataDeclaration = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaMetadataDeclaration | null => {
  if (!validator.record(value, path, "Meta metadata")) return null
  validator.closed(value, path, ["name", "description"])
  validator.required(value, path, ["name"])
  const name = validator.text(value.name, childPath(path, "name"), "Meta name")
  const description = value.description === undefined
    ? undefined
    : validator.text(value.description, childPath(path, "description"), "Meta description", true)
  return name === null || description === null
    ? null
    : {name, ...(description === undefined ? {} : {description})}
}

const stateDeclaration = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaStateDeclaration | null => {
  if (!validator.record(value, path, "State declaration")) return null
  validator.closed(value, path, ["name", "transitions"])
  validator.required(value, path, ["name", "transitions"])
  const name = validator.text(value.name, childPath(path, "name"), "State name")
  if (value.transitions === null) return name === null ? null : {name, transitions: null}
  const transitionsPath = childPath(path, "transitions")
  if (!validator.record(value.transitions, transitionsPath, "State transitions")) return null
  const transitions: Record<string, Record<string, Record<string, MetaJsonValue>>> = {}
  for (const [target, rawWave] of Object.entries(value.transitions)) {
    const targetPath = childPath(transitionsPath, target)
    if (target.trim().length === 0 || target.includes("\0")) {
      validator.issue(targetPath, "invalid_state_name", "Transition target must be a non-empty name without NUL")
      continue
    }
    if (!validator.record(rawWave, targetPath, `Transition ${target}`)) continue
    const wave: Record<string, Record<string, MetaJsonValue>> = {}
    for (const [field, rawPredicate] of Object.entries(rawWave)) {
      const predicatePath = childPath(targetPath, field)
      if (field.trim().length === 0 || field.includes("\0")) {
        validator.issue(predicatePath, "invalid_field_key", "Condition Field key must be non-empty without NUL")
        continue
      }
      if (!validator.record(rawPredicate, predicatePath, `Condition ${field}`)) continue
      const predicate = validator.json(rawPredicate, predicatePath, `Condition ${field}`)
      if (predicate && !Array.isArray(predicate) && typeof predicate === "object") {
        wave[field] = predicate as Record<string, MetaJsonValue>
      }
    }
    transitions[target] = wave
  }
  return name === null ? null : {name, transitions}
}

const massDeclaration = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaMassDeclaration | null => {
  if (!validator.record(value, path, "Mass declaration")) return null
  validator.closed(value, path, ["key", "format", "label", "description"])
  validator.required(value, path, ["key", "format"])
  const key = validator.text(value.key, childPath(path, "key"), "Mass key")
  if (key?.includes("\0")) validator.issue(childPath(path, "key"), "invalid_mass_key", "Mass key must not contain NUL")
  if (value.format !== "json" && value.format !== "binary") {
    validator.issue(childPath(path, "format"), "invalid_mass_format", "Mass format must be json or binary")
  }
  const label = value.label === undefined
    ? undefined
    : validator.text(value.label, childPath(path, "label"), "Mass label", true)
  const description = value.description === undefined
    ? undefined
    : validator.text(value.description, childPath(path, "description"), "Mass description", true)
  if (key === null || (value.format !== "json" && value.format !== "binary") || label === null || description === null) return null
  return {
    key,
    format: value.format,
    ...(label === undefined ? {} : {label}),
    ...(description === undefined ? {} : {description}),
  }
}

const reactionDeclaration = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaReactionDeclaration | null => {
  if (!validator.record(value, path, "Reaction declaration")) return null
  validator.closed(value, path, [
    "key", "label", "description", "states", "filterSource", "updateSource", "read", "write",
  ])
  validator.required(value, path, ["key", "label", "states", "filterSource", "updateSource", "read", "write"])
  const key = validator.text(value.key, childPath(path, "key"), "Reaction key")
  if (key?.includes("\0")) validator.issue(childPath(path, "key"), "invalid_reaction_key", "Reaction key must not contain NUL")
  const label = validator.text(value.label, childPath(path, "label"), "Reaction label")
  const description = value.description === undefined
    ? undefined
    : validator.text(value.description, childPath(path, "description"), "Reaction description", true)
  const states = validator.stringList(value.states, childPath(path, "states"), "Reaction states")
  const read = validator.stringList(value.read, childPath(path, "read"), "Reaction read Fields")
  const write = validator.stringList(value.write, childPath(path, "write"), "Reaction write Fields")
  const filterSource = validator.source(value.filterSource, childPath(path, "filterSource"), "Reaction filterSource")
  const updateSource = validator.source(value.updateSource, childPath(path, "updateSource"), "Reaction updateSource")
  for (const field of write) if (!read.includes(field)) {
    validator.issue(childPath(path, "read"), "missing_read_field", `Reaction write Field ${field} must also be declared in read`)
  }
  if (key === null || label === null || description === null || filterSource === null || updateSource === null) return null
  return {
    key,
    label,
    ...(description === undefined ? {} : {description}),
    states,
    filterSource,
    updateSource,
    read,
    write,
  }
}

const processArtifact = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
  operation: "add" | "replace",
): MetaProcessSourceArtifact | null => {
  if (!validator.record(value, path, "Process source artifact")) return null
  validator.closed(value, path, ["path", "revision", "source", "exportName"])
  validator.required(value, path, ["path", "revision", "source", "exportName"])
  const artifactPath = validator.text(value.path, childPath(path, "path"), "Process artifact path")
  if (artifactPath !== null && !PROCESS_ARTIFACT_PATH.test(artifactPath)) {
    validator.issue(childPath(path, "path"), "invalid_process_artifact_path", "Process artifact must be one actions/<safe-file>.ts path")
  }
  const revision = operation === "add"
    ? value.revision === "absent"
      ? "absent" as const
      : (validator.issue(childPath(path, "revision"), "invalid_source_revision", "New Process artifact revision must be absent"), null)
    : validator.revision(value.revision, childPath(path, "revision"))
  const source = validator.source(value.source, childPath(path, "source"), "Process artifact source")
  const exportName = validator.text(value.exportName, childPath(path, "exportName"), "Process artifact export")
  if (exportName !== null && !PROCESS_ARTIFACT_EXPORTS.has(exportName as MetaProcessArtifactExport)) {
    validator.issue(childPath(path, "exportName"), "invalid_process_artifact_export", "Process artifact export is not allowed")
  }
  if (
    artifactPath === null || !PROCESS_ARTIFACT_PATH.test(artifactPath) || revision === null ||
    source === null || exportName === null || !PROCESS_ARTIFACT_EXPORTS.has(exportName as MetaProcessArtifactExport)
  ) return null
  return {
    path: artifactPath as `actions/${string}.ts`,
    revision,
    source,
    exportName: exportName as MetaProcessArtifactExport,
  }
}

const processDeclaration = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
  operation: "add" | "replace",
): MetaProcessDeclaration | null => {
  if (!validator.record(value, path, "Process declaration")) return null
  const type = value.type
  const actionFields = type === "action" ? ["successSource", "errorSource"] : []
  validator.closed(value, path, ["key", "type", "label", "description", "env", "artifact", ...actionFields])
  validator.required(value, path, ["key", "type", ...(operation === "add" ? ["artifact"] : [])])
  const key = validator.text(value.key, childPath(path, "key"), "Process key")
  if (key?.includes("\0")) validator.issue(childPath(path, "key"), "invalid_process_key", "Process key must not contain NUL")
  if (type !== "action" && type !== "finally") {
    validator.issue(childPath(path, "type"), "invalid_process_type", "Process type must be action or finally")
  }
  const label = value.label === undefined
    ? undefined
    : validator.text(value.label, childPath(path, "label"), "Process label", true)
  const description = value.description === undefined
    ? undefined
    : validator.text(value.description, childPath(path, "description"), "Process description", true)
  const env = value.env === undefined
    ? undefined
    : validator.stringList(value.env, childPath(path, "env"), "Process environments")
  if (env) for (const [index, item] of env.entries()) {
    if (!PROCESS_ENVS.has(item as MetaExecutionEnv)) {
      validator.issue(childPath(childPath(path, "env"), index), "invalid_process_environment", `Process environment ${item} is not allowed`)
    }
  }
  const artifact = value.artifact === undefined
    ? undefined
    : processArtifact(validator, value.artifact, childPath(path, "artifact"), operation)
  const successSource = type === "action" && value.successSource !== undefined
    ? validator.source(value.successSource, childPath(path, "successSource"), "Process success handler")
    : undefined
  const errorSource = type === "action" && value.errorSource !== undefined
    ? validator.source(value.errorSource, childPath(path, "errorSource"), "Process error handler")
    : undefined
  if (
    key === null || (type !== "action" && type !== "finally") || label === null || description === null ||
    artifact === null || successSource === null || errorSource === null ||
    (operation === "add" && artifact === undefined) ||
    env?.some((item) => !PROCESS_ENVS.has(item as MetaExecutionEnv))
  ) return null
  const base = {
    key,
    type,
    ...(label === undefined ? {} : {label}),
    ...(description === undefined ? {} : {description}),
    ...(env === undefined ? {} : {env: env as NonNullable<MetaProcessDeclaration["env"]>}),
    ...(artifact === undefined ? {} : {artifact}),
  }
  return type === "action"
    ? {
        ...base,
        type,
        ...(successSource === undefined ? {} : {successSource}),
        ...(errorSource === undefined ? {} : {errorSource}),
      }
    : {...base, type}
}

const bulkDeclaration = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaBulkDeclaration | null => {
  if (!validator.record(value, path, "Bulk declaration")) return null
  validator.closed(value, path, ["view"])
  validator.required(value, path, ["view"])
  const view = validator.source(value.view, childPath(path, "view"), "Bulk view", true)
  return view === null ? null : {view}
}

const MATTER_EDGE_SLOTS = new Set<MetaMatterLocatorStep["edgeSlot"]>([
  "root", "child", "then", "else", "branch",
])

const matterPosition = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
  name: string,
): number | null => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  validator.issue(path, "invalid_matter_position", `${name} must be a non-negative safe integer`)
  return null
}

const matterBinding = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaMatterBinding | null => {
  if (typeof value === "string") {
    return validator.source(value, path, "Matter binding", true)
  }
  if (!validator.record(value, path, "Matter binding")) return null
  const before = validator.issues.length
  validator.closed(value, path, ["data", "expr", "directMass"])
  if (value.data === undefined) {
    validator.issue(childPath(path, "data"), "required", "Normalized Matter binding data is required")
  } else if (typeof value.data === "string") {
    validator.source(value.data, childPath(path, "data"), "Matter binding data")
  } else if (validator.array(value.data, childPath(path, "data"), "Matter binding data")) {
    if (value.data.length === 0) {
      validator.issue(childPath(path, "data"), "invalid_matter_binding", "Matter binding data must not be empty")
    }
    value.data.forEach((item, index) => {
      validator.source(item, childPath(childPath(path, "data"), index), "Matter binding data item")
    })
  }
  if (value.expr !== undefined) {
    validator.source(value.expr, childPath(path, "expr"), "Matter binding expression", true)
  }
  if (value.directMass !== undefined) {
    const directPath = childPath(path, "directMass")
    if (validator.record(value.directMass, directPath, "Matter direct Mass binding")) {
      const kind = value.directMass.kind
      const allowed = kind === "keys" ? ["kind", "entries"] : ["kind"]
      validator.closed(value.directMass, directPath, allowed)
      validator.required(value.directMass, directPath, allowed)
      if (kind !== "whole" && kind !== "keys") {
        validator.issue(childPath(directPath, "kind"), "invalid_matter_binding", "Direct Mass kind must be whole or keys")
      }
      if (kind === "keys" && validator.array(
        value.directMass.entries,
        childPath(directPath, "entries"),
        "Matter direct Mass entries",
      )) {
        if (value.directMass.entries.length === 0) {
          validator.issue(childPath(directPath, "entries"), "invalid_matter_binding", "Direct Mass entries must not be empty")
        }
        const targets = new Set<string>()
        const sources = new Set<string>()
        value.directMass.entries.forEach((entry, index) => {
          const entryPath = childPath(childPath(directPath, "entries"), index)
          if (!validator.record(entry, entryPath, "Matter direct Mass entry")) return
          validator.closed(entry, entryPath, ["target", "source"])
          validator.required(entry, entryPath, ["target", "source"])
          const target = validator.text(entry.target, childPath(entryPath, "target"), "Matter direct Mass target")
          const source = validator.text(entry.source, childPath(entryPath, "source"), "Matter direct Mass source")
          if (target !== null && targets.has(target)) {
            validator.issue(childPath(entryPath, "target"), "duplicate_value", `Matter target ${target} is duplicated`)
          }
          if (source !== null && sources.has(source)) {
            validator.issue(childPath(entryPath, "source"), "duplicate_value", `Matter source ${source} is duplicated`)
          }
          if (target !== null) targets.add(target)
          if (source !== null) sources.add(source)
        })
      }
    }
  }
  return validator.issues.length === before ? structuredClone(value) as MetaMatterBinding : null
}

const matterParticle = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
  depth = 0,
): MetaMatterParticle | null => {
  if (depth > 32) {
    validator.issue(path, "invalid_matter_depth", "Matter subtree exceeds 32 nested levels")
    return null
  }
  if (!validator.record(value, path, "Matter particle")) return null
  const before = validator.issues.length
  const kind = value.kind
  const definition = kind === "wimp"
    ? ["src", "fieldsBinding", "massBinding", "energyBinding"]
    : kind === "fuzzy"
      ? ["fuzzyKind", "predicateBinding"]
      : kind === "axion"
        ? ["predicateBinding"]
        : kind === "macho"
          ? ["collectionBinding"]
          : []
  validator.closed(value, path, ["kind", ...definition, "children"])
  validator.required(value, path, ["kind", ...definition.filter((key) =>
    key !== "fieldsBinding" && key !== "massBinding" && key !== "energyBinding"
  )])
  if (kind !== "wimp" && kind !== "fuzzy" && kind !== "axion" && kind !== "macho") {
    validator.issue(childPath(path, "kind"), "invalid_matter_kind", "Matter kind must be wimp, fuzzy, axion or macho")
    return null
  }

  let src: MetaAddress | null = null
  if (kind === "wimp") src = validator.address(value.src, childPath(path, "src"))
  if (kind === "fuzzy" && value.fuzzyKind !== "dynamic-meta") {
    validator.issue(childPath(path, "fuzzyKind"), "invalid_matter_fuzzy_kind", "Fuzzy kind must be dynamic-meta")
  }
  const bindings = new Map<string, MetaMatterBinding | null>()
  for (const key of definition) {
    if (key === "src" || key === "fuzzyKind" || value[key] === undefined) continue
    bindings.set(key, matterBinding(validator, value[key], childPath(path, key)))
  }

  const children: Array<{edgeSlot: "child" | "then" | "else" | "branch"; particle: MetaMatterParticle}> = []
  if (value.children !== undefined && validator.array(value.children, childPath(path, "children"), "Matter children")) {
    if (value.children.length > 512) {
      validator.issue(childPath(path, "children"), "invalid_matter_width", "Matter particle has more than 512 children")
    }
    value.children.forEach((entry, index) => {
      const entryPath = childPath(childPath(path, "children"), index)
      if (!validator.record(entry, entryPath, "Matter child")) return
      validator.closed(entry, entryPath, ["edgeSlot", "particle"])
      validator.required(entry, entryPath, ["edgeSlot", "particle"])
      const edgeSlot = entry.edgeSlot
      const allowed = kind === "wimp" || kind === "macho"
        ? edgeSlot === "child"
        : kind === "fuzzy"
          ? edgeSlot === "branch"
          : edgeSlot === "child" || edgeSlot === "then" || edgeSlot === "else"
      if (!allowed) {
        validator.issue(childPath(entryPath, "edgeSlot"), "invalid_matter_edge", `Matter ${kind} child edge is invalid`)
      }
      const particle = matterParticle(validator, entry.particle, childPath(entryPath, "particle"), depth + 1)
      if (kind === "fuzzy" && particle?.kind !== "wimp") {
        validator.issue(childPath(entryPath, "particle"), "invalid_matter_edge", "Fuzzy branches must contain WIMP particles")
      }
      if (allowed && particle) children.push({edgeSlot, particle} as typeof children[number])
    })
  }
  if (kind === "fuzzy" && children.length === 0) {
    validator.issue(childPath(path, "children"), "invalid_matter_fuzzy", "Fuzzy must contain its resolved WIMP branches")
  }
  if (kind === "axion") {
    const edgeSlots = new Set(children.map(({edgeSlot}) => edgeSlot))
    if (edgeSlots.has("child") && (edgeSlots.has("then") || edgeSlots.has("else"))) {
      validator.issue(childPath(path, "children"), "invalid_matter_edge", "Axion cannot mix logical and conditional child edges")
    }
  }

  if (validator.issues.length !== before || (kind === "wimp" && src === null)) return null
  if (kind === "wimp") return {
    kind,
    src: src!,
    ...(bindings.has("fieldsBinding") ? {fieldsBinding: bindings.get("fieldsBinding")!} : {}),
    ...(bindings.has("massBinding") ? {massBinding: bindings.get("massBinding")!} : {}),
    ...(bindings.has("energyBinding") ? {energyBinding: bindings.get("energyBinding")!} : {}),
    ...(children.length === 0 ? {} : {children: children as NonNullable<Extract<MetaMatterParticle, {kind: "wimp"}>["children"]>}),
  }
  if (kind === "fuzzy") return {
    kind,
    fuzzyKind: "dynamic-meta",
    predicateBinding: bindings.get("predicateBinding")!,
    children: children as NonNullable<Extract<MetaMatterParticle, {kind: "fuzzy"}>["children"]>,
  }
  if (kind === "axion") return {
    kind,
    predicateBinding: bindings.get("predicateBinding")!,
    ...(children.length === 0 ? {} : {children: children as NonNullable<Extract<MetaMatterParticle, {kind: "axion"}>["children"]>}),
  }
  return {
    kind,
    collectionBinding: bindings.get("collectionBinding")!,
    ...(children.length === 0 ? {} : {children: children as NonNullable<Extract<MetaMatterParticle, {kind: "macho"}>["children"]>}),
  }
}

const matterLocator = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
  allowEmpty = false,
): MetaMatterOccurrenceLocator | null => {
  if (!validator.record(value, path, "Matter occurrence locator")) return null
  const before = validator.issues.length
  validator.closed(value, path, ["address", "path"])
  validator.required(value, path, ["address", "path"])
  const address = validator.address(value.address, childPath(path, "address"))
  const steps: MetaMatterLocatorStep[] = []
  if (validator.array(value.path, childPath(path, "path"), "Matter locator path")) {
    if (!allowEmpty && value.path.length === 0) {
      validator.issue(childPath(path, "path"), "invalid_matter_locator", "Matter occurrence path must not be empty")
    }
    if (value.path.length > 32) {
      validator.issue(childPath(path, "path"), "invalid_matter_depth", "Matter locator exceeds 32 steps")
    }
    value.path.forEach((entry, index) => {
      const stepPath = childPath(childPath(path, "path"), index)
      if (!validator.record(entry, stepPath, "Matter locator step")) return
      validator.closed(entry, stepPath, ["edgeSlot", "position"])
      validator.required(entry, stepPath, ["edgeSlot", "position"])
      const edgeSlot = entry.edgeSlot
      if (!MATTER_EDGE_SLOTS.has(edgeSlot as MetaMatterLocatorStep["edgeSlot"])) {
        validator.issue(childPath(stepPath, "edgeSlot"), "invalid_matter_edge", "Matter locator edge slot is invalid")
      }
      if (index === 0 && edgeSlot !== "root") {
        validator.issue(childPath(stepPath, "edgeSlot"), "invalid_matter_locator", "Matter locator must start at a root edge")
      }
      if (index > 0 && edgeSlot === "root") {
        validator.issue(childPath(stepPath, "edgeSlot"), "invalid_matter_locator", "Nested Matter locator step cannot be root")
      }
      const position = matterPosition(validator, entry.position, childPath(stepPath, "position"), "Matter locator position")
      if (MATTER_EDGE_SLOTS.has(edgeSlot as MetaMatterLocatorStep["edgeSlot"]) && position !== null) {
        steps.push({edgeSlot: edgeSlot as MetaMatterLocatorStep["edgeSlot"], position})
      }
    })
  }
  return validator.issues.length === before && address !== null && (allowEmpty || steps.length > 0)
    ? {address, path: steps as MetaMatterOccurrenceLocator["path"]}
    : null
}

const matterPlacement = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaMatterPlacement | null => {
  if (!validator.record(value, path, "Matter placement")) return null
  const before = validator.issues.length
  validator.closed(value, path, ["address", "parent", "edgeSlot", "position"])
  validator.required(value, path, ["address", "parent", "edgeSlot", "position"])
  const address = validator.address(value.address, childPath(path, "address"))
  const parent = value.parent === null ? null : matterLocator(validator, value.parent, childPath(path, "parent"))
  const edgeSlot = value.edgeSlot
  if (!MATTER_EDGE_SLOTS.has(edgeSlot as MetaMatterLocatorStep["edgeSlot"])) {
    validator.issue(childPath(path, "edgeSlot"), "invalid_matter_edge", "Matter placement edge slot is invalid")
  }
  const position = matterPosition(validator, value.position, childPath(path, "position"), "Matter placement position")
  if (parent === null && value.parent !== null) {
    return null
  }
  if (parent === null && edgeSlot !== "root") {
    validator.issue(childPath(path, "edgeSlot"), "invalid_matter_placement", "Root Matter placement must use root edge")
  }
  if (parent !== null) {
    if (parent.address !== address) {
      validator.issue(childPath(path, "parent"), "invalid_matter_placement", "Matter parent must belong to placement address")
    }
    if (edgeSlot === "root") {
      validator.issue(childPath(path, "edgeSlot"), "invalid_matter_placement", "Nested Matter placement cannot use root edge")
    }
  }
  return validator.issues.length === before && address !== null && position !== null &&
    MATTER_EDGE_SLOTS.has(edgeSlot as MetaMatterLocatorStep["edgeSlot"])
    ? {address, parent, edgeSlot: edgeSlot as MetaMatterLocatorStep["edgeSlot"], position}
    : null
}

const matterWimpAddresses = (particle: MetaMatterParticle): MetaAddress[] => {
  const result: MetaAddress[] = []
  const pending = [particle]
  while (pending.length > 0) {
    const current = pending.shift()!
    if (current.kind === "wimp") result.push(current.src)
    for (const child of current.children ?? []) pending.push(child.particle)
  }
  return result
}

const locatorStartsWith = (
  locator: MetaMatterOccurrenceLocator,
  prefix: MetaMatterOccurrenceLocator,
): boolean => locator.address === prefix.address && prefix.path.every((step, index) => {
  const current = locator.path[index]
  return current?.edgeSlot === step.edgeSlot && current.position === step.position
})

export const validateMetaMatterRequest = (
  input: unknown,
  context: MetaAuthoringValidationContext,
): ValidationResult<MetaMatterRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.matter.apply request")) return {ok: false, issues: validator.issues}
  const operation = input.operation
  const operationFields = operation === "add"
    ? ["to"]
    : operation === "move"
      ? ["from", "to"]
      : operation === "remove"
        ? ["target"]
        : []
  validator.closed(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "operation",
    "particle",
    "revisions",
    ...operationFields,
  ])
  validator.required(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "operation",
    "particle",
    "revisions",
    ...operationFields,
  ])
  const envelope = commonEnvelope(validator, input)
  validator.literal(input.capability, "/capability", META_MATTER_WRITE_CAPABILITY, "capability")
  if (operation !== "add" && operation !== "move" && operation !== "remove") {
    validator.issue("/operation", "forbidden_operation", "Matter operation must be add, move or remove")
  }
  const particle = matterParticle(validator, input.particle, "/particle")
  const from = operation === "move" ? matterLocator(validator, input.from, "/from") : null
  const target = operation === "remove" ? matterLocator(validator, input.target, "/target") : null
  const to = operation === "add" || operation === "move" ? matterPlacement(validator, input.to, "/to") : null
  if (operation === "move" && from !== null && to !== null) {
    const parent = to.parent
    if (parent && locatorStartsWith(parent, from)) {
      validator.issue("/to/parent", "invalid_matter_cycle", "Matter occurrence cannot move into its own subtree")
    }
    const targetPath = [...(parent?.path ?? []), {edgeSlot: to.edgeSlot, position: to.position}]
    if (
      from.address === to.address && from.path.length === targetPath.length &&
      from.path.every((step, index) =>
        step.edgeSlot === targetPath[index]!.edgeSlot && step.position === targetPath[index]!.position
      )
    ) {
      validator.issue("/to", "forbidden_operation", "Matter move must change placement")
    }
  }
  const revisions = sourcePreconditions(validator, input.revisions)
  const affected = [...new Set([
    from?.address,
    target?.address,
    to?.address,
  ].filter((address): address is MetaAddress => address !== undefined && address !== null))]
  const scope = [...new Set([
    ...affected,
    ...(particle ? matterWimpAddresses(particle) : []),
  ])]
  const grant = grantFor(
    validator,
    context.capabilities,
    META_MATTER_WRITE_CAPABILITY,
    META_MATTER_APPLY_METHOD,
    "matter",
    true,
  )
  requireScope(validator, grant, scope)
  exactRevisions(validator, revisions, affected, context.currentRevision)
  if (
    validator.issues.length > 0 ||
    !envelope ||
    particle === null ||
    (operation !== "add" && operation !== "move" && operation !== "remove")
  ) return {ok: false, issues: validator.issues}

  const base = {
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    operationId: envelope.operationId,
    capability: META_MATTER_WRITE_CAPABILITY,
    particle,
    revisions,
  }
  if (operation === "add" && to !== null) {
    return {ok: true, value: {...base, operation, to}}
  }
  if (operation === "move" && from !== null && to !== null) {
    return {ok: true, value: {...base, operation, from, to}}
  }
  if (operation === "remove" && target !== null) {
    return {ok: true, value: {...base, operation, target}}
  }
  return {ok: false, issues: validator.issues}
}

export const validateMetaDeclarationRequest = (
  input: unknown,
  context: MetaAuthoringValidationContext,
): ValidationResult<MetaDeclarationRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.declaration.apply request")) return {ok: false, issues: validator.issues}
  const entity = input.entity
  const operation = input.operation
  const declarationField = entity === "field" ? "field"
    : entity === "metadata" ? "metadata"
      : entity === "state" ? "state"
        : entity === "mass" ? "mass"
          : entity === "reaction" ? "reaction"
            : entity === "process" ? "process"
              : entity === "bulk" ? "bulk"
              : null
  const locatorField = entity === "state" ? "name"
    : entity === "field" || entity === "mass" || entity === "reaction" || entity === "process" ? "key"
      : null
  const operationFields = operation === "move"
    ? ["fromAddress", "toAddress", ...(locatorField ? [locatorField] : [])]
    : operation === "add"
      ? ["address", ...(declarationField ? [declarationField] : [])]
      : operation === "replace"
        ? ["address", ...(locatorField ? [locatorField] : []), ...(declarationField ? [declarationField] : [])]
        : operation === "remove"
          ? ["address", ...(locatorField ? [locatorField] : [])]
          : []
  validator.closed(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "entity",
    "operation",
    "revisions",
    ...operationFields,
  ])
  validator.required(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "entity",
    "operation",
    "revisions",
    ...operationFields,
  ])
  const envelope = commonEnvelope(validator, input)
  validator.literal(input.capability, "/capability", META_DECLARATION_WRITE_CAPABILITY, "capability")
  if (declarationField === null) {
    validator.issue("/entity", "invalid_declaration_entity", "entity must be field, metadata, state, mass, reaction, process or bulk")
  }
  if (operation !== "add" && operation !== "replace" && operation !== "remove" && operation !== "move") {
    validator.issue("/operation", "forbidden_operation", "Declaration operation must be add, replace, remove or move")
  }
  if (entity === "metadata" && operation !== "replace") {
    validator.issue("/operation", "forbidden_operation", "Meta metadata supports replace only")
  }
  if (entity === "process" && operation !== "add" && operation !== "replace") {
    validator.issue("/operation", "forbidden_operation", "Process supports add or replace")
  }
  const address = operation === "add" || operation === "replace" || operation === "remove"
    ? validator.address(input.address, "/address")
    : null
  const fromAddress = operation === "move"
    ? validator.address(input.fromAddress, "/fromAddress")
    : null
  const toAddress = operation === "move"
    ? validator.address(input.toAddress, "/toAddress")
    : null
  if (operation === "move" && fromAddress !== null && fromAddress === toAddress) {
    validator.issue("/toAddress", "forbidden_operation", "Declaration move requires distinct source and destination Meta")
  }
  const locator = locatorField !== null && (operation === "replace" || operation === "remove" || operation === "move")
    ? validator.text(input[locatorField], `/${locatorField}` as JsonPointer, `${entity} ${locatorField}`)
    : null
  const declaration = operation === "add" || operation === "replace"
    ? entity === "field" ? optionalFieldDeclaration(validator, input.field, "/field")
      : entity === "metadata" ? metadataDeclaration(validator, input.metadata, "/metadata")
        : entity === "state" ? stateDeclaration(validator, input.state, "/state")
          : entity === "mass" ? massDeclaration(validator, input.mass, "/mass")
            : entity === "reaction" ? reactionDeclaration(validator, input.reaction, "/reaction")
              : entity === "process" && (operation === "add" || operation === "replace")
                ? processDeclaration(validator, input.process, "/process", operation)
                : entity === "bulk" ? bulkDeclaration(validator, input.bulk, "/bulk")
                : null
    : null
  const revisions = sourcePreconditions(validator, input.revisions)
  const affected = operation === "move"
    ? [fromAddress, toAddress].filter((item): item is MetaAddress => item !== null)
    : address === null ? [] : [address]
  const grant = grantFor(
    validator,
    context.capabilities,
    META_DECLARATION_WRITE_CAPABILITY,
    META_DECLARATION_APPLY_METHOD,
    "declaration",
    true,
  )
  requireScope(validator, grant, affected)
  exactRevisions(validator, revisions, affected, context.currentRevision)
  if (
    validator.issues.length > 0 ||
    !envelope ||
    declarationField === null ||
    (operation !== "add" && operation !== "replace" && operation !== "remove" && operation !== "move")
  ) return {ok: false, issues: validator.issues}

  const base = {
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    operationId: envelope.operationId,
    capability: META_DECLARATION_WRITE_CAPABILITY,
    revisions,
  }
  if (entity === "metadata" && operation === "replace" && address !== null && declaration !== null) {
    return {ok: true, value: {...base, entity, operation, address, metadata: declaration as MetaMetadataDeclaration}}
  }
  if (entity === "bulk") {
    if (operation === "add" && address !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, bulk: declaration as MetaBulkDeclaration}}
    if (operation === "replace" && address !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, bulk: declaration as MetaBulkDeclaration}}
    if (operation === "remove" && address !== null) return {ok: true, value: {...base, entity, operation, address}}
    if (operation === "move" && fromAddress !== null && toAddress !== null) return {ok: true, value: {...base, entity, operation, fromAddress, toAddress}}
  }
  if (entity === "field") {
    if (operation === "add" && address !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, field: declaration as MetaOptionalFieldDeclaration}}
    if (operation === "replace" && address !== null && locator !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, key: locator, field: declaration as MetaOptionalFieldDeclaration}}
    if (operation === "remove" && address !== null && locator !== null) return {ok: true, value: {...base, entity, operation, address, key: locator}}
    if (operation === "move" && fromAddress !== null && toAddress !== null && locator !== null) return {ok: true, value: {...base, entity, operation, fromAddress, toAddress, key: locator}}
  }
  if (entity === "state") {
    if (operation === "add" && address !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, state: declaration as MetaStateDeclaration}}
    if (operation === "replace" && address !== null && locator !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, name: locator, state: declaration as MetaStateDeclaration}}
    if (operation === "remove" && address !== null && locator !== null) return {ok: true, value: {...base, entity, operation, address, name: locator}}
    if (operation === "move" && fromAddress !== null && toAddress !== null && locator !== null) return {ok: true, value: {...base, entity, operation, fromAddress, toAddress, name: locator}}
  }
  if (entity === "mass") {
    if (operation === "add" && address !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, mass: declaration as MetaMassDeclaration}}
    if (operation === "replace" && address !== null && locator !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, key: locator, mass: declaration as MetaMassDeclaration}}
    if (operation === "remove" && address !== null && locator !== null) return {ok: true, value: {...base, entity, operation, address, key: locator}}
    if (operation === "move" && fromAddress !== null && toAddress !== null && locator !== null) return {ok: true, value: {...base, entity, operation, fromAddress, toAddress, key: locator}}
  }
  if (entity === "reaction") {
    if (operation === "add" && address !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, reaction: declaration as MetaReactionDeclaration}}
    if (operation === "replace" && address !== null && locator !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, key: locator, reaction: declaration as MetaReactionDeclaration}}
    if (operation === "remove" && address !== null && locator !== null) return {ok: true, value: {...base, entity, operation, address, key: locator}}
    if (operation === "move" && fromAddress !== null && toAddress !== null && locator !== null) return {ok: true, value: {...base, entity, operation, fromAddress, toAddress, key: locator}}
  }
  if (entity === "process") {
    if (operation === "add" && address !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, process: declaration as MetaProcessDeclarationAddRequest["process"]}}
    if (operation === "replace" && address !== null && locator !== null && declaration !== null) return {ok: true, value: {...base, entity, operation, address, key: locator, process: declaration as MetaProcessDeclaration}}
  }
  return {ok: false, issues: validator.issues}
}
